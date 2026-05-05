from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class RoiBox(BaseModel):
    x: int
    y: int
    width: int
    height: int


class RoiObservationRead(BaseModel):
    id: UUID
    session_id: UUID
    frame_number: int
    timestamp_ms: int
    box: RoiBox
    confidence: float
    detector: str
    created_at: datetime


class RoiObservationList(BaseModel):
    items: list[RoiObservationRead]
    limit: int = Field(ge=1, le=500)

