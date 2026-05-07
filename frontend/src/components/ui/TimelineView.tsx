import type { ReactElement } from 'react'
import type { TimelineEntry } from '../Dashboard'

interface TimelineViewProps {
  entries: TimelineEntry[]
}

export function TimelineView({ entries }: TimelineViewProps): ReactElement {
  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-xs font-medium text-slate-600 px-2 py-1">Timeline</h3>
      <div className="flex-1 overflow-y-auto">
        {entries.length === 0 ? (
          <div className="text-xs text-slate-500 p-2">No events</div>
        ) : (
          <ul className="space-y-0.5">
            {entries.map((entry) => (
              <li key={entry.id} className="text-xs px-2 py-1 hover:bg-slate-100">
                <div className="flex justify-between gap-2">
                  <span className="text-slate-600">{entry.label}</span>
                  <span className="text-slate-500 font-mono">{entry.time}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
