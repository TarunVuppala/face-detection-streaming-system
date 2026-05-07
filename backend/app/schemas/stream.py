from typing import Literal
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel

from app.schemas.roi import RoiBox


class StreamSessionStarted(BaseModel):
    type: Literal["session.started"] = "session.started"
    session_id: UUID


class StreamErrorMessage(BaseModel):
    type: Literal["segment.rejected", "stream.error"] = "stream.error"
    reason: str


class RoiStreamMessage(BaseModel):
    type: Literal["roi"] = "roi"
    session_id: UUID
    frame_number: int
    timestamp_ms: int
    box: RoiBox | None
    confidence: float | None
    detector: str | None = None
    processing_ms: float
    published_at: datetime
