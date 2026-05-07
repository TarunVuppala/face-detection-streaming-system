import { useEffect, useRef } from 'react'
import { useStreamingStore } from './store/streamingStore'
import { StreamingManager } from './services/StreamingManager'
import {
  ControlsBar,
  MetricsPanel,
  RoiTable,
  VideoPanel,
} from './components/Dashboard'

function formatClock(value: string | null | undefined): string {
  if (!value) {
    return '—'
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return '—'
  }

  return parsed.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function App() {

  const localVideoRef = useRef<HTMLVideoElement | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const clipTimerRef = useRef<number | null>(null)
  const ingestSocketRef = useRef<WebSocket | null>(null)
  const feedSocketRef = useRef<WebSocket | null>(null)
  const frameUrlRef = useRef<string | null>(null)
  const stopRequestedRef = useRef(false)
  const streamGenerationRef = useRef(0)
  const frameReceiptTimesRef = useRef<number[]>([])
  const startRecorderRef = useRef<((stream: MediaStream, streamGeneration: number) => void) | null>(null)


  const status = useStreamingStore((state) => state.status)
  const sessionId = useStreamingStore((state) => state.sessionId)
  const error = useStreamingStore((state) => state.error)
  const frameUrl = useStreamingStore((state) => state.frameUrl)
  const roiRows = useStreamingStore((state) => state.roiRows)
  const localCameraReady = useStreamingStore((state) => state.localCameraReady)
  const showDetectionOverlay = useStreamingStore((state) => state.showDetectionOverlay)
  const captureRate = useStreamingStore((state) => state.captureRate)
  const activeDetection = useStreamingStore((state) => state.activeDetection)
  const streamStats = useStreamingStore((state) => state.streamStats)
  const timelineEntries = useStreamingStore((state) => state.timelineEntries)


  const setShowDetectionOverlay = useStreamingStore((state) => state.setShowDetectionOverlay)
  const setCaptureRate = useStreamingStore((state) => state.setCaptureRate)


  const managerRef = useRef<StreamingManager | null>(null)

  if (!managerRef.current) {
    managerRef.current = new StreamingManager({
      localVideoRef,
      mediaStreamRef,
      recorderRef,
      clipTimerRef,
      ingestSocketRef,
      feedSocketRef,
      frameUrlRef,
      stopRequestedRef,
      streamGenerationRef,
      frameReceiptTimesRef,
      startRecorderRef,
    })
  }

  const manager = managerRef.current


  useEffect(() => {
    startRecorderRef.current = manager.startRecorder
  }, [manager])



  useEffect(() => {
    return () => {
      stopRequestedRef.current = true
      manager.cleanupResources()
    }
  }, [manager])


  const statusLabel =
    status === 'idle'
      ? 'Ready'
      : status === 'starting'
        ? 'Connecting'
        : status === 'streaming'
          ? 'Streaming'
          : status === 'stopped'
            ? 'Stopped'
            : 'Error'

  const systemLatencyLabel =
    streamStats.currentLatencyMs !== null ? `${Math.round(streamStats.currentLatencyMs)} ms` : '—'

  return (
    <main className="flex h-screen w-screen overflow-hidden bg-white text-slate-900">
      <div className="mx-auto flex h-full w-full max-w-500 flex-1 flex-col gap-0 overflow-hidden">
        {/* Header Section */}
        <section className="flex shrink-0 flex-col gap-0 overflow-hidden border-b border-slate-200">
          {/* Status Header */}
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
                <span>FPS {streamStats.fps.toFixed(1)}</span>
                <span>Latency {systemLatencyLabel}</span>
                {error ? <span className="max-w-64 truncate text-red-600">{error}</span> : null}
              </div>
            </div>

            <div className="text-sm font-medium text-slate-600">
              {statusLabel}
            </div>
          </header>

          {/* Controls */}
          <div className="flex shrink-0 items-center gap-3 border-b border-slate-200 px-4 py-2">
            <ControlsBar
              status={status}
              sessionId={sessionId}
              localCameraReady={localCameraReady}
              showDetectionOverlay={showDetectionOverlay}
              selectedCaptureRate={captureRate}
              onToggleStream={() => {
                if (status === 'streaming' || status === 'starting') {
                  manager.stopStream()
                } else {
                  void manager.startStream()
                }
              }}
              onClearSession={manager.clearSession}
              onToggleDetectionOverlay={() => setShowDetectionOverlay(!showDetectionOverlay)}
              onCaptureRateChange={(value) => {
                if (value === '1' || value === '2' || value === '4') {
                  setCaptureRate(value)
                }
              }}
            />
          </div>
        </section>

        {/* Main Content */}
        <section className="min-h-0 flex-1 gap-0 overflow-hidden grid border-t border-slate-200" style={{ gridTemplateColumns: '1fr 320px' }}>
          <VideoPanel
            frameUrl={frameUrl}
            liveStatus={localCameraReady ? 'Camera ready' : 'Camera idle'}
            isStreaming={status === 'streaming'}
            activeDetection={activeDetection}
            showDetectionOverlay={showDetectionOverlay}
            localVideoRef={localVideoRef}
            localCameraReady={localCameraReady}
          />

          <div className="flex flex-col min-h-0 gap-0 border-l border-slate-200 overflow-hidden">
            <MetricsPanel stats={streamStats} timelineEntries={timelineEntries} />

            <div className="min-h-0 flex-1 overflow-hidden border-t border-slate-200">
              <RoiTable rows={roiRows} formatClock={formatClock} />
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}

export default App
