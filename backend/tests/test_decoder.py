from io import BytesIO

import av
import numpy as np
import pytest

from app.streaming.decoder import PyAvVideoDecoder, VideoDecodeError


def make_webm_segment() -> bytes:
    buffer = BytesIO()

    with av.open(buffer, mode="w", format="webm") as container:
        stream = container.add_stream("vp8", rate=10)
        stream.width = 64
        stream.height = 48
        stream.pix_fmt = "yuv420p"

        for index in range(3):
            image = np.full((48, 64, 3), fill_value=index * 60, dtype=np.uint8)
            frame = av.VideoFrame.from_ndarray(image, format="rgb24")
            for packet in stream.encode(frame):
                container.mux(packet)

        for packet in stream.encode():
            container.mux(packet)

    return buffer.getvalue()


def test_decode_webm_segment_returns_rgb_frames() -> None:
    decoder = PyAvVideoDecoder()

    frames = decoder.decode(make_webm_segment())

    assert len(frames) == 3
    assert frames[0].index == 0
    assert frames[0].timestamp_ms >= 0
    assert frames[0].image.shape == (48, 64, 3)
    assert frames[0].image.dtype == np.uint8


def test_decode_rejects_empty_segment() -> None:
    decoder = PyAvVideoDecoder()

    with pytest.raises(VideoDecodeError, match="empty_segment"):
        decoder.decode(b"")


def test_decode_rejects_invalid_bytes() -> None:
    decoder = PyAvVideoDecoder()

    with pytest.raises(VideoDecodeError, match="decode_failed"):
        decoder.decode(b"not a video segment")

