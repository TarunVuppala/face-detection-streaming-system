import type { ReactElement } from 'react'
import type { StreamStats } from '../Dashboard'

interface StatsDisplayProps {
  stats: StreamStats
}

function metricValue(value: string): ReactElement {
  return <strong className="text-xl font-semibold tracking-tight text-slate-950">{value}</strong>
}

function metricLabel(label: string): ReactElement {
  return <div className="text-xs font-medium text-slate-600">{label}</div>
}

export function StatsDisplay({ stats }: StatsDisplayProps): ReactElement {
  const latencyDisplay = stats.currentLatencyMs !== null ? `${Math.round(stats.currentLatencyMs)} ms` : '—'
  const processingDisplay = stats.currentProcessingMs !== null ? `${Math.round(stats.currentProcessingMs)} ms` : '—'

  return (
    <div className="flex flex-col gap-2 p-2">
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-0.5 border border-slate-200 rounded p-2">
          {metricLabel('Frames')}
          {metricValue(stats.framesDecoded.toString())}
        </div>
        <div className="flex flex-col gap-0.5 border border-slate-200 rounded p-2">
          {metricLabel('Faces')}
          {metricValue(stats.facesDetected.toString())}
        </div>
        <div className="flex flex-col gap-0.5 border border-slate-200 rounded p-2">
          {metricLabel('Latency')}
          {metricValue(latencyDisplay)}
        </div>
        <div className="flex flex-col gap-0.5 border border-slate-200 rounded p-2">
          {metricLabel('Processing')}
          {metricValue(processingDisplay)}
        </div>
      </div>
    </div>
  )
}
