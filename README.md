# Real-Time Face Detection Video Streaming System

Containerized FastAPI, PostgreSQL, and React application for receiving a browser video feed,
detecting a face, drawing a minimal axis-aligned ROI without OpenCV, persisting ROI data, and
showing the annotated stream in the frontend.

## Quick Start

1. Start the stack:

   ```bash
   docker compose up --build
   ```

2. Open the frontend at `http://localhost:5173`.
3. Click `Start stream` and allow camera access.

The backend container runs Alembic migrations automatically before starting the API.

## API Surface

- `WS /ws/video/ingest` receives `video/webm` chunks from the browser camera.
- `WS /ws/video/feed?session_id=<uuid>` serves annotated JPEG frames plus ROI metadata for that
  session.
- `GET /api/roi?session_id=<uuid>&limit=100` returns persisted ROI observations from PostgreSQL.
- `GET /health` returns service health.

## Implementation Notes

- Video decoding uses PyAV, not OpenCV.
- Face detection uses MediaPipe.
- Frame annotation uses Pillow.
- The database is PostgreSQL with SQLAlchemy and Alembic.
- Session rows and ROI rows are persisted separately so the stream history can be queried later.

## Local Development

- Backend: `cd backend && alembic upgrade head && uvicorn app.main:app --reload`
- Frontend: `cd frontend && npm install && npm run dev`

