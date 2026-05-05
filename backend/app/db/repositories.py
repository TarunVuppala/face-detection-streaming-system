from uuid import UUID

from sqlalchemy import Select, desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import RoiObservation


class RoiObservationRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

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

