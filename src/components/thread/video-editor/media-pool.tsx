"use client";

import React from "react";
import { useVideoEditor } from "@/providers/VideoEditor";
import { Trash2, Music, Plus } from "lucide-react";

export function MediaPool() {
  const {
    mediaPool,
    removeFromMediaPool,
    selectedMediaItemId,
    setSelectedMediaItemId,
    addToTimeline,
  } = useVideoEditor();

  return (
    <div className="flex h-full flex-col">
      <h2 className="text-muted-foreground mb-3 flex items-center justify-between text-xs font-semibold tracking-wider uppercase">
        Media Pool
        <span className="bg-muted rounded px-1.5 py-0.5 text-[10px]">
          {mediaPool.length}
        </span>
      </h2>
      <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto pr-2">
        {mediaPool.length === 0 ? (
          <div className="border-muted/50 rounded-lg border-2 border-dashed px-4 py-8 text-center">
            <p className="text-muted-foreground text-xs italic">
              No assets in pool. Send videos from chat!
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {mediaPool.map((item) => (
              <div
                key={item.id}
                onClick={() => setSelectedMediaItemId(item.id)}
                className={`group relative flex cursor-pointer items-center gap-3 rounded-lg border p-2 transition-all ${
                  selectedMediaItemId === item.id
                    ? "bg-primary/10 border-primary"
                    : "bg-muted/30 hover:border-muted-foreground/30 border-transparent"
                }`}
              >
                <div className="relative h-12 w-20 flex-shrink-0 overflow-hidden rounded bg-black">
                  {item.type === "audio" ? (
                    <div className="flex h-full w-full items-center justify-center">
                      <Music className="text-primary size-5" />
                    </div>
                  ) : (
                    <video
                      src={`${item.fullAssetUrl || item.assetId}#t=${(item.start + 0.1).toFixed(1)}`}
                      className="h-full w-full object-cover"
                      muted
                      playsInline
                      preload="metadata"
                      crossOrigin="anonymous"
                    />
                  )}
                  <div className="absolute right-0.5 bottom-0.5 rounded bg-black/60 px-1 text-[8px] text-white">
                    {(item.end - item.start).toFixed(1)}s
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11px] leading-tight font-medium">
                    {item.name}
                  </p>
                  <p className="text-muted-foreground mt-0.5 text-[9px]">
                    ID: {item.assetId}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      addToTimeline(
                        item,
                        item.type === "audio" ? "audio" : "video",
                      );
                    }}
                    className="hover:bg-primary hover:text-primary-foreground rounded p-1 opacity-0 transition-all group-hover:opacity-100"
                    title="Add to Timeline"
                  >
                    <Plus className="size-3.5" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFromMediaPool(item.id);
                    }}
                    className="hover:bg-destructive hover:text-destructive-foreground rounded p-1 opacity-0 transition-all group-hover:opacity-100"
                    title="Remove from Pool"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
