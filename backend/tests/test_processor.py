from dataclasses import dataclass
from uuid import UUID, uuid4

import numpy as np

from app.detection.types import FaceDetectionResult, RoiBox
from app.streaming.processor import FramePipelineDependencies, FrameProcessor
from app.streaming.types import ProcessedFrame
from app.streaming.decoder import DecodedFrame
from app.streaming.annotator import PillowFrameAnnotator


class FakeDecoder:
    def __init__(self, frames):
        self.frames = frames

    def decode(self, segment: bytes):
        return self.frames


class FakeDetector:
    def __init__(self, result):
        self.result = result

    def detect_one(self, image):
        return self.result


@dataclass
class RecordingRoiRepo:
    created: list[dict]

    async def create(self, **kwargs):
        self.created.append(kwargs)
        return kwargs


@dataclass
class RecordingSessionRepo:
    frame_counts: list[UUID]

    async def increment_frame_count(self, session_id):
        self.frame_counts.append(session_id)


def test_process_segment_creates_roi_and_annotations() -> None:
    session_id = uuid4()
    decoded_frame = DecodedFrame(
        index=0,
        timestamp_ms=120,
        image=np.full((32, 32, 3), 30, dtype=np.uint8),
    )
    detection = FaceDetectionResult(box=RoiBox(x=5, y=6, width=10, height=11), confidence=0.91)
    roi_repo = RecordingRoiRepo(created=[])
    session_repo = RecordingSessionRepo(frame_counts=[])
    processor = FrameProcessor(
        FramePipelineDependencies(
            decoder=FakeDecoder([decoded_frame]),
            detector=FakeDetector(detection),
            annotator=PillowFrameAnnotator(),
            session_repository=session_repo,
            roi_repository=roi_repo,
        )
    )

    frames = _run(processor.process_segment(session_id=session_id, segment=b"segment"))

    assert len(frames) == 1
    assert isinstance(frames[0], ProcessedFrame)
    assert frames[0].detection == detection
    assert len(roi_repo.created) == 1
    assert roi_repo.created[0]["session_id"] == session_id
    assert session_repo.frame_counts == [session_id]
    assert frames[0].image_jpeg[:2] == b"\xff\xd8"


def test_process_segment_handles_no_detection() -> None:
    session_id = uuid4()
    decoded_frame = DecodedFrame(
        index=0,
        timestamp_ms=120,
        image=np.full((32, 32, 3), 30, dtype=np.uint8),
    )
    roi_repo = RecordingRoiRepo(created=[])
    session_repo = RecordingSessionRepo(frame_counts=[])
    processor = FrameProcessor(
        FramePipelineDependencies(
            decoder=FakeDecoder([decoded_frame]),
            detector=FakeDetector(None),
            annotator=PillowFrameAnnotator(),
            session_repository=session_repo,
            roi_repository=roi_repo,
        )
    )

    frames = _run(processor.process_segment(session_id=session_id, segment=b"segment"))

    assert len(frames) == 1
    assert frames[0].detection is None
    assert roi_repo.created == []
    assert session_repo.frame_counts == [session_id]


def _run(awaitable):
    import asyncio

    return asyncio.run(awaitable)
