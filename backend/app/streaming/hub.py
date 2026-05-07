from collections import defaultdict
from collections.abc import Iterable
from uuid import UUID

from fastapi import WebSocket
from starlette.websockets import WebSocketState

from app.schemas.roi import RoiBox
from app.schemas.stream import RoiStreamMessage
from app.streaming.types import ProcessedFrame


class FeedHub:
    def __init__(self) -> None:
        self._clients: dict[UUID, set[WebSocket]] = defaultdict(set)

    async def connect(self, websocket: WebSocket, *, session_id: UUID) -> None:
        await websocket.accept()
        self._clients[session_id].add(websocket)

    def disconnect(self, websocket: WebSocket) -> None:
        empty_sessions: list[UUID] = []
        for session_id, clients in self._clients.items():
            if websocket in clients:
                clients.discard(websocket)
                if not clients:
                    empty_sessions.append(session_id)

        for session_id in empty_sessions:
            self._clients.pop(session_id, None)

    async def broadcast(self, frames: Iterable[ProcessedFrame]) -> None:
        for frame in frames:
            clients = list(self._clients.get(frame.session_id, set()))
            if not clients:
                continue

            message = RoiStreamMessage(
                session_id=frame.session_id,
                frame_number=frame.frame_number,
                timestamp_ms=frame.timestamp_ms,
                box=None
                if frame.detection is None
                else RoiBox(
                    x=frame.detection.box.x,
                    y=frame.detection.box.y,
                    width=frame.detection.box.width,
                    height=frame.detection.box.height,
                ),
                confidence=None if frame.detection is None else frame.detection.confidence,
                detector=None if frame.detection is None else frame.detection.detector,
                processing_ms=frame.processing_ms,
                published_at=frame.published_at,
            )
            for client in clients:
                if client.application_state != WebSocketState.CONNECTED:
                    self.disconnect(client)
                    continue

                try:
                    await client.send_bytes(frame.image_jpeg)
                    await client.send_json(message.model_dump(mode="json"))
                except Exception:
                    self.disconnect(client)


hub = FeedHub()
