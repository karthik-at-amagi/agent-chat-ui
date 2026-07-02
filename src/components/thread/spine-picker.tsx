import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useQueryState } from "nuqs";
import { type PromoSpine } from "@/providers/Stream";

interface SpinePickerProps {
  elicitationId: string;
  spines: PromoSpine[];
  onDone: () => void;
}

export function SpinePickerView({ elicitationId, spines, onDone }: SpinePickerProps) {
  const [selected, setSelected] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [apiUrl] = useQueryState("apiUrl");

  const handleSubmit = async () => {
    if (selected === null || !apiUrl) return;

    setLoading(true);
    try {
      const base = apiUrl.endsWith("/") ? apiUrl.slice(0, -1) : apiUrl;
      const res = await fetch(`${base}/elicitations/${elicitationId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "accept",
          content: { selected_option: selected + 1 },
        }),
      });

      if (!res.ok) throw new Error(await res.text());
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

  return (
    <div className="border-border flex w-full flex-col items-start gap-4 rounded-lg border">
      <div className="border-border bg-muted w-full border-b px-4 py-2">
        <h3 className="text-foreground font-medium">Choose a Promo Spine</h3>
      </div>

      <div className="flex w-full flex-col gap-2 px-4">
        {spines.map((spine, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setSelected(i)}
            className={cn(
              "border-border flex w-full flex-col items-start gap-1 rounded-lg border p-4 text-left transition-colors",
              selected === i
                ? "border-primary bg-primary/5"
                : "bg-muted/50 hover:bg-muted",
            )}
          >
            <div className="flex w-full items-center justify-between gap-2">
              <span className="text-foreground text-sm font-medium">{spine.label}</span>
              <span className="text-muted-foreground bg-muted rounded-full px-2 py-0.5 text-xs">
                {spine.type}
              </span>
            </div>
            <p className="text-muted-foreground text-sm">{spine.premise}</p>
            {spine.trajectory.length > 0 && (
              <p className="text-muted-foreground text-xs">
                {spine.trajectory.join(" → ")}
              </p>
            )}
          </button>
        ))}
      </div>

      <div className="flex w-full items-center justify-end px-4 pb-4">
        <Button
          variant="brand"
          disabled={selected === null || loading}
          onClick={handleSubmit}
        >
          {loading ? "Submitting..." : "Use this spine"}
        </Button>
      </div>
    </div>
  );
}
