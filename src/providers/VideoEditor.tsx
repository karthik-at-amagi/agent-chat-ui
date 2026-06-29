"use client";

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
  useEffect,
} from "react";
import { v4 as uuidv4 } from "uuid";
import { getRuntimeEnv } from "@/lib/utils";
import { useAuth } from "./Auth";

export interface AssetInfo {
  id: string;
  title?: string;
}

export interface MediaPoolItem {
  id: string;
  assetId: string;
  fullAssetUrl: string;
  type: "video" | "audio" | "both";
  name: string;
  start: number;
  end: number;
  duration: number;
}

export interface TimelineItem extends MediaPoolItem {
  timelineId: string; // Unique ID for the instance on the timeline
  timelineStart: number;
  trackId: "video" | "audio";
}

interface VideoEditorContextType {
  mediaPool: MediaPoolItem[];
  timelineItems: TimelineItem[];
  selectedMediaItemId: string | null;
  addToMediaPool: (item: Omit<MediaPoolItem, "id">) => void;
  updateMediaItem: (id: string, updates: Partial<MediaPoolItem>) => void;
  removeFromMediaPool: (id: string) => void;
  addToTimeline: (item: MediaPoolItem, trackId: "video" | "audio") => void;
  updateTimelineItem: (
    timelineId: string,
    updates: Partial<TimelineItem>,
  ) => void;
  removeFromTimeline: (timelineId: string) => void;
  moveTimelineItem: (
    timelineId: string,
    direction: "forward" | "backward",
  ) => void;
  setSelectedMediaItemId: (id: string | null) => void;
  playhead: number;
  setPlayhead: (time: number) => void;
  assets: AssetInfo[];
}

const VideoEditorContext = createContext<VideoEditorContextType | undefined>(
  undefined,
);

export function VideoEditorProvider({ children }: { children: ReactNode }) {
  const { apiId } = useAuth();
  const [mediaPool, setMediaPool] = useState<MediaPoolItem[]>([]);
  const [timelineItems, setTimelineItems] = useState<TimelineItem[]>([]);
  const [selectedMediaItemId, setSelectedMediaItemId] = useState<string | null>(
    null,
  );
  const [playhead, setPlayhead] = useState(0);
  const [assets, setAssets] = useState<AssetInfo[]>([]);

  useEffect(() => {
    const fetchAssets = async () => {
      const backendUrl = getRuntimeEnv("NEXT_PUBLIC_VIDEO_BACKEND_URL");
      if (!backendUrl) return;

      const cleanBackendUrl = backendUrl.endsWith("/")
        ? backendUrl.slice(0, -1)
        : backendUrl;

      try {
        const res = await fetch(`${cleanBackendUrl}/assets`, {
          headers: {
            ...(apiId && { "x-login-id": apiId }),
          },
        });
        if (res.ok) {
          const data = await res.json();
          setAssets(data);
        }
      } catch (e) {
        console.error("Failed to fetch assets", e);
      }
    };

    fetchAssets();
  }, [apiId]);

  const addToMediaPool = useCallback((item: Omit<MediaPoolItem, "id">) => {
    const newItem = { ...item, id: uuidv4() };
    setMediaPool((prev) => [...prev, newItem]);
  }, []);

  const updateMediaItem = useCallback(
    (id: string, updates: Partial<MediaPoolItem>) => {
      setMediaPool((prev) =>
        prev.map((item) => (item.id === id ? { ...item, ...updates } : item)),
      );
    },
    [],
  );

  const removeFromMediaPool = useCallback(
    (id: string) => {
      setMediaPool((prev) => prev.filter((item) => item.id !== id));
      if (selectedMediaItemId === id) setSelectedMediaItemId(null);
    },
    [selectedMediaItemId],
  );

  const addToTimeline = useCallback(
    (item: MediaPoolItem, trackId: "video" | "audio") => {
      setTimelineItems((prev) => {
        const trackItems = prev.filter((i) => i.trackId === trackId);
        const lastItem = trackItems.reduce(
          (acc, curr) =>
            curr.timelineStart + (curr.end - curr.start) > acc
              ? curr.timelineStart + (curr.end - curr.start)
              : acc,
          0,
        );

        const newTimelineItem: TimelineItem = {
          ...item,
          timelineId: uuidv4(),
          timelineStart: lastItem,
          trackId,
        };
        return [...prev, newTimelineItem];
      });
    },
    [],
  );

  const updateTimelineItem = useCallback(
    (timelineId: string, updates: Partial<TimelineItem>) => {
      setTimelineItems((prev) =>
        prev.map((item) =>
          item.timelineId === timelineId ? { ...item, ...updates } : item,
        ),
      );
    },
    [],
  );

  const removeFromTimeline = useCallback((timelineId: string) => {
    setTimelineItems((prev) =>
      prev.filter((item) => item.timelineId !== timelineId),
    );
  }, []);

  const moveTimelineItem = useCallback(
    (timelineId: string, direction: "forward" | "backward") => {
      setTimelineItems((prev) => {
        const target = prev.find((item) => item.timelineId === timelineId);
        if (!target) return prev;

        const trackItems = prev.filter(
          (item) => item.trackId === target.trackId,
        );
        const orderedTrackItems = [...trackItems].sort(
          (a, b) => a.timelineStart - b.timelineStart,
        );
        const currentIndex = orderedTrackItems.findIndex(
          (item) => item.timelineId === timelineId,
        );
        if (currentIndex === -1) return prev;

        const nextIndex =
          direction === "forward" ? currentIndex + 1 : currentIndex - 1;
        if (nextIndex < 0 || nextIndex >= orderedTrackItems.length) {
          return prev;
        }

        const updatedOrder = [...orderedTrackItems];
        const [movedItem] = updatedOrder.splice(currentIndex, 1);
        updatedOrder.splice(nextIndex, 0, movedItem);

        let cursor = 0;
        const updatedMap = new Map<string, TimelineItem>();
        updatedOrder.forEach((item) => {
          const duration = item.end - item.start;
          const nextItem = { ...item, timelineStart: cursor };
          updatedMap.set(item.timelineId, nextItem);
          cursor += duration;
        });

        return prev.map((item) => {
          if (item.trackId !== target.trackId) return item;
          return updatedMap.get(item.timelineId) ?? item;
        });
      });
    },
    [],
  );

  return (
    <VideoEditorContext.Provider
      value={{
        mediaPool,
        timelineItems,
        selectedMediaItemId,
        addToMediaPool,
        updateMediaItem,
        removeFromMediaPool,
        addToTimeline,
        updateTimelineItem,
        removeFromTimeline,
        moveTimelineItem,
        setSelectedMediaItemId,
        playhead,
        setPlayhead,
        assets,
      }}
    >
      {children}
    </VideoEditorContext.Provider>
  );
}

export function useVideoEditor() {
  const context = useContext(VideoEditorContext);
  if (context === undefined) {
    throw new Error("useVideoEditor must be used within a VideoEditorProvider");
  }
  return context;
}
