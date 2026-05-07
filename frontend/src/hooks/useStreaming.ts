import { useCallback, useEffect, useRef, useState } from 'react'
import type { ActiveDetection } from '../components/Dashboard'

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

export function useStreaming() {
  const [status, setStatus] = useState<StreamStatus>('idle')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [frameUrl, setFrameUrl] = useState<string | null>(null)
  const [roiRows, setRoiRows] = useState<RoiRow[]>([])
  const [localCameraReady, setLocalCameraReady] = useState(false)
  const [showDetectionOverlay, setShowDetectionOverlay] = useState(true)
  const [captureRate, setCaptureRate] = useState<keyof typeof captureRateOptions>('1')
  const [activeDetection, setActiveDetection] = useState<ActiveDetection>({
    frameNumber: null,
    box: null,
    confidence: null,
  })
  const [streamStats, setStreamStats] = useState<StreamStats>({
    framesDecoded: 0,
    facesDetected: 0,
    currentLatencyMs: null,
    currentProcessingMs: null,
    fps: 0,
    lastUpdateAt: null,
  })
  const [timelineEntries, setTimelineEntries] = useState<TimelineEntry[]>([])
  const localVideoRef = useRef<HTMLVideoElement | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const clipTimerRef = useRef<number | null>(null)
  const ingestSocketRef = useRef<WebSocket | null>(null)
  const feedSocketRef = useRef<WebSocket | null>(null)
  const frameUrlRef = useRef<string | null>(null)
  const stopRequestedRef = useRef(false)
  const streamGenerationRef = useRef(0)
  const timelineSeenRef = useRef<Set<string>>(new Set())
  const frameReceiptTimesRef = useRef<number[]>([])

  const pushTimeline = useCallback((id: string, label: string) => {
    if (timelineSeenRef.current.has(id)) {
      return
    }

    timelineSeenRef.current.add(id)
    const time = new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })

    setTimelineEntries((current) => [{ id, label, time }, ...current].slice(0, 6))
  }, [])

  const resetStreamState = useCallback(() => {
    frameReceiptTimesRef.current = []
    timelineSeenRef.current = new Set()
    setStreamStats({
      framesDecoded: 0,
      facesDetected: 0,
      currentLatencyMs: null,
      currentProcessingMs: null,
      fps: 0,
      lastUpdateAt: null,
    })
    setTimelineEntries([])
    setActiveDetection({
      frameNumber: null,
      box: null,
      confidence: null,
    })
  }, [])

  const closeSockets = useCallback(() => {
    if (ingestSocketRef.current) {
      ingestSocketRef.current.close()
      ingestSocketRef.current = null
    }

    if (feedSocketRef.current) {
      feedSocketRef.current.close()
      feedSocketRef.current = null
    }
  }, [])

  const clearFrame = useCallback(() => {
    if (frameUrlRef.current) {
      URL.revokeObjectURL(frameUrlRef.current)
      frameUrlRef.current = null
    }
    setFrameUrl(null)
  }, [])

  const clearClipTimer = useCallback(() => {
    if (clipTimerRef.current !== null) {
      window.clearTimeout(clipTimerRef.current)
      clipTimerRef.current = null
    }
  }, [])

  const clearMedia = useCallback(() => {
    clearClipTimer()

    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop()
    }
    recorderRef.current = null

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop())
      mediaStreamRef.current = null
    }

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null
    }

    setLocalCameraReady(false)
  }, [clearClipTimer])

  const cleanupResources = useCallback(() => {
    closeSockets()
    clearMedia()
    clearFrame()
  }, [clearFrame, clearMedia, closeSockets])

  const upsertRoiRow = useCallback((row: RoiRow) => {
    setRoiRows((current) => normalizeRoiRows(current, [row]))
  }, [])

  const loadPersistedRois = useCallback(async (currentSessionId: string) => {
    try {
      const response = await fetch(
        `${backendUrl}/api/roi?session_id=${encodeURIComponent(currentSessionId)}&limit=25`,
      )

      if (!response.ok) {
        return
      }

      const body = (await response.json()) as { items?: RoiRow[] }
      const items = body.items ?? []

      setRoiRows((current) => normalizeRoiRows(current, items))
    } catch {
      // The live stream still works without the history call.
    }
  }, [])

  const startRecorder = useCallback(
    (stream: MediaStream, streamGeneration: number) => {
      if (!('MediaRecorder' in window)) {
        throw new Error('MediaRecorder is not available in this browser')
      }

      const supportedMimeTypes = [
        'video/webm;codecs=vp8',
        'video/webm;codecs=vp9',
        'video/webm',
      ]
      const mimeType = supportedMimeTypes.find((candidate) =>
        typeof MediaRecorder.isTypeSupported === 'function'
          ? MediaRecorder.isTypeSupported(candidate)
          : candidate === 'video/webm',
      )

      if (!mimeType) {
        throw new Error('No supported WebM mime type was found')
      }

      const socket = ingestSocketRef.current
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        throw new Error('Ingest websocket is not ready.')
      }

      const recorder = new MediaRecorder(stream, { mimeType })
      const clipParts: BlobPart[] = []

      recorder.ondataavailable = (event) => {
        if (event.data.size) {
          clipParts.push(event.data)
        }
      }

      recorder.onerror = () => {
        if (!stopRequestedRef.current && streamGenerationRef.current === streamGeneration) {
          setError('MediaRecorder failed while capturing the camera stream.')
          setStatus('error')
          stopRequestedRef.current = true
          cleanupResources()
        }
      }

      recorder.onstop = () => {
        clearClipTimer()
        recorderRef.current = null

        if (stopRequestedRef.current || streamGenerationRef.current !== streamGeneration) {
          return
        }

        void (async () => {
          try {
            const clipBlob = new Blob(clipParts, { type: mimeType })
            if (!clipBlob.size) {
              throw new Error('Recorded clip was empty.')
            }

            const payload = await clipBlob.arrayBuffer()
            if (
              stopRequestedRef.current ||
              streamGenerationRef.current !== streamGeneration ||
              socket.readyState !== WebSocket.OPEN
            ) {
              return
            }

            socket.send(payload)
          } catch {
            if (streamGenerationRef.current !== streamGeneration) {
              return
            }

            setError('Failed to encode the video clip for upload.')
            setStatus('error')
            stopRequestedRef.current = true
            cleanupResources()
            return
          }

          if (
            stopRequestedRef.current ||
            streamGenerationRef.current !== streamGeneration ||
            socket.readyState !== WebSocket.OPEN
          ) {
            return
          }

          startRecorder(stream, streamGeneration)
        })()
      }

      recorderRef.current = recorder
      recorder.start()
      clipTimerRef.current = window.setTimeout(() => {
        if (
          !stopRequestedRef.current &&
          streamGenerationRef.current === streamGeneration &&
          recorder.state === 'recording'
        ) {
          recorder.stop()
        }
      }, captureRateOptions[captureRate])
    },
    [captureRate, cleanupResources, clearClipTimer],
  )

  const stopStream = useCallback(() => {
    streamGenerationRef.current += 1
    stopRequestedRef.current = true
    pushTimeline(`stream-stopped:${streamGenerationRef.current}`, 'Stream stopped')
    cleanupResources()
    setStatus('stopped')
  }, [cleanupResources, pushTimeline])

  const clearSession = useCallback(() => {
    streamGenerationRef.current += 1
    stopRequestedRef.current = true
    cleanupResources()
    resetStreamState()
    setStatus('idle')
    setSessionId(null)
    setRoiRows([])
    setError(null)
  }, [cleanupResources, resetStreamState])

  const openFeedSocket = useCallback(
    (currentSessionId: string, streamGeneration: number) => {
      const socket = new WebSocket(
        `${backendWsUrl}/ws/video/feed?session_id=${encodeURIComponent(currentSessionId)}`,
      )
      socket.binaryType = 'arraybuffer'

      socket.onopen = () => {
        pushTimeline(`feed-connected:${currentSessionId}`, 'Feed connected')
        if (stopRequestedRef.current || streamGenerationRef.current !== streamGeneration) {
          socket.close()
          return
        }

        const stream = mediaStreamRef.current
        if (!stream) {
          setError('Camera stream was lost before the feed socket opened.')
          setStatus('error')
          stopRequestedRef.current = true
          cleanupResources()
          return
        }

        try {
          startRecorder(stream, streamGeneration)
          setStatus('streaming')
        } catch (cause) {
          if (streamGenerationRef.current !== streamGeneration) {
            return
          }

          setError(cause instanceof Error ? cause.message : 'Unable to start the recorder.')
          setStatus('error')
          stopRequestedRef.current = true
          cleanupResources()
        }
      }

      socket.onmessage = (event) => {
        if (streamGenerationRef.current !== streamGeneration) {
          return
        }

        if (typeof event.data === 'string') {
          let message: RoiStreamMessage | null = null
          try {
            message = JSON.parse(event.data) as RoiStreamMessage
          } catch {
            return
          }

          if (!message) {
            return
          }

          const publishedAt = Date.parse(message.published_at)
          const latencyMs = Number.isNaN(publishedAt)
            ? null
            : Math.max(Date.now() - publishedAt, 0)

          setStreamStats((current) => ({
            ...current,
            currentLatencyMs: latencyMs,
            currentProcessingMs: message.processing_ms,
            lastUpdateAt: message.published_at,
            facesDetected:
              message.box && message.confidence !== null
                ? current.facesDetected + 1
                : current.facesDetected,
          }))

          const nextRow: RoiRow = {
            id: `${message.session_id}:${message.frame_number}:${message.timestamp_ms}`,
            session_id: message.session_id,
            frame_number: message.frame_number,
            timestamp_ms: message.timestamp_ms,
            box: message.box,
            confidence: message.confidence,
            published_at: message.published_at,
            created_at: message.published_at,
          }

          if (message.box && message.confidence !== null) {
            setActiveDetection({
              frameNumber: nextRow.frame_number,
              box: nextRow.box,
              confidence: nextRow.confidence,
            })
            pushTimeline(`first-face:${message.session_id}`, 'First face detected')
          } else {
            setActiveDetection({
              frameNumber: nextRow.frame_number,
              box: null,
              confidence: null,
            })
          }

          upsertRoiRow(nextRow)
          return
        }

        const now = Date.now()
        const hadNoFramesYet = frameReceiptTimesRef.current.length === 0
        frameReceiptTimesRef.current = [
          ...frameReceiptTimesRef.current.filter((timestamp) => now - timestamp <= 5000),
          now,
        ]
        const fps = Math.round((frameReceiptTimesRef.current.length / 5) * 10) / 10
        setStreamStats((current) => ({
          ...current,
          framesDecoded: current.framesDecoded + 1,
          fps,
        }))
        if (hadNoFramesYet) {
          pushTimeline(`first-frame:${currentSessionId}`, 'First frame received')
        }

        const image =
          event.data instanceof Blob
            ? event.data
            : new Blob([event.data], { type: 'image/jpeg' })
        const nextUrl = URL.createObjectURL(image)

        if (frameUrlRef.current) {
          URL.revokeObjectURL(frameUrlRef.current)
        }

        frameUrlRef.current = nextUrl
        setFrameUrl(nextUrl)
      }

      socket.onerror = () => {
        if (!stopRequestedRef.current && streamGenerationRef.current === streamGeneration) {
          setError('Annotated feed websocket error.')
          pushTimeline(`feed-error:${currentSessionId}`, 'Feed error')
          setStatus('error')
          stopRequestedRef.current = true
          cleanupResources()
        }
      }

      socket.onclose = () => {
        if (!stopRequestedRef.current && streamGenerationRef.current === streamGeneration) {
          setError('Annotated feed connection closed unexpectedly.')
          pushTimeline(`feed-closed:${currentSessionId}`, 'Stream ended')
          setStatus('error')
          stopRequestedRef.current = true
          cleanupResources()
        }
      }

      feedSocketRef.current = socket
    },
    [cleanupResources, pushTimeline, startRecorder, upsertRoiRow],
  )

  const startStream = useCallback(async () => {
    if (status === 'starting' || status === 'streaming') {
      return
    }

    streamGenerationRef.current += 1
    const streamGeneration = streamGenerationRef.current
    stopRequestedRef.current = true
    cleanupResources()
    stopRequestedRef.current = false
    resetStreamState()
    setError(null)
    setStatus('starting')
    setSessionId(null)
    setRoiRows([])

    try {
      const mediaDevices = navigator.mediaDevices
      if (!mediaDevices?.getUserMedia) {
        throw new Error('This browser does not support camera capture.')
      }

      const stream = await mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      })

      mediaStreamRef.current = stream
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream
        void localVideoRef.current.play().catch(() => undefined)
        setLocalCameraReady(true)
      }

      const ingestSocket = new WebSocket(`${backendWsUrl}/ws/video/ingest`)
      ingestSocketRef.current = ingestSocket

      ingestSocket.onopen = () => {
        pushTimeline(`ingest-connected:${streamGeneration}`, 'Ingest connected')
      }

      ingestSocket.onmessage = (event) => {
        if (streamGenerationRef.current !== streamGeneration) {
          return
        }

        let message: StreamSessionStarted | StreamErrorMessage | null = null

        try {
          message = JSON.parse(event.data as string) as StreamSessionStarted | StreamErrorMessage
        } catch {
          setError('Received an invalid message from the ingest websocket.')
          setStatus('error')
          stopRequestedRef.current = true
          cleanupResources()
          return
        }

        if (!message) {
          return
        }

        if (message.type === 'session.started') {
          setSessionId(message.session_id)
          pushTimeline(`session-started:${message.session_id}`, 'Session started')
          void loadPersistedRois(message.session_id)
          openFeedSocket(message.session_id, streamGeneration)
          return
        }

        setError(message.reason)
        if (message.type === 'stream.error') {
          setStatus('error')
          stopRequestedRef.current = true
          cleanupResources()
        }
      }

      ingestSocket.onerror = () => {
        if (!stopRequestedRef.current && streamGenerationRef.current === streamGeneration) {
          setError('Video ingest websocket error.')
          setStatus('error')
          streamGenerationRef.current += 1
          stopRequestedRef.current = true
          pushTimeline(`ingest-error:${streamGeneration}`, 'Ingest error')
          cleanupResources()
        }
      }

      ingestSocket.onclose = () => {
        if (!stopRequestedRef.current && streamGenerationRef.current === streamGeneration) {
          setError('Video ingest websocket error.')
          setStatus('error')
          streamGenerationRef.current += 1
          stopRequestedRef.current = true
          pushTimeline(`ingest-closed:${streamGeneration}`, 'Stream ended')
          cleanupResources()
        }
      }
    } catch (cause) {
      stopRequestedRef.current = true
      cleanupResources()
      setStatus('error')
      setError(cause instanceof Error ? cause.message : 'Unable to start streaming.')
    }
  }, [cleanupResources, loadPersistedRois, openFeedSocket, pushTimeline, resetStreamState, status])

  useEffect(() => {
    return () => {
      stopRequestedRef.current = true
      cleanupResources()
    }
  }, [cleanupResources])

  return {
    activeDetection,
    captureRate,
    error,
    frameUrl,
    localCameraReady,
    localVideoRef,
    roiRows,
    clearSession,
    startStream,
    stopStream,
    status,
    streamStats,
    sessionId,
    showDetectionOverlay,
    timelineEntries,
    setCaptureRate,
    setShowDetectionOverlay,
  }
}
