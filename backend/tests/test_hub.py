from dataclasses import dataclass, field
from datetime import UTC, datetime
from uuid import uuid4

from starlette.websockets import WebSocketState

from app.detection.types import FaceDetectionResult, RoiBox
from app.streaming.hub import FeedHub
from app.streaming.types import ProcessedFrame


@dataclass
class FakeWebSocket:
    accepted: bool = False
    application_state: WebSocketState = WebSocketState.CONNECTING
    bytes_messages: list[bytes] = field(default_factory=list)
    json_messages: list[dict] = field(default_factory=list)

    async def accept(self) -> None:
        self.accepted = True
        self.application_state = WebSocketState.CONNECTED

    async def send_bytes(self, data: bytes) -> None:
        self.bytes_messages.append(data)

    async def send_json(self, data: dict) -> None:
        self.json_messages.append(data)


def test_feed_hub_broadcasts_only_to_matching_session() -> None:
    hub = FeedHub()
    session_a = uuid4()
    session_b = uuid4()
    websocket_a = FakeWebSocket()
    websocket_b = FakeWebSocket()

    _run(hub.connect(websocket_a, session_id=session_a))
    _run(hub.connect(websocket_b, session_id=session_b))

    frame = ProcessedFrame(
        session_id=session_a,
        frame_number=4,
        timestamp_ms=120,
        image_jpeg=b"\xff\xd8\xff\xd9",
        detection=FaceDetectionResult(box=RoiBox(x=5, y=6, width=40, height=50), confidence=0.91),
        processing_ms=12.5,
        published_at=datetime.now(UTC),
    )

    _run(hub.broadcast([frame]))

    assert websocket_a.bytes_messages == [frame.image_jpeg]
    assert websocket_a.json_messages[0]["session_id"] == str(session_a)
    assert websocket_b.bytes_messages == []
    assert websocket_b.json_messages == []


def _run(awaitable):
    import asyncio

    return asyncio.run(awaitable)
