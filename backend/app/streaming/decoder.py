from dataclasses import dataclass
from io import BytesIO
from tempfile import NamedTemporaryFile

import av
import numpy as np
from av.error import FFmpegError


class VideoDecodeError(ValueError):
    """Raised when an incoming video segment cannot be decoded into frames."""


@dataclass(frozen=True)
class DecodedFrame:
    index: int
    timestamp_ms: int
    image: np.ndarray


class PyAvVideoDecoder:
    def decode(self, segment: bytes) -> list[DecodedFrame]:
        if not segment:
            raise VideoDecodeError("empty_segment")

        frames: list[DecodedFrame] = []

        try:
            with NamedTemporaryFile(suffix=".webm") as temp_file:
                temp_file.write(segment)
                temp_file.flush()

                with av.open(temp_file.name, mode="r", format="webm") as container:
                    video_stream = next(
                        (stream for stream in container.streams if stream.type == "video"),
                        None,
                    )
                    if video_stream is None:
                        raise VideoDecodeError("missing_video_stream")

                    for frame_index, frame in enumerate(container.decode(video=0)):
                        frames.append(
                            DecodedFrame(
                                index=frame_index,
                                timestamp_ms=self._timestamp_ms(frame),
                                image=frame.to_ndarray(format="rgb24"),
                            )
                        )
        except VideoDecodeError:
            raise
        except FFmpegError:
            try:
                with av.open(BytesIO(segment), mode="r", format="webm") as container:
                    video_stream = next(
                        (stream for stream in container.streams if stream.type == "video"),
                        None,
                    )
                    if video_stream is None:
                        raise VideoDecodeError("missing_video_stream")

                    for frame_index, frame in enumerate(container.decode(video=0)):
                        frames.append(
                            DecodedFrame(
                                index=frame_index,
                                timestamp_ms=self._timestamp_ms(frame),
                                image=frame.to_ndarray(format="rgb24"),
                            )
                        )
            except VideoDecodeError:
                raise
            except FFmpegError as exc:
                raise VideoDecodeError("decode_failed") from exc

        if not frames:
            raise VideoDecodeError("no_frames")

        return frames

    @staticmethod
    def _timestamp_ms(frame: av.VideoFrame) -> int:
        if frame.pts is None or frame.time_base is None:
            return 0

        return int(frame.pts * frame.time_base * 1000)
