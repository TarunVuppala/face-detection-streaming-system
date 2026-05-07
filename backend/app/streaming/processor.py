from dataclasses import dataclass
from collections import defaultdict, deque
import logging
from datetime import UTC, datetime
from time import perf_counter
from typing import Any, Deque
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.detection.box import expand_box_with_padding
from app.detection.types import FaceDetectionResult, RoiBox
from app.db.repositories import RoiObservationRepository, StreamSessionRepository
from app.streaming.annotator import PillowFrameAnnotator
from app.streaming.types import ProcessedFrame

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class FramePipelineDependencies:
    decoder: Any
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
        from app.streaming.decoder import PyAvVideoDecoder

        return cls(
            FramePipelineDependencies(
                decoder=PyAvVideoDecoder(),
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

    async def process_segment(self, *, session_id: UUID, segment: bytes) -> list[ProcessedFrame]:
        from app.db.models import StreamSession as SessionModel
        
        decoded_frames = self.dependencies.decoder.decode(segment)
        logger.info("decoded %s frames for session %s", len(decoded_frames), session_id)
        processed_frames: list[ProcessedFrame] = []

        # Get initial frame count from session to maintain continuity in memory
        stream_session = await self.dependencies.session_repository.session.get(
            SessionModel, 
            session_id
        )
        current_frame_count = stream_session.frame_count if stream_session else 0

        for decoded_frame in decoded_frames:
            frame_started_at = perf_counter()
            current_frame_count += 1
            frame_number = current_frame_count
            
            detection = self.dependencies.detector.detect_one(decoded_frame.image)
            frame_height, frame_width = decoded_frame.image.shape[:2]
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
            if detection is None:
                self._clear_box_history(session_id)
            else:
                await self.dependencies.roi_repository.create(
                    session_id=session_id,
                    frame_number=frame_number,
                    timestamp_ms=decoded_frame.timestamp_ms,
                    x=detection.box.x,
                    y=detection.box.y,
                    width=detection.box.width,
                    height=detection.box.height,
                    confidence=detection.confidence,
                    detector=detection.detector,
                )

            image_jpeg = (
                self.dependencies.annotator.draw_roi(
                    decoded_frame.image,
                    detection.box,
                    confidence=detection.confidence,
                )
                if detection is not None
                else self.dependencies.annotator.encode_jpeg(decoded_frame.image)
            )
            processing_ms = round((perf_counter() - frame_started_at) * 1000, 2)
            published_at = datetime.now(UTC)
            
            processed_frames.append(
                ProcessedFrame(
                    session_id=session_id,
                    frame_number=frame_number,
                    timestamp_ms=decoded_frame.timestamp_ms,
                    image_jpeg=image_jpeg,
                    detection=detection,
                    processing_ms=processing_ms,
                    published_at=published_at,
                )
            )

        # Batch update session and commit all observations at once
        await self.dependencies.session_repository.update_frame_count(session_id, current_frame_count)
        await self.dependencies.session_repository.session.commit()

        return processed_frames
