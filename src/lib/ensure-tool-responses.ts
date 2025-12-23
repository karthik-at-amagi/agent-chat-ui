import { Message } from "@langchain/langgraph-sdk";

export const DO_NOT_RENDER_ID_PREFIX = "do-not-render-";

export function ensureToolCallsHaveResponses(messages: Message[]): Message[] {
  messages.forEach((message, index) => {
    if (message.type !== "ai" || message.tool_calls?.length === 0) {
      return;
    }

    const followingMessage = messages[index + 1];
    if (followingMessage && followingMessage.type === "tool") {
      return;
    }

    throw new Error(
      "Backend returned tool calls without corresponding tool response messages",
    );
  });

  return [];
}
