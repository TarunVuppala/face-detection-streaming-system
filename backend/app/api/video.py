from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.repositories import StreamSessionRepository
from app.db.session import get_db_session
from app.schemas.stream import StreamErrorMessage, StreamSessionStarted
from app.streaming.hub import hub
from app.streaming.processor import FrameProcessor

router = APIRouter(tags=["video"])


@router.websocket("/ws/video/feed")
async def stream_feed(websocket: WebSocket) -> None:
    await hub.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        hub.disconnect(websocket)


@router.websocket("/ws/video/ingest")
async def ingest_video(
    websocket: WebSocket,
    db: AsyncSession = Depends(get_db_session),
) -> None:
    await websocket.accept()
    session_repository = StreamSessionRepository(db)
    stream_session = await session_repository.create(source="browser")
    await websocket.send_json(StreamSessionStarted(session_id=stream_session.id).model_dump(mode="json"))

    processor = FrameProcessor.from_session(db)

    try:
        while True:
            segment = await websocket.receive_bytes()
            try:
                processed_frames = await processor.process_segment(
                    session_id=stream_session.id,
                    segment=segment,
                )
            except Exception as exc:
                from app.streaming.decoder import VideoDecodeError

                if isinstance(exc, VideoDecodeError):
                    await websocket.send_json(
                        StreamErrorMessage(reason=str(exc)).model_dump(mode="json")
                    )
                    continue

                await session_repository.mark_finished(stream_session.id, status="failed")
                await websocket.send_json(
                    StreamErrorMessage(reason="stream_failed").model_dump(mode="json")
                )
                break

            await hub.broadcast(processed_frames)
    except WebSocketDisconnect:
        await session_repository.mark_finished(stream_session.id)
    finally:
        detector = getattr(processor.dependencies.detector, "close", None)
        if callable(detector):
            detector()
