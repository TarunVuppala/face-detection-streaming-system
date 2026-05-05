from io import BytesIO

import numpy as np
from PIL import Image

from app.detection.types import RoiBox
from app.streaming.annotator import PillowFrameAnnotator


def test_draw_roi_produces_valid_jpeg_with_overlay() -> None:
    annotator = PillowFrameAnnotator()
    image = np.zeros((20, 20, 3), dtype=np.uint8)
    image[:, :] = [20, 20, 20]

    output = annotator.draw_roi(image, RoiBox(x=2, y=2, width=10, height=10))

    result = Image.open(BytesIO(output))
    assert result.size == (20, 20)
    assert result.format == "JPEG"
    assert result.getpixel((2, 2)) != (20, 20, 20)

