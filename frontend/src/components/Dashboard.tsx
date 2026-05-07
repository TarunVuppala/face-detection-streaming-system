import { useEffect, useRef, type RefObject } from 'react'
import { DetectionOverlay } from './ui/DetectionOverlay'
import { StatsDisplay } from './ui/StatsDisplay'
import { TimelineView } from './ui/TimelineView'
import {
  type StreamStatus,
  type RoiBox,
  type RoiRow,
  type StreamStats,
  type TimelineEntry,
} from '../hooks/useStreaming'

export type ActiveDetection = {
  frameNumber: number | null
  box: RoiBox | null
  confidence: number | null
}

// Re-export for convenience
export type { StreamStatus, RoiBox, RoiRow, StreamStats, TimelineEntry }

// Re-export UI components
export { DetectionOverlay } from './ui/DetectionOverlay'
export { StatsDisplay } from './ui/StatsDisplay'
export { TimelineView } from './ui/TimelineView'
export { StatusHeader } from './ui/StatusHeader'

type ControlsBarProps = {
  status: StreamStatus
  sessionId: string | null
  localCameraReady: boolean
  showDetectionOverlay: boolean
  selectedCaptureRate: string
  onToggleStream: () => void
  onClearSession: () => void
  onToggleDetectionOverlay: () => void
  onCaptureRateChange: (value: string) => void
}

type VideoPanelProps = {
  frameUrl: string | null
  liveStatus: string
  isStreaming: boolean
  activeDetection: ActiveDetection
  showDetectionOverlay: boolean
  localVideoRef: RefObject<HTMLVideoElement | null>
  localCameraReady: boolean
}

type MetricsPanelProps = {
  stats: StreamStats
  timelineEntries: TimelineEntry[]
}

type RoiTableProps = {
  rows: RoiRow[]
  formatClock: (value: string | null | undefined) => string
}

function formatSessionId(sessionId: string | null): string {
  if (!sessionId) {
    return 'none'
  }

  if (sessionId.length <= 10) {
    return sessionId
  }

  return `${sessionId.slice(0, 4)}…${sessionId.slice(-4)}`
}

export function ControlsBar({
  status,
  sessionId,
  localCameraReady,
  showDetectionOverlay,
  selectedCaptureRate,
  onToggleStream,
  onClearSession,
  onToggleDetectionOverlay,
  onCaptureRateChange,
}: ControlsBarProps) {
  const isActive = status === 'streaming' || status === 'starting'

  return (
    <div className="flex items-center gap-2">
      <button
        className={`px-3 py-1 text-sm border ${
          isActive ? 'bg-slate-900 text-white border-slate-900 hover:bg-slate-800' : 'bg-blue-600 text-white border-blue-600 hover:bg-blue-500'
        }`}
        type="button"
        onClick={onToggleStream}
      >
        {isActive ? 'Stop' : 'Start'}
      </button>
      <button
        className="px-3 py-1 text-sm border border-slate-200 bg-white hover:bg-slate-50"
        type="button"
        onClick={onClearSession}
      >
        Clear
      </button>

      <div className="flex items-center gap-2 ml-auto">
        <label className="flex items-center gap-2 text-sm">
          <input
            className="w-4 h-4"
            type="checkbox"
            checked={showDetectionOverlay}
            onChange={onToggleDetectionOverlay}
          />
          <span>Overlay</span>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <span>Rate</span>
          <select
            className="border border-slate-200 bg-white px-2 py-0.5 text-sm"
            value={selectedCaptureRate}
            onChange={(event) => onCaptureRateChange(event.target.value)}
          >
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="4">4</option>
          </select>
        </label>
      </div>

      <div className="flex items-center gap-2 ml-auto border-l border-slate-200 pl-3 text-xs text-slate-600">
        <div>
          <span className="font-mono text-xs">Session</span>
          <div className="text-xs font-medium">{formatSessionId(sessionId)}</div>
        </div>
        <div>
          <span className="font-mono text-xs">Camera</span>
          <div className="text-xs font-medium">{localCameraReady ? 'ready' : 'idle'}</div>
        </div>
      </div>
    </div>
  )
}

