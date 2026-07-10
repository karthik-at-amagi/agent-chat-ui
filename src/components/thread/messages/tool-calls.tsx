import { AIMessage, ToolMessage } from "@langchain/langgraph-sdk";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronDown,
  ChevronUp,
  PlusCircle,
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

// ------------------------------------------------------------------
// PromoRenderPlayer: async render player with animated storyboard
// ------------------------------------------------------------------

interface PromoClip {
  asset_id: string;
  clip_start: number;
  clip_end: number;
  outgoing_transition?: { kind: string; duration_s?: number };
  thumbnailUrl?: string;
}

type RenderStatus = "idle" | "rendering" | "done" | "error";

function HlsPlayer({ hlsUrl }: { hlsUrl: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !hlsUrl) return;

    let hls: any = null;

    const attach = async () => {
      const Hls = (await import("hls.js")).default;
      console.log("[HlsPlayer] hlsUrl:", hlsUrl, "isSupported:", Hls.isSupported());
      if (Hls.isSupported()) {
        hls = new Hls({ lowLatencyMode: false });
        hls.loadSource(hlsUrl);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => { console.log("[HlsPlayer] manifest parsed"); });
        hls.on(Hls.Events.ERROR, (_: any, data: any) => console.error("[HlsPlayer] hls error:", data.type, data.details, data.fatal));
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        // Safari native HLS
        video.src = hlsUrl;
      }
    };

    attach();
    return () => { hls?.destroy(); };
  }, [hlsUrl]);

  return (
    <video
      ref={videoRef}
      controls
      autoPlay
      muted
      className="w-full rounded bg-black"
    />
  );
}

