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

    def draw_roi(self, image: np.ndarray, box: RoiBox, *, confidence: float = 0.0) -> bytes:
        pil_image = Image.fromarray(image.astype(np.uint8), mode="RGB")
        draw = ImageDraw.Draw(pil_image)
        x2 = box.x + box.width - 1
        y2 = box.y + box.height - 1
        if confidence >= 0.9:
            color = (34, 197, 94)
        elif confidence >= 0.75:
            color = (245, 158, 11)
        else:
            color = (239, 68, 68)

        radius = max(8, min(box.width, box.height) // 12)
        draw.rounded_rectangle([box.x, box.y, x2, y2], radius=radius, outline=color, width=4)

        output = BytesIO()
        pil_image.save(output, format="JPEG", quality=90, optimize=True)
        return output.getvalue()
