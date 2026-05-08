import asyncio
from dataclasses import dataclass
from io import BytesIO
from uuid import UUID, uuid4

import numpy as np
from PIL import Image

from app.detection.types import FaceDetectionResult, RoiBox
from app.streaming.processor import FramePipelineDependencies, FrameProcessor
from app.streaming.types import ProcessedFrame
from app.streaming.annotator import PillowFrameAnnotator


class FakeDetector:
    def __init__(self, result):
        self.result = result

    def detect_one(self, image):
        return self.result


class SequenceDetector:
    def __init__(self, results):
        self.results = list(results)
        self.calls = 0

    def detect_one(self, image):
        result = self.results[self.calls]
        self.calls += 1
        return result


@dataclass
class RecordingRoiRepo:
    created: list[dict]

    async def create(self, **kwargs):
        self.created.append(kwargs)
        return kwargs


@dataclass
class RecordingSessionRepo:
    updated_counts: list[tuple[UUID, int]]

    async def update_frame_count(self, session_id: UUID, count: int):
        self.updated_counts.append((session_id, count))


def create_jpeg(width: int = 32, height: int = 32) -> bytes:
    img = Image.fromarray(np.full((height, width, 3), 30, dtype=np.uint8))
    buf = BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


def test_process_frame_creates_roi_and_annotations() -> None:
    session_id = uuid4()
    jpeg_bytes = create_jpeg()
    
    detection = FaceDetectionResult(
        box=RoiBox(x=5, y=6, width=10, height=11), 
        confidence=0.91,
        detector="mediapipe"
    )
    roi_repo = RecordingRoiRepo(created=[])
    session_repo = RecordingSessionRepo(updated_counts=[])
    
    processor = FrameProcessor(
        FramePipelineDependencies(
            detector=FakeDetector(detection),
            annotator=PillowFrameAnnotator(),
            session_repository=session_repo,
            roi_repository=roi_repo,
        )
    )

    frame = _run(processor.process_frame(
        session_id=session_id, 
        image_bytes=jpeg_bytes, 
        frame_number=1,
        timestamp_ms=0
    ))

    assert isinstance(frame, ProcessedFrame)
    assert frame.frame_number == 1
    assert len(roi_repo.created) == 1
    assert roi_repo.created[0]["session_id"] == session_id
    assert frame.image_jpeg[:2] == b"\xff\xd8"


def test_process_frame_handles_no_detection() -> None:
    session_id = uuid4()
    jpeg_bytes = create_jpeg()
    
    roi_repo = RecordingRoiRepo(created=[])
    session_repo = RecordingSessionRepo(updated_counts=[])
    
    processor = FrameProcessor(
        FramePipelineDependencies(
            detector=FakeDetector(None),
            annotator=PillowFrameAnnotator(),
            session_repository=session_repo,
            roi_repository=roi_repo,
        )
    )

    frame = _run(processor.process_frame(
        session_id=session_id, 
        image_bytes=jpeg_bytes, 
        frame_number=1,
        timestamp_ms=33
    ))

    assert frame.detection is None
    assert frame.frame_number == 1
    assert roi_repo.created == []


def _run(awaitable):
    return asyncio.run(awaitable)