function PromoRenderPlayer({
  clips,
  apiId,
  onRenderDone,
  cacheKey,
}: {
  clips: PromoClip[];
  apiId: string | null;
  onRenderDone: (url: string) => void;
  cacheKey: string | null;
}) {
  const [status, setStatus] = useState<RenderStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [hlsUrl, setHlsUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const backendUrlRaw = getRuntimeEnv("NEXT_PUBLIC_VIDEO_BACKEND_URL") ?? "";
  const cleanBackendUrl = backendUrlRaw.endsWith("/") ? backendUrlRaw.slice(0, -1) : backendUrlRaw;

  // Trigger render when component mounts (once)
  useEffect(() => {
    if (status !== "idle") return;
    if (clips.length === 0) return;
    if (!cleanBackendUrl) return;

    setStatus("rendering");
    const backendUrl = cleanBackendUrl;

    const body: Record<string, any> = {
      ...(cacheKey ? { cache_key: cacheKey } : {}),
      clips: clips.map((c, idx) => {
        const trans = c.outgoing_transition;
        const outgoing_transition = trans
          ? { kind: trans.kind, duration_s: trans.duration_s }
          : (idx < clips.length - 1 ? { kind: "cut", duration_s: 0 } : null);
        return {
          asset_id: c.asset_id,
          clip_start: c.clip_start,
          clip_end: c.clip_end,
          outgoing_transition,
        };
      }),
    };

    fetch(`${backendUrl}/render`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiId ? { "x-login-id": apiId } : {}),
      },
      body: JSON.stringify(body),
    })
      .then((r) => r.json())
      .then(({ job_id, hls_url }: { job_id: string; hls_url: string }) => {
        // Show player immediately with the playlist URL (segments stream in as ffmpeg encodes)
        if (hls_url) setHlsUrl(`${backendUrl}${hls_url}`);

        let consecutiveFailures = 0;
        const maxRetries = 5;
        const poll = setInterval(async () => {
          const res = await fetch(`${backendUrl}/render/status/${job_id}`);
          if (!res.ok) {
            consecutiveFailures++;
            if (consecutiveFailures >= maxRetries) {
              clearInterval(poll);
              setStatus("error");
              setError("Render job not found");
            }
            return;
          }
          consecutiveFailures = 0;
          const job = await res.json();
          setProgress(job.progress);
          if (job.hls_url && !hlsUrl) setHlsUrl(`${backendUrl}${job.hls_url}`);
          if (job.status === "done") {
            clearInterval(poll);
            setStatus("done");
            onRenderDone(job.hls_url ?? "");
          } else if (job.status === "failed") {
            clearInterval(poll);
            setStatus("error");
            setError(job.error ?? "Render failed");
          }
        }, 2000);
        return () => clearInterval(poll);
      });
  }, [clips.length, apiId, onRenderDone, cleanBackendUrl]);

  // Idle: nothing
  if (status === "idle") return null;

  // Error state
  if (status === "error") {
    return (
      <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3">
        <div className="mb-2 text-sm font-semibold text-red-700">Promo render failed</div>
        {error && (
          <div className="mb-2 rounded bg-white/50 p-2 text-xs text-red-600">
            {error}
          </div>
        )}
        <button
          className="rounded bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700"
          onClick={() => window.location.reload()}
        >
          Retry
        </button>
      </div>
    );
  }

  // Once we have an HLS URL, show the player (works during encoding and after)
  if (hlsUrl) {
    return (
      <div className="mb-4 rounded-lg border p-3">
        <div className="mb-2 flex items-center justify-between text-sm font-semibold">
          <span>{status === "done" ? "Promo playback" : `Rendering… ${progress}%`}</span>
        </div>
        {status === "rendering" && (
          <div className="mb-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
            <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${progress}%` }} />
          </div>
        )}
        <HlsPlayer hlsUrl={hlsUrl} />
      </div>
    );
  }

  // Rendering state: animated storyboard + progress bar (no HLS URL yet)
  return (
    <div className="mb-4 rounded-lg border p-3">
      <div className="mb-2 text-sm font-semibold">
        Rendering promo — {clips.length} clips with transitions
      </div>

      {/* Animated clip strip */}
      <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
        {clips.map((clip, idx) => (
          <div
            key={`promo-render-${idx}`}
            className="relative flex shrink-0 flex-col items-center gap-1"
          >
            <div
              className={`
                aspect-video w-28 overflow-hidden rounded border
                ${status === "rendering"
                  ? "animate-pulse border-blue-400"
                  : "border-gray-300"}
              `}
            >
              {clip.thumbnailUrl ? (
                <img
                  src={clip.thumbnailUrl}
                  alt={`Clip ${idx + 1}`}
                  className="aspect-video w-full object-cover"
                />
              ) : (
                <div className="flex aspect-video w-full items-center justify-center bg-gray-200 text-xs text-gray-500">
                  Clip {idx + 1}
                </div>
              )}
            </div>
            <div className="text-center text-xs text-gray-600">
              <div className="font-medium">Clip {idx + 1}</div>
              <div className="font-mono">
                {formatTime(clip.clip_start)}–{formatTime(clip.clip_end)}
              </div>
              {clip.outgoing_transition && (
                <div className="text-[10px] capitalize text-gray-400">
                  {clip.outgoing_transition.kind}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Progress bar */}
      <div className="mb-1 h-2 w-full overflow-hidden rounded bg-gray-200">
        <div
          className="h-full rounded bg-blue-500 transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="text-xs text-gray-500">
        {progress < 100 ? `${progress}% complete` : "Render complete"}
      </div>
    </div>
  );
}


export function ToolCalls({
  toolCalls,
}: {
  toolCalls: AIMessage["tool_calls"];
}) {
  if (!toolCalls || toolCalls.length === 0) return null;

  return (
    <div className="grid w-full max-w-3xl grid-rows-[1fr_auto] gap-2 text-left">
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

function normalizeVideoClip(data: any): any | null {
  const clipStart =
    typeof data?.clip_start === "number"
      ? data.clip_start
      : typeof data?.start_time === "number"
        ? data.start_time
        : data?.start_pts_time_s;
  const clipEnd =
    typeof data?.clip_end === "number"
      ? data.clip_end
      : typeof data?.end_time === "number"
        ? data.end_time
        : data?.end_pts_time_s;

  if (
    data &&
    typeof data === "object" &&
    typeof data.asset_id === "string" &&
    typeof clipStart === "number" &&
    typeof clipEnd === "number" &&
    clipEnd > clipStart
  ) {
    return {
      ...data,
      clip_start: clipStart,
      clip_end: clipEnd,
      duration:
        typeof data.duration === "number"
          ? data.duration
          : typeof data.duration_s === "number"
            ? data.duration_s
            : clipEnd - clipStart,
      name: data.name || data.clip_title || data.clip_id || "Video Clip",
      thumbnail_url:
        data.thumbnail_url ||
        (Array.isArray(data.keyframe_urls) ? data.keyframe_urls[0] : undefined),
    };
  }

  return null;
}

export function findVideoClips(data: any): any[] {
  const clips: any[] = [];

  if (!data || typeof data !== "object") {
    return clips;
  }

  if (Array.isArray(data)) {
    data.forEach((item) => {
      clips.push(...findVideoClips(item));
    });
  } else {
    const normalized = normalizeVideoClip(data);
    if (normalized) {
      clips.push(normalized);
    }
    Object.values(data).forEach((value) => {
      clips.push(...findVideoClips(value));
    });
  }

  return clips;
}

function getFinalPromoClips(data: any): any[] {
  const clips =
    data?.artifact?.promo_json?.clips || data?.promo_json?.clips || data?.clips;
  if (!Array.isArray(clips)) return [];
  return clips.map(normalizeVideoClip).filter(Boolean);
}

const MAX_CHAR_LENGTH = 800;
const MAX_LINES = 12;
const MAX_JSON_ITEMS = 4;
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

function ClipRangeVideo({
  url,
  start,
  end,
  className,
  controls = false,
  autoPlay = false,
  muted = false,
}: {
  url: string;
  start: number;
  end: number;
  className?: string;
  controls?: boolean;
  autoPlay?: boolean;
  muted?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const seekAndMaybePlay = () => {
      if (Number.isFinite(start)) {
        video.currentTime = Math.max(0, start);
      }
      if (autoPlay) {
        video.play().catch(() => {
          // Browser may block autoplay with audio; user can press play.
        });
      }
    };

    if (video.readyState >= 1) {
      seekAndMaybePlay();
    } else {
      video.addEventListener("loadedmetadata", seekAndMaybePlay, {
        once: true,
      });
    }

    return () => {
      video.removeEventListener("loadedmetadata", seekAndMaybePlay);
    };
  }, [url, start, autoPlay]);

  return (
    <video
      ref={videoRef}
      controls={controls}
      muted={muted}
      preload="metadata"
      className={className}
      src={removeMediaFragment(url)}
      onTimeUpdate={(event) => {
        const video = event.currentTarget;
        if (Number.isFinite(end) && video.currentTime >= end) {
          video.pause();
          video.currentTime = end;
        }
      }}
    />
  );
}

function stringifyToolValue(value: any): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function parseMaybeJsonText(text: string): {
  parsedContent: any;
  isJsonContent: boolean;
} {
  try {
    const parsedContent = JSON.parse(text);
    return {
      parsedContent,
      isJsonContent: isComplexValue(parsedContent),
    };
  } catch {
    return { parsedContent: text, isJsonContent: false };
  }
}

function parseToolContent(message: ToolMessage): {
  parsedContent: any;
  isJsonContent: boolean;
} {
  if (typeof message.content === "string") {
    return parseMaybeJsonText(message.content);
  }

  if (Array.isArray(message.content)) {
    const textBlocks = message.content
      .map((block: any) => block?.text)
      .filter((text: any) => typeof text === "string");

    if (textBlocks.length === 1) {
      return parseMaybeJsonText(textBlocks[0]);
    }

    if (textBlocks.length > 1) {
      return parseMaybeJsonText(textBlocks.join("\n\n"));
    }
  }

  return {
    parsedContent: message.content,
    isJsonContent: isComplexValue(message.content),
  };
}

function toolArtifactMessage(message: ToolMessage): string {
  const { parsedContent } = parseToolContent(message);
  const resultData = message.artifact ?? parsedContent;
  const messageText =
    resultData?.message ||
    resultData?.artifact?.message ||
    parsedContent?.artifact?.message ||
    parsedContent?.message;

  return stringifyToolValue(messageText || message.name || "Tool completed");
}

export function CompactToolResult({ message }: { message: ToolMessage }) {
  return (
    <div className="w-full max-w-3xl py-1 text-left">
      <div className="text-muted-foreground flex items-center justify-start gap-2 text-left text-sm">
        <span className="bg-muted-foreground/60 size-1.5 rounded-full" />
        <span>{toolArtifactMessage(message)}</span>
      </div>
    </div>
  );
}

export function ToolResult({ message }: { message: ToolMessage }) {
  const { parsedContent, isJsonContent } = parseToolContent(message);
  const resultData = message.artifact ?? parsedContent;

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

  const contentStr = isJsonContent
    ? stringifyToolValue(parsedContent)
    : stringifyToolValue(message.content);
  const contentLines = contentStr.split("\n");
  const shouldTruncate =
    contentLines.length > MAX_LINES || contentStr.length > MAX_CHAR_LENGTH;
  const displayedContent =
    shouldTruncate && !isExpanded
      ? contentStr.length > MAX_CHAR_LENGTH
        ? contentStr.slice(0, MAX_CHAR_LENGTH) + "..."
        : contentLines.slice(0, MAX_LINES).join("\n") + "\n..."
      : contentStr;

  const videoClips = findVideoClips(resultData);
  const finalPromoClips = getFinalPromoClips(resultData);
  const backendUrl = getRuntimeEnv("NEXT_PUBLIC_VIDEO_BACKEND_URL");
  const cleanBackendUrl = backendUrl?.endsWith("/")
    ? backendUrl.slice(0, -1)
    : backendUrl;

  const resolvedVideoClips = videoClips.map((clip) => {
    let fullAssetUrl = clip.video_url;
    if (fullAssetUrl && !fullAssetUrl.startsWith("http") && cleanBackendUrl) {
      // rewrite /assets/<id> → /asset_files/<id>
      const normalized = fullAssetUrl.replace(/^\/?assets\//, "asset_files/");
      const cleanPath = normalized.startsWith("/") ? normalized.slice(1) : normalized;
      fullAssetUrl = `${cleanBackendUrl}/${cleanPath}`;
    }
    if (!fullAssetUrl && cleanBackendUrl) {
      fullAssetUrl = `${cleanBackendUrl}/asset_files/${clip.asset_id}.mp4`;
    }
    const displayUrl = fullAssetUrl
      ? buildMediaFragmentUrl(fullAssetUrl, clip.clip_start, clip.clip_end)
      : undefined;

    return {
      ...clip,
      displayUrl,
      fullAssetUrl,
      thumbnailUrl: clip.thumbnail_url,
    };
  });

  const finalPromoClipKeys = new Set(
    finalPromoClips.map(
      (clip) => `${clip.asset_id}:${clip.clip_start}:${clip.clip_end}`,
    ),
  );
  const resolvedFinalPromoClips = resolvedVideoClips.filter((clip) =>
    finalPromoClipKeys.has(
      `${clip.asset_id}:${clip.clip_start}:${clip.clip_end}`,
    ),
  );

  const canShowClipFeedback = CLIP_FEEDBACK_WHITELISTED_TOOLS.includes(
    message.name || "",
  );

  const feedbackClipKeys = useMemo(() => {
    if (!canShowClipFeedback) return [];
    return videoClips
      .filter((clip) => clip.asset_id && clip.clip_id)
      .map((clip) => `${clip.asset_id}:${clip.clip_id}`);
  }, [canShowClipFeedback, videoClips]);

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
    return (
      expandedClipState.clip.fullAssetUrl ||
      expandedClipState.clip.displayUrl ||
      null
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
    <div className="grid w-full max-w-3xl grid-rows-[1fr_auto] gap-2 text-left">
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
            {resolvedFinalPromoClips.length > 0 && (
              <div className="bg-background mb-4 rounded-lg border p-3">
                <div className="mb-3 text-sm font-semibold">
                  Promo simulation
                </div>
                <div className="flex gap-3 overflow-x-auto pb-1">
                  {resolvedFinalPromoClips.map((clip, idx) => (
                    <div
                      key={`promo-sim-${idx}`}
                      className="flex shrink-0 items-center gap-3"
                    >
                      <button
                        type="button"
                        className="group w-40 overflow-hidden rounded-lg border bg-black text-left"
                        onClick={() => openExpandedClip(clip)}
                      >
                        {clip.thumbnailUrl ? (
                          <img
                            src={clip.thumbnailUrl}
                            alt={clip.clip_title || clip.name || "Promo clip"}
                            className="aspect-video w-full object-cover transition-opacity group-hover:opacity-80"
                          />
                        ) : (
                          <div className="flex aspect-video w-full items-center justify-center text-xs text-white/70">
                            Play clip
                          </div>
                        )}
                        <div className="bg-background p-2 text-xs">
                          <div className="truncate font-medium">
                            {clip.clip_title || clip.name || `Clip ${idx + 1}`}
                          </div>
                          <div className="text-muted-foreground font-mono">
                            {formatTime(clip.clip_start)}–
                            {formatTime(clip.clip_end)}
                          </div>
                        </div>
                      </button>
                      {clip.outgoing_transition && (
                        <div className="text-muted-foreground min-w-20 text-center text-xs">
                          <div className="rounded-full border px-2 py-1 font-medium uppercase">
                            {clip.outgoing_transition.kind}
                          </div>
                          {clip.outgoing_transition.kind === "dissolve" && (
                            <div className="mt-1 font-mono">
                              {clip.outgoing_transition.duration_s}s
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {resolvedFinalPromoClips.length > 0 && (
              <PromoRenderPlayer
                clips={resolvedFinalPromoClips}
                apiId={apiId}
                cacheKey={threadId && message.id ? `${threadId}_${message.id}` : null}
                onRenderDone={(url) => {
                  console.log("Promo render done:", url);
                }}
              />
            )}

            {resolvedVideoClips.length > 0 && (
              <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-2">
                {resolvedVideoClips.map((clip, idx) => (
                  <div
                    key={`clip-${idx}`}
                    className="flex flex-col gap-2"
                  >
                    {clip.displayUrl && (
                      <button
                        type="button"
                        className="overflow-hidden rounded-lg border bg-black"
                        onClick={() => openExpandedClip(clip)}
                      >
                        {clip.thumbnailUrl ? (
                          <img
                            src={clip.thumbnailUrl}
                            alt={clip.clip_title || clip.name || "Video clip"}
                            className="aspect-video w-full object-cover"
                          />
                        ) : (
                          <video
                            muted
                            preload="metadata"
                            className="aspect-video w-full object-contain"
                            src={clip.displayUrl}
                          />
                        )}
                      </button>
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
                <ClipRangeVideo
                  key={`${expandedPreviewUrl}:${expandedClipState.start}:${expandedClipState.end}`}
                  url={expandedPreviewUrl}
                  start={expandedClipState.start}
                  end={expandedClipState.end}
                  controls
                  autoPlay
                  className="aspect-video w-full rounded-lg bg-black object-contain"
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
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
