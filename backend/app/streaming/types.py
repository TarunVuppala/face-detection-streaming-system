from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from app.detection.types import FaceDetectionResult


@dataclass(frozen=True)
class ProcessedFrame:
    session_id: UUID
    frame_number: int
    timestamp_ms: int
    image_jpeg: bytes
    detection: FaceDetectionResult | None
    processing_ms: float
    published_at: datetime
