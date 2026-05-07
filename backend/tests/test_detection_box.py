import pytest

from app.detection.box import expand_box_with_padding, normalized_box_to_pixels
from app.detection.types import RoiBox


def test_normalized_box_to_pixels_converts_coordinates() -> None:
    box = normalized_box_to_pixels(
        xmin=0.25,
        ymin=0.1,
        width=0.5,
        height=0.4,
        frame_width=640,
        frame_height=480,
    )

    assert box == RoiBox(x=160, y=48, width=320, height=192)


def test_normalized_box_to_pixels_clamps_to_frame_bounds() -> None:
    box = normalized_box_to_pixels(
        xmin=-0.1,
        ymin=0.8,
        width=0.4,
        height=0.5,
        frame_width=100,
        frame_height=100,
    )

    assert box == RoiBox(x=0, y=80, width=30, height=20)


def test_normalized_box_to_pixels_rejects_boxes_outside_frame() -> None:
    box = normalized_box_to_pixels(
        xmin=1.2,
        ymin=0.2,
        width=0.2,
        height=0.2,
        frame_width=100,
        frame_height=100,
    )

    assert box is None


def test_normalized_box_to_pixels_requires_positive_frame_dimensions() -> None:
    with pytest.raises(ValueError, match="frame dimensions"):
        normalized_box_to_pixels(
            xmin=0,
            ymin=0,
            width=1,
            height=1,
            frame_width=0,
            frame_height=100,
        )


def test_expand_box_with_padding_clamps_to_frame_bounds() -> None:
    box = expand_box_with_padding(
        box=RoiBox(x=4, y=5, width=20, height=30),
        frame_width=24,
        frame_height=28,
        padding_ratio=0.25,
    )

    assert box == RoiBox(x=0, y=0, width=24, height=28)


def test_expand_box_with_padding_requires_positive_frame_dimensions() -> None:
    with pytest.raises(ValueError, match="frame dimensions"):
        expand_box_with_padding(
            box=RoiBox(x=1, y=1, width=10, height=10),
            frame_width=0,
            frame_height=100,
        )
