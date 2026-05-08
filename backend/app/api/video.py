import logging
from uuid import UUID

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.repositories import StreamSessionRepository
from app.db.session import get_db_session
from app.schemas.stream import StreamErrorMessage, StreamSessionStarted
from app.streaming.hub import hub
from app.streaming.processor import FrameProcessor

router = APIRouter(tags=["video"])
logger = logging.getLogger(__name__)


@router.websocket("/ws/video/feed")
async def stream_feed(websocket: WebSocket, session_id: UUID) -> None:
    await hub.connect(websocket, session_id=session_id)
    try:
        while True:
            message = await websocket.receive()
            if message.get("type") == "websocket.disconnect":
                break
    except WebSocketDisconnect:
        pass
    finally:
        hub.disconnect(websocket)


@router.websocket("/ws/video/ingest")
async def ingest_video(
    websocket: WebSocket,
    db: AsyncSession = Depends(get_db_session),
) -> None:
    await websocket.accept()
    session_repository = StreamSessionRepository(db)
    stream_session = await session_repository.create(source="browser")
    logger.info("started ingest session %s", stream_session.id)
    await websocket.send_json(StreamSessionStarted(session_id=stream_session.id).model_dump(mode="json"))

    processor = FrameProcessor.from_session(db)
    frames_since_commit = 0
    current_frame_count = 0

    try:
        while True:
            payload = await websocket.receive_bytes()
            if len(payload) < 8:
                logger.error("received invalid payload size: %d", len(payload))
                continue
                
            # Unpack timestamp (8-byte BigInt BigEndian)
            timestamp_ms = int.from_bytes(payload[:8], byteorder="big")
            image_bytes = payload[8:]
            
            current_frame_count += 1

            try:
                processed_frame = await processor.process_frame(
                    session_id=stream_session.id,
                    image_bytes=image_bytes,
                    frame_number=current_frame_count,
                    timestamp_ms=timestamp_ms,
                )
                
                if processed_frame:
                    await hub.broadcast([processed_frame])
                    
                    # Periodic commit to avoid blocking the stream while still persisting data
                    frames_since_commit += 1
                    if frames_since_commit >= 15:
                        await session_repository.update_frame_count(stream_session.id, current_frame_count)
                        await db.commit()
                        frames_since_commit = 0
                else:
                    logger.warning("processor returned no frame for session %s", stream_session.id)
            except Exception:
                logger.exception("error processing frame for session %s", stream_session.id)
                
    except WebSocketDisconnect:
        logger.info("ingest websocket disconnected for session %s", stream_session.id)
        await session_repository.mark_finished(stream_session.id)
    finally:
        detector = getattr(processor.dependencies.detector, "close", None)
        if callable(detector):
            detector()
