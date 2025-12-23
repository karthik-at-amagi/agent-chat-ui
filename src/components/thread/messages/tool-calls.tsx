import { AIMessage, ToolMessage } from "@langchain/langgraph-sdk";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronUp } from "lucide-react";

function isComplexValue(value: any): boolean {
  return Array.isArray(value) || (typeof value === "object" && value !== null);
}

export function ToolCalls({
  toolCalls,
}: {
  toolCalls: AIMessage["tool_calls"];
}) {
  if (!toolCalls || toolCalls.length === 0) return null;

  return (
    <div className="mx-auto grid max-w-3xl grid-rows-[1fr_auto] gap-2">
      {toolCalls.map((tc, idx) => {
        const args = tc.args as Record<string, any>;
        const hasArgs = Object.keys(args).length > 0;
        return (
          <div
            key={idx}
            className="border-border overflow-hidden rounded-lg border"
          >
            <div className="border-border bg-muted border-b px-4 py-2">
              <h3 className="text-foreground font-medium">
                {tc.name}
                {tc.id && (
                  <code className="bg-muted ml-2 rounded px-2 py-1 text-sm">
                    {tc.id}
                  </code>
                )}
              </h3>
            </div>
            {hasArgs ? (
              <table className="divide-border min-w-full divide-y">
                <tbody className="divide-border divide-y">
                  {Object.entries(args).map(([key, value], argIdx) => (
                    <tr key={argIdx}>
                      <td className="text-foreground px-4 py-2 text-sm font-medium whitespace-nowrap">
                        {key}
                      </td>
                      <td className="text-muted-foreground px-4 py-2 text-sm">
                        {isComplexValue(value) ? (
                          <code className="bg-muted rounded px-2 py-1 font-mono text-sm break-all">
                            {JSON.stringify(value, null, 2)}
                          </code>
                        ) : (
                          String(value)
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <code className="block p-3 text-sm">{"{}"}</code>
            )}
          </div>
        );
      })}
    </div>
  );
}

function findAllVideoUrls(data: any): string[] {
  const urls: string[] = [];

  if (!data || typeof data !== "object") {
    return urls;
  }

  if (Array.isArray(data)) {
    data.forEach((item) => {
      urls.push(...findAllVideoUrls(item));
    });
  } else {
    if ("video_url" in data && typeof data.video_url === "string") {
      urls.push(data.video_url);
    }
    Object.values(data).forEach((value) => {
      urls.push(...findAllVideoUrls(value));
    });
  }

  return urls;
}

const MAX_CHAR_LENGTH = 50;
const MAX_LINES = 2;
const MAX_JSON_ITEMS = 0;

export function ToolResult({ message }: { message: ToolMessage }) {
  const [isExpanded, setIsExpanded] = useState(false);

  let parsedContent: any;
  let isJsonContent = false;

  try {
    if (typeof message.content === "string") {
      parsedContent = JSON.parse(message.content);
      isJsonContent = isComplexValue(parsedContent);
    }
  } catch {
    // Content is not JSON, use as is
    parsedContent = message.content;
  }

  const contentStr = isJsonContent
    ? JSON.stringify(parsedContent, null, 2)
    : String(message.content);
  const contentLines = contentStr.split("\n");
  const shouldTruncate =
    contentLines.length > MAX_LINES || contentStr.length > MAX_CHAR_LENGTH;
  const displayedContent =
    shouldTruncate && !isExpanded
      ? contentStr.length > MAX_CHAR_LENGTH
        ? contentStr.slice(0, MAX_CHAR_LENGTH) + "..."
        : contentLines.slice(0, MAX_LINES).join("\n") + "\n..."
      : contentStr;

  const videoUrlsFromContent = isJsonContent
    ? findAllVideoUrls(parsedContent)
    : [];
  const videoUrlsFromArtifact = findAllVideoUrls(message.artifact);
  const videoUrls = Array.from(
    new Set([...videoUrlsFromContent, ...videoUrlsFromArtifact]),
  );

  const resolvedVideoUrls = videoUrls.map((url) => {
    const backendUrl = process.env.NEXT_PUBLIC_VIDEO_BACKEND_URL;
    if (!backendUrl) return url;
    const cleanBackendUrl = backendUrl.endsWith("/")
      ? backendUrl.slice(0, -1)
      : backendUrl;
    const cleanPath = url.startsWith("/") ? url.slice(1) : url;
    return `${cleanBackendUrl}/${cleanPath}`;
  });

  const jsonItems = isJsonContent
    ? Array.isArray(parsedContent)
      ? parsedContent
      : Object.entries(parsedContent)
    : [];

  return (
    <div className="mx-auto grid max-w-3xl grid-rows-[1fr_auto] gap-2">
      <div className="border-border overflow-hidden rounded-lg border">
        <div className="border-border bg-muted border-b px-4 py-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {message.name ? (
              <h3 className="text-foreground font-medium">
                Tool Result:{" "}
                <code className="bg-muted rounded px-2 py-1">
                  {message.name}
                </code>
              </h3>
            ) : (
              <h3 className="text-foreground font-medium">Tool Result</h3>
            )}
            {message.tool_call_id && (
              <code className="bg-muted ml-2 rounded px-2 py-1 text-sm">
                {message.tool_call_id}
              </code>
            )}
          </div>
        </div>
        <motion.div
          className="bg-muted/50 min-w-full"
          initial={false}
          animate={{ height: "auto" }}
          transition={{ duration: 0.3 }}
        >
          <div className="p-3">
            {resolvedVideoUrls.length > 0 && (
              <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {resolvedVideoUrls.map((url, idx) => (
                  <video
                    key={idx}
                    controls
                    className="aspect-video w-full rounded-lg bg-black object-contain"
                    src={url}
                  />
                ))}
              </div>
            )}
            <AnimatePresence
              mode="wait"
              initial={false}
            >
              <motion.div
                key={isExpanded ? "expanded" : "collapsed"}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.2 }}
              >
                {isJsonContent ? (
                  <table className="divide-border min-w-full divide-y">
                    <tbody className="divide-border divide-y">
                      {(isExpanded
                        ? jsonItems
                        : jsonItems.slice(0, MAX_JSON_ITEMS)
                      ).map((item, argIdx) => {
                        const [key, value] = Array.isArray(parsedContent)
                          ? [argIdx, item]
                          : [item[0], item[1]];
                        return (
                          <tr key={argIdx}>
                            <td className="text-foreground px-4 py-2 text-sm font-medium whitespace-nowrap">
                              {key}
                            </td>
                            <td className="text-muted-foreground px-4 py-2 text-sm">
                              {isComplexValue(value) ? (
                                <code className="bg-muted rounded px-2 py-1 font-mono text-sm break-all">
                                  {JSON.stringify(value, null, 2)}
                                </code>
                              ) : (
                                String(value)
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : (
                  <code className="block text-sm">{displayedContent}</code>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
          {((shouldTruncate && !isJsonContent) ||
            (isJsonContent && jsonItems.length > MAX_JSON_ITEMS)) && (
            <motion.button
              onClick={() => setIsExpanded(!isExpanded)}
              className="border-border text-muted-foreground hover:bg-muted hover:text-foreground flex w-full cursor-pointer items-center justify-center border-t-[1px] py-2 transition-all duration-200 ease-in-out"
              initial={{ scale: 1 }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {isExpanded ? <ChevronUp /> : <ChevronDown />}
            </motion.button>
          )}
        </motion.div>
      </div>
    </div>
  );
}