export function VideoPanel({
  frameUrl,
  liveStatus,
  isStreaming,
  activeDetection,
  showDetectionOverlay,
  localVideoRef,
  localCameraReady,
}: VideoPanelProps) {
  const hasDetection = activeDetection.box !== null && activeDetection.confidence !== null

  return (
    <div className="flex flex-col min-h-0">
      <div className="flex flex-col gap-1 shrink-0 border-b border-slate-200 px-3 py-2 text-sm font-medium">
        <div className="flex items-center justify-between gap-2">
          <div>Processed stream</div>
          <div className="text-xs text-slate-500">
            {isStreaming ? 'Live' : 'Waiting'}
          </div>
        </div>
        <div className="text-xs text-slate-500">{liveStatus}</div>
      </div>

      <figure className="relative min-h-0 flex-1 overflow-hidden bg-slate-900">
        <DetectionOverlay detection={activeDetection} show={showDetectionOverlay} />

        {!hasDetection && frameUrl ? (
          <div className="absolute bottom-2 left-2 z-20 bg-slate-800 px-2 py-1 text-xs text-white">
            No face detected
          </div>
        ) : null}

        <div className="absolute bottom-2 right-2 z-20 h-20 w-32 overflow-hidden border border-slate-400 bg-slate-950">
          <div className="flex flex-col h-full p-0.5">
            <div className="text-[10px] text-slate-300 mb-0.5">Camera</div>
            <div className="flex-1 overflow-hidden border border-slate-400 bg-black relative">
              <video ref={localVideoRef} autoPlay muted playsInline className="h-full w-full object-cover" />
              {!localCameraReady && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/80 text-white text-xs">
                  Camera access required
                </div>
              )}
            </div>
          </div>
        </div>

        {frameUrl ? (
          <img
            src={frameUrl}
            alt="Annotated camera frame"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center p-4 text-center text-slate-400 text-sm">
            Waiting for frames. Start stream to begin.
          </div>
        )}
      </figure>
    </div>
  )
}

export function MetricsPanel({ stats, timelineEntries }: MetricsPanelProps) {
  return (
    <div className="flex flex-col min-h-0 border-b border-slate-200 overflow-hidden">
      <StatsDisplay stats={stats} />
      <div className="flex-1 min-h-0 overflow-hidden border-t border-slate-200">
        <TimelineView entries={timelineEntries} />
      </div>
    </div>
  )
}

export function RoiTable({ rows, formatClock }: RoiTableProps) {
  const latestRowId = rows[0]?.id ?? null
  const tableWrapRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (tableWrapRef.current) {
      tableWrapRef.current.scrollTop = 0
    }
  }, [rows])

  return (
    <div className="flex flex-col min-h-0 flex-1 overflow-hidden">
      <div className="flex flex-col gap-1 border-b border-slate-200 px-3 py-2 shrink-0">
        <div className="flex items-center justify-between gap-2 text-sm font-medium">
          <div>ROI Table</div>
          <div className="text-xs text-slate-500">{rows.length} rows</div>
        </div>
        <div className="text-xs text-slate-500">Latest processed frames, including no-face frames.</div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        <table className="w-full table-fixed text-xs">
          <thead className="shrink-0 bg-slate-50 border-b border-slate-200 sticky top-0">
            <tr className="text-left">
              <th className="px-2 py-1 font-medium text-slate-600 w-12">Frame</th>
              <th className="px-2 py-1 font-medium text-slate-600 flex-1">Coords</th>
              <th className="px-2 py-1 font-medium text-slate-600 w-16">Conf</th>
              <th className="px-2 py-1 font-medium text-slate-600 w-20">Time</th>
            </tr>
          </thead>
        </table>

        <div className="roi-scroll min-h-0 flex-1 overflow-y-auto" ref={tableWrapRef}>
          <table className="w-full table-fixed text-xs">
            <tbody>
              {rows.length > 0 ? (
                rows.map((row, index) => (
                  <tr
                    key={row.id}
                    className={`border-b border-slate-200 text-slate-700 ${
                      row.id === latestRowId ? 'bg-blue-100' : index % 2 === 0 ? 'bg-white' : 'bg-slate-50'
                    }`}
                  >
                      <td className="px-2 py-1 font-mono text-slate-900 w-12">{row.frame_number}</td>
                    <td className="px-2 py-1 font-mono text-xs truncate flex-1">
                      {row.box ? `${row.box.x},${row.box.y} ${row.box.width}x${row.box.height}` : 'No face'}
                    </td>
                    <td className="px-2 py-1 font-mono w-16">
                      {row.confidence !== null ? `${Math.round(row.confidence * 1000) / 10}%` : '-'}
                    </td>
                    <td className="px-2 py-1 font-mono text-slate-500 w-20 text-xs">{formatClock(row.published_at ?? row.created_at)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-2 py-4 text-center text-slate-500 col-span-4" colSpan={4}>
                    No detections
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
