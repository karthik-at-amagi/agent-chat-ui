import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useQueryState } from "nuqs";
import { Check, X } from "lucide-react";

interface ReviewClip {
  clip_index?: number;
  clip_title?: string;
  start_time: number;
  end_time: number;
  thumbnail_url?: string | null;
  video_url?: string | null;
}

interface TransitionDecision {
  after_index: number;
  kind: "cut" | "dissolve";
  duration_s: number;
  reason?: string;
}

interface Payload {
  kind: "edit_decisions_review";
  clips: ReviewClip[];
  transitions: TransitionDecision[];
}

interface Props {
  elicitationId: string;
  payload: Payload;
  onDone: () => void;
}

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds - minutes * 60;
  return `${minutes}:${secs.toFixed(1).padStart(4, "0")}`;
}

function valueFor(t: TransitionDecision): string {
  if (t.kind === "cut") return "cut";
  if (t.duration_s <= 0.35) return "dissolve:0.3";
  if (t.duration_s >= 0.75) return "dissolve:0.8";
  return "dissolve:0.5";
}

function fromValue(value: string, base: TransitionDecision): TransitionDecision {
  if (value === "cut") {
    return {
      ...base,
      kind: "cut",
      duration_s: 0,
      reason:
        base.kind === "cut"
          ? base.reason
          : "User selected a cut to make this boundary land immediately.",
    };
  }
  const duration = Number(value.split(":")[1] || 0.5);
  return {
    ...base,
    kind: "dissolve",
    duration_s: duration,
    reason:
      base.kind === "dissolve" && Math.abs(base.duration_s - duration) < 0.01
        ? base.reason
        : "User selected a dissolve to soften this boundary and suggest passage between moments.",
  };
}

export function PromoEditReviewView({ elicitationId, payload, onDone }: Props) {
  const [apiUrl] = useQueryState("apiUrl");
  const [transitions, setTransitions] = useState<TransitionDecision[]>(
    payload.transitions || [],
  );
  const [loading, setLoading] = useState(false);
  const [previewClip, setPreviewClip] = useState<ReviewClip | null>(null);

  const setTransition = (index: number, value: string) => {
    setTransitions((prev) => {
      const next = [...prev];
      next[index] = fromValue(value, next[index]);
      return next;
    });
  };

  const submit = async () => {
    if (!apiUrl) return;
    setLoading(true);
    try {
      const base = apiUrl.endsWith("/") ? apiUrl.slice(0, -1) : apiUrl;
      const res = await fetch(`${base}/elicitations/${elicitationId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "accept",
          content: { accepted: true, transitions },
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      onDone();
    } catch (err: any) {
      toast.error("Failed to submit edit decisions", {
        description: err?.message,
        richColors: true,
        closeButton: true,
        duration: 5000,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-background flex w-full flex-col gap-4 rounded-none p-1">
      <div className="px-1">
        <h3 className="text-sm font-semibold">Review promo edit</h3>
        <p className="text-muted-foreground mt-0.5 text-xs">
          Override cut/dissolve choices at each boundary before finalizing.
        </p>
      </div>

      <div className="px-1">
        <div className="bg-background p-1">
          <div className="mb-3 text-sm font-semibold">Promo simulation</div>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {payload.clips.map((clip, idx) => {
              const transition = transitions[idx];
              const nextClip = payload.clips[idx + 1];
              return (
                <div key={idx} className="flex shrink-0 items-center gap-3">
                  <div className="w-40 overflow-hidden rounded-none border bg-black text-left">
                    {clip.thumbnail_url ? (
                      <button type="button" onClick={() => setPreviewClip(clip)} className="block w-full">
                        <img
                          src={clip.thumbnail_url}
                          alt={clip.clip_title || "Promo clip"}
                          className="aspect-video w-full object-cover transition-opacity hover:opacity-80"
                        />
                      </button>
                    ) : (
                      <div className="flex aspect-video w-full items-center justify-center text-xs text-white/70">
                        Clip {idx + 1}
                      </div>
                    )}
                    <div className="bg-background p-2 text-xs">
                      <div className="truncate font-medium">
                        {clip.clip_title || `Clip ${idx + 1}`}
                      </div>
                      <div className="text-muted-foreground font-mono">
                        {formatTime(clip.start_time)}–{formatTime(clip.end_time)}
                      </div>
                    </div>
                  </div>
                  {nextClip && transition && (
                    <div className="text-muted-foreground min-w-32 text-center text-xs">
                      <select
                        className="bg-background border-border w-full border px-2 py-1 text-center text-xs font-medium uppercase"
                        value={valueFor(transition)}
                        onChange={(e) => setTransition(idx, e.target.value)}
                      >
                        <option value="cut">Cut</option>
                        <option value="dissolve:0.3">Dissolve 0.3s</option>
                        <option value="dissolve:0.5">Dissolve 0.5s</option>
                        <option value="dissolve:0.8">Dissolve 0.8s</option>
                      </select>
                      {transition.reason && (
                        <div className="mt-2 max-w-36 text-balance text-[11px] leading-snug">
                          {transition.reason}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex justify-end px-1 pb-1">
        <Button variant="brand" disabled={loading} onClick={submit}>
          <Check className="mr-2 size-4" />
          {loading ? "Finalizing..." : "Use these edit decisions"}
        </Button>
      </div>
      {previewClip?.video_url && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-background w-full max-w-2xl rounded-none border shadow-none">
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
                className="aspect-video w-full rounded-none bg-black object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
