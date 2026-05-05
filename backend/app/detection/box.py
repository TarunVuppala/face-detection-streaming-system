from app.detection.types import RoiBox


def normalized_box_to_pixels(
    *,
    xmin: float,
    ymin: float,
    width: float,
    height: float,
    frame_width: int,
    frame_height: int,
) -> RoiBox | None:
    if frame_width <= 0 or frame_height <= 0:
        raise ValueError("frame dimensions must be positive")

    x1 = round(xmin * frame_width)
    y1 = round(ymin * frame_height)
    x2 = round((xmin + width) * frame_width)
    y2 = round((ymin + height) * frame_height)

    x1 = min(max(x1, 0), frame_width)
    y1 = min(max(y1, 0), frame_height)
    x2 = min(max(x2, 0), frame_width)
    y2 = min(max(y2, 0), frame_height)

    box_width = x2 - x1
    box_height = y2 - y1

    if box_width <= 0 or box_height <= 0:
        return None

    return RoiBox(x=x1, y=y1, width=box_width, height=box_height)

