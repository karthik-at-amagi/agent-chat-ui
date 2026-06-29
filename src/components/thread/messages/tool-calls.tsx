import { AIMessage, ToolMessage } from "@langchain/langgraph-sdk";
import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronDown,
  ChevronUp,
  PlusCircle,
  Download,
  MoveHorizontal,
  X,
} from "lucide-react";
import { getRuntimeEnv } from "@/lib/utils";
import { useVideoEditor } from "@/providers/VideoEditor";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useQueryState } from "nuqs";
import { FeedbackPopover } from "./feedback";
import { useAuth } from "@/providers/Auth";

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
const CLIP_FEEDBACK_WHITELISTED_TOOLS = ["show_clips"];

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function removeMediaFragment(url: string): string {
  return url.split("#")[0];
}

function buildMediaFragmentUrl(
  url: string,
  start: number,
  end: number,
): string {
  const safeStart = Math.max(0, start);
  const safeEnd = Math.max(safeStart + 0.1, end);
  return `${removeMediaFragment(url)}#t=${safeStart},${safeEnd}`;
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h.toString().padStart(2, "0")}:${m
    .toString()
    .padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export function ToolResult({ message }: { message: ToolMessage }) {
  const { apiId } = useAuth();
  const [isExpanded, setIsExpanded] = useState(false);
  const { addToMediaPool, assets } = useVideoEditor();
  const [threadId] = useQueryState("threadId");
  const [clipFeedback, setClipFeedback] = useState<
    Record<string, { vote: 1 | -1 | null; text: string }>
  >({});
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  const [activeFeedbackClipId, setActiveFeedbackClipId] = useState<
    string | null
  >(null);
  const [expandedClipState, setExpandedClipState] = useState<{
    clip: any;
    start: number;
    end: number;
    maxEnd: number | null;
  } | null>(null);

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

  const backendUrl = getRuntimeEnv("NEXT_PUBLIC_VIDEO_BACKEND_URL");
  const cleanBackendUrl = backendUrl?.endsWith("/")
    ? backendUrl.slice(0, -1)
    : backendUrl;

  const resolvedVideoClips = videoClips.map((clip) => {
    const videoUrlWithoutFragment =
      typeof clip.video_url === "string"
        ? removeMediaFragment(clip.video_url).split("?")[0]
        : "";
    const extension = videoUrlWithoutFragment.split(".").pop() || "mp4";
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

  const canShowClipFeedback = CLIP_FEEDBACK_WHITELISTED_TOOLS.includes(
    message.name || "",
  );

  const feedbackClipKeys = useMemo(() => {
    if (!canShowClipFeedback) return [];
    return videoClips
      .filter((clip) => clip.asset_id && clip.clip_id)
      .map((clip) => `${clip.asset_id}:${clip.clip_id}`);
  }, [canShowClipFeedback, videoClips]);

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

  const getClipKey = (clip: any) => `${clip.asset_id}:${clip.clip_id}`;
  const getClipFeedback = (clip: any) =>
    clipFeedback[getClipKey(clip)] || { vote: null, text: "" };

  useEffect(() => {
    const fetchClipFeedback = async () => {
      if (!threadId || !cleanBackendUrl || feedbackClipKeys.length === 0)
        return;

      try {
        const results = await Promise.all(
          feedbackClipKeys.map(async (key) => {
            const [assetId, clipId] = key.split(":");
            const url = new URL(`${cleanBackendUrl}/feedback/clip`);
            url.searchParams.set("thread_id", threadId);
            url.searchParams.set("message_id", message.id || "");
            url.searchParams.set("asset_id", assetId);
            url.searchParams.set("clip_id", clipId);
            url.searchParams.set("actor_type", "user");
            url.searchParams.set("actor_id", "1");

            const res = await fetch(url.toString(), {
              headers: {
                ...(apiId && { "x-login-id": apiId }),
              },
            });
            if (!res.ok) return null;
            const data = await res.json();
            if (data && typeof data.vote === "number") {
              return {
                key,
                vote: data.vote as 1 | -1,
                text: data.feedback_text ?? "",
              };
            }
            return null;
          }),
        );

        const nextFeedback: Record<
          string,
          { vote: 1 | -1 | null; text: string }
        > = {};
        results.forEach((item) => {
          if (item) {
            nextFeedback[item.key] = {
              vote: item.vote,
              text: item.text,
            };
          }
        });

        if (Object.keys(nextFeedback).length > 0) {
          setClipFeedback((prev) => ({
            ...prev,
            ...nextFeedback,
          }));
        }
      } catch (e) {
        console.error("Failed to fetch clip feedback", e);
      }
    };

    fetchClipFeedback();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId, cleanBackendUrl, message.id, apiId]);

  const submitClipFeedback = async (
    clip: any,
    newVote: 1 | -1 | 0,
    feedbackText: string | null,
  ) => {
    if (!threadId || !cleanBackendUrl) return;

    const clipId = getClipKey(clip);
    setIsSubmittingFeedback(true);
    setActiveFeedbackClipId(clipId);

    try {
      const payload = {
        thread_id: threadId,
        message_id: message.id,
        asset_id: clip.asset_id,
        clip_id: clip.clip_id,
        actor_type: "user",
        actor_id: "1",
        vote: newVote,
        feedback_text: feedbackText,
      };

      const res = await fetch(`${cleanBackendUrl}/feedback/clip`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apiId && { "x-login-id": apiId }),
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error("Failed to submit feedback");
      }

      setClipFeedback((prev) => ({
        ...prev,
        [clipId]: {
          vote: newVote === 0 ? null : (newVote as 1 | -1),
          text: feedbackText || "",
        },
      }));
    } catch (e) {
      console.error(e);
      toast.error("Failed to submit clip feedback");
    } finally {
      setIsSubmittingFeedback(false);
      setActiveFeedbackClipId(null);
    }
  };

  const handleClipFeedbackText = (clip: any, value: string) => {
    const clipId = getClipKey(clip);
    setClipFeedback((prev) => ({
      ...prev,
      [clipId]: {
        vote: prev[clipId]?.vote ?? null,
        text: value,
      },
    }));
  };

  const handleClipVote = (clip: any, newVote: 1 | -1) => {
    const feedback = getClipFeedback(clip);
    const nextVote = feedback.vote === newVote ? 0 : newVote;
    submitClipFeedback(clip, nextVote, feedback.text || null);
    return nextVote !== 0;
  };

  const handleClipFeedbackSubmit = async (clip: any) => {
    const feedback = getClipFeedback(clip);
    if (!feedback.vote) return;
    await submitClipFeedback(clip, feedback.vote, feedback.text || null);
    toast.success("Feedback submitted");
  };

  const handleDownloadClip = async (
    displayUrl: string | undefined,
    assetId: string,
  ) => {
    try {
      if (!displayUrl) {
        throw new Error("Missing clip URL");
      }
      const response = await fetch(displayUrl, {
        headers: {
          ...(apiId && { "x-login-id": apiId }),
        },
      });
      if (!response.ok) throw new Error("Failed to download video");
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `clip-${assetId}.mp4`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => window.URL.revokeObjectURL(blobUrl), 100);
      toast.success("Download started");
    } catch (e) {
      console.error(e);
      toast.error("Failed to download video");
    }
  };

  const openExpandedClip = (clip: any) => {
    const maxEnd =
      typeof clip.duration === "number" && clip.duration > 0
        ? clip.duration
        : null;
    const initialStart = Math.max(0, clip.clip_start - 10);
    const rawEnd = clip.clip_end + 10;
    const initialEnd =
      maxEnd !== null ? clamp(rawEnd, initialStart + 0.1, maxEnd) : rawEnd;
    setExpandedClipState({
      clip,
      start: initialStart,
      end: initialEnd,
      maxEnd,
    });
  };

  const adjustExpandedStart = (delta: number) => {
    if (!expandedClipState) return;
    const nextStart = clamp(
      expandedClipState.start + delta,
      0,
      expandedClipState.end - 0.1,
    );
    setExpandedClipState({
      ...expandedClipState,
      start: nextStart,
    });
  };

  const adjustExpandedEnd = (delta: number) => {
    if (!expandedClipState) return;
    const upperBound = expandedClipState.maxEnd ?? Number.POSITIVE_INFINITY;
    const nextEnd = clamp(
      expandedClipState.end + delta,
      expandedClipState.start + 0.1,
      upperBound,
    );
    setExpandedClipState({
      ...expandedClipState,
      end: nextEnd,
    });
  };

  const expandedPreviewUrl = useMemo(() => {
    if (!expandedClipState) return null;
    const baseUrl =
      expandedClipState.clip.fullAssetUrl || expandedClipState.clip.displayUrl;
    if (!baseUrl) return null;
    return buildMediaFragmentUrl(
      baseUrl,
      expandedClipState.start,
      expandedClipState.end,
    );
  }, [expandedClipState]);

  useEffect(() => {
    if (!expandedClipState) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setExpandedClipState(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [expandedClipState]);

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
                    <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="items-center gap-2 text-xs"
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
                        className="items-center gap-2 text-xs"
                        onClick={async () => {
                          await handleDownloadClip(
                            clip.displayUrl,
                            clip.asset_id,
                          );
                        }}
                      >
                        <Download className="size-3" />
                        Download
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="items-center gap-2 text-xs sm:col-span-2"
                        onClick={() => openExpandedClip(clip)}
                      >
                        <MoveHorizontal className="size-3" />
                        extend by 10 seconds
                      </Button>
                    </div>
                    <div className="bg-muted/50 flex flex-col gap-1 rounded p-2 font-mono text-xs">
                      <div className="break-all">{clip.asset_id}</div>
                      {assets.find((a) => a.id === clip.asset_id)?.title && (
                        <div className="text-muted-foreground font-sans">
                          {assets.find((a) => a.id === clip.asset_id)?.title}
                        </div>
                      )}
                      <div className="text-muted-foreground flex items-center justify-between gap-2">
                        <span>
                          {formatTime(clip.clip_start)} -{" "}
                          {formatTime(clip.clip_end)}
                        </span>
                        {canShowClipFeedback && (
                          <FeedbackPopover
                            className="font-sans"
                            vote={getClipFeedback(clip).vote}
                            text={getClipFeedback(clip).text}
                            onVote={(newVote) => handleClipVote(clip, newVote)}
                            onTextChange={(value) =>
                              handleClipFeedbackText(clip, value)
                            }
                            onSubmit={() => handleClipFeedbackSubmit(clip)}
                            isSubmitting={
                              isSubmittingFeedback &&
                              activeFeedbackClipId === getClipKey(clip)
                            }
                          />
                        )}
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
      {expandedClipState && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-background w-full max-w-2xl rounded-xl border shadow-xl">
            <div className="border-border flex items-center justify-between border-b px-4 py-3">
              <h4 className="text-sm font-semibold">Expanded Clip</h4>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setExpandedClipState(null)}
                aria-label="Close expanded clip"
              >
                <X className="size-4" />
              </Button>
            </div>
            <div className="space-y-4 p-4">
              {expandedPreviewUrl && (
                <video
                  key={expandedPreviewUrl}
                  controls
                  className="aspect-video w-full rounded-lg bg-black object-contain"
                  src={expandedPreviewUrl}
                />
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="bg-muted/40 space-y-2 rounded-lg border p-3">
                  <div className="text-sm font-medium">Start</div>
                  <div className="text-muted-foreground font-mono text-xs">
                    {formatTime(expandedClipState.start)} (
                    {expandedClipState.start.toFixed(1)}s)
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => adjustExpandedStart(-10)}
                    >
                      -10s
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => adjustExpandedStart(10)}
                    >
                      +10s
                    </Button>
                  </div>
                </div>
                <div className="bg-muted/40 space-y-2 rounded-lg border p-3">
                  <div className="text-sm font-medium">End</div>
                  <div className="text-muted-foreground font-mono text-xs">
                    {formatTime(expandedClipState.end)} (
                    {expandedClipState.end.toFixed(1)}s)
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => adjustExpandedEnd(-10)}
                    >
                      -10s
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => adjustExpandedEnd(10)}
                    >
                      +10s
                    </Button>
                  </div>
                </div>
              </div>
              <div className="flex w-full gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 items-center gap-2"
                  onClick={() => {
                    addToMediaPool({
                      assetId: expandedClipState.clip.asset_id,
                      fullAssetUrl: expandedClipState.clip.fullAssetUrl,
                      name:
                        expandedClipState.clip.name ||
                        message.name ||
                        "Video Clip",
                      type: "video",
                      start: expandedClipState.start,
                      end: expandedClipState.end,
                      duration:
                        expandedClipState.clip.duration ||
                        expandedClipState.end,
                    });
                    toast.success("Expanded clip added to Media Pool");
                  }}
                >
                  <PlusCircle className="size-3" />
                  Send to pool
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 items-center gap-2"
                  onClick={async () => {
                    await handleDownloadClip(
                      expandedClipState.clip.displayUrl,
                      expandedClipState.clip.asset_id,
                    );
                  }}
                >
                  <Download className="size-3" />
                  Download
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
