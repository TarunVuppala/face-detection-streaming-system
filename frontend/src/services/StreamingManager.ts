import {
  backendUrl,
  backendWsUrl,
  captureRateOptions,
  type RoiRow,
  type RoiStreamMessage,
  type StreamErrorMessage,
  type StreamSessionStarted,
} from '../hooks/useStreaming'
import { useStreamingStore } from '../store/streamingStore'


interface StreamingManagerRefs {
  localVideoRef: React.RefObject<HTMLVideoElement | null>
  mediaStreamRef: React.MutableRefObject<MediaStream | null>
  recorderRef: React.MutableRefObject<MediaRecorder | null>
  clipTimerRef: React.MutableRefObject<number | null>
  ingestSocketRef: React.MutableRefObject<WebSocket | null>
  feedSocketRef: React.MutableRefObject<WebSocket | null>
  frameUrlRef: React.MutableRefObject<string | null>
  stopRequestedRef: React.MutableRefObject<boolean>
  streamGenerationRef: React.MutableRefObject<number>
  frameReceiptTimesRef: React.MutableRefObject<number[]>
  startRecorderRef: React.MutableRefObject<((stream: MediaStream, streamGeneration: number) => void) | null>
}

export class StreamingManager {
  private refs: StreamingManagerRefs

  constructor(refs: StreamingManagerRefs) {
    this.refs = refs
  }

  

  closeSockets = () => {
    if (this.refs.ingestSocketRef.current) {
      this.refs.ingestSocketRef.current.close()
      this.refs.ingestSocketRef.current = null
    }

    if (this.refs.feedSocketRef.current) {
      this.refs.feedSocketRef.current.close()
      this.refs.feedSocketRef.current = null
    }
  }

  clearFrame = () => {
    if (this.refs.frameUrlRef.current) {
      URL.revokeObjectURL(this.refs.frameUrlRef.current)
      this.refs.frameUrlRef.current = null
    }
    useStreamingStore.setState({ frameUrl: null })
  }

  clearClipTimer = () => {
    if (this.refs.clipTimerRef.current !== null) {
      window.clearTimeout(this.refs.clipTimerRef.current)
      this.refs.clipTimerRef.current = null
    }
  }

  clearMedia = () => {
    this.clearClipTimer()

    if (this.refs.recorderRef.current && this.refs.recorderRef.current.state !== 'inactive') {
      this.refs.recorderRef.current.stop()
    }
    this.refs.recorderRef.current = null

    if (this.refs.mediaStreamRef.current) {
      this.refs.mediaStreamRef.current.getTracks().forEach((track: MediaStreamTrack) => track.stop())
      this.refs.mediaStreamRef.current = null
    }

    if (this.refs.localVideoRef.current) {
      this.refs.localVideoRef.current.srcObject = null
    }

    useStreamingStore.setState({ localCameraReady: false })
  }

  cleanupResources = () => {
    this.closeSockets()
    this.clearMedia()
    this.clearFrame()
  }

  

  startRecorder = (stream: MediaStream, streamGeneration: number) => {
    const store = useStreamingStore.getState()

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

    const socket = this.refs.ingestSocketRef.current
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
      if (!this.refs.stopRequestedRef.current && this.refs.streamGenerationRef.current === streamGeneration) {
        useStreamingStore.setState({
          error: 'MediaRecorder failed while capturing the camera stream.',
          status: 'error',
        })
        this.refs.stopRequestedRef.current = true
        this.cleanupResources()
      }
    }

    recorder.onstop = () => {
      this.clearClipTimer()
      this.refs.recorderRef.current = null

      if (this.refs.stopRequestedRef.current || this.refs.streamGenerationRef.current !== streamGeneration) {
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
            this.refs.stopRequestedRef.current ||
            this.refs.streamGenerationRef.current !== streamGeneration ||
            socket.readyState !== WebSocket.OPEN
          ) {
            return
          }

          socket.send(payload)
        } catch {
          if (this.refs.streamGenerationRef.current !== streamGeneration) {
            return
          }

          useStreamingStore.setState({
            error: 'Failed to encode the video clip for upload.',
            status: 'error',
          })
          this.refs.stopRequestedRef.current = true
          this.cleanupResources()
          return
        }

        if (
          this.refs.stopRequestedRef.current ||
          this.refs.streamGenerationRef.current !== streamGeneration ||
          socket.readyState !== WebSocket.OPEN
        ) {
          return
        }

