import { create } from "zustand";
import {
  type RoiRow,
  type StreamStats,
  type StreamStatus,
  type TimelineEntry,
  normalizeRoiRows,
} from "../hooks/useStreaming";
import type { ActiveDetection } from "../components/Dashboard";

export interface StreamingState {
  status: StreamStatus;
  sessionId: string | null;
  error: string | null;
  frameUrl: string | null;
  localCameraReady: boolean;
  showDetectionOverlay: boolean;
  captureRate: keyof { "1": number; "2": number; "4": number };
  roiRows: RoiRow[];
  activeDetection: ActiveDetection;
  streamStats: StreamStats;
  timelineEntries: TimelineEntry[];
  setStatus: (status: StreamStatus) => void;
  setSessionId: (sessionId: string | null) => void;
  setError: (error: string | null) => void;
  setFrameUrl: (frameUrl: string | null) => void;
  setLocalCameraReady: (ready: boolean) => void;
  setShowDetectionOverlay: (show: boolean) => void;
  setCaptureRate: (
    rate: keyof { "1": number; "2": number; "4": number },
  ) => void;
  setRoiRows: (rows: RoiRow[]) => void;
  setActiveDetection: (detection: ActiveDetection) => void;
  setStreamStats: (
    stats: StreamStats | ((prev: StreamStats) => StreamStats),
  ) => void;
  setTimelineEntries: (entries: TimelineEntry[]) => void;
  upsertRoiRow: (row: RoiRow) => void;
  mergeRoiRows: (incoming: RoiRow[]) => void;
  pushTimeline: (id: string, label: string) => void;
  resetStreamState: () => void;
  updateStreamStats: (updates: Partial<StreamStats>) => void;
  updateActiveDetection: (updates: Partial<ActiveDetection>) => void;
  timelineSeen: Set<string>;
}

const createStreamingStore = () =>
  create<StreamingState>((set, get) => ({
    status: "idle",
    sessionId: null,
    error: null,
    frameUrl: null,
    localCameraReady: false,
    showDetectionOverlay: true,
    captureRate: "1",

    roiRows: [],
    activeDetection: {
      frameNumber: null,
      box: null,
      confidence: null,
    },
    streamStats: {
      framesDecoded: 0,
      facesDetected: 0,
      currentLatencyMs: null,
      currentProcessingMs: null,
      fps: 0,
      lastUpdateAt: null,
    },
    timelineEntries: [],
    timelineSeen: new Set(),

    setStatus: (status: StreamStatus) => set({ status }),
    setSessionId: (sessionId: string | null) => set({ sessionId }),
    setError: (error: string | null) => set({ error }),
    setFrameUrl: (frameUrl: string | null) => set({ frameUrl }),
    setLocalCameraReady: (ready: boolean) => set({ localCameraReady: ready }),
    setShowDetectionOverlay: (show: boolean) =>
      set({ showDetectionOverlay: show }),
    setCaptureRate: (rate: keyof { "1": number; "2": number; "4": number }) =>
      set({ captureRate: rate }),
    setRoiRows: (rows: RoiRow[]) => set({ roiRows: rows }),
    setActiveDetection: (detection: ActiveDetection) =>
      set({ activeDetection: detection }),
    setTimelineEntries: (entries: TimelineEntry[]) =>
      set({ timelineEntries: entries }),

    setStreamStats: (
      stats: StreamStats | ((prev: StreamStats) => StreamStats),
    ) =>
      set((state) => ({
        streamStats:
          typeof stats === "function" ? stats(state.streamStats) : stats,
      })),

    upsertRoiRow: (row: RoiRow) => {
      const { roiRows } = get();
      set({ roiRows: normalizeRoiRows(roiRows, [row]) });
    },

    mergeRoiRows: (incoming: RoiRow[]) => {
      const { roiRows } = get();
      set({ roiRows: normalizeRoiRows(roiRows, incoming) });
    },

    pushTimeline: (id: string, label: string) => {
      const { timelineEntries, timelineSeen } = get();

      if (timelineSeen.has(id)) {
        return;
      }

      timelineSeen.add(id);
      const time = new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });

      set({
        timelineEntries: [{ id, label, time }, ...timelineEntries].slice(0, 6),
      });
    },

    resetStreamState: () => {
      set({
        streamStats: {
          framesDecoded: 0,
          facesDetected: 0,
          currentLatencyMs: null,
          currentProcessingMs: null,
          fps: 0,
          lastUpdateAt: null,
        },
        timelineEntries: [],
        activeDetection: {
          frameNumber: null,
          box: null,
          confidence: null,
        },
        timelineSeen: new Set(),
      });
    },

    updateStreamStats: (updates: Partial<StreamStats>) => {
      set((state) => ({
        streamStats: {
          ...state.streamStats,
          ...updates,
        },
      }));
    },

    updateActiveDetection: (updates: Partial<ActiveDetection>) => {
      set((state) => ({
        activeDetection: {
          ...state.activeDetection,
          ...updates,
        },
      }));
    },
  }));

export const useStreamingStore = createStreamingStore();
