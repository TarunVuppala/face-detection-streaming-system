from datetime import datetime
from uuid import UUID

from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, Numeric, String
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UuidPrimaryKeyMixin


class StreamSession(UuidPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "stream_sessions"

    status: Mapped[str] = mapped_column(String(24), nullable=False, default="active")
    source: Mapped[str] = mapped_column(String(64), nullable=False, default="browser")
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    frame_count: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)

    observations: Mapped[list["RoiObservation"]] = relationship(
        back_populates="session",
        cascade="all, delete-orphan",
    )


class RoiObservation(UuidPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "roi_observations"

    session_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("stream_sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    frame_number: Mapped[int] = mapped_column(BigInteger, nullable=False, index=True)
    timestamp_ms: Mapped[int] = mapped_column(BigInteger, nullable=False)
    x: Mapped[int] = mapped_column(Integer, nullable=False)
    y: Mapped[int] = mapped_column(Integer, nullable=False)
    width: Mapped[int] = mapped_column(Integer, nullable=False)
    height: Mapped[int] = mapped_column(Integer, nullable=False)
    confidence: Mapped[float] = mapped_column(Numeric(5, 4), nullable=False)
    detector: Mapped[str] = mapped_column(String(64), nullable=False, default="mediapipe")

    session: Mapped[StreamSession] = relationship(back_populates="observations")

