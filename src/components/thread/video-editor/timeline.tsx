"use client";

import React, {
  useMemo,
  useRef,
  useState,
  useCallback,
  useEffect,
} from "react";
import { useVideoEditor, TimelineItem } from "@/providers/VideoEditor";
import { ArrowLeft, ArrowRight, Trash2, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getRuntimeEnv } from "@/lib/utils";
import { toast } from "sonner";
import { useAuth } from "@/providers/Auth";

export function Timeline() {
  const { apiId } = useAuth();
  const {
    timelineItems,
    removeFromTimeline,
    moveTimelineItem,
    playhead,
    setPlayhead,
  } = useVideoEditor();

  const [isRendering, setIsRendering] = useState(false);

  const handleRender = async () => {
    const videoTrack = timelineItems
      .filter((item) => item.trackId === "video")
      .sort((a, b) => a.timelineStart - b.timelineStart);

    if (videoTrack.length === 0) {
      toast.error("No video clips in the timeline to render.");
      return;
    }

    const backendUrl = getRuntimeEnv("NEXT_PUBLIC_VIDEO_BACKEND_URL");
    if (!backendUrl) {
      toast.error("Video backend URL is not configured.");
      return;
    }

    setIsRendering(true);
    try {
      const clips = videoTrack.map((item) => ({
        asset_id: item.assetId,
        clip_start: item.start,
        clip_end: item.end,
      }));

      const cleanBackendUrl = backendUrl.endsWith("/")
        ? backendUrl.slice(0, -1)
        : backendUrl;

      const response = await fetch(`${cleanBackendUrl}/render`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apiId && { "x-login-id": apiId }),
        },
        body: JSON.stringify({
          clips,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to render video");
      }

      const data = await response.json();
      let downloadUrl = data.download_url;

      if (downloadUrl) {
        if (downloadUrl.startsWith("/")) {
          downloadUrl = `${cleanBackendUrl}${downloadUrl}`;
        } else if (!downloadUrl.startsWith("http")) {
          downloadUrl = `${cleanBackendUrl}/${downloadUrl}`;
        }

        // Fetch the file as a blob to force download
        const fileResponse = await fetch(downloadUrl, {
          headers: {
            ...(apiId && { "x-login-id": apiId }),
          },
        });
        if (!fileResponse.ok)
          throw new Error("Failed to download rendered video");

        const blob = await fileResponse.blob();
        const blobUrl = window.URL.createObjectURL(blob);

        const link = document.createElement("a");
        link.href = blobUrl;
        link.download = `rendered-video-${Date.now()}.mp4`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // Cleanup the blob URL after a small delay to ensure download started
        setTimeout(() => window.URL.revokeObjectURL(blobUrl), 100);

        toast.success("Video rendered! Download starting...");
      } else {
        throw new Error("No download URL returned");
      }
    } catch (error) {
      console.error(error);
      toast.error("Failed to render video.");
    } finally {
      setIsRendering(false);
    }
  };

  const maxDuration = useMemo(() => {
    return Math.max(
      ...timelineItems.map(
        (item) => item.timelineStart + (item.end - item.start),
      ),
      30,
    );
  }, [timelineItems]);

  const scale = 10;
  const timelineSurfaceRef = useRef<HTMLDivElement>(null);
  const [isScrubbing, setIsScrubbing] = useState(false);

  const scrubToClientX = useCallback(
    (clientX: number) => {
      const surface = timelineSurfaceRef.current;
      if (!surface) return;
      const rect = surface.getBoundingClientRect();
      if (rect.width === 0) return;
      const relativeX = clientX - rect.left;
      const clampedX = Math.min(Math.max(relativeX, 0), rect.width);
      const ratio = clampedX / rect.width;
      setPlayhead(ratio * maxDuration);
    },
    [maxDuration, setPlayhead],
  );

  useEffect(() => {
    if (!isScrubbing) return;

    const handleMove = (event: PointerEvent) => {
      scrubToClientX(event.clientX);
    };

    const stopScrubbing = () => {
      setIsScrubbing(false);
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", stopScrubbing);
    window.addEventListener("pointercancel", stopScrubbing);

    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", stopScrubbing);
      window.removeEventListener("pointercancel", stopScrubbing);
    };
  }, [isScrubbing, scrubToClientX]);

  const handleScrubStart = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('[data-timeline-control="true"]')) {
        return;
      }

      event.preventDefault();
      setIsScrubbing(true);
      scrubToClientX(event.clientX);
    },
    [scrubToClientX],
  );

  const sortedTracks = useMemo(() => {
    const video = timelineItems
      .filter((item) => item.trackId === "video")
      .sort((a, b) => a.timelineStart - b.timelineStart);
    const audio = timelineItems
      .filter((item) => item.trackId === "audio")
      .sort((a, b) => a.timelineStart - b.timelineStart);

    return { video, audio };
  }, [timelineItems]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
      <div className="flex items-center justify-between">
        <h2 className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
          Timeline
        </h2>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-2 text-[10px]"
            onClick={handleRender}
            disabled={isRendering}
          >
            {isRendering ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <Download className="size-3" />
            )}
            Render & Download
          </Button>
          <span className="bg-muted rounded px-2 py-0.5 font-mono text-[10px]">
            {playhead.toFixed(2)}s / {maxDuration.toFixed(2)}s
          </span>
        </div>
      </div>

      <div className="custom-scrollbar bg-muted/20 relative min-h-0 flex-1 overflow-auto rounded-lg border">
        <div
          ref={timelineSurfaceRef}
          className="cursor-col-resize pb-4 select-none"
          style={{ width: maxDuration * scale }}
          onPointerDown={handleScrubStart}
        >
          <div className="border-muted relative flex h-6 items-end border-b pb-1">
            {Array.from({ length: Math.ceil(maxDuration) + 1 }).map((_, i) => (
              <div
                key={i}
                className="border-muted-foreground/30 absolute h-2 border-l pl-1 text-[8px] select-none"
                style={{ left: i * scale }}
              >
                {i % 5 === 0 ? `${i}s` : ""}
              </div>
            ))}
          </div>

          <div className="relative pt-2">
            <div
              className="pointer-events-none absolute top-0 bottom-0 z-10 w-[2px] bg-red-500"
              style={{ left: playhead * scale }}
            >
              <div className="absolute top-0 left-1/2 h-3 w-3 -translate-x-1/2 rounded-full bg-red-500" />
            </div>

            <div className="space-y-4 px-1">
              <div className="bg-muted/30 border-muted/50 group relative h-16 rounded border">
                <span className="text-muted-foreground absolute top-1 left-2 text-[8px] font-bold uppercase">
                  Video Track
                </span>
                {sortedTracks.video.map((item, index) => (
                  <TimelineClip
                    key={item.timelineId}
                    item={item}
                    scale={scale}
                    onRemove={removeFromTimeline}
                    onMove={moveTimelineItem}
                    canMoveBackward={index > 0}
                    canMoveForward={index < sortedTracks.video.length - 1}
                  />
                ))}
              </div>

              <div className="bg-muted/30 border-muted/50 group relative h-16 rounded border">
                <span className="text-muted-foreground absolute top-1 left-2 text-[8px] font-bold uppercase">
                  Audio Track
                </span>
                {sortedTracks.audio.map((item, index) => (
                  <TimelineClip
                    key={item.timelineId}
                    item={item}
                    scale={scale}
                    onRemove={removeFromTimeline}
                    onMove={moveTimelineItem}
                    canMoveBackward={index > 0}
                    canMoveForward={index < sortedTracks.audio.length - 1}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TimelineClip({
  item,
  scale,
  onRemove,
  onMove,
  canMoveBackward,
  canMoveForward,
}: {
  item: TimelineItem;
  scale: number;
  onRemove: (id: string) => void;
  onMove: (id: string, direction: "forward" | "backward") => void;
  canMoveBackward: boolean;
  canMoveForward: boolean;
}) {
  const duration = item.end - item.start;

  return (
    <div
      className="bg-primary/20 border-primary/40 group/clip hover:bg-primary/30 absolute top-4 flex h-10 flex-col justify-center rounded border px-2 transition-colors"
      style={{
        left: item.timelineStart * scale,
        width: duration * scale,
      }}
    >
      <div className="flex items-center justify-between gap-2 overflow-hidden">
        <p className="truncate text-[9px] font-medium select-none">
          {item.name}
        </p>
        <div className="text-muted-foreground flex items-center gap-1">
          <button
            type="button"
            data-timeline-control="true"
            onClick={() => onMove(item.timelineId, "backward")}
            disabled={!canMoveBackward}
            aria-label="Move clip left"
            className="hover:bg-muted/40 flex h-7 w-7 flex-shrink-0 cursor-pointer items-center justify-center rounded transition-colors disabled:opacity-30"
          >
            <ArrowLeft className="size-3.5" />
          </button>
          <button
            type="button"
            data-timeline-control="true"
            onClick={() => onMove(item.timelineId, "forward")}
            disabled={!canMoveForward}
            aria-label="Move clip right"
            className="hover:bg-muted/40 flex h-7 w-7 flex-shrink-0 cursor-pointer items-center justify-center rounded transition-colors disabled:opacity-30"
          >
            <ArrowRight className="size-3.5" />
          </button>
          <button
            type="button"
            data-timeline-control="true"
            onClick={() => onRemove(item.timelineId)}
            className="hover:bg-destructive/20 hover:text-destructive flex h-7 w-7 flex-shrink-0 cursor-pointer items-center justify-center rounded transition-colors"
            aria-label="Remove clip"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>
      <div className="mt-0.5 flex items-center justify-between">
        <span className="text-muted-foreground text-[7px]">
          {item.start.toFixed(1)}s
        </span>
        <span className="text-muted-foreground text-[7px]">
          {item.end.toFixed(1)}s
        </span>
      </div>
    </div>
  );
}
