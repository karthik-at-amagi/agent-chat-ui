import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useQueryState } from "nuqs";
import { Check, X, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface QuestionnaireOption {
  id: string;
  label: string;
}

interface QuestionnaireQuestion {
  id: string;
  prompt: string;
  hint?: string | null;
  multi_select: boolean;
  options: QuestionnaireOption[];
}

interface QuestionnairePayload {
  reason: string;
  questions: QuestionnaireQuestion[];
}

interface QuestionnaireReviewProps {
  elicitationId: string;
  payload: QuestionnairePayload;
  onDone: () => void;
}

const OTHER_OPTION_ID = "__other__";
const OTHER_OPTION_LABEL = "Something else...";

interface AnswerState {
  // UI state keeps "__other__" in this list so the textarea reveal works.
  // It is stripped at submit time per the elicitation contract.
  selectedOptionIds: string[];
  freeText: string;
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n).trimEnd() + "…";
}

export function QuestionnaireReviewView({
  elicitationId,
  payload,
  onDone,
}: QuestionnaireReviewProps) {
  const [apiUrl] = useQueryState("apiUrl");
  const [loading, setLoading] = useState<"accept" | "cancel" | null>(null);
  const [submitted, setSubmitted] = useState(false);

  // Dedupe options by id and ensure the __other__ option appears exactly once,
  // at the end. The backend already appends __other__ as the last option, so
  // re-appending it (as the previous code did) caused the "Something else..."
  // card to render twice.
  const questions = useMemo(() => {
    return (payload.questions ?? []).map((q) => {
      const seen = new Set<string>();
      const deduped: QuestionnaireOption[] = [];
      for (const o of q.options ?? []) {
        if (!seen.has(o.id)) {
          seen.add(o.id);
          deduped.push(o);
        }
      }
      const withoutOther = deduped.filter(
        (o) => o.id !== OTHER_OPTION_ID,
      );
      withoutOther.push({ id: OTHER_OPTION_ID, label: OTHER_OPTION_LABEL });
      return { ...q, options: withoutOther };
    });
  }, [payload.questions]);

  const [answersByQuestion, setAnswersByQuestion] = useState<
    Record<string, AnswerState>
  >(() => {
    const init: Record<string, AnswerState> = {};
    for (const q of questions) {
      init[q.id] = { selectedOptionIds: [], freeText: "" };
    }
    return init;
  });

  const [activeIdx, setActiveIdx] = useState(0);

  const isAnswered = (qid: string): boolean => {
    const s = answersByQuestion[qid];
    if (!s) return false;
    if (s.selectedOptionIds.includes(OTHER_OPTION_ID)) {
      return s.freeText.trim().length > 0;
    }
    return s.selectedOptionIds.length > 0;
  };

  const setSingleSelect = (questionId: string, optionId: string) => {
    setAnswersByQuestion((prev) => ({
      ...prev,
      [questionId]: {
        selectedOptionIds: [optionId],
        freeText:
          optionId === OTHER_OPTION_ID
            ? (prev[questionId]?.freeText ?? "")
            : "",
      },
    }));
  };

  const toggleMultiSelect = (questionId: string, optionId: string) => {
    setAnswersByQuestion((prev) => {
      const current = prev[questionId] ?? {
        selectedOptionIds: [],
        freeText: "",
      };
      if (optionId === OTHER_OPTION_ID) {
        const alreadyOther = current.selectedOptionIds.includes(
          OTHER_OPTION_ID,
        );
        return {
          ...prev,
          [questionId]: {
            selectedOptionIds: alreadyOther ? [] : [OTHER_OPTION_ID],
            freeText: alreadyOther ? "" : current.freeText,
          },
        };
      }
      const withoutOther = current.selectedOptionIds.filter(
        (id) => id !== OTHER_OPTION_ID,
      );
      const has = withoutOther.includes(optionId);
      return {
        ...prev,
        [questionId]: {
          selectedOptionIds: has
            ? withoutOther.filter((id) => id !== optionId)
            : [...withoutOther, optionId],
          freeText: "",
        },
      };
    });
  };

  const setFreeText = (questionId: string, value: string) => {
    setAnswersByQuestion((prev) => ({
      ...prev,
      [questionId]: {
        ...(prev[questionId] ?? { selectedOptionIds: [], freeText: "" }),
        freeText: value,
      },
    }));
  };

  // Single-select questions auto-advance to the next unanswered question,
  // unless the user picked the "__other__" option — that reveals the free-text
  // textarea and waits for an explicit Next/Submit click so the user has a
  // chance to type. Switching back to a normal option re-enables auto-advance.
  const handleSingleSelect = (qid: string, optionId: string) => {
    setSingleSelect(qid, optionId);
    if (optionId === OTHER_OPTION_ID) return;
    setTimeout(() => {
      const curIdx = questions.findIndex((q) => q.id === qid);
      for (let i = curIdx + 1; i < questions.length; i++) {
        if (!isAnswered(questions[i].id)) {
          setActiveIdx(i);
          return;
        }
      }
      // No further unanswered question; stay put (Submit is shown).
    }, 120);
  };

  const buildAnswers = () => {
    return questions.map((q) => {
      const state = answersByQuestion[q.id] ?? {
        selectedOptionIds: [],
        freeText: "",
      };
      const pickedOther = state.selectedOptionIds.includes(OTHER_OPTION_ID);
      if (pickedOther) {
        const text = state.freeText.trim();
        return {
          question_id: q.id,
          selected_option_ids: [] as string[],
          free_text: text ? text : null,
        };
      }
      return {
        question_id: q.id,
        selected_option_ids: state.selectedOptionIds,
        free_text: null as string | null,
      };
    });
  };

  const post = async (
    action: "accept" | "cancel",
    content: Record<string, unknown>,
  ) => {
    if (!apiUrl) return;
    setLoading(action);
    try {
      const base = apiUrl.endsWith("/") ? apiUrl.slice(0, -1) : apiUrl;
      const res = await fetch(`${base}/elicitations/${elicitationId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, content }),
      });
      if (!res.ok) throw new Error(await res.text());
      if (action === "accept") setSubmitted(true);
      onDone();
    } catch (err: any) {
      toast.error("Failed to submit questionnaire", {
        description: err?.message,
        richColors: true,
        closeButton: true,
        duration: 5000,
      });
    } finally {
      setLoading(null);
    }
  };

  const onSubmit = () => {
    void post("accept", { answers: buildAnswers() });
  };

  const onSkip = () => {
    void post("cancel", {});
  };

  if (questions.length === 0) {
    return (
      <div className="flex w-full flex-col items-start gap-4 p-1">
        <div className="px-1">
          <h3 className="text-sm font-semibold">{payload.reason}</h3>
          <p className="text-muted-foreground mt-0.5 text-xs">
            No questions to answer.
          </p>
        </div>
        <div className="flex w-full justify-end gap-2 px-1 pb-1">
          <Button
            variant="outline"
            disabled={loading !== null || submitted}
            onClick={onSkip}
          >
            <X className="mr-2 size-4" />
            {loading === "cancel" ? "Skipping..." : "Skip"}
          </Button>
        </div>
      </div>
    );
  }

  const activeQuestion = questions[activeIdx];
  const activeState = answersByQuestion[activeQuestion.id] ?? {
    selectedOptionIds: [],
    freeText: "",
  };
  const isMulti = !!activeQuestion.multi_select;
  const isLast = activeIdx === questions.length - 1;
  const pickedOtherActive = activeState.selectedOptionIds.includes(
    OTHER_OPTION_ID,
  );

  const goNext = () => {
    if (!isLast) setActiveIdx(activeIdx + 1);
  };

  return (
    <div className="bg-background flex w-full flex-col items-start gap-4 p-1">
      <div className="px-1">
        <h3 className="text-sm font-semibold">{payload.reason}</h3>
        <p className="text-muted-foreground mt-0.5 text-xs">
          {submitted
            ? "Answers submitted."
            : "Answer the questions below and submit, or skip."}
        </p>
      </div>

      {/* Tab bar — one entry per question */}
      <div className="flex w-full flex-wrap items-center gap-1 border-b border-border px-1 pb-2">
        {questions.map((q, i) => {
          const answered = isAnswered(q.id);
          const active = i === activeIdx;
          return (
            <button
              type="button"
              key={q.id}
              onClick={() => setActiveIdx(i)}
              className={cn(
                "flex items-center gap-1 border px-2 py-1 text-xs transition-colors",
                active
                  ? "border-primary bg-primary/5 text-foreground"
                  : "border-border bg-background text-muted-foreground hover:bg-muted/40",
              )}
              aria-pressed={active}
            >
              <span className="font-semibold">{i + 1}</span>
              <span className="max-w-[120px] truncate">
                {truncate(q.prompt, 24)}
              </span>
              {answered ? (
                <Check className="size-3 text-primary" />
              ) : (
                <span className="bg-muted-foreground/40 size-1.5" />
              )}
            </button>
          );
        })}
      </div>

      {/* Active question */}
      <div className="flex w-full flex-col gap-3 px-1">
        <div className="border-border border p-3">
          <p className="text-foreground text-sm font-medium">
            {activeQuestion.prompt}
          </p>
          {activeQuestion.hint ? (
            <p className="text-muted-foreground mt-1 text-xs">
              {activeQuestion.hint}
            </p>
          ) : null}

          <div className="mt-3 flex flex-col gap-2">
            {activeQuestion.options.map((opt) => {
              const checked = activeState.selectedOptionIds.includes(opt.id);
              const isOther = opt.id === OTHER_OPTION_ID;
              return (
                <div key={opt.id} className="flex flex-col gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      isMulti
                        ? toggleMultiSelect(activeQuestion.id, opt.id)
                        : handleSingleSelect(activeQuestion.id, opt.id)
                    }
                    aria-pressed={checked}
                    className={cn(
                      "flex w-full items-center gap-2 border px-3 py-2 text-left text-sm transition-colors",
                      checked
                        ? "border-primary bg-primary/5"
                        : "border-border bg-background hover:bg-muted/40",
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-4 shrink-0 items-center justify-center border",
                        checked
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background",
                      )}
                    >
                      {checked ? <Check className="size-3" /> : null}
                    </span>
                    <span className="text-foreground flex-1">
                      {opt.label}
                    </span>
                  </button>
                  {isOther && pickedOtherActive ? (
                    <Textarea
                      placeholder="Type your answer..."
                      value={activeState.freeText}
                      onChange={(e) =>
                        setFreeText(activeQuestion.id, e.target.value)
                      }
                      className="border-border mt-1 rounded-none p-2 text-sm"
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex w-full justify-end gap-2 px-1 pb-1">
        <Button
          variant="outline"
          disabled={loading !== null || submitted}
          onClick={onSkip}
        >
          <X className="mr-2 size-4" />
          {loading === "cancel" ? "Skipping..." : "Skip"}
        </Button>
        {isMulti && !isLast ? (
          <Button
            variant="outline"
            disabled={loading !== null || submitted}
            onClick={goNext}
          >
            Next
            <ChevronRight className="ml-2 size-4" />
          </Button>
        ) : null}
        {!isMulti && pickedOtherActive && !isLast ? (
          <Button
            variant="outline"
            disabled={loading !== null || submitted}
            onClick={goNext}
          >
            Next
            <ChevronRight className="ml-2 size-4" />
          </Button>
        ) : null}
        {isLast ? (
          <Button
            variant="brand"
            disabled={loading !== null || submitted}
            onClick={onSubmit}
          >
            <Check className="mr-2 size-4" />
            {submitted
              ? "Submitted"
              : loading === "accept"
                ? "Submitting..."
                : "Submit"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
