# Frontend

React client for the live camera stream, annotated feed playback, and ROI table.

## Run

```bash
cd frontend
npm install
npm run dev
```

## Environment

- `VITE_BACKEND_URL`
- `VITE_BACKEND_WS_URL`

## Behavior

- Captures camera video with `MediaRecorder`.
- Records short complete `video/webm` clips and sends them to the ingest websocket.
- Subscribes to the session-scoped feed websocket to render annotated JPEG frames.
- Loads persisted ROI data from the backend ROI endpoint and keeps the latest observations visible.
