"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { ThumbsUp, ThumbsDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { TooltipIconButton } from "../tooltip-icon-button";
import { cn } from "@/lib/utils";
import { useQueryState } from "nuqs";

interface FeedbackProps {
  messageId: string;
}

export function Feedback({ messageId }: FeedbackProps) {
  const [threadId] = useQueryState("threadId");
  const [vote, setVote] = useState<1 | -1 | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [text, setText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [popupPosition, setPopupPosition] = useState({ top: 0, left: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  // Extract run_id if messageId follows "run-{uuid}" pattern, otherwise "unknown"
  const runId = messageId.startsWith("run-")
    ? messageId.replace("run-", "")
    : "unknown";

  const backendUrl = process.env.NEXT_PUBLIC_VIDEO_BACKEND_URL;
  const cleanBackendUrl = backendUrl?.endsWith("/")
    ? backendUrl.slice(0, -1)
    : backendUrl;

  // Fetch existing feedback on mount
  useEffect(() => {
    const fetchFeedback = async () => {
      if (!threadId || !cleanBackendUrl) return;

      try {
        const url = new URL(`${cleanBackendUrl}/agent_feedback`);
        url.searchParams.set("thread_id", threadId);
        url.searchParams.set("message_id", messageId);
        url.searchParams.set("actor_type", "user");
        url.searchParams.set("actor_id", "1");

        const res = await fetch(url.toString());
        if (res.ok) {
          const data = await res.json();
          if (data && typeof data.vote === "number") {
            setVote(data.vote as 1 | -1);
            if (data.feedback_text) {
              setText(data.feedback_text);
            }
          }
        }
      } catch (e) {
        console.error("Failed to fetch feedback", e);
      }
    };

    fetchFeedback();
  }, [threadId, messageId, cleanBackendUrl]);

  // Close popup when clicking outside or scrolling
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        popupRef.current &&
        !popupRef.current.contains(event.target as Node) &&
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    // Close on scroll to keep it simple, or we'd need to update position on scroll
    const handleScroll = () => {
      if (isOpen) setIsOpen(false);
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      window.addEventListener("scroll", handleScroll, true); // Capture phase to catch scroll in any container
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [isOpen]);

  const updatePosition = () => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      // Position above the buttons
      setPopupPosition({
        top: rect.top + window.scrollY, // rect.top is relative to viewport
        left: rect.left + window.scrollX,
      });
    }
  };

  const openPopup = () => {
    updatePosition();
    setIsOpen(true);
  };

  const submitFeedback = async (
    newVote: 1 | -1 | 0,
    feedbackText: string | null = null,
  ) => {
    if (!threadId || !cleanBackendUrl) return;

    try {
      const payload = {
        thread_id: threadId,
        run_id: runId,
        message_id: messageId,
        actor_type: "user",
        actor_id: "1",
        vote: newVote,
        feedback_text: feedbackText,
      };

      const res = await fetch(`${cleanBackendUrl}/agent_feedback`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error("Failed to submit feedback");
      }
    } catch (e) {
      console.error(e);
      toast.error("Failed to submit feedback");
    }
  };

  const handleVote = (newVote: 1 | -1) => {
    if (vote === newVote) {
      // Toggle off (undo)
      setVote(null);
      setIsOpen(false);
      submitFeedback(0, null); // Send 0 to undo
      return;
    }
    setVote(newVote);
    openPopup();
    submitFeedback(newVote, text || null);
  };

  const handleSubmitText = async () => {
    if (!vote) return;
    setIsSubmitting(true);
    await submitFeedback(vote, text);
    setIsSubmitting(false);
    setIsOpen(false);
    toast.success("Feedback submitted");
  };

  return (
    <div
      ref={containerRef}
      className="relative flex items-center gap-1"
    >
      <TooltipIconButton
        variant={vote === 1 ? "secondary" : "ghost"}
        tooltip="Helpful"
        onClick={() => handleVote(1)}
        className={cn(
          vote === 1 &&
            "bg-green-100 text-green-600 hover:bg-green-100 hover:text-green-700 dark:bg-green-900/30 dark:text-green-400",
        )}
      >
        <ThumbsUp className="size-4" />
      </TooltipIconButton>
      <TooltipIconButton
        variant={vote === -1 ? "secondary" : "ghost"}
        tooltip="Not helpful"
        onClick={() => handleVote(-1)}
        className={cn(
          vote === -1 &&
            "bg-red-100 text-red-600 hover:bg-red-100 hover:text-red-700 dark:bg-red-900/30 dark:text-red-400",
        )}
      >
        <ThumbsDown className="size-4" />
      </TooltipIconButton>

      {isOpen &&
        createPortal(
          <div
            ref={popupRef}
            style={{
              position: "fixed",
              top: popupPosition.top,
              left: popupPosition.left,
              transform: "translateY(-100%) translateY(-10px)",
            }}
            className="animate-in fade-in zoom-in-95 bg-background border-border z-[9999] mb-2 w-64 rounded-lg border p-2 shadow-lg"
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-muted-foreground text-xs font-medium">
                Feedback
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5"
                onClick={() => setIsOpen(false)}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Tell us more..."
              className="mb-2 min-h-[80px] resize-none text-xs"
              autoFocus
            />
            <Button
              size="sm"
              className="h-7 w-full text-xs"
              onClick={handleSubmitText}
              disabled={isSubmitting}
            >
              Submit
            </Button>
          </div>,
          document.body,
        )}
    </div>
  );
}
