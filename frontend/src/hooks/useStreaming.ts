export type RoiBox = {
  x: number
  y: number
  width: number
  height: number
}

export type StreamSessionStarted = {
  type: 'session.started'
  session_id: string
}

export type StreamErrorMessage = {
  type: 'segment.rejected' | 'stream.error'
  reason: string
}

export type RoiStreamMessage = {
  type: 'roi'
  session_id: string
  frame_number: number
  timestamp_ms: number
  box: RoiBox | null
  confidence: number | null
  detector: string | null
  processing_ms: number
  published_at: string
}

export type RoiRow = {
  id: string
  session_id: string
  frame_number: number
  timestamp_ms: number
  box: RoiBox | null
  confidence: number | null
  published_at?: string
  created_at: string
}

export type StreamStats = {
  framesDecoded: number
  facesDetected: number
  currentLatencyMs: number | null
  currentProcessingMs: number | null
  fps: number
  lastUpdateAt: string | null
}

export type TimelineEntry = {
  id: string
  label: string
  time: string
}

export type StreamStatus = 'idle' | 'starting' | 'streaming' | 'stopped' | 'error'

export const backendUrl = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:8000'
export const backendWsUrl = import.meta.env.VITE_BACKEND_WS_URL ?? 'ws://localhost:8000'
const maxRows = 15

export const captureRateOptions = {
  '1': 1000,
  '2': 500,
  '4': 250,
} as const

function getRoiRowKey(row: RoiRow): string {
  return row.id
}

function compareRoiRows(left: RoiRow, right: RoiRow): number {
  const leftTime = Date.parse(left.published_at ?? left.created_at)
  const rightTime = Date.parse(right.published_at ?? right.created_at)

  if (!Number.isNaN(leftTime) && !Number.isNaN(rightTime) && leftTime !== rightTime) {
    return rightTime - leftTime
  }

  if (left.created_at !== right.created_at) {
    return right.created_at.localeCompare(left.created_at)
  }

  if (left.frame_number !== right.frame_number) {
    return right.frame_number - left.frame_number
  }

  if (left.timestamp_ms !== right.timestamp_ms) {
    return right.timestamp_ms - left.timestamp_ms
  }

  return getRoiRowKey(left).localeCompare(getRoiRowKey(right))
}

export function normalizeRoiRows(current: RoiRow[], incoming: RoiRow[]): RoiRow[] {
  const merged = new Map<string, RoiRow>()

  for (const row of [...current, ...incoming]) {
    merged.set(getRoiRowKey(row), row)
  }

  return Array.from(merged.values())
    .sort(compareRoiRows)
    .slice(0, maxRows)
}
