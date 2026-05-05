from collections.abc import Iterable

from fastapi import WebSocket
from starlette.websockets import WebSocketState

from app.schemas.roi import RoiBox
from app.schemas.stream import RoiStreamMessage
from app.streaming.types import ProcessedFrame


class FeedHub:
    def __init__(self) -> None:
        self._clients: set[WebSocket] = set()

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self._clients.add(websocket)

    def disconnect(self, websocket: WebSocket) -> None:
        self._clients.discard(websocket)

    async def broadcast(self, frames: Iterable[ProcessedFrame]) -> None:
        for frame in frames:
            message = RoiStreamMessage(
                session_id=frame.session_id,
                frame_number=frame.frame_number,
                timestamp_ms=frame.timestamp_ms,
                box=
                None
                if frame.detection is None
                else RoiBox(
                    x=frame.detection.box.x,
                    y=frame.detection.box.y,
                    width=frame.detection.box.width,
                    height=frame.detection.box.height,
                ),
                confidence=None if frame.detection is None else frame.detection.confidence,
                detector=None if frame.detection is None else frame.detection.detector,
            )
            for client in list(self._clients):
                if client.application_state != WebSocketState.CONNECTED:
                    self.disconnect(client)
                    continue

                try:
                    await client.send_bytes(frame.image_jpeg)
                    await client.send_json(message.model_dump(mode="json"))
                except Exception:
                    self.disconnect(client)


hub = FeedHub()
