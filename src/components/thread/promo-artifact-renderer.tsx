import React, { useState } from "react";
import { Message } from "@langchain/langgraph-sdk";
import { fetchAssetUrl } from "@/lib/mirage";
import { Button } from "@/components/ui/button";
import { PlayCircle } from "lucide-react";
import { useAuth } from "@/providers/Auth";
import { findVideoClips } from "./messages/tool-calls";
import { cn } from "@/lib/utils";

interface PromoArtifactRendererProps {
  message: Message;
}

export function PromoArtifactRenderer({ message }: PromoArtifactRendererProps) {
  const { apiId } = useAuth();
  const [loadingUrls, setLoadingUrls] = useState<Record<string, boolean>>({});
  const [resolvedUrls, setResolvedUrls] = useState<Record<string, string>>({});

  const artifact = (message as any).artifact;

  if (!artifact) return null;

  const videoClips = findVideoClips(artifact);

  if (videoClips.length === 0) return null;

  const handlePlay = async (assetId: string) => {
    if (resolvedUrls[assetId]) {
      return;
    }

    if (loadingUrls[assetId] || !apiId) return;

    setLoadingUrls((prev) => ({ ...prev, [assetId]: true }));

    try {
      const url = await fetchAssetUrl(assetId, apiId!);
      if (url) {
        setResolvedUrls((prev) => ({ ...prev, [assetId]: url }));
      } else {
        throw new Error("Failed to fetch asset URL");
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoadingUrls((prev) => ({ ...prev, [assetId]: false }));
    }
  };

  return (
    <div className="mt-2 flex flex-wrap gap-3">
      {videoClips.map((clip: any) => {
        const assetId = clip.asset_id;
        const isResolving = loadingUrls[assetId];
        const assetUrl = resolvedUrls[assetId];

        return (
          <div key={assetId} className="flex flex-col gap-2">
            <div className="relative group">
              <div className="aspect-video w-32 overflow-hidden rounded-md border bg-black">
                {clip.keyframe_urls && clip.keyframe_urls.length > 0 ? (
                  <img
                    src={clip.keyframe_urls[0]}
                    alt={clip.asset_id}
                    className="h-full w-full object-cover"
                  />
                ) : assetUrl ? (
                  <video
                    src={assetUrl}
                    className="h-full w-full object-cover"
                    onLoadedData={() => {
                      // We could show a thumbnail here if we had one
                    }}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-muted text-[10px] text-muted-foreground">
                    {isResolving ? "Loading..." : "No Preview"}
                  </div>
                )}
                <button
                  onClick={() => handlePlay(assetId)}
                  disabled={isResolving}
                  className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <PlayCircle className="size-8 text-white" />
                </button>
              </div>
            </div>
            <div className="text-[10px] text-muted-foreground truncate max-w-[128px]">
              {clip.asset_id}
            </div>
          </div>
        );
      })}
    </div>
  );
}
