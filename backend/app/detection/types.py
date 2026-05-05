from dataclasses import dataclass


@dataclass(frozen=True)
class RoiBox:
    x: int
    y: int
    width: int
    height: int


@dataclass(frozen=True)
class FaceDetectionResult:
    box: RoiBox
    confidence: float
    detector: str = "mediapipe"

