import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useQueryState } from "nuqs";
import { type PromoSpine } from "@/providers/Stream";
import { Edit, Plus, Check, X } from "lucide-react";

interface SpinePickerProps {
  elicitationId: string;
  spines: PromoSpine[];
  onDone: () => void;
}

export function SpinePickerView({
  elicitationId,
  spines: initialSpines,
  onDone,
}: SpinePickerProps) {
  const [localSpines, setLocalSpines] = useState<PromoSpine[]>(
    initialSpines.map((s) => (typeof s === "string" ? JSON.parse(s) : s)),
  );
  const [selected, setSelected] = useState<number | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [feedback, setFeedback] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState<"accept" | "revise" | null>(null);
  const [apiUrl] = useQueryState("apiUrl");

  const handleAddSpine = () => {
    const nextIndex = localSpines.length;
    const newSpine: PromoSpine = {
      label: "New Spine",
      type: "mystery",
      premise: "",
      trajectory: [],
      ends_on: "",
      grounding: "",
    };
    setLocalSpines((prev) => [...prev, newSpine]);
    setSelected(nextIndex);
    setEditingIndex(nextIndex);
  };

  const handleSaveEdit = (index: number) => {
    setEditingIndex(null);
  };

  const handleCancelEdit = () => {
    setEditingIndex(null);
  };

  const handleSubmit = async () => {
    if (selected === null || !apiUrl) return;

    setLoading(true);
    try {
      const base = apiUrl.endsWith("/") ? apiUrl.slice(0, -1) : apiUrl;
      const payload: any = {
        action: "accept",
        content: {
          selected_option: selected + 1,
          updated_spines: localSpines.map((s) => JSON.stringify(s)),
        },
      };

      const res = await fetch(`${base}/elicitations/${elicitationId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error(await res.text());
      setSubmitted("accept");
      onDone();
    } catch (err: any) {
      toast.error("Failed to submit spine", {
        description: err?.message,
        richColors: true,
        closeButton: true,
        duration: 5000,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRequestNewSpines = async () => {
    if (!apiUrl || !feedback.trim()) {
      toast.error("Add feedback for the next spine direction", {
        richColors: true,
        closeButton: true,
      });
      return;
    }
    setLoading(true);
    try {
      const base = apiUrl.endsWith("/") ? apiUrl.slice(0, -1) : apiUrl;
      const res = await fetch(`${base}/elicitations/${elicitationId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "accept",
          content: {
            accepted: false,
            feedback: feedback.trim(),
          },
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setSubmitted("revise");
      onDone();
    } catch (err: any) {
      toast.error("Failed to submit spine feedback", {
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
    <div className="bg-background flex w-full flex-col items-start gap-3 rounded-none p-1">
      <div className="px-1 text-sm font-semibold">Choose a promo spine</div>

      <div className="flex w-full flex-col gap-1">
        {localSpines.map((spine, i) => {
          if (editingIndex === i) {
            return (
              <div
                key={i}
                className="border-primary flex w-full flex-col gap-2 border p-4"
              >
                <Input
                  placeholder="Label"
                  value={spine.label}
                  onChange={(e) => {
                    const updated = [...localSpines];
                    updated[i] = { ...updated[i], label: e.target.value };
                    setLocalSpines(updated);
                  }}
                />
                <Input
                  placeholder="Type"
                  value={spine.type}
                  onChange={(e) => {
                    const updated = [...localSpines];
                    updated[i] = { ...updated[i], type: e.target.value };
                    setLocalSpines(updated);
                  }}
                />
                <Textarea
                  placeholder="Premise"
                  value={spine.premise}
                  onChange={(e) => {
                    const updated = [...localSpines];
                    updated[i] = { ...updated[i], premise: e.target.value };
                    setLocalSpines(updated);
                  }}
                />
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCancelEdit}
                  >
                    <X className="size-4" />
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => handleSaveEdit(i)}
                  >
                    <Check className="size-4" />
                  </Button>
                </div>
              </div>
            );
          }

          return (
            <div
              key={i}
              role="button"
              tabIndex={0}
              onClick={() => setSelected(i)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setSelected(i);
                }
              }}
              className={cn(
                "group flex w-full cursor-pointer flex-col items-start gap-1 border-l-2 px-3 py-3 text-left transition-colors",
                selected === i
                  ? "border-primary bg-primary/5"
                  : "border-transparent bg-transparent hover:bg-muted/50",
              )}
            >
              <div className="flex w-full items-center justify-between gap-2">
                <span className="text-foreground text-sm font-medium">
                  {spine.label}
                </span>
                <div className="flex items-center gap-2">
                  <span className="border-border text-muted-foreground border bg-background px-2 py-0.5 text-xs">
                    {spine.type}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6 p-0 opacity-0 group-hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingIndex(i);
                    }}
                  >
                    <Edit className="size-3" />
                  </Button>
                </div>
              </div>
              <p className="text-muted-foreground text-sm">{spine.premise}</p>
              {spine.trajectory.length > 0 && (
                <p className="text-muted-foreground text-xs">
                  {spine.trajectory.join(" → ")}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex w-full flex-col gap-2 px-1">
        <Button
          variant="outline"
          size="sm"
          onClick={handleAddSpine}
          disabled={submitted !== null}
          className="w-full"
        >
          <Plus className="mr-2 size-4" /> Add New Spine
        </Button>
        <Textarea
          placeholder="Want a different direction? Describe what the next spine options should emphasize."
          value={feedback}
          disabled={submitted !== null}
          onChange={(e) => setFeedback(e.target.value)}
        />
      </div>

      <div className="flex w-full items-center justify-end gap-2 px-1 pb-1">
        <Button
          variant="outline"
          disabled={loading || submitted !== null}
          onClick={handleRequestNewSpines}
        >
          {submitted === "revise" ? "Feedback sent" : "Suggest different spines"}
        </Button>
        <Button
          variant="brand"
          disabled={selected === null || loading || submitted !== null}
          onClick={handleSubmit}
        >
          {submitted === "accept"
            ? "Selected"
            : loading
              ? "Submitting..."
              : "Use this spine"}
        </Button>
      </div>
    </div>
  );
}
