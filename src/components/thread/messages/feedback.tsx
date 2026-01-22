"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { ThumbsUp, ThumbsDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { TooltipIconButton } from "../tooltip-icon-button";
import { cn, getRuntimeEnv } from "@/lib/utils";
import { useQueryState } from "nuqs";
import { useAuth } from "@/providers/Auth";

interface FeedbackProps {
  messageId: string;
}

interface FeedbackPopoverProps {
  vote: 1 | -1 | null;
  text: string;
  onVote: (vote: 1 | -1) => boolean;
  onTextChange: (value: string) => void;
  onSubmit: () => Promise<void> | void;
  isSubmitting?: boolean;
  disabled?: boolean;
  className?: string;
}

export function FeedbackPopover({
  vote,
  text,
  onVote,
  onTextChange,
  onSubmit,
  isSubmitting = false,
  disabled = false,
  className,
}: FeedbackPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [popupPosition, setPopupPosition] = useState({ top: 0, left: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

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

    const handleScroll = () => {
      if (isOpen) setIsOpen(false);
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      window.addEventListener("scroll", handleScroll, true);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [isOpen]);

  const updatePosition = () => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setPopupPosition({
        top: rect.top + window.scrollY,
        left: rect.left + window.scrollX,
      });
    }
  };

  const openPopup = () => {
    updatePosition();
    setIsOpen(true);
  };

  const handleVoteClick = (newVote: 1 | -1) => {
    const shouldOpen = onVote(newVote);
    if (shouldOpen) {
      openPopup();
    } else {
      setIsOpen(false);
    }
  };

  const handleSubmitText = async () => {
    await onSubmit();
    setIsOpen(false);
  };

  return (
    <div
      ref={containerRef}
      className={cn("relative flex items-center gap-1", className)}
    >
      <TooltipIconButton
        variant={vote === 1 ? "secondary" : "ghost"}
        tooltip="Helpful"
        onClick={() => handleVoteClick(1)}
        className={cn(
          vote === 1 &&
            "bg-green-100 text-green-600 hover:bg-green-100 hover:text-green-700 dark:bg-green-900/30 dark:text-green-400",
        )}
        disabled={disabled}
      >
        <ThumbsUp className="size-4" />
      </TooltipIconButton>
      <TooltipIconButton
        variant={vote === -1 ? "secondary" : "ghost"}
        tooltip="Not helpful"
        onClick={() => handleVoteClick(-1)}
        className={cn(
          vote === -1 &&
            "bg-red-100 text-red-600 hover:bg-red-100 hover:text-red-700 dark:bg-red-900/30 dark:text-red-400",
        )}
        disabled={disabled}
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
              onChange={(event) => onTextChange(event.target.value)}
              placeholder="Tell us more..."
              className="mb-2 min-h-[80px] resize-none text-xs"
              autoFocus
            />
            <Button
              size="sm"
              className="h-7 w-full text-xs"
              onClick={handleSubmitText}
              disabled={isSubmitting || disabled}
            >
              Submit
            </Button>
          </div>,
          document.body,
        )}
    </div>
  );
}

export function Feedback({ messageId }: FeedbackProps) {
  const { apiId } = useAuth();
  const [threadId] = useQueryState("threadId");
  const [vote, setVote] = useState<1 | -1 | null>(null);
  const [text, setText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Extract run_id if messageId follows "run-{uuid}" pattern, otherwise "unknown"
  const runId = messageId.startsWith("run-")
    ? messageId.replace("run-", "")
    : "unknown";

  const backendUrl = getRuntimeEnv("NEXT_PUBLIC_VIDEO_BACKEND_URL");
  const cleanBackendUrl = backendUrl?.endsWith("/")
    ? backendUrl.slice(0, -1)
    : backendUrl;

  // Fetch existing feedback on mount
  useEffect(() => {
    const fetchFeedback = async () => {
      if (!threadId || !cleanBackendUrl) return;

      try {
        const url = new URL(`${cleanBackendUrl}/feedback/message`);
        url.searchParams.set("thread_id", threadId);
        url.searchParams.set("message_id", messageId);
        url.searchParams.set("actor_type", "user");
        url.searchParams.set("actor_id", "1");

        const res = await fetch(url.toString(), {
          headers: {
            ...(apiId && { "x-login-id": apiId }),
          },
        });
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
  }, [threadId, messageId, cleanBackendUrl, apiId]);

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

      const res = await fetch(`${cleanBackendUrl}/feedback/message`, {
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
    } catch (e) {
      console.error(e);
      toast.error("Failed to submit feedback");
    }
  };

  const handleVote = (newVote: 1 | -1) => {
    if (vote === newVote) {
      setVote(null);
      submitFeedback(0, null);
      return false;
    }
    setVote(newVote);
    submitFeedback(newVote, text || null);
    return true;
  };

  const handleSubmitText = async () => {
    if (!vote) return;
    setIsSubmitting(true);
    await submitFeedback(vote, text);
    setIsSubmitting(false);
    toast.success("Feedback submitted");
  };

  return (
    <FeedbackPopover
      vote={vote}
      text={text}
      onVote={handleVote}
      onTextChange={setText}
      onSubmit={handleSubmitText}
      isSubmitting={isSubmitting}
    />
  );
}
