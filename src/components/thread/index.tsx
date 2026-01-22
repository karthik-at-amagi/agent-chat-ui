import Image from "next/image";
import { v4 as uuidv4 } from "uuid";
import {
  ReactNode,
  useEffect,
  useRef,
  useState,
  useCallback,
  FormEvent,
} from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useStreamContext } from "@/providers/Stream";
import { Button } from "../ui/button";
import { Checkpoint, Message } from "@langchain/langgraph-sdk";
import { AssistantMessage, AssistantMessageLoading } from "./messages/ai";
import { HumanMessage } from "./messages/human";
import {
  DO_NOT_RENDER_ID_PREFIX,
  ensureToolCallsHaveResponses,
} from "@/lib/ensure-tool-responses";
import { TooltipIconButton } from "./tooltip-icon-button";
import { VideoEditor } from "./video-editor";
import {
  ArrowDown,
  ArrowUp,
  LoaderCircle,
  PanelRightOpen,
  PanelRightClose,
  SquarePen,
  XIcon,
  Plus,
  Sun,
  Moon,
  VideoIcon,
} from "lucide-react";
import { useQueryState, parseAsBoolean } from "nuqs";
import { StickToBottom, useStickToBottomContext } from "use-stick-to-bottom";
import { useThreads } from "@/providers/Thread";
import ThreadHistory from "./history";
import { toast } from "sonner";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { Label } from "../ui/label";
import { Switch } from "../ui/switch";
import { useTheme } from "next-themes";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip";
import { useFileUpload } from "@/hooks/use-file-upload";
import { ContentBlocksPreview } from "./ContentBlocksPreview";
import {
  useArtifactOpen,
  ArtifactContent,
  ArtifactTitle,
  useArtifactContext,
} from "./artifact";
import { useAuth } from "@/providers/Auth";

function StickyToBottomContent(props: {
  content: ReactNode;
  footer?: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  const context = useStickToBottomContext();
  return (
    <div
      ref={context.scrollRef}
      style={{ width: "100%", height: "100%" }}
      className={props.className}
    >
      <div
        ref={context.contentRef}
        className={props.contentClassName}
      >
        {props.content}
      </div>

      {props.footer}
    </div>
  );
}

function ScrollToTop(props: { className?: string }) {
  const { scrollRef } = useStickToBottomContext();

  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleScroll = () => {
      setIsVisible(el.scrollTop > 300);
    };
    el.addEventListener("scroll", handleScroll);
    return () => el.removeEventListener("scroll", handleScroll);
  }, [scrollRef]);

  if (!isVisible) return null;
  return (
    <Button
      variant="outline"
      className={props.className}
      onClick={() => {
        scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
      }}
    >
      <ArrowUp className="h-4 w-4" />
      <span>Scroll to top</span>
    </Button>
  );
}

