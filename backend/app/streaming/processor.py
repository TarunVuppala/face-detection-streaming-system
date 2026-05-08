import logging
from collections import defaultdict, deque
from dataclasses import dataclass
from datetime import UTC, datetime
from io import BytesIO
from time import perf_counter
from typing import Any, Deque
from uuid import UUID

import numpy as np
from PIL import Image
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.repositories import RoiObservationRepository, StreamSessionRepository
from app.detection.box import expand_box_with_padding
from app.detection.types import FaceDetectionResult, RoiBox
from app.streaming.annotator import PillowFrameAnnotator
from app.streaming.types import ProcessedFrame

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class FramePipelineDependencies:
    detector: Any
    annotator: PillowFrameAnnotator
    session_repository: StreamSessionRepository
    roi_repository: RoiObservationRepository


class FrameProcessor:
    _box_history_limit = 5

    def __init__(self, dependencies: FramePipelineDependencies) -> None:
        self.dependencies = dependencies
        self._box_history: dict[UUID, Deque[RoiBox]] = defaultdict(lambda: deque(maxlen=self._box_history_limit))

    @classmethod
    def from_session(cls, db: AsyncSession) -> "FrameProcessor":
        from app.detection.mediapipe_detector import MediaPipeFaceDetector

        return cls(
            FramePipelineDependencies(
                detector=MediaPipeFaceDetector(),
                annotator=PillowFrameAnnotator(),
                session_repository=StreamSessionRepository(db),
                roi_repository=RoiObservationRepository(db),
            )
        )

    def _smooth_box(self, session_id: UUID, box: RoiBox) -> RoiBox:
        history = self._box_history[session_id]
        history.append(box)

        averaged_box = RoiBox(
            x=round(sum(item.x for item in history) / len(history)),
            y=round(sum(item.y for item in history) / len(history)),
            width=round(sum(item.width for item in history) / len(history)),
            height=round(sum(item.height for item in history) / len(history)),
        )
        return averaged_box

    def _clear_box_history(self, session_id: UUID) -> None:
        self._box_history.pop(session_id, None)

    async def process_frame(
        self, 
        *, 
        session_id: UUID, 
        image_bytes: bytes, 
        frame_number: int,
        timestamp_ms: int
    ) -> ProcessedFrame | None:
        if not image_bytes or len(image_bytes) < 10:
            logger.error("received empty or invalid frame bytes")
            return None

        # SECURITY/ROBUSTNESS: Magic Byte Validation (JPEG: FF D8 FF)
        if image_bytes[:3] != b"\xff\xd8\xff":
            logger.error(
                "invalid image format for session %s. expected JPEG magic bytes, got: %s", 
                session_id, 
                image_bytes[:3].hex(" ")
            )
            return None

        # Fast image parsing
        try:
            with Image.open(BytesIO(image_bytes)) as pil_img:
                if pil_img.mode != "RGB":
                    pil_img = pil_img.convert("RGB")
                image_array = np.array(pil_img)
        except Exception:
            logger.exception("failed to parse incoming frame bytes. size=%d", len(image_bytes))
            return None

        frame_started_at = perf_counter()
        frame_height, frame_width = image_array.shape[:2]
        detection = self.dependencies.detector.detect_one(image_array)
        
        if detection is not None:
            smoothed_box = self._smooth_box(session_id, detection.box)
            padded_box = expand_box_with_padding(
                box=smoothed_box,
                frame_width=frame_width,
                frame_height=frame_height,
            )
            if padded_box is None:
                self._clear_box_history(session_id)
                detection = None
            else:
                detection = FaceDetectionResult(
                    box=padded_box,
                    confidence=detection.confidence,
                    detector=detection.detector,
                )
                await self.dependencies.roi_repository.create(
                    session_id=session_id,
                    frame_number=frame_number,
                    timestamp_ms=timestamp_ms,
                    x=detection.box.x,
                    y=detection.box.y,
                    width=detection.box.width,
                    height=detection.box.height,
                    confidence=detection.confidence,
                    detector=detection.detector,
                )
        else:
            self._clear_box_history(session_id)

        image_jpeg = (
            self.dependencies.annotator.draw_roi(
                image_array,
                detection.box,
                confidence=detection.confidence,
            )
            if detection is not None
            else self.dependencies.annotator.encode_jpeg(image_array)
        )

        processing_ms = round((perf_counter() - frame_started_at) * 1000, 2)
        published_at = datetime.now(UTC)

        return ProcessedFrame(
            session_id=session_id,
            frame_number=frame_number,
            timestamp_ms=timestamp_ms,
            image_jpeg=image_jpeg,
            detection=detection,
            processing_ms=processing_ms,
            published_at=published_at,
        )
