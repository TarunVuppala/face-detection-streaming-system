from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.repositories import RoiObservationRepository
from app.db.session import get_db_session
from app.schemas.roi import RoiBox, RoiObservationList, RoiObservationRead

router = APIRouter(prefix="/api/roi", tags=["roi"])


@router.get("", response_model=RoiObservationList)
async def list_roi_observations(
    session_id: UUID | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    db: AsyncSession = Depends(get_db_session),
) -> RoiObservationList:
    repository = RoiObservationRepository(db)
    observations = await repository.list_latest(session_id=session_id, limit=limit)

    return RoiObservationList(
        items=[
            RoiObservationRead(
                id=observation.id,
                session_id=observation.session_id,
                frame_number=observation.frame_number,
                timestamp_ms=observation.timestamp_ms,
                box=RoiBox(
                    x=observation.x,
                    y=observation.y,
                    width=observation.width,
                    height=observation.height,
                ),
                confidence=float(observation.confidence),
                detector=observation.detector,
                created_at=observation.created_at,
            )
            for observation in observations
        ],
        limit=limit,
    )