function ScrollToBottom(props: { className?: string }) {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();

  if (isAtBottom) return null;
  return (
    <Button
      variant="outline"
      className={props.className}
      onClick={() => scrollToBottom()}
    >
      <ArrowDown className="h-4 w-4" />
      <span>Scroll to bottom</span>
    </Button>
  );
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return <div className="size-6" />;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="flex items-center justify-center"
          >
            {theme === "dark" ? (
              <Sun className="size-5" />
            ) : (
              <Moon className="size-5" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">
          <p>Toggle theme</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function Thread() {
  const [artifactContext, setArtifactContext] = useArtifactContext();
  const [artifactOpen, closeArtifact] = useArtifactOpen();
  const [videoEditorOpen, setVideoEditorOpen] = useState(false);
  const [rightPanelWidth, setRightPanelWidth] = useState(40); // percentage
  const isResizing = useRef(false);

  const startResizing = useCallback(() => {
    isResizing.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  const stopResizing = useCallback(() => {
    isResizing.current = false;
    document.body.style.cursor = "default";
    document.body.style.userSelect = "auto";
  }, []);

  const resize = useCallback((e: MouseEvent) => {
    if (!isResizing.current) return;
    const newWidth =
      ((window.innerWidth - e.clientX) / window.innerWidth) * 100;
    if (newWidth > 20 && newWidth < 80) {
      setRightPanelWidth(newWidth);
    }
  }, []);

  useEffect(() => {
    window.addEventListener("mousemove", resize);
    window.addEventListener("mouseup", stopResizing);
    return () => {
      window.removeEventListener("mousemove", resize);
      window.removeEventListener("mouseup", stopResizing);
    };
  }, [resize, stopResizing]);

  const [threadId, _setThreadId] = useQueryState("threadId");
  const [chatHistoryOpen, setChatHistoryOpen] = useQueryState(
    "chatHistoryOpen",
    parseAsBoolean.withDefault(false),
  );
  const [hideToolCalls, setHideToolCalls] = useQueryState(
    "hideToolCalls",
    parseAsBoolean.withDefault(true),
  );
  const [input, setInput] = useState("");
  const {
    contentBlocks,
    setContentBlocks,
    handleFileUpload,
    dropRef,
    removeBlock,
    resetBlocks: _resetBlocks,
    dragOver,
    handlePaste,
  } = useFileUpload();
  const [firstTokenReceived, setFirstTokenReceived] = useState(false);
  const isLargeScreen = useMediaQuery("(min-width: 1024px)");

  const stream = useStreamContext();
  const { threads } = useThreads();
  const { permissions } = useAuth();
  const hasToolView = permissions.includes("tool_view");

  const threadSummary = threads.find((t) => t.thread_id === threadId);
  const historyMessages =
    ((stream.history?.at(-1)?.values as any)?.messages as Message[]) ?? [];
  const summaryMessages =
    ((threadSummary?.values as any)?.messages as Message[]) ?? [];
  const messages =
    stream.messages.length > 0
      ? stream.messages
      : historyMessages.length > 0
        ? historyMessages
        : summaryMessages;
  const isLoading = stream.isLoading;
  const isThreadBusy =
    threadSummary?.status === "busy" ||
    Boolean(stream.history?.at(-1)?.next?.length) ||
    stream.isLoading;

  const lastError = useRef<string | undefined>(undefined);

  const setThreadId = (id: string | null) => {
    _setThreadId(id);

    // close artifact and reset artifact context
    closeArtifact();
    setArtifactContext({});
  };

  useEffect(() => {
    if (!stream.error) {
      lastError.current = undefined;
      return;
    }
    try {
      const message = (stream.error as any).message;
      if (!message || lastError.current === message) {
        // Message has already been logged. do not modify ref, return early.
        return;
      }

      // Message is defined, and it has not been logged yet. Save it, and send the error
      lastError.current = message;
      toast.error("An error occurred. Please try again.", {
        description: (
          <p>
            <strong>Error:</strong> <code>{message}</code>
          </p>
        ),
        richColors: true,
        closeButton: true,
      });
    } catch {
      // no-op
    }
  }, [stream.error]);

  // TODO: this should be part of the useStream hook
  const prevMessageLength = useRef(0);
  useEffect(() => {
    if (
      messages.length !== prevMessageLength.current &&
      messages?.length &&
      messages[messages.length - 1].type === "ai"
    ) {
      setFirstTokenReceived(true);
    }

    prevMessageLength.current = messages.length;
  }, [messages]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (
      (input.trim().length === 0 && contentBlocks.length === 0) ||
      isLoading ||
      isThreadBusy
    )
      return;
    setFirstTokenReceived(false);

    const newHumanMessage: Message = {
      id: uuidv4(),
      type: "human",
      content: [
        ...(input.trim().length > 0 ? [{ type: "text", text: input }] : []),
        ...contentBlocks,
      ] as Message["content"],
    };

    let toolMessages: Message[] = [];
    try {
      toolMessages = ensureToolCallsHaveResponses(stream.messages);
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Missing tool response for previous tool call.",
      );
      return;
    }

    const context =
      Object.keys(artifactContext).length > 0 ? artifactContext : undefined;

    stream.submit(
      { messages: [...toolMessages, newHumanMessage], context },
      {
        streamMode: ["values"],
        streamSubgraphs: true,
        streamResumable: true,
        optimisticValues: (prev) => ({
          ...prev,
          context,
          messages: [
            ...(prev.messages ?? []),
            ...toolMessages,
            newHumanMessage,
          ],
        }),
      },
    );

    setInput("");
    setContentBlocks([]);
  };

  const handleRegenerate = (
    parentCheckpoint: Checkpoint | null | undefined,
  ) => {
    // Do this so the loading state is correct
    prevMessageLength.current = prevMessageLength.current - 1;
    setFirstTokenReceived(false);
    stream.submit(undefined, {
      checkpoint: parentCheckpoint,
      streamMode: ["values"],
      streamSubgraphs: true,
      streamResumable: true,
    });
  };

  const chatStarted = !!threadId || !!messages.length;
  const hasNoAIOrToolMessages = !messages.find(
    (m) => m.type === "ai" || m.type === "tool",
  );

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <div className="relative hidden lg:flex">
        <motion.div
          className="bg-background absolute z-20 h-full overflow-hidden border-r"
          style={{ width: 300 }}
          animate={
            isLargeScreen
              ? { x: chatHistoryOpen ? 0 : -300 }
              : { x: chatHistoryOpen ? 0 : -300 }
          }
          initial={{ x: -300 }}
          transition={
            isLargeScreen
              ? { type: "spring", stiffness: 300, damping: 30 }
              : { duration: 0 }
          }
        >
          <div
            className="relative h-full"
            style={{ width: 300 }}
          >
            <ThreadHistory />
          </div>
        </motion.div>
      </div>

      <div
        className={cn(
          "grid h-full w-full",
          !isResizing.current && "transition-all duration-500",
        )}
        style={{
          gridTemplateColumns:
            artifactOpen || videoEditorOpen
              ? `${100 - rightPanelWidth}% ${rightPanelWidth}%`
              : "1fr 0fr",
        }}
      >
        <div className="flex h-full min-w-0 overflow-hidden">
          <motion.div
            initial={false}
            animate={{ width: chatHistoryOpen && isLargeScreen ? 300 : 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="flex-shrink-0"
          />
          <div
            className={cn(
              "relative flex min-w-0 flex-1 flex-col overflow-hidden",
              !chatStarted && "grid-rows-[1fr]",
            )}
          >
            {!chatStarted && (
              <div className="absolute top-0 left-0 z-10 flex w-full items-center justify-between gap-3 p-2 pl-4">
                <div>
                  {(!chatHistoryOpen || !isLargeScreen) && (
                    <Button
                      className="hover:bg-muted"
                      variant="ghost"
                      onClick={() => setChatHistoryOpen((p) => !p)}
                    >
                      {chatHistoryOpen ? (
                        <PanelRightOpen className="size-5" />
                      ) : (
                        <PanelRightClose className="size-5" />
                      )}
                    </Button>
                  )}
                </div>
                <div className="absolute top-2 right-4 flex items-center">
                  <ThemeToggle />
                </div>
              </div>
            )}
            {chatStarted && (
              <div className="relative z-10 flex items-center justify-between gap-3 p-2">
                <div className="relative flex items-center justify-start gap-2">
                  <div className="absolute left-0 z-10">
                    {(!chatHistoryOpen || !isLargeScreen) && (
                      <Button
                        className="hover:bg-muted"
                        variant="ghost"
                        onClick={() => setChatHistoryOpen((p) => !p)}
                      >
                        {chatHistoryOpen ? (
                          <PanelRightOpen className="size-5" />
                        ) : (
                          <PanelRightClose className="size-5" />
                        )}
                      </Button>
                    )}
                  </div>
                  <motion.button
                    className="flex cursor-pointer items-center gap-2"
                    onClick={() => setThreadId(null)}
                    animate={{
                      marginLeft: !chatHistoryOpen ? 48 : 0,
                    }}
                    transition={{
                      type: "spring",
                      stiffness: 300,
                      damping: 30,
                    }}
                  >
                    <Image
                      src="/logo.png"
                      alt="Agentic Search Mascot Picky"
                      width={45}
                      height={45}
                      className="rounded-lg"
                    />
                    <span className="text-xl font-semibold tracking-tight">
                      Agentic Search
                    </span>
                  </motion.button>
                </div>

                <div className="flex items-center gap-4">
                  <div className="flex items-center">
                    <ThemeToggle />
                  </div>
                  <TooltipIconButton
                    size="lg"
                    className="p-4"
                    tooltip="Video Editor"
                    variant={videoEditorOpen ? "secondary" : "ghost"}
                    onClick={() => setVideoEditorOpen((v) => !v)}
                  >
                    <VideoIcon className="size-5" />
                  </TooltipIconButton>
                  <TooltipIconButton
                    size="lg"
                    className="p-4"
                    tooltip="New thread"
                    variant="ghost"
                    onClick={() => setThreadId(null)}
                  >
                    <SquarePen className="size-5" />
                  </TooltipIconButton>
                </div>

                <div className="from-background to-background/0 absolute inset-x-0 top-full h-5 bg-gradient-to-b" />
              </div>
            )}

            <StickToBottom className="relative flex-1 overflow-hidden">
              <StickyToBottomContent
                className={cn(
                  "[&::-webkit-scrollbar-thumb]:bg-border absolute inset-0 overflow-y-scroll px-4 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent",
                  !chatStarted && "mt-[25vh] flex flex-col items-stretch",
                  chatStarted && "grid grid-rows-[1fr_auto]",
                )}
                contentClassName="pt-8 pb-16 max-w-3xl mx-auto flex flex-col gap-4 w-full"
                content={
                  <>
                    {(() => {
                      return messages.map((message, index) => {
                        if (message.id?.startsWith(DO_NOT_RENDER_ID_PREFIX)) {
                          return null;
                        }

                        if (message.type !== "human") {
                          return (
                            <AssistantMessage
                              key={message.id || `${message.type}-${index}`}
                              message={message}
                              isLoading={isLoading}
                              handleRegenerate={handleRegenerate}
                            />
                          );
                        }

                        return (
                          <HumanMessage
                            key={message.id || `${message.type}-${index}`}
                            message={message}
                            isLoading={isLoading}
                            rawIndex={index}
                            allMessages={messages}
                          />
                        );
                      });
                    })()}
                    {/* Special rendering case where there are no AI/tool messages, but there is an interrupt.
                    We need to render it outside of the messages list, since there are no messages to render */}
                    {hasNoAIOrToolMessages && !!stream.interrupt && (
                      <AssistantMessage
                        key="interrupt-msg"
                        message={undefined}
                        isLoading={isLoading}
                        handleRegenerate={handleRegenerate}
                      />
                    )}
                    {isLoading && !firstTokenReceived && (
                      <AssistantMessageLoading />
                    )}
                  </>
                }
                footer={
                  <div className="bg-background sticky bottom-0 flex flex-col items-center gap-8">
                    {!chatStarted && (
                      <div className="flex items-center gap-3">
                        <Image
                          src="/logo.png"
                          alt="Agentic Search Logo"
                          width={60}
                          height={60}
                          className="rounded-xl"
                        />
                        <h1 className="text-2xl font-semibold tracking-tight">
                          Agentic Search
                        </h1>
                      </div>
                    )}

                    <ScrollToBottom className="animate-in fade-in-0 zoom-in-95 absolute bottom-full left-1/2 mb-4 -translate-x-1/2" />
                    <ScrollToTop className="animate-in fade-in-0 zoom-in-95 absolute bottom-full left-1/2 mb-16 -translate-x-1/2" />

                    <div
                      ref={dropRef}
                      className={cn(
                        "bg-muted relative z-10 mx-auto mb-8 w-full max-w-3xl rounded-2xl shadow-xs transition-all",
                        dragOver
                          ? "border-primary border-2 border-dotted"
                          : "border border-solid",
                      )}
                    >
                      <form
                        onSubmit={handleSubmit}
                        className="mx-auto grid max-w-3xl grid-rows-[1fr_auto] gap-2"
                      >
                        <ContentBlocksPreview
                          blocks={contentBlocks}
                          onRemove={removeBlock}
                        />
                        <textarea
                          value={input}
                          onChange={(e) => setInput(e.target.value)}
                          onPaste={handlePaste}
                          onKeyDown={(e) => {
                            if (
                              e.key === "Enter" &&
                              !e.shiftKey &&
                              !e.metaKey &&
                              !e.nativeEvent.isComposing
                            ) {
                              e.preventDefault();
                              const el = e.target as HTMLElement | undefined;
                              const form = el?.closest("form");
                              form?.requestSubmit();
                            }
                          }}
                          placeholder="Type your message..."
                          className="field-sizing-content resize-none border-none bg-transparent p-3.5 pb-0 shadow-none ring-0 outline-none focus:ring-0 focus:outline-none"
                        />

                        <div className="flex items-center gap-6 p-2 pt-4">
                          {hasToolView && (
                            <div>
                              <div className="flex items-center space-x-2">
                                <Switch
                                  id="render-tool-calls"
                                  checked={hideToolCalls ?? false}
                                  onCheckedChange={setHideToolCalls}
                                />
                                <Label
                                  htmlFor="render-tool-calls"
                                  className="text-muted-foreground text-sm"
                                >
                                  Hide Tool Calls
                                </Label>
                              </div>
                            </div>
                          )}
                          {/* 
                            <>
                              <Label
                                htmlFor="file-input"
                                className="flex cursor-pointer items-center gap-2"
                              >
                                <Plus className="text-muted-foreground size-5" />
                                <span className="text-muted-foreground text-sm">
                                  Upload PDF or Image
                                </span>
                              </Label>
                              <input
                                id="file-input"
                                type="file"
                                onChange={handleFileUpload}
                                multiple
                                accept="image/jpeg,image/png,image/gif,image/webp,application/pdf"
                                className="hidden"
                              />
                            </>
                          */}

                          {stream.isLoading ? (
                            <Button
                              key="stop"
                              onClick={() => stream.stop()}
                              className="ml-auto"
                            >
                              <LoaderCircle className="h-4 w-4 animate-spin" />
                              Cancel
                            </Button>
                          ) : (
                            <Button
                              type="submit"
                              className="ml-auto shadow-md transition-all"
                              disabled={
                                isLoading ||
                                isThreadBusy ||
                                (!input.trim() && contentBlocks.length === 0)
                              }
                            >
                              Send
                            </Button>
                          )}
                        </div>
                      </form>
                    </div>
                  </div>
                }
              />
            </StickToBottom>
          </div>
        </div>
        <div className="bg-background relative flex flex-col border-l">
          {(artifactOpen || videoEditorOpen) && (
            <div
              onMouseDown={startResizing}
              className="hover:bg-primary/30 absolute top-0 bottom-0 -left-1 z-50 w-2 cursor-col-resize transition-colors"
            />
          )}
          {videoEditorOpen ? (
            <div className="absolute inset-0 flex min-w-[30vw] flex-col">
              <div className="relative flex items-center justify-between gap-3 border-b p-2">
                <div className="flex items-center gap-3">
                  <Image
                    src="/VideoEditor.png"
                    alt="Video editor logo"
                    width={70}
                    height={70}
                    className="rounded-md object-contain"
                    priority
                  />
                  <span className="text-xl font-semibold tracking-tight">
                    Video Editor
                  </span>
                </div>
                <button
                  onClick={() => setVideoEditorOpen(false)}
                  className="cursor-pointer"
                >
                  <XIcon className="size-5" />
                </button>
                <div className="from-background to-background/0 pointer-events-none absolute inset-x-0 top-full h-5 bg-gradient-to-b" />
              </div>
              <div className="flex-grow overflow-hidden">
                <VideoEditor />
              </div>
            </div>
          ) : (
            <div className="absolute inset-0 flex min-w-[30vw] flex-col">
              <div className="grid grid-cols-[1fr_auto] border-b p-4">
                <ArtifactTitle className="truncate overflow-hidden" />
                <button
                  onClick={closeArtifact}
                  className="cursor-pointer"
                >
                  <XIcon className="size-5" />
                </button>
              </div>
              <ArtifactContent className="relative flex-grow" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
