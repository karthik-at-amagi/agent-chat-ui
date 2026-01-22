"use client";

import { Thread } from "@/components/thread";
import { StreamProvider } from "@/providers/Stream";
import { ThreadProvider } from "@/providers/Thread";
import { ArtifactProvider } from "@/components/thread/artifact";
import { VideoEditorProvider } from "@/providers/VideoEditor";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/providers/Auth";
import React from "react";

export default function DemoPage(): React.ReactNode {
  return (
    <React.Suspense fallback={<div>Loading (layout)...</div>}>
      <Toaster />
      <AuthProvider>
        <ThreadProvider>
          <StreamProvider>
            <ArtifactProvider>
              <VideoEditorProvider>
                <Thread />
              </VideoEditorProvider>
            </ArtifactProvider>
          </StreamProvider>
        </ThreadProvider>
      </AuthProvider>
    </React.Suspense>
  );
}
