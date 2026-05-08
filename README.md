# Real-Time Face Detection Video Streaming System

Containerized FastAPI, PostgreSQL, and React application for high-frequency real-time face detection. 
The system uses a custom **synchronized MJPEG-over-WebSocket pipeline** to achieve sub-100ms latency.

![Architecture Diagram](architecture.png)

## Quick Start

1. Start the stack in production mode:

   ```bash
   docker compose up --build
   ```

2. Open the frontend at `http://localhost:5173`.
3. Click `Start stream` and allow camera access.

The backend container runs Alembic migrations automatically before starting the API.

## API Surface

- `WS /ws/video/ingest` receives a synchronized binary stream from the browser.
  - Payload: `[8-byte Timestamp] [JPEG Image Bytes]`.
- `WS /ws/video/feed?session_id=<uuid>` serves the annotated synchronized binary stream.
  - Payload: `[4-byte JSON length] [JSON metadata] [JPEG frame]`.
- `GET /api/roi?session_id=<uuid>&limit=100` returns persisted ROI observations from PostgreSQL.
- `GET /health` returns service health.

## Implementation Notes

- **Low-Latency Pipeline:** Frame-by-frame MJPEG-over-WebSocket pipeline. Frontend captures video frames directly from the browser's MediaStream API, encodes to JPEG, and sends with 8-byte timestamp prefix. Backend processes frames immediately and broadcasts annotated results.
- **Synchronized Protocol:** Custom binary protocol locks ROI metadata to frame pixels: `[4-byte JSON length] [JSON metadata] [JPEG]`. This prevents UI jitter and ensures viewers see ROI and frame in sync.
- **Adaptive Quality:** JPEG quality automatically adjusts based on detected latency (0.3–0.8 quality range).
- **Non-Blocking Persistence:** ROI observations stored in PostgreSQL with async SQLAlchemy. Database commits batched every 15 frames to avoid blocking the video stream.
- **No OpenCV:** Face detection uses MediaPipe, frame annotation uses Pillow (PIL).

## Local Development

- Backend: `cd backend && pip install ".[dev]" && alembic upgrade head && uvicorn app.main:app --reload`
- Frontend: `cd frontend && npm install && npm run dev`

## Docker & Deployment

- **Backend:** Slim Python 3.12 image with FFmpeg, MediaPipe, and SQLAlchemy async driver.
- **Frontend:** Multi-stage Node build → Nginx Alpine serving static assets and proxying `/api` and `/ws` to the backend.
- **Database:** PostgreSQL 18 Alpine with health checks and persistent volumes.
- **Networking:** Nginx at `localhost:5173` proxies requests to backend at `http://backend:8000` (internal Docker network).

