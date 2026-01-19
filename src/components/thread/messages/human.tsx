import { useStreamContext } from "@/providers/Stream";
import { Message } from "@langchain/langgraph-sdk";
import { useState } from "react";
import { getContentString } from "../utils";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import { BranchSwitcher, CommandBar } from "./shared";
import { MultimodalPreview } from "@/components/thread/MultimodalPreview";
import { isBase64ContentBlock } from "@/lib/multimodal-utils";
import { v4 as uuidv4 } from "uuid";

function EditableContent({
  value,
  setValue,
  onSubmit,
}: {
  value: string;
  setValue: React.Dispatch<React.SetStateAction<string>>;
  onSubmit: () => void;
}) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      onSubmit();
    }
  };

  return (
    <Textarea
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={handleKeyDown}
      className="focus-visible:ring-0"
    />
  );
}

export function HumanMessage({
  message,
  isLoading,
  rawIndex,
  allMessages,
}: {
  message: Message;
  isLoading: boolean;
  rawIndex: number;
  allMessages: Message[];
}) {
  const thread = useStreamContext();
  const meta = thread.getMessagesMetadata(message);
  const parentCheckpoint = meta?.firstSeenState?.parent_checkpoint;

  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState("");
  const contentString = getContentString(message.content);

  const handleSubmitEdit = () => {
    setIsEditing(false);

    const nonTextBlocks = Array.isArray(message.content)
      ? message.content.filter(
          (c) => c && typeof c === "object" && c.type !== "text",
        )
      : [];

    const newMessage: Message = {
      id: uuidv4(),
      type: "human",
      content: [
        ...(value.trim().length > 0 ? [{ type: "text", text: value }] : []),
        ...nonTextBlocks,
      ] as Message["content"],
    };

    // Robustly find index in latest history
    const historyMessages =
      ((thread.history?.at(-1)?.values as any)?.messages as Message[]) || [];
    const historyIndex = historyMessages.findIndex((m) => m.id === message.id);

    // Final target index: priority historyIndex > rawIndex
    const targetIndex = historyIndex !== -1 ? historyIndex : rawIndex;

    thread.submit(
      { messages: [newMessage] },
      {
        checkpoint: parentCheckpoint,
        streamMode: ["values"],
        streamSubgraphs: true,
        streamResumable: true,
        optimisticValues: (prev) => {
          // Use history messages or allMessages as baseline
          const base =
            prev.messages && prev.messages.length > 0
              ? [...prev.messages]
              : historyMessages.length > 0
                ? [...historyMessages]
                : [...allMessages];

          const idxInBase = base.findIndex((m) => m.id === message.id);
          const finalIdx = idxInBase !== -1 ? idxInBase : targetIndex;

          if (finalIdx === -1) {
            console.error("Optimistic: message not found", message.id);
            return prev;
          }

          const updated = [...base];
          updated.splice(finalIdx, 1, newMessage);
          return { ...prev, messages: updated };
        },
      },
    );
  };

  return (
    <div
      className={cn(
        "group ml-auto flex items-center gap-2",
        isEditing && "w-full max-w-xl",
      )}
    >
      <div className={cn("flex flex-col gap-2", isEditing && "w-full")}>
        {isEditing ? (
          <EditableContent
            value={value}
            setValue={setValue}
            onSubmit={handleSubmitEdit}
          />
        ) : (
          <div className="flex flex-col gap-2">
            {/* Render images and files if no text */}
            {Array.isArray(message.content) && message.content.length > 0 && (
              <div className="flex flex-wrap items-end justify-end gap-2">
                {message.content.reduce<React.ReactNode[]>(
                  (acc, block, idx) => {
                    if (isBase64ContentBlock(block)) {
                      acc.push(
                        <MultimodalPreview
                          key={idx}
                          block={block}
                          size="md"
                        />,
                      );
                    }
                    return acc;
                  },
                  [],
                )}
              </div>
            )}
            {/* Render text if present, otherwise fallback to file/image name */}
            {contentString ? (
              <p className="bg-muted ml-auto w-fit rounded-3xl px-4 py-2 whitespace-pre-wrap">
                {contentString}
              </p>
            ) : null}
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          <BranchSwitcher
            branch={meta?.branch}
            branchOptions={meta?.branchOptions}
            onSelect={(branch) => thread.setBranch(branch)}
            isLoading={isLoading}
          />
          <CommandBar
            isLoading={isLoading}
            content={contentString}
            isEditing={isEditing}
            setIsEditing={(c) => {
              if (c) {
                setValue(contentString);
              }
              setIsEditing(c);
            }}
            handleSubmitEdit={handleSubmitEdit}
            isHumanMessage={true}
          />
        </div>
      </div>
    </div>
  );
}
