import type { ReactElement } from 'react'
import type { StreamStatus } from '../Dashboard'

interface StatusHeaderProps {
  status: StreamStatus
  statusLabel: string
  fps: number
  latencyLabel: string
  error: string | null
}

export function StatusHeader({
  status,
  statusLabel,
  fps,
  latencyLabel,
  error,
}: StatusHeaderProps): ReactElement {
  return (
    <header className="flex items-center justify-between gap-4 border-b border-slate-200 px-4 py-3">
      <div className="flex items-center gap-4">
        <div>
          <h1 className="text-lg font-medium">Face Detection Stream</h1>
        </div>
        <div className="flex items-center gap-4 border-l border-slate-200 pl-4 text-sm">
          <span className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${status === 'streaming' ? 'bg-green-500' : 'bg-slate-400'}`} />
            {status === 'streaming' ? 'Live' : statusLabel}
          </span>
          <span>FPS {fps.toFixed(1)}</span>
          <span>Latency {latencyLabel}</span>
          {error ? <span className="max-w-64 truncate text-red-600">{error}</span> : null}
        </div>
      </div>

      <div className="text-sm font-medium text-slate-600">
        {statusLabel}
      </div>
    </header>
  )
}
