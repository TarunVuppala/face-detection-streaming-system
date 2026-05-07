import type { ReactElement } from 'react'
import type { ActiveDetection } from '../Dashboard'

interface DetectionOverlayProps {
  detection: ActiveDetection
  show: boolean
}

export function DetectionOverlay({ detection, show }: DetectionOverlayProps): ReactElement | null {
  if (!show || detection.frameNumber === null) {
    return null
  }

  const confidenceTone =
    detection.confidence === null
      ? 'border-slate-400'
      : detection.confidence >= 0.85
        ? 'border-green-600'
        : detection.confidence >= 0.65
          ? 'border-yellow-600'
          : 'border-red-600'

  return (
    <div className={`absolute left-2 top-2 z-20 w-36 border ${confidenceTone} bg-black/60 p-1.5 text-white text-xs`}>
      <div className="font-mono text-xs">{detection.frameNumber}</div>
      <div className="font-mono text-xs mt-0.5">
        {detection.box
          ? `${detection.box.x}, ${detection.box.y}, ${detection.box.width}x${detection.box.height}`
          : '-'}
      </div>
      <div className="text-xs mt-0.5">
        {detection.confidence !== null ? `${Math.round(detection.confidence * 1000) / 10}%` : '-'}
      </div>
    </div>
  )
}
