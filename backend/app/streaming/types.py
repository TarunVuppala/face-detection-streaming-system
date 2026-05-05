from dataclasses import dataclass
from uuid import UUID

from app.detection.types import FaceDetectionResult


@dataclass(frozen=True)
class ProcessedFrame:
    session_id: UUID
    frame_number: int
    timestamp_ms: int
    image_jpeg: bytes
    detection: FaceDetectionResult | None

