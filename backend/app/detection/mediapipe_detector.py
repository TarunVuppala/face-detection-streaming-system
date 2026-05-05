import numpy as np
import mediapipe as mp

from app.detection.box import normalized_box_to_pixels
from app.detection.types import FaceDetectionResult


class MediaPipeFaceDetector:
    def __init__(self, *, model_selection: int = 0, min_detection_confidence: float = 0.5) -> None:
        self._detector = mp.solutions.face_detection.FaceDetection(
            model_selection=model_selection,
            min_detection_confidence=min_detection_confidence,
        )

    def detect_one(self, image: np.ndarray) -> FaceDetectionResult | None:
        if image.ndim != 3 or image.shape[2] != 3:
            raise ValueError("expected RGB image with shape (height, width, 3)")

        frame_height, frame_width = image.shape[:2]
        result = self._detector.process(image)

        if not result.detections:
            return None

        detection = max(result.detections, key=lambda item: item.score[0] if item.score else 0.0)
        relative_box = detection.location_data.relative_bounding_box
        box = normalized_box_to_pixels(
            xmin=relative_box.xmin,
            ymin=relative_box.ymin,
            width=relative_box.width,
            height=relative_box.height,
            frame_width=frame_width,
            frame_height=frame_height,
        )
        if box is None:
            return None

        confidence = float(detection.score[0]) if detection.score else 0.0
        return FaceDetectionResult(box=box, confidence=confidence)

    def close(self) -> None:
        self._detector.close()

    def __enter__(self) -> "MediaPipeFaceDetector":
        return self

    def __exit__(self, *_: object) -> None:
        self.close()

