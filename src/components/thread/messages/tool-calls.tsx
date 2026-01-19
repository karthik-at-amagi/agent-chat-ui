import { AIMessage, ToolMessage } from "@langchain/langgraph-sdk";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronUp, PlusCircle, Download } from "lucide-react";
import { useVideoEditor } from "@/providers/VideoEditor";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

function isComplexValue(value: any): boolean {
  return Array.isArray(value) || (typeof value === "object" && value !== null);
}

export function ToolCalls({
  toolCalls,
}: {
  toolCalls: AIMessage["tool_calls"];
}) {
  if (!toolCalls || toolCalls.length === 0) return null;

  return (
    <div className="mx-auto grid max-w-3xl grid-rows-[1fr_auto] gap-2">
      {toolCalls.map((tc, idx) => {
        const args = tc.args as Record<string, any>;
        const hasArgs = Object.keys(args).length > 0;
        return (
          <div
            key={idx}
            className="border-border overflow-hidden rounded-lg border"
          >
            <div className="border-border bg-muted border-b px-4 py-2">
              <h3 className="text-foreground font-medium">
                {tc.name}
                {tc.id && (
                  <code className="bg-muted ml-2 rounded px-2 py-1 text-sm">
                    {tc.id}
                  </code>
                )}
              </h3>
            </div>
            {hasArgs ? (
              <table className="divide-border min-w-full divide-y">
                <tbody className="divide-border divide-y">
                  {Object.entries(args).map(([key, value], argIdx) => (
                    <tr key={argIdx}>
                      <td className="text-foreground px-4 py-2 text-sm font-medium whitespace-nowrap">
                        {key}
                      </td>
                      <td className="text-muted-foreground px-4 py-2 text-sm">
                        {isComplexValue(value) ? (
                          <code className="bg-muted rounded px-2 py-1 font-mono text-sm break-all">
                            {JSON.stringify(value, null, 2)}
                          </code>
                        ) : (
                          String(value)
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <code className="block p-3 text-sm">{"{}"}</code>
            )}
          </div>
        );
      })}
    </div>
  );
}

function findVideoClips(data: any): any[] {
  const clips: any[] = [];

  if (!data || typeof data !== "object") {
    return clips;
  }

  if (Array.isArray(data)) {
    data.forEach((item) => {
      clips.push(...findVideoClips(item));
    });
  } else {
    if (
      "asset_id" in data &&
      "clip_start" in data &&
      "clip_end" in data &&
      typeof data.asset_id === "string" &&
      typeof data.clip_start === "number" &&
      typeof data.clip_end === "number" &&
      data.clip_end > data.clip_start
    ) {
      clips.push(data);
    }
    Object.values(data).forEach((value) => {
      clips.push(...findVideoClips(value));
    });
  }

  return clips;
}

function findAllVideoUrls(data: any): string[] {
  const urls: string[] = [];

  if (!data || typeof data !== "object") {
    return urls;
  }

  if (Array.isArray(data)) {
    data.forEach((item) => {
      urls.push(...findAllVideoUrls(item));
    });
  } else {
    if ("video_url" in data && typeof data.video_url === "string") {
      urls.push(data.video_url);
    }
    Object.values(data).forEach((value) => {
      urls.push(...findAllVideoUrls(value));
    });
  }

  return urls;
}

const MAX_CHAR_LENGTH = 50;
const MAX_LINES = 2;
const MAX_JSON_ITEMS = 0;

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h.toString().padStart(2, "0")}:${m
    .toString()
    .padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export function ToolResult({ message }: { message: ToolMessage }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { addToMediaPool, assets } = useVideoEditor();

  let parsedContent: any;
  let isJsonContent = false;

  try {
    if (typeof message.content === "string") {
      parsedContent = JSON.parse(message.content);
      isJsonContent = isComplexValue(parsedContent);
    }
  } catch {
    // Content is not JSON, use as is
    parsedContent = message.content;
  }

  const contentStr = isJsonContent
    ? JSON.stringify(parsedContent, null, 2)
    : String(message.content);
  const contentLines = contentStr.split("\n");
  const shouldTruncate =
    contentLines.length > MAX_LINES || contentStr.length > MAX_CHAR_LENGTH;
  const displayedContent =
    shouldTruncate && !isExpanded
      ? contentStr.length > MAX_CHAR_LENGTH
        ? contentStr.slice(0, MAX_CHAR_LENGTH) + "..."
        : contentLines.slice(0, MAX_LINES).join("\n") + "\n..."
      : contentStr;

  const videoClips = findVideoClips(message.artifact);
  const videoUrlsFromContent = isJsonContent
    ? findAllVideoUrls(parsedContent)
    : [];

  const backendUrl = process.env.NEXT_PUBLIC_VIDEO_BACKEND_URL;
  const cleanBackendUrl = backendUrl?.endsWith("/")
    ? backendUrl.slice(0, -1)
    : backendUrl;

  const resolvedVideoClips = videoClips.map((clip) => {
    const extension = clip.video_url?.split(".").pop() || "mp4";
    const fullAssetUrl = cleanBackendUrl
      ? `${cleanBackendUrl}/asset_files/${clip.asset_id}.${extension}`
      : clip.video_url;

    let displayUrl = clip.video_url;
    if (displayUrl && !displayUrl.startsWith("http") && cleanBackendUrl) {
      const cleanPath = displayUrl.startsWith("/")
        ? displayUrl.slice(1)
        : displayUrl;
      displayUrl = `${cleanBackendUrl}/${cleanPath}`;
    }

    return {
      ...clip,
      displayUrl,
      fullAssetUrl,
    };
  });

  // Also handle cases where we just have URLs but no clip metadata
  const videoUrls = Array.from(new Set(findAllVideoUrls(message.artifact)));
  const knownUrls = new Set(videoClips.map((c) => c.video_url).filter(Boolean));
  const otherUrls = videoUrls.filter((url) => !knownUrls.has(url));
  const allUrls = [...videoUrlsFromContent, ...otherUrls];

  const resolvedOtherUrls = allUrls.map((url) => {
    if (!cleanBackendUrl) return url;
    if (url.startsWith("http")) return url;
    const cleanPath = url.startsWith("/") ? url.slice(1) : url;
    return `${cleanBackendUrl}/${cleanPath}`;
  });

  const jsonItems = isJsonContent
    ? Array.isArray(parsedContent)
      ? parsedContent
      : Object.entries(parsedContent)
    : [];

  return (
    <div className="mx-auto grid max-w-3xl grid-rows-[1fr_auto] gap-2">
      <div className="border-border overflow-hidden rounded-lg border">
        <div className="border-border bg-muted border-b px-4 py-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {message.name ? (
              <h3 className="text-foreground font-medium">
                Tool Result:{" "}
                <code className="bg-muted rounded px-2 py-1">
                  {message.name}
                </code>
              </h3>
            ) : (
              <h3 className="text-foreground font-medium">Tool Result</h3>
            )}
            {message.tool_call_id && (
              <code className="bg-muted ml-2 rounded px-2 py-1 text-sm">
                {message.tool_call_id}
              </code>
            )}
          </div>
        </div>
        <motion.div
          className="bg-muted/50 min-w-full"
          initial={false}
          animate={{ height: "auto" }}
          transition={{ duration: 0.3 }}
        >
          <div className="p-3">
            {(resolvedVideoClips.length > 0 ||
              resolvedOtherUrls.length > 0) && (
              <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-2">
                {resolvedVideoClips.map((clip, idx) => (
                  <div
                    key={`clip-${idx}`}
                    className="flex flex-col gap-2"
                  >
                    {clip.displayUrl && (
                      <video
                        controls
                        className="aspect-video w-full rounded-lg bg-black object-contain"
                        src={clip.displayUrl}
                      />
                    )}
                    <div className="flex w-full gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 items-center gap-2 text-xs"
                        onClick={() => {
                          addToMediaPool({
                            assetId: clip.asset_id,
                            fullAssetUrl: clip.fullAssetUrl,
                            name: clip.name || message.name || "Video Clip",
                            type: "video",
                            start: clip.clip_start,
                            end: clip.clip_end,
                            duration: clip.duration || clip.clip_end,
                          });
                          toast.success("Added to Media Pool");
                        }}
                      >
                        <PlusCircle className="size-3" />
                        Send to pool
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 items-center gap-2 text-xs"
                        onClick={async () => {
                          try {
                            const response = await fetch(clip.displayUrl);
                            if (!response.ok)
                              throw new Error("Failed to download video");
                            const blob = await response.blob();
                            const blobUrl = window.URL.createObjectURL(blob);
                            const link = document.createElement("a");
                            link.href = blobUrl;
                            link.download = `clip-${clip.asset_id}.mp4`;
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);
                            setTimeout(
                              () => window.URL.revokeObjectURL(blobUrl),
                              100,
                            );
                            toast.success("Download started");
                          } catch (e) {
                            console.error(e);
                            toast.error("Failed to download video");
                          }
                        }}
                      >
                        <Download className="size-3" />
                        Download
                      </Button>
                    </div>
                    <div className="bg-muted/50 flex flex-col gap-1 rounded p-2 font-mono text-xs">
                      <div className="break-all">{clip.asset_id}</div>
                      {assets.find((a) => a.id === clip.asset_id)?.title && (
                        <div className="text-muted-foreground font-sans">
                          {assets.find((a) => a.id === clip.asset_id)?.title}
                        </div>
                      )}
                      <div className="text-muted-foreground">
                        {formatTime(clip.clip_start)} -{" "}
                        {formatTime(clip.clip_end)}
                      </div>
                    </div>
                  </div>
                ))}
                {resolvedOtherUrls.map((url, idx) => (
                  <div
                    key={`url-${idx}`}
                    className="flex flex-col gap-2"
                  >
                    <video
                      controls
                      className="aspect-video w-full rounded-lg bg-black object-contain"
                      src={url}
                    />
                  </div>
                ))}
              </div>
            )}
            <AnimatePresence
              mode="wait"
              initial={false}
            >
              <motion.div
                key={isExpanded ? "expanded" : "collapsed"}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.2 }}
              >
                {isJsonContent ? (
                  <table className="divide-border min-w-full divide-y">
                    <tbody className="divide-border divide-y">
                      {(isExpanded
                        ? jsonItems
                        : jsonItems.slice(0, MAX_JSON_ITEMS)
                      ).map((item, argIdx) => {
                        const [key, value] = Array.isArray(parsedContent)
                          ? [argIdx, item]
                          : [item[0], item[1]];
                        return (
                          <tr key={argIdx}>
                            <td className="text-foreground px-4 py-2 text-sm font-medium whitespace-nowrap">
                              {key}
                            </td>
                            <td className="text-muted-foreground px-4 py-2 text-sm">
                              {isComplexValue(value) ? (
                                <code className="bg-muted rounded px-2 py-1 font-mono text-sm break-all">
                                  {JSON.stringify(value, null, 2)}
                                </code>
                              ) : (
                                String(value)
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : (
                  <code className="block text-sm">{displayedContent}</code>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
          {((shouldTruncate && !isJsonContent) ||
            (isJsonContent && jsonItems.length > MAX_JSON_ITEMS)) && (
            <motion.button
              onClick={() => setIsExpanded(!isExpanded)}
              className="border-border text-muted-foreground hover:bg-muted hover:text-foreground flex w-full cursor-pointer items-center justify-center border-t-[1px] py-2 transition-all duration-200 ease-in-out"
              initial={{ scale: 1 }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {isExpanded ? <ChevronUp /> : <ChevronDown />}
            </motion.button>
          )}
        </motion.div>
      </div>
    </div>
  );
}
