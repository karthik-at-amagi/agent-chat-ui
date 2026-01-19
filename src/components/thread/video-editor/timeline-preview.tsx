"use client";

import React, { useEffect, useRef, useState, useMemo } from "react";
import { useVideoEditor } from "@/providers/VideoEditor";
import { Play, Pause, Square } from "lucide-react";
import { Button } from "@/components/ui/button";

export function TimelinePreview() {
  const { timelineItems, playhead, setPlayhead } = useVideoEditor();
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const playheadRef = useRef(playhead);

  useEffect(() => {
    playheadRef.current = playhead;
  }, [playhead]);

  const activeVideoItem = useMemo(() => {
    return timelineItems.find(
      (item) =>
        item.trackId === "video" &&
        playhead >= item.timelineStart &&
        playhead < item.timelineStart + (item.end - item.start),
    );
  }, [timelineItems, playhead]);

  const activeAudioItem = useMemo(() => {
    return timelineItems.find(
      (item) =>
        item.trackId === "audio" &&
        playhead >= item.timelineStart &&
        playhead < item.timelineStart + (item.end - item.start),
    );
  }, [timelineItems, playhead]);

  useEffect(() => {
    if (isPlaying) {
      let lastTime = performance.now();
      const update = (now: number) => {
        const dt = (now - lastTime) / 1000;
        const next = playheadRef.current + dt;
        playheadRef.current = next;
        setPlayhead(next);
        lastTime = now;
        animationFrameRef.current = requestAnimationFrame(update);
      };
      animationFrameRef.current = requestAnimationFrame(update);
    } else if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [isPlaying, setPlayhead]);

  // Sync Video Player
  useEffect(() => {
    if (videoRef.current && activeVideoItem) {
      const internalTime =
        activeVideoItem.start + (playhead - activeVideoItem.timelineStart);
      if (Math.abs(videoRef.current.currentTime - internalTime) > 0.2) {
        videoRef.current.currentTime = internalTime;
      }
      if (isPlaying && videoRef.current.paused) {
        videoRef.current.play().catch(() => {});
      } else if (!isPlaying && !videoRef.current.paused) {
        videoRef.current.pause();
      }
    } else if (videoRef.current && !activeVideoItem) {
      videoRef.current.pause();
    }
  }, [activeVideoItem, playhead, isPlaying]);

  // Sync Audio Player
  useEffect(() => {
    if (audioRef.current && activeAudioItem) {
      const internalTime =
        activeAudioItem.start + (playhead - activeAudioItem.timelineStart);
      if (Math.abs(audioRef.current.currentTime - internalTime) > 0.2) {
        audioRef.current.currentTime = internalTime;
      }
      if (isPlaying && audioRef.current.paused) {
        audioRef.current.play().catch(() => {});
      } else if (!isPlaying && !audioRef.current.paused) {
        audioRef.current.pause();
      }
    } else if (audioRef.current && !activeAudioItem) {
      audioRef.current.pause();
    }
  }, [activeAudioItem, playhead, isPlaying]);

  const maxDuration = useMemo(() => {
    return Math.max(
      ...timelineItems.map(
        (item) => item.timelineStart + (item.end - item.start),
      ),
      0,
    );
  }, [timelineItems]);

  useEffect(() => {
    if (playhead >= maxDuration && isPlaying) {
      setIsPlaying(false);
      setPlayhead(0);
    }
  }, [playhead, maxDuration, isPlaying, setPlayhead]);

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
        Timeline Preview
      </h2>
      <div className="relative h-40 overflow-hidden rounded-lg border bg-black">
        {activeVideoItem ? (
          <video
            ref={videoRef}
            src={activeVideoItem.fullAssetUrl || activeVideoItem.assetId}
            className="h-full w-full object-contain"
            muted={!!activeAudioItem}
          />
        ) : (
          <div className="text-muted-foreground flex h-full w-full items-center justify-center text-xs">
            No video at {playhead.toFixed(2)}s
          </div>
        )}

        {activeAudioItem && (
          <audio
            ref={audioRef}
            src={activeAudioItem.fullAssetUrl || activeAudioItem.assetId}
          />
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => setIsPlaying(!isPlaying)}
        >
          {isPlaying ? (
            <Pause className="size-4" />
          ) : (
            <Play className="size-4" />
          )}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setIsPlaying(false);
            setPlayhead(0);
          }}
        >
          <Square className="size-4" />
        </Button>
        <div className="bg-muted relative h-1 flex-1 overflow-hidden rounded-full">
          <div
            className="bg-primary absolute top-0 left-0 h-full"
            style={{ width: `${(playhead / (maxDuration || 1)) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}
