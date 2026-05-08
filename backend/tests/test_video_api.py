from dataclasses import dataclass, field
from datetime import UTC, datetime
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
    
    async def update_frame_count(self, session_id, count: int):
        return None


class FakeProcessor:
    def __init__(self):
        self.calls = []

    async def process_frame(self, *, session_id, image_bytes: bytes, frame_number: int, timestamp_ms: int):
        self.calls.append((session_id, timestamp_ms, image_bytes))
        return ProcessedFrame(
            session_id=session_id,
            frame_number=frame_number,
            timestamp_ms=timestamp_ms,
            image_jpeg=b"\xff\xd8\xff\xd9",
            detection=FaceDetectionResult(box=RoiBox(x=1, y=2, width=3, height=4), confidence=0.9),
            processing_ms=5.0,
            published_at=datetime.now(UTC),
        )


def test_ingest_websocket_receives_timestamped_frames(monkeypatch) -> None:
    """Test that the ingest WebSocket correctly unpacks timestamp+JPEG payload."""
    fake_processor = FakeProcessor()
    broadcasted = []

    async def fake_broadcast(frames):
        broadcasted.extend(frames)

    monkeypatch.setattr("app.api.video.StreamSessionRepository", FakeStreamSessionRepository)
    monkeypatch.setattr("app.api.video.FrameProcessor.from_session", lambda db: fake_processor)
    monkeypatch.setattr("app.api.video.hub.broadcast", fake_broadcast)

    client = TestClient(app)

    # Create a test JPEG payload (minimal valid JPEG)
    test_jpeg = b"\xff\xd8\xff\xd9"  # Minimal JPEG magic bytes
    timestamp_ms = 1000
    
    # Pack: 8-byte BigEndian timestamp + JPEG
    header = timestamp_ms.to_bytes(8, byteorder="big")
    payload = header + test_jpeg

    with client.websocket_connect("/ws/video/ingest") as websocket:
        message = websocket.receive_json()
        assert message["type"] == "session.started"
        websocket.send_bytes(payload)
        websocket.close()

    # Verify frame was processed with correct timestamp
    assert len(fake_processor.calls) > 0
    session_id, timestamp, frame_bytes = fake_processor.calls[0]
    assert timestamp == timestamp_ms
    assert frame_bytes == test_jpeg
    assert broadcasted
