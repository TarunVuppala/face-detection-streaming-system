# Backend

FastAPI service for browser video ingest, face ROI detection, persistence, and annotated stream
delivery.

## Run

### Docker

From the repository root:

```bash
docker compose up --build
```

The backend container applies Alembic migrations on startup before launching Uvicorn.

### Local

```bash
cd backend
alembic upgrade head
uvicorn app.main:app --reload
```

## Environment

- `DATABASE_URL`
- `FRONTEND_ORIGIN`

## Endpoints

- `WS /ws/video/ingest`
- `WS /ws/video/feed?session_id=<uuid>`
- `GET /api/roi`
- `GET /health`

## Notes

- Frame decoding uses PyAV.
- Face detection uses MediaPipe.
- Frame annotation uses Pillow.
- ROI observations are stored in PostgreSQL through SQLAlchemy async sessions.