        if (this.refs.startRecorderRef.current) {
          this.refs.startRecorderRef.current(stream, streamGeneration)
        }
      })()
    }

    this.refs.recorderRef.current = recorder
    recorder.start()
    this.refs.clipTimerRef.current = window.setTimeout(() => {
      if (
        !this.refs.stopRequestedRef.current &&
        this.refs.streamGenerationRef.current === streamGeneration &&
        recorder.state === 'recording'
      ) {
        recorder.stop()
      }
    }, captureRateOptions[store.captureRate])
  }

  

  openFeedSocket = (currentSessionId: string, streamGeneration: number) => {
    const socket = new WebSocket(
      `${backendWsUrl}/ws/video/feed?session_id=${encodeURIComponent(currentSessionId)}`,
    )
    socket.binaryType = 'arraybuffer'

    socket.onopen = () => {
      useStreamingStore.getState().pushTimeline(`feed-connected:${currentSessionId}`, 'Feed connected')
      if (this.refs.stopRequestedRef.current || this.refs.streamGenerationRef.current !== streamGeneration) {
        socket.close()
        return
      }

      const stream = this.refs.mediaStreamRef.current
      if (!stream) {
        useStreamingStore.setState({
          error: 'Camera stream was lost before the feed socket opened.',
          status: 'error',
        })
        this.refs.stopRequestedRef.current = true
        this.cleanupResources()
        return
      }

      try {
        this.startRecorder(stream, streamGeneration)
        useStreamingStore.setState({ status: 'streaming' })
      } catch (cause) {
        if (this.refs.streamGenerationRef.current !== streamGeneration) {
          return
        }

        useStreamingStore.setState({
          error: cause instanceof Error ? cause.message : 'Unable to start the recorder.',
          status: 'error',
        })
        this.refs.stopRequestedRef.current = true
        this.cleanupResources()
      }
    }

    socket.onmessage = (event) => {
      if (this.refs.streamGenerationRef.current !== streamGeneration) {
        return
      }

      this.handleFeedSocketMessage(event)
    }

    socket.onerror = () => {
      if (!this.refs.stopRequestedRef.current && this.refs.streamGenerationRef.current === streamGeneration) {
        const store = useStreamingStore.getState()
        store.pushTimeline(`feed-error:${currentSessionId}`, 'Feed error')
        useStreamingStore.setState({
          error: 'Annotated feed websocket error.',
          status: 'error',
        })
        this.refs.stopRequestedRef.current = true
        this.cleanupResources()
      }
    }

    socket.onclose = () => {
      if (!this.refs.stopRequestedRef.current && this.refs.streamGenerationRef.current === streamGeneration) {
        const store = useStreamingStore.getState()
        store.pushTimeline(`feed-closed:${currentSessionId}`, 'Stream ended')
        useStreamingStore.setState({
          error: 'Annotated feed connection closed unexpectedly.',
          status: 'error',
        })
        this.refs.stopRequestedRef.current = true
        this.cleanupResources()
      }
    }

    this.refs.feedSocketRef.current = socket
  }

  private handleFeedSocketMessage = (event: MessageEvent) => {
    if (typeof event.data === 'string') {
      let message: RoiStreamMessage | null
      try {
        message = JSON.parse(event.data) as RoiStreamMessage
      } catch {
        return
      }

      if (!message) {
        return
      }

      this.processRoiMessage(message)
      return
    }

    
    this.processFrameData(event)
  }

  private processRoiMessage = (message: RoiStreamMessage) => {
    const store = useStreamingStore.getState()

    const publishedAt = Date.parse(message.published_at)
    const latencyMs = Number.isNaN(publishedAt)
      ? null
      : Math.max(Date.now() - publishedAt, 0)

    store.updateStreamStats({
      currentLatencyMs: latencyMs,
      currentProcessingMs: message.processing_ms,
      lastUpdateAt: message.published_at,
      facesDetected:
        message.box && message.confidence !== null
          ? store.streamStats.facesDetected + 1
          : store.streamStats.facesDetected,
    })

    if (message.type === 'roi') {
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
        store.updateActiveDetection({
          frameNumber: nextRow.frame_number,
          box: nextRow.box,
          confidence: nextRow.confidence,
        })
        store.pushTimeline(`first-face:${message.session_id}`, 'First face detected')
      } else {
        store.updateActiveDetection({
          frameNumber: nextRow.frame_number,
          box: null,
          confidence: null,
        })
      }

      store.upsertRoiRow(nextRow)
    }
  }

  private processFrameData = (event: MessageEvent) => {
    const store = useStreamingStore.getState()
    const now = Date.now()
    const hadNoFramesYet = this.refs.frameReceiptTimesRef.current.length === 0

    this.refs.frameReceiptTimesRef.current = [
      ...this.refs.frameReceiptTimesRef.current.filter((timestamp: number) => now - timestamp <= 5000),
      now,
    ]
    const fps = Math.round((this.refs.frameReceiptTimesRef.current.length / 5) * 10) / 10

    store.updateStreamStats({
      framesDecoded: store.streamStats.framesDecoded + 1,
      fps,
    })

    if (hadNoFramesYet) {
      store.pushTimeline(`first-frame:${store.sessionId}`, 'First frame received')
    }

    const image =
      event.data instanceof Blob
        ? event.data
        : new Blob([event.data], { type: 'image/jpeg' })
    const nextUrl = URL.createObjectURL(image)

    if (this.refs.frameUrlRef.current) {
      URL.revokeObjectURL(this.refs.frameUrlRef.current)
    }

    this.refs.frameUrlRef.current = nextUrl
    useStreamingStore.setState({ frameUrl: nextUrl })
  }

  

  stopStream = () => {
    this.refs.streamGenerationRef.current += 1
    this.refs.stopRequestedRef.current = true
    const store = useStreamingStore.getState()
    store.pushTimeline(`stream-stopped:${this.refs.streamGenerationRef.current}`, 'Stream stopped')
    this.cleanupResources()
    useStreamingStore.setState({ status: 'stopped' })
  }

  clearSession = () => {
    this.refs.streamGenerationRef.current += 1
    this.refs.stopRequestedRef.current = true
    this.cleanupResources()
    const store = useStreamingStore.getState()
    store.resetStreamState()
    useStreamingStore.setState({
      status: 'idle',
      sessionId: null,
      roiRows: [],
      error: null,
    })
  }

  

  loadPersistedRois = async (currentSessionId: string) => {
    try {
      const response = await fetch(
        `${backendUrl}/api/roi?session_id=${encodeURIComponent(currentSessionId)}&limit=25`,
      )

      if (!response.ok) {
        return
      }

      const body = (await response.json()) as { items?: RoiRow[] }
      const items = body.items ?? []

      const store = useStreamingStore.getState()
      store.mergeRoiRows(items)
    } catch {
      // Ignore errors when loading persisted ROIs
    }
  }

  startStream = async () => {
    const store = useStreamingStore.getState()

    if (store.status === 'starting' || store.status === 'streaming') {
      return
    }

    this.refs.streamGenerationRef.current += 1
    const streamGeneration = this.refs.streamGenerationRef.current
    this.refs.stopRequestedRef.current = true
    this.cleanupResources()
    this.refs.stopRequestedRef.current = false
    store.resetStreamState()
    useStreamingStore.setState({
      error: null,
      status: 'starting',
      sessionId: null,
      roiRows: [],
    })

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

      this.refs.mediaStreamRef.current = stream
      if (this.refs.localVideoRef.current) {
        this.refs.localVideoRef.current.srcObject = stream
        void this.refs.localVideoRef.current.play().catch(() => undefined)
        useStreamingStore.setState({ localCameraReady: true })
      }

      const ingestSocket = new WebSocket(`${backendWsUrl}/ws/video/ingest`)
      this.refs.ingestSocketRef.current = ingestSocket

      ingestSocket.onopen = () => {
        store.pushTimeline(`ingest-connected:${streamGeneration}`, 'Ingest connected')
      }

      ingestSocket.onmessage = (event) => {
        if (this.refs.streamGenerationRef.current !== streamGeneration) {
          return
        }

        this.handleIngestSocketMessage(event, streamGeneration)
      }

      ingestSocket.onerror = () => {
        if (!this.refs.stopRequestedRef.current && this.refs.streamGenerationRef.current === streamGeneration) {
          const s = useStreamingStore.getState()
          s.pushTimeline(`ingest-error:${streamGeneration}`, 'Ingest error')
          useStreamingStore.setState({
            error: 'Video ingest websocket error.',
            status: 'error',
          })
          this.refs.streamGenerationRef.current += 1
          this.refs.stopRequestedRef.current = true
          this.cleanupResources()
        }
      }

      ingestSocket.onclose = () => {
        if (!this.refs.stopRequestedRef.current && this.refs.streamGenerationRef.current === streamGeneration) {
          const s = useStreamingStore.getState()
          s.pushTimeline(`ingest-closed:${streamGeneration}`, 'Stream ended')
          useStreamingStore.setState({
            error: 'Video ingest connection closed unexpectedly.',
            status: 'error',
          })
          this.refs.streamGenerationRef.current += 1
          this.refs.stopRequestedRef.current = true
          this.cleanupResources()
        }
      }
    } catch (cause) {
      this.refs.stopRequestedRef.current = true
      this.cleanupResources()
      useStreamingStore.setState({
        status: 'error',
        error: cause instanceof Error ? cause.message : 'Unable to start streaming.',
      })
    }
  }

  private handleIngestSocketMessage = (event: MessageEvent, streamGeneration: number) => {
    try {
      const message = JSON.parse(event.data as string) as StreamSessionStarted | StreamErrorMessage

      if (message.type === 'session.started') {
        useStreamingStore.setState({ sessionId: message.session_id })
        const store = useStreamingStore.getState()
        store.pushTimeline(`session-started:${message.session_id}`, 'Session started')
        void this.loadPersistedRois(message.session_id)
        this.openFeedSocket(message.session_id, streamGeneration)
        return
      }

      if ('reason' in message) {
        useStreamingStore.setState({ error: message.reason })
      }
      if (message.type === 'stream.error') {
        useStreamingStore.setState({ status: 'error' })
        this.refs.stopRequestedRef.current = true
        this.cleanupResources()
      }
    } catch {
      useStreamingStore.setState({
        error: 'Received an invalid message from the ingest websocket.',
        status: 'error',
      })
      this.refs.stopRequestedRef.current = true
      this.cleanupResources()
      return
    }
  }
}
