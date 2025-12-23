import type { Message } from "@langchain/langgraph-sdk";

/**
 * Extracts a string summary from a message's content, supporting multimodal (text, image, file, etc.).
 * - If text is present, returns the joined text.
 * - If not, returns a label for the first non-text modality (e.g., 'Image', 'Other').
 * - If unknown, returns 'Multimodal message'.
 */
export function getContentString(content: Message["content"]): string {
  if (!content) return "";
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return String(content);

  const texts = content
    .filter(
      (c): c is { type: "text"; text: string } =>
        c && typeof c === "object" && "type" in c && c.type === "text",
    )
    .map((c) => c.text);

  if (texts.length > 0) return texts.join(" ");

  // Fallback for non-text blocks
  const firstBlock = content[0];
  if (!firstBlock) return "";
  if (typeof firstBlock === "object" && "type" in firstBlock) {
    return firstBlock.type.charAt(0).toUpperCase() + firstBlock.type.slice(1);
  }

  return "";
}
