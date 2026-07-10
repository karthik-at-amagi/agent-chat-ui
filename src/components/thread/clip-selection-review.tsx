import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useQueryState } from "nuqs";
import { Check, RefreshCcw, X } from "lucide-react";
import { type PromoSpine } from "@/providers/Stream";

interface ReviewClip {
  asset_id: string;
  clip_title: string;
  start_time: number;
  end_time: number;
  reason: string;
  thumbnail_url?: string | null;
  video_url?: string | null;
}

interface ClipSelectionPayload {
  kind: "clip_selection";
  selected_spine: PromoSpine;
  target_duration_s?: number | null;
  overall_reason: string;
  clips: ReviewClip[];
}

interface ClipSelectionReviewProps {
  elicitationId: string;
  payload: ClipSelectionPayload;
  onDone: () => void;
}

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds - minutes * 60;
  return `${minutes}:${secs.toFixed(1).padStart(4, "0")}`;
}

function clipFlavor(reason: string): string {
  const match = reason.match(/^\s*\[([^\]]+)\]/);
  return match?.[1] ?? "clip";
}

export function ClipSelectionReviewView({
  elicitationId,
  payload,
}: ClipSelectionReviewProps) {
  const [feedback, setFeedback] = useState("");
  const [loading, setLoading] = useState<"accept" | "revise" | null>(null);
  const [submitted, setSubmitted] = useState<"accept" | "revise" | null>(null);
  const [previewClip, setPreviewClip] = useState<ReviewClip | null>(null);
  const [apiUrl] = useQueryState("apiUrl");

  const submit = async (accepted: boolean) => {
    if (!apiUrl) return;
    if (!accepted && !feedback.trim()) {
      toast.error("Add feedback before requesting changes", {
        richColors: true,
        closeButton: true,
      });
      return;
    }

    setLoading(accepted ? "accept" : "revise");
    try {
      const base = apiUrl.endsWith("/") ? apiUrl.slice(0, -1) : apiUrl;
      const res = await fetch(`${base}/elicitations/${elicitationId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "accept",
          content: {
            accepted,
            feedback: accepted ? "" : feedback.trim(),
          },
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setSubmitted(accepted ? "accept" : "revise");
    } catch (err: any) {
      toast.error("Failed to submit clip review", {
        description: err?.message,
        richColors: true,
        closeButton: true,
        duration: 5000,
      });
    } finally {
      setLoading(null);
    }
  };

  const totalDuration = payload.clips.reduce(
    (acc, clip) => acc + Math.max(0, clip.end_time - clip.start_time),
    0,
  );

  return (
    <div className="bg-background flex w-full flex-col items-start gap-4 rounded-lg p-1">
      <div className="px-1">
        <h3 className="text-sm font-semibold">Review clip selection</h3>
        <p className="text-muted-foreground mt-0.5 text-xs">
          {submitted === "accept"
            ? "Accepted — preparing edit decisions."
            : submitted === "revise"
              ? "Feedback sent — the agent will revise the selection."
              : "Accept to finalize, or give feedback and the agent will search again."}
        </p>
      </div>

      <div className="flex w-full flex-col gap-3 px-1">
        <div className="bg-muted/30 rounded-lg p-3">
          <p className="text-foreground text-sm font-medium">
            Spine: {payload.selected_spine?.label}
          </p>
          <p className="text-muted-foreground mt-1 text-sm">
            {payload.selected_spine?.premise}
          </p>
          {payload.selected_spine?.trajectory?.length > 0 && (
            <p className="text-muted-foreground mt-1 text-xs">
              {payload.selected_spine.trajectory.join(" → ")}
            </p>
          )}
        </div>

        <div>
          <p className="text-foreground text-sm font-medium">Why this cut</p>
          <p className="text-muted-foreground mt-1 text-sm">
            {payload.overall_reason}
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            {payload.clips.length} clips · {totalDuration.toFixed(1)}s selected
            {payload.target_duration_s
              ? ` · target ${payload.target_duration_s.toFixed(0)}s`
              : ""}
          </p>
        </div>

        <div className="flex w-full flex-col divide-y">
          {payload.clips.map((clip, index) => {
            const duration = Math.max(0, clip.end_time - clip.start_time);
            return (
              <div
                key={`${clip.asset_id}-${clip.start_time}-${clip.end_time}-${index}`}
                className="py-3"
              >
                <div className="flex items-start gap-3">
                  {clip.thumbnail_url && (
                    <button
                      type="button"
                      onClick={() => setPreviewClip(clip)}
                      className="shrink-0 overflow-hidden rounded"
                    >
                      <img
                        src={clip.thumbnail_url}
                        alt={clip.clip_title || "clip thumbnail"}
                        className="h-16 w-28 object-cover transition-opacity hover:opacity-80"
                      />
                    </button>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-foreground text-sm font-medium">
                          {index + 1}. {clip.clip_title}
                        </p>
                        <p className="text-muted-foreground mt-0.5 text-xs">
                          {formatTime(clip.start_time)}–{formatTime(clip.end_time)} · {duration.toFixed(1)}s
                        </p>
                      </div>
                      <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs">
                        {clipFlavor(clip.reason)}
                      </span>
                    </div>
                    <p className="text-muted-foreground mt-2 text-sm">
                      {clip.reason.replace(/^\s*\[[^\]]+\]\s*/, "")}
                    </p>
                  </div>
                </div>

              </div>
            );
          })}
        </div>
      </div>

      <div className="flex w-full flex-col gap-3 px-1 pb-1">
        <Textarea
          placeholder="Optional feedback: e.g. Replace clip 2 with a quieter Red visual, make the ending more hopeful..."
          value={feedback}
          disabled={submitted !== null}
          onChange={(e) => setFeedback(e.target.value)}
        />
        <div className="flex w-full justify-end gap-2">
          <Button
            variant="outline"
            disabled={loading !== null || submitted !== null}
            onClick={() => submit(false)}
          >
            <RefreshCcw className="mr-2 size-4" />
            {submitted === "revise"
              ? "Feedback sent"
              : loading === "revise"
                ? "Sending..."
                : "Request changes"}
          </Button>
          <Button
            variant="brand"
            disabled={loading !== null || submitted !== null}
            onClick={() => submit(true)}
          >
            <Check className="mr-2 size-4" />
            {submitted === "accept"
              ? "Accepted"
              : loading === "accept"
                ? "Finalizing..."
                : "Accept and finalize"}
          </Button>
        </div>
      </div>
      {previewClip?.video_url && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-background w-full max-w-2xl rounded-xl border shadow-xl">
            <div className="border-border flex items-center justify-between border-b px-4 py-3">
              <h4 className="text-sm font-semibold">Preview</h4>
              <Button variant="ghost" size="icon" onClick={() => setPreviewClip(null)}>
                <X className="size-4" />
              </Button>
            </div>
            <div className="p-4">
              <video
                src={`${previewClip.video_url}#t=${Math.max(0, previewClip.start_time)},${previewClip.end_time}`}
                controls
                autoPlay
                className="aspect-video w-full rounded-lg bg-black object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
