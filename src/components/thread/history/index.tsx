import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useThreads } from "@/providers/Thread";
import { Thread } from "@langchain/langgraph-sdk";
import { useState } from "react";

import { getContentString } from "../utils";
import { useQueryState, parseAsBoolean } from "nuqs";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetHeader } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import {
  PanelRightOpen,
  PanelRightClose,
  Eye,
  EyeOff,
  Pencil,
  Check,
  X,
  LogOut,
  ChevronDown,
} from "lucide-react";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { TooltipIconButton } from "../tooltip-icon-button";
import { useAuth } from "@/providers/Auth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function ThreadList({
  threads,
  hiddenThreadIds,
  showHiddenThreads,
  onThreadClick,
  onHideThread,
  onUnhideThread,
  onRenameThread,
  onDeleteThread,
}: {
  threads: Thread[];
  hiddenThreadIds: string[];
  showHiddenThreads: boolean;
  onThreadClick?: (threadId: string) => void;
  onHideThread?: (threadId: string) => void;
  onUnhideThread?: (threadId: string) => void;
  onRenameThread?: (threadId: string, name: string) => Promise<void>;
  onDeleteThread?: (threadId: string) => Promise<void>;
}) {
  const [threadId, setThreadId] = useQueryState("threadId");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const handleStartEdit = (t: Thread, currentText: string) => {
    setEditingId(t.thread_id);
    setEditName(currentText);
  };

  const handleSaveEdit = async (id: string) => {
    if (onRenameThread) {
      await onRenameThread(id, editName);
    }
    setEditingId(null);
  };

  return (
    <div className="[&::-webkit-scrollbar-thumb]:bg-border flex h-full w-full flex-col items-start justify-start gap-2 overflow-y-scroll [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent">
      {threads.map((t) => {
        let itemText = (t.metadata?.name as string) || t.thread_id;
        if (!t.metadata?.name) {
          if (
            typeof t.values === "object" &&
            t.values &&
            "messages" in t.values &&
            Array.isArray(t.values.messages) &&
            t.values.messages?.length > 0
          ) {
            const firstMessage = t.values.messages[0];
            itemText = getContentString(firstMessage.content);
          }
        }
        const isHidden = hiddenThreadIds.includes(t.thread_id);
        const isEditing = editingId === t.thread_id;

        return (
          <div
            key={t.thread_id}
            className="group relative flex w-full items-center px-1"
          >
            {isEditing ? (
              <div className="flex min-w-0 flex-1 items-center gap-1">
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="h-8 flex-1"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveEdit(t.thread_id);
                    if (e.key === "Escape") setEditingId(null);
                  }}
                />
                <TooltipIconButton
                  tooltip="Save"
                  onClick={() => handleSaveEdit(t.thread_id)}
                >
                  <Check className="h-4 w-4" />
                </TooltipIconButton>
                <TooltipIconButton
                  tooltip="Cancel"
                  onClick={() => setEditingId(null)}
                >
                  <X className="h-4 w-4" />
                </TooltipIconButton>
              </div>
            ) : (
              <>
                <Button
                  variant={t.thread_id === threadId ? "secondary" : "ghost"}
                  className={cn(
                    "flex h-10 w-full min-w-0 flex-1 items-center justify-start gap-2 overflow-hidden text-left font-normal transition-all",
                    t.thread_id === threadId
                      ? "bg-secondary pr-20"
                      : "group-hover:pr-20",
                  )}
                  onClick={(e) => {
                    e.preventDefault();
                    onThreadClick?.(t.thread_id);
                    if (t.thread_id === threadId) return;
                    setThreadId(t.thread_id);
                  }}
                >
                  <span className="min-w-0 flex-1 truncate text-ellipsis">
                    {itemText}
                  </span>
                  {showHiddenThreads && isHidden && (
                    <span className="text-muted-foreground shrink-0 text-xs">
                      Hidden
                    </span>
                  )}
                </Button>

                <div
                  className={cn(
                    "absolute right-2 flex shrink-0 transition-opacity",
                    t.thread_id !== threadId &&
                      "opacity-0 group-hover:opacity-100",
                  )}
                >
                  <TooltipIconButton
                    tooltip="Rename thread"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleStartEdit(t, itemText);
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </TooltipIconButton>

                  <TooltipIconButton
                    tooltip={isHidden ? "Unhide thread" : "Hide thread"}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (isHidden) {
                        onUnhideThread?.(t.thread_id);
                      } else {
                        onHideThread?.(t.thread_id);
                      }
                    }}
                  >
                    {isHidden ? (
                      <Eye className="h-4 w-4" />
                    ) : (
                      <EyeOff className="h-4 w-4" />
                    )}
                  </TooltipIconButton>

                  {/* <TooltipIconButton
                    tooltip="Delete thread"
                    className="hover:text-destructive"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (
                        window.confirm(
                          "Are you sure you want to delete this thread?",
                        )
                      ) {
                        onDeleteThread?.(t.thread_id);
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </TooltipIconButton> */}
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ThreadHistoryLoading() {
  return (
    <div className="[&::-webkit-scrollbar-thumb]:bg-border flex h-full w-full flex-col items-start justify-start gap-2 overflow-y-scroll [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent">
      {Array.from({ length: 30 }).map((_, i) => (
        <Skeleton
          key={`skeleton-${i}`}
          className="h-10 w-[280px]"
        />
      ))}
    </div>
  );
}

export default function ThreadHistory() {
  const isLargeScreen = useMediaQuery("(min-width: 1024px)");
  const [chatHistoryOpen, setChatHistoryOpen] = useQueryState(
    "chatHistoryOpen",
    parseAsBoolean.withDefault(false),
  );
  const [showHiddenThreads, setShowHiddenThreads] = useQueryState(
    "showHiddenThreads",
    parseAsBoolean.withDefault(false),
  );

  const {
    threads,
    threadsLoading,
    hiddenThreadIds,
    hideThread,
    unhideThread,
    renameThread,
    deleteThread,
  } = useThreads();

  const { displayName, logout } = useAuth();

  const displayedThreads = showHiddenThreads
    ? threads
    : threads.filter((thread) => !hiddenThreadIds.includes(thread.thread_id));

  const hiddenToggleId = "show-hidden-threads-toggle";
  const hiddenToggleControl = (
    <div className="flex w-full items-center justify-between px-4 text-sm">
      <Label
        htmlFor={hiddenToggleId}
        className="text-muted-foreground text-sm font-medium"
      >
        Show hidden threads
      </Label>
      <Switch
        id={hiddenToggleId}
        checked={showHiddenThreads}
        onCheckedChange={(checked) => setShowHiddenThreads(checked)}
      />
    </div>
  );

  return (
    <>
      <div className="shadow-inner-right bg-background border-border hidden h-screen w-[300px] shrink-0 flex-col items-start justify-start gap-6 border-r-[1px] lg:flex">
        <div className="flex w-full items-center justify-between px-4 pt-1.5">
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="border-muted-foreground/20 hover:border-muted-foreground/40 flex h-auto min-w-0 items-center gap-2 overflow-hidden px-3 py-1 transition-colors"
              >
                <span className="truncate text-sm font-medium">
                  {displayName || "Thread History"}
                </span>
                <ChevronDown className="size-3.5 shrink-0 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-48"
            >
              <DropdownMenuItem
                onClick={() => logout()}
                className="text-destructive focus:text-destructive cursor-pointer"
              >
                <LogOut className="mr-2 h-4 w-4" />
                <span>Log out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {hiddenToggleControl}
        {threadsLoading ? (
          <ThreadHistoryLoading />
        ) : (
          <ThreadList
            threads={displayedThreads}
            hiddenThreadIds={hiddenThreadIds}
            showHiddenThreads={showHiddenThreads}
            onHideThread={hideThread}
            onUnhideThread={unhideThread}
            onRenameThread={renameThread}
            onDeleteThread={deleteThread}
          />
        )}
      </div>
      <div className="lg:hidden">
        <Sheet
          open={!!chatHistoryOpen && !isLargeScreen}
          onOpenChange={(open) => {
            if (isLargeScreen) return;
            setChatHistoryOpen(open);
          }}
        >
          <SheetContent
            side="left"
            className="flex flex-col gap-4 lg:hidden"
          >
            <SheetHeader>
              <div className="flex items-center justify-between pr-8">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      className="border-muted-foreground/20 flex h-auto min-w-0 items-center gap-2 overflow-hidden px-3 py-1"
                    >
                      <span className="truncate text-sm font-medium">
                        {displayName || "Thread History"}
                      </span>
                      <ChevronDown className="size-3.5 shrink-0 opacity-50" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="start"
                    className="w-48"
                  >
                    <DropdownMenuItem
                      onClick={() => logout()}
                      className="text-destructive focus:text-destructive cursor-pointer"
                    >
                      <LogOut className="mr-2 h-4 w-4" />
                      <span>Log out</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </SheetHeader>
            {hiddenToggleControl}
            <ThreadList
              threads={displayedThreads}
              hiddenThreadIds={hiddenThreadIds}
              showHiddenThreads={showHiddenThreads}
              onThreadClick={() => setChatHistoryOpen((o) => !o)}
              onHideThread={hideThread}
              onUnhideThread={unhideThread}
              onRenameThread={renameThread}
              onDeleteThread={deleteThread}
            />
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
