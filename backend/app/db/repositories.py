from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import Select, desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import RoiObservation, StreamSession


class StreamSessionRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create(self, *, source: str = "browser") -> StreamSession:
        stream_session = StreamSession(
            source=source,
            status="active",
            started_at=datetime.now(UTC),
        )
        self.session.add(stream_session)
        await self.session.commit()
        await self.session.refresh(stream_session)
        return stream_session

    async def mark_finished(self, session_id: UUID, *, status: str = "ended") -> None:
        stream_session = await self.session.get(StreamSession, session_id)
        if stream_session is None:
            return

        stream_session.status = status
        stream_session.ended_at = datetime.now(UTC)
        await self.session.commit()

    async def increment_frame_count(self, session_id: UUID) -> int:
        stream_session = await self.session.get(StreamSession, session_id)
        if stream_session is None:
            return 0

        stream_session.frame_count += 1
        await self.session.commit()
        return stream_session.frame_count


class RoiObservationRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create(
        self,
        *,
        session_id: UUID,
        frame_number: int,
        timestamp_ms: int,
        x: int,
        y: int,
        width: int,
        height: int,
        confidence: float,
        detector: str,
    ) -> RoiObservation:
        observation = RoiObservation(
            session_id=session_id,
            frame_number=frame_number,
            timestamp_ms=timestamp_ms,
            x=x,
            y=y,
            width=width,
            height=height,
            confidence=confidence,
            detector=detector,
        )
        self.session.add(observation)
        await self.session.commit()
        await self.session.refresh(observation)
        return observation

    async def list_latest(
        self,
        *,
        session_id: UUID | None,
        limit: int,
    ) -> list[RoiObservation]:
        statement: Select[tuple[RoiObservation]] = select(RoiObservation)
        if session_id is not None:
            statement = statement.where(RoiObservation.session_id == session_id)

        statement = statement.order_by(desc(RoiObservation.created_at)).limit(limit)
        result = await self.session.execute(statement)
        return list(result.scalars().all())
