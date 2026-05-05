from datetime import UTC, datetime
from decimal import Decimal
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.db.models import RoiObservation
from app.db.repositories import RoiObservationRepository
from app.db.session import get_db_session
from app.main import app


class FakeRoiRepository:
    async def list_latest(self, *, session_id, limit):
        return [
            RoiObservation(
                id=uuid4(),
                session_id=session_id or uuid4(),
                frame_number=12,
                timestamp_ms=480,
                x=10,
                y=20,
                width=120,
                height=140,
                confidence=Decimal("0.9132"),
                detector="mediapipe",
                created_at=datetime(2026, 5, 5, tzinfo=UTC),
            )
        ]


@pytest.fixture(autouse=True)
def override_dependencies(monkeypatch):
    async def fake_session():
        yield None

    app.dependency_overrides[get_db_session] = fake_session
    monkeypatch.setattr(
        RoiObservationRepository,
        "list_latest",
        FakeRoiRepository().list_latest,
    )
    yield
    app.dependency_overrides.clear()


def test_list_roi_observations_returns_box_shape() -> None:
    client = TestClient(app)
    session_id = uuid4()

    response = client.get(f"/api/roi?session_id={session_id}&limit=25")

    assert response.status_code == 200
    body = response.json()
    assert body["limit"] == 25
    assert body["items"][0]["session_id"] == str(session_id)
    assert body["items"][0]["box"] == {
        "x": 10,
        "y": 20,
        "width": 120,
        "height": 140,
    }

