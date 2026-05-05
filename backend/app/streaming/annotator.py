from io import BytesIO

import numpy as np
from PIL import Image, ImageDraw

from app.detection.types import RoiBox


class PillowFrameAnnotator:
    def encode_jpeg(self, image: np.ndarray) -> bytes:
        pil_image = Image.fromarray(image.astype(np.uint8), mode="RGB")
        output = BytesIO()
        pil_image.save(output, format="JPEG", quality=90, optimize=True)
        return output.getvalue()

    def draw_roi(self, image: np.ndarray, box: RoiBox) -> bytes:
        pil_image = Image.fromarray(image.astype(np.uint8), mode="RGB")
        draw = ImageDraw.Draw(pil_image)
        x2 = box.x + box.width - 1
        y2 = box.y + box.height - 1
        draw.rectangle([box.x, box.y, x2, y2], outline=(255, 215, 0), width=3)

        output = BytesIO()
        pil_image.save(output, format="JPEG", quality=90, optimize=True)
        return output.getvalue()
