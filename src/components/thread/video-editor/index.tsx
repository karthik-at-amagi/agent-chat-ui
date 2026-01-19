"use client";

import React from "react";
import { AssetEditor } from "./asset-editor";
import { MediaPool } from "./media-pool";
import { Timeline } from "./timeline";
import { TimelinePreview } from "./timeline-preview";

export function VideoEditor() {
  return (
    <div className="bg-background text-foreground flex h-full flex-col overflow-hidden">
      {/* Top Section: Asset Editor & Preview (Left) and Media Pool (Right) */}
      <div className="flex overflow-hidden border-b">
        <div className="custom-scrollbar min-h-[400px] flex-[2] space-y-8 overflow-auto border-r p-4">
          <AssetEditor />
        </div>

        <div className="min-w-[300px] flex-1 overflow-hidden p-4">
          <MediaPool />
        </div>
      </div>

      {/* Bottom: Timeline */}
      <div className="custom-scrollbar h-2/5 min-h-[150px] overflow-hidden p-4">
        <TimelinePreview />
        <Timeline />
      </div>
    </div>
  );
}
