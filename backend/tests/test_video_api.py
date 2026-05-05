from dataclasses import dataclass, field
from uuid import UUID, uuid4

from fastapi.testclient import TestClient

from app.detection.types import FaceDetectionResult, RoiBox
from app.main import app
from app.streaming.types import ProcessedFrame


@dataclass
class DummySession:
    id: UUID = field(default_factory=uuid4)


class FakeStreamSessionRepository:
    def __init__(self, db):
        self.db = db

    async def create(self, *, source: str = "browser"):
        return DummySession()

    async def mark_finished(self, session_id, *, status: str = "ended"):
        return None


class FakeProcessor:
    def __init__(self):
        self.calls = []

    async def process_segment(self, *, session_id, segment: bytes):
        self.calls.append((session_id, segment))
        return [
            ProcessedFrame(
                session_id=session_id,
                frame_number=1,
                timestamp_ms=42,
                image_jpeg=b"\xff\xd8\xff\xd9",
                detection=FaceDetectionResult(box=RoiBox(x=1, y=2, width=3, height=4), confidence=0.9),
            )
        ]


def test_ingest_websocket_starts_session_and_processes_segment(monkeypatch) -> None:
    fake_processor = FakeProcessor()
    broadcasted = []

    async def fake_broadcast(frames):
        broadcasted.extend(frames)

    monkeypatch.setattr("app.api.video.StreamSessionRepository", FakeStreamSessionRepository)
    monkeypatch.setattr("app.api.video.FrameProcessor.from_session", lambda db: fake_processor)
    monkeypatch.setattr("app.api.video.hub.broadcast", fake_broadcast)

    client = TestClient(app)

    with client.websocket_connect("/ws/video/ingest") as websocket:
        message = websocket.receive_json()
        assert message["type"] == "session.started"
        websocket.send_bytes(b"segment-bytes")
        websocket.close()

    assert fake_processor.calls
    assert broadcasted
