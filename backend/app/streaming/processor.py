from dataclasses import dataclass
from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.repositories import RoiObservationRepository, StreamSessionRepository
from app.streaming.annotator import PillowFrameAnnotator
from app.streaming.types import ProcessedFrame


@dataclass(frozen=True)
class FramePipelineDependencies:
    decoder: Any
    detector: Any
    annotator: PillowFrameAnnotator
    session_repository: StreamSessionRepository
    roi_repository: RoiObservationRepository


class FrameProcessor:
    def __init__(self, dependencies: FramePipelineDependencies) -> None:
        self.dependencies = dependencies

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

    async def process_segment(self, *, session_id: UUID, segment: bytes) -> list[ProcessedFrame]:
        decoded_frames = self.dependencies.decoder.decode(segment)
        processed_frames: list[ProcessedFrame] = []

        for decoded_frame in decoded_frames:
            detection = self.dependencies.detector.detect_one(decoded_frame.image)
            if detection is not None:
                await self.dependencies.roi_repository.create(
                    session_id=session_id,
                    frame_number=decoded_frame.index,
                    timestamp_ms=decoded_frame.timestamp_ms,
                    x=detection.box.x,
                    y=detection.box.y,
                    width=detection.box.width,
                    height=detection.box.height,
                    confidence=detection.confidence,
                    detector=detection.detector,
                )

            image_jpeg = (
                self.dependencies.annotator.draw_roi(decoded_frame.image, detection.box)
                if detection is not None
                else self.dependencies.annotator.encode_jpeg(decoded_frame.image)
            )
            await self.dependencies.session_repository.increment_frame_count(session_id)
            processed_frames.append(
                ProcessedFrame(
                    session_id=session_id,
                    frame_number=decoded_frame.index,
                    timestamp_ms=decoded_frame.timestamp_ms,
                    image_jpeg=image_jpeg,
                    detection=detection,
                )
            )

        return processed_frames
