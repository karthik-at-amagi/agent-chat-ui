"use client";

import React, { useEffect, useRef, useState } from "react";
import { useVideoEditor } from "@/providers/VideoEditor";
import * as Slider from "@radix-ui/react-slider";
import { Button } from "@/components/ui/button";
import { Play, Pause, Save, RotateCcw } from "lucide-react";

export function AssetEditor() {
  const { mediaPool, selectedMediaItemId, updateMediaItem, addToMediaPool } =
    useVideoEditor();
  const videoRef = useRef<HTMLVideoElement>(null);
  const playheadContainerRef = useRef<HTMLDivElement>(null);
  const isDraggingPlayhead = useRef(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [clipRange, setClipRange] = useState<[number, number]>([0, 10]);
  const [windowRange, setWindowRange] = useState<[number, number]>([0, 10]);
  const [currentTime, setCurrentTime] = useState(0);
  const [assetDuration, setAssetDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const selectedItem = mediaPool.find(
    (item) => item.id === selectedMediaItemId,
  );

  useEffect(() => {
    if (selectedItem) {
      setError(null);
      const start = selectedItem.start ?? 0;
      const end = selectedItem.end ?? selectedItem.duration ?? 10;
      const duration = selectedItem.duration ?? end;

      setClipRange([start, end]);
      setAssetDuration(duration);

      const winStart = Math.max(0, start - 10);
      const winEnd = Math.min(duration, end + 10);
      setWindowRange([winStart, Math.max(winStart + 0.1, winEnd)]);

      if (videoRef.current) {
        videoRef.current.currentTime = start;
      }
    }
  }, [selectedMediaItemId, selectedItem]);

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      const duration = videoRef.current.duration;
      setAssetDuration(duration);
      if (
        selectedItem &&
        (!selectedItem.duration || selectedItem.duration === 0)
      ) {
        updateMediaItem(selectedItem.id, { duration });
      }
      const winEnd = Math.min(duration, clipRange[1] + 10);
      setWindowRange((prev) => [prev[0], Math.max(prev[0] + 0.1, winEnd)]);
    }
  };

  const handleVideoError = () => {
    setError("Failed to load video asset. Please check the URL.");
    setIsPlaying(false);
  };

  const handlePlayPause = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      if (videoRef.current.currentTime >= clipRange[1]) {
        videoRef.current.currentTime = clipRange[0];
      }
      videoRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    setCurrentTime(videoRef.current.currentTime);
    if (
      clipRange[1] > clipRange[0] &&
      videoRef.current.currentTime >= clipRange[1]
    ) {
      videoRef.current.pause();
      setIsPlaying(false);
      videoRef.current.currentTime = clipRange[0];
    }
  };

  const handleClipChange = (newRange: number[]) => {
    setClipRange([newRange[0], newRange[1]]);
    if (videoRef.current) {
      if (newRange[0] !== clipRange[0]) {
        videoRef.current.currentTime = newRange[0];
        setCurrentTime(newRange[0]);
      }
    }
  };

  const handleSeek = (time: number) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = time;
    setCurrentTime(time);
  };

  const handleOverwrite = () => {
    if (!selectedItem) return;
    updateMediaItem(selectedItem.id, {
      start: clipRange[0],
      end: clipRange[1],
    });
  };

  const handleSaveAsNew = () => {
    if (!selectedItem) return;
    addToMediaPool({
      assetId: selectedItem.assetId,
      fullAssetUrl: selectedItem.fullAssetUrl,
      type: selectedItem.type,
      name: `${selectedItem.name} (Trimmed)`,
      start: clipRange[0],
      end: clipRange[1],
      duration: selectedItem.duration ?? clipRange[1] - clipRange[0],
    });
  };

  const resetViewWindow = () => {
    if (!selectedItem) return;
    const start = selectedItem.start ?? 0;
    const end = selectedItem.end ?? assetDuration ?? 10;
    const winStart = Math.max(0, start - 10);
    const winEnd = Math.min(assetDuration, end + 10);
    setWindowRange([winStart, Math.max(winStart + 0.1, winEnd)]);
  };

  const adjustWindow = (side: "start" | "end", amount: number) => {
    setWindowRange((prev) => {
      if (side === "start") {
        const newStart = Math.max(0, Math.min(prev[1] - 0.1, prev[0] + amount));
        return [newStart, prev[1]];
      } else {
        const newEnd = Math.max(
          prev[0] + 0.1,
          Math.min(assetDuration, prev[1] + amount),
        );
        return [prev[0], newEnd];
      }
    });
  };

  const onPlayheadPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    isDraggingPlayhead.current = true;
    window.addEventListener("pointermove", onPlayheadPointerMove);
    window.addEventListener("pointerup", onPlayheadPointerUp);
    window.addEventListener("pointercancel", onPlayheadPointerUp);
  };

  const onPlayheadPointerMove = (e: PointerEvent) => {
    if (!isDraggingPlayhead.current || !playheadContainerRef.current) return;
    const rect = playheadContainerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const percentage = x / rect.width;
    const newTime =
      windowRange[0] + percentage * (windowRange[1] - windowRange[0]);
    handleSeek(newTime);
  };

  const onPlayheadPointerUp = () => {
    if (!isDraggingPlayhead.current) return;
    isDraggingPlayhead.current = false;
    window.removeEventListener("pointermove", onPlayheadPointerMove);
    window.removeEventListener("pointerup", onPlayheadPointerUp);
    window.removeEventListener("pointercancel", onPlayheadPointerUp);
  };

  const handleTrackClickToSeek = (e: React.PointerEvent) => {
    if (!playheadContainerRef.current) return;
    const rect = playheadContainerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const percentage = x / rect.width;
    const newTime =
      windowRange[0] + percentage * (windowRange[1] - windowRange[0]);
    handleSeek(newTime);
  };

  if (!selectedItem) {
    return (
      <div className="text-muted-foreground bg-muted/20 flex h-full flex-col items-center justify-center rounded-lg border-2 border-dashed">
        <p className="text-sm">Select an asset from the pool to edit</p>
      </div>
    );
  }

  const playheadPosition =
    ((currentTime - windowRange[0]) / (windowRange[1] - windowRange[0])) * 100;

  return (
    <div className="flex flex-col gap-4">
      <div className="group relative aspect-video overflow-hidden rounded-lg bg-black">
        {error ? (
          <div className="flex h-full w-full flex-col items-center justify-center p-4 text-center">
            <p className="text-destructive text-xs font-semibold">{error}</p>
            <p className="text-muted-foreground mt-2 text-[10px] break-all">
              {selectedItem.fullAssetUrl || selectedItem.assetId}
            </p>
          </div>
        ) : (
          <video
            ref={videoRef}
            src={selectedItem.fullAssetUrl || selectedItem.assetId}
            className="h-full w-full object-contain"
            onLoadedMetadata={handleLoadedMetadata}
            onError={handleVideoError}
            onTimeUpdate={handleTimeUpdate}
            onEnded={() => {
              setIsPlaying(false);
              if (videoRef.current) videoRef.current.currentTime = clipRange[0];
            }}
          />
        )}
        <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 transition-opacity group-hover:opacity-100">
          <Button
            size="icon"
            variant="ghost"
            className="text-white"
            onClick={handlePlayPause}
            disabled={!!error}
          >
            {isPlaying ? (
              <Pause className="size-8" />
            ) : (
              <Play className="size-8" />
            )}
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        <div className="text-muted-foreground flex justify-between text-[10px] font-bold tracking-tighter uppercase">
          <button
            className="hover:text-primary transition-colors"
            onClick={() => handleSeek(clipRange[0])}
          >
            Clip Start: {clipRange[0].toFixed(1)}s
          </button>
          <span className="text-primary bg-primary/10 rounded px-2 py-0.5 font-mono">
            {currentTime.toFixed(2)}s
          </span>
          <button
            className="hover:text-primary transition-colors"
            onClick={() => handleSeek(clipRange[1])}
          >
            Clip End: {clipRange[1].toFixed(1)}s
          </button>
        </div>

        <div className="space-y-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-muted-foreground text-[9px] font-bold tracking-widest uppercase">
                Trim & Seek
              </label>
              <span className="text-muted-foreground text-[9px] italic">
                Zoom: {(windowRange[1] - windowRange[0]).toFixed(1)}s
              </span>
            </div>
            <div className="relative flex h-8 items-center">
              <Slider.Root
                className="relative z-20 flex h-full w-full touch-none items-center px-2.5 select-none"
                value={[clipRange[0], clipRange[1]]}
                min={windowRange[0]}
                max={windowRange[1]}
                step={0.01}
                minStepsBetweenThumbs={0.1}
                onValueChange={handleClipChange}
              >
                <Slider.Track
                  className="bg-muted/50 relative h-full grow rounded-full"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    handleTrackClickToSeek(e);
                  }}
                >
                  <div className="bg-muted absolute top-1/2 right-0 left-0 h-[8px] -translate-y-1/2 overflow-hidden rounded-full">
                    <Slider.Range className="bg-primary/30 absolute h-full rounded-full" />
                  </div>

                  <div
                    ref={playheadContainerRef}
                    className="pointer-events-none relative h-full w-full"
                  >
                    <div
                      className="group/playhead pointer-events-auto absolute top-0 bottom-0 z-50 -ml-[1px] w-[2px] cursor-col-resize bg-red-500 shadow-[0_0_4px_rgba(239,68,68,0.5)]"
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        onPlayheadPointerDown(e);
                      }}
                      style={{
                        left: `${Math.max(0, Math.min(100, playheadPosition))}%`,
                        display:
                          currentTime >= windowRange[0] &&
                          currentTime <= windowRange[1]
                            ? "block"
                            : "none",
                      }}
                    >
                      <div className="ring-background absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-red-500 shadow-sm ring-1" />
                      <div className="pointer-events-none absolute -bottom-5 left-1/2 -translate-x-1/2 rounded bg-red-500 px-1 text-[7px] whitespace-nowrap text-white opacity-0 transition-opacity group-hover/playhead:opacity-100">
                        {currentTime.toFixed(1)}s
                      </div>
                    </div>
                  </div>
                </Slider.Track>

                <Slider.Thumb className="border-primary hover:bg-muted focus:ring-primary z-40 block h-6 w-2 cursor-col-resize rounded-sm border-2 bg-white shadow-md transition-transform focus:ring-2 focus:outline-none active:scale-110" />
                <Slider.Thumb className="border-primary hover:bg-muted focus:ring-primary z-40 block h-6 w-2 cursor-col-resize rounded-sm border-2 bg-white shadow-md transition-transform focus:ring-2 focus:outline-none active:scale-110" />
              </Slider.Root>
            </div>
          </div>

          <div className="bg-muted/30 border-muted space-y-2 rounded-lg border p-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <label className="text-muted-foreground text-[9px] font-bold tracking-widest uppercase">
                  View Window
                </label>
                <button
                  onClick={resetViewWindow}
                  className="text-primary text-[8px] font-bold tracking-tighter uppercase hover:underline"
                >
                  Reset
                </button>
              </div>
              <span className="text-muted-foreground font-mono text-[9px]">
                {windowRange[0].toFixed(1)}s - {windowRange[1].toFixed(1)}s
              </span>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex flex-col gap-1">
                <button
                  onClick={() => adjustWindow("start", -10)}
                  className="bg-muted hover:bg-muted-foreground/20 rounded px-1 py-0.5 text-[8px]"
                >
                  -10s
                </button>
                <button
                  onClick={() => adjustWindow("start", 10)}
                  className="bg-muted hover:bg-muted-foreground/20 rounded px-1 py-0.5 text-[8px]"
                >
                  +10s
                </button>
              </div>

              <div className="flex-1">
                <Slider.Root
                  className="relative flex h-5 w-full touch-none items-center select-none"
                  value={[windowRange[0], windowRange[1]]}
                  min={0}
                  max={assetDuration || 100}
                  step={0.1}
                  onValueChange={(val) => {
                    setWindowRange([val[0], val[1]]);
                    setClipRange([
                      Math.max(val[0], clipRange[0]),
                      Math.min(val[1], clipRange[1]),
                    ]);
                  }}
                >
                  <Slider.Track className="bg-muted relative h-[4px] grow rounded-full">
                    <Slider.Range className="bg-primary/20 absolute h-full rounded-full" />
                  </Slider.Track>
                  <Slider.Thumb className="border-muted-foreground/30 hover:border-primary block h-4 w-4 cursor-grab rounded-full border bg-white shadow-sm transition-colors active:cursor-grabbing" />
                  <Slider.Thumb className="border-muted-foreground/30 hover:border-primary block h-4 w-4 cursor-grab rounded-full border bg-white shadow-sm transition-colors active:cursor-grabbing" />
                </Slider.Root>
              </div>

              <div className="flex flex-col gap-1">
                <button
                  onClick={() => adjustWindow("end", -10)}
                  className="bg-muted hover:bg-muted-foreground/20 rounded px-1 py-0.5 text-[8px]"
                >
                  -10s
                </button>
                <button
                  onClick={() => adjustWindow("end", 10)}
                  className="bg-muted hover:bg-muted-foreground/20 rounded px-1 py-0.5 text-[8px]"
                >
                  +10s
                </button>
              </div>
            </div>

            <div className="text-muted-foreground flex justify-between px-1 text-[8px]">
              <span>0s</span>
              <span>{(assetDuration || 0).toFixed(1)}s</span>
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 gap-1.5 text-xs font-semibold"
            onClick={handleOverwrite}
          >
            <RotateCcw className="size-3" /> Overwrite Clip
          </Button>
          <Button
            size="sm"
            className="flex-1 gap-1.5 text-xs font-semibold"
            onClick={handleSaveAsNew}
          >
            <Save className="size-3" /> Save as New
          </Button>
        </div>
      </div>
    </div>
  );
}
