import { validate } from "uuid";
import { getApiKey } from "@/lib/api-key";
import { Thread } from "@langchain/langgraph-sdk";
import { useQueryState } from "nuqs";
import {
  createContext,
  useContext,
  ReactNode,
  useCallback,
  useState,
  useEffect,
  useRef,
  Dispatch,
  SetStateAction,
} from "react";
import { getRuntimeEnv } from "@/lib/utils";
import { createClient } from "./client";
import { useAuth } from "./Auth";

interface ThreadContextType {
  getThreads: () => Promise<Thread[]>;
  threads: Thread[];
  setThreads: Dispatch<SetStateAction<Thread[]>>;
  threadsLoading: boolean;
  setThreadsLoading: Dispatch<SetStateAction<boolean>>;
  hiddenThreadIds: string[];
  hideThread: (threadId: string) => void;
  unhideThread: (threadId: string) => void;
  renameThread: (threadId: string, name: string) => Promise<void>;
  deleteThread: (threadId: string) => Promise<void>;
}

const ThreadContext = createContext<ThreadContextType | undefined>(undefined);

const HIDDEN_THREADS_STORAGE_KEY = "lg:chat:hidden-threads";

function readHiddenThreadIdsFromStorage(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(HIDDEN_THREADS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is string => typeof value === "string");
  } catch {
    return [];
  }
}

function getThreadSearchMetadataFilters(assistantId: string) {
  if (!assistantId) return [];

  const trimmedId = assistantId.trim();
  if (!trimmedId) return [];

  const filters: Array<{ assistant_id?: string; graph_id?: string }> = [
    { graph_id: trimmedId },
    { assistant_id: trimmedId },
  ];

  if (!validate(trimmedId)) {
    return filters;
  }

  // For UUIDs we still keep both entries but ensure assistant_id search is first.
  return [{ assistant_id: trimmedId }, { graph_id: trimmedId }];
}

export function ThreadProvider({ children }: { children: ReactNode }) {
  const envAssistantId: string | undefined = getRuntimeEnv(
    "NEXT_PUBLIC_ASSISTANT_ID",
  );
  const envApiUrl: string | undefined = getRuntimeEnv("NEXT_PUBLIC_API_URL");
  const envVideoBackendUrl: string | undefined = getRuntimeEnv(
    "NEXT_PUBLIC_VIDEO_BACKEND_URL",
  );
  const envDemo: string | undefined = getRuntimeEnv("DEMO");

  const { apiId } = useAuth();

  const [apiUrl] = useQueryState("apiUrl");
  const [assistantId] = useQueryState("assistantId");

  const finalApiUrl =
    envDemo === "true" ? envApiUrl : apiUrl;
  const finalAssistantId =
    envDemo === "true" ? envAssistantId : assistantId;

  const cleanBackendUrl = envVideoBackendUrl?.endsWith("/")
    ? envVideoBackendUrl.slice(0, -1)
    : envVideoBackendUrl;

  const [threadId, setThreadId] = useQueryState("threadId");
  const [threads, setThreads] = useState<Thread[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(false);
  const [hiddenThreadIds, setHiddenThreadIds] = useState<string[]>(() =>
    readHiddenThreadIdsFromStorage(),
  );
  const inFlightThreadsRequestRef = useRef<Promise<Thread[]> | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        HIDDEN_THREADS_STORAGE_KEY,
        JSON.stringify(hiddenThreadIds),
      );
    } catch {
      // no-op
    }
  }, [hiddenThreadIds]);

  const hideThread = useCallback(
    (targetId: string) => {
      if (!targetId) return;
      setHiddenThreadIds((prev) => {
        if (prev.includes(targetId)) return prev;
        return [...prev, targetId];
      });
      if (threadId === targetId) {
        setThreadId(null);
      }
    },
    [threadId, setThreadId, setHiddenThreadIds],
  );

  const unhideThread = useCallback(
    (targetId: string) => {
      if (!targetId) return;
      setHiddenThreadIds((prev) => prev.filter((id) => id !== targetId));
    },
    [setHiddenThreadIds],
  );

  const renameThread = useCallback(
    async (targetId: string, name: string) => {
      if (!finalApiUrl || !targetId) return;
      const client = createClient(finalApiUrl, getApiKey() ?? undefined, apiId);
      const thread = threads.find((t) => t.thread_id === targetId);
      const newMetadata = { ...(thread?.metadata || {}), name };
      await client.threads.update(targetId, { metadata: newMetadata });
      setThreads((prev) =>
        prev.map((t) =>
          t.thread_id === targetId ? { ...t, metadata: newMetadata } : t,
        ),
      );
    },
    [finalApiUrl, threads, setThreads, apiId],
  );

  const deleteThread = useCallback(
    async (targetId: string) => {
      if (!finalApiUrl || !targetId) return;
      const client = createClient(finalApiUrl, getApiKey() ?? undefined, apiId);
      await client.threads.delete(targetId);
      setThreads((prev) => prev.filter((t) => t.thread_id !== targetId));
      if (threadId === targetId) {
        setThreadId(null);
      }
    },
    [finalApiUrl, threadId, setThreadId, setThreads, apiId],
  );

  const getThreads = useCallback(async (): Promise<Thread[]> => {
    if (inFlightThreadsRequestRef.current) {
      return inFlightThreadsRequestRef.current;
    }

    if (!finalApiUrl || !finalAssistantId) return [];
    const request = (async () => {
      const client = createClient(finalApiUrl, getApiKey() ?? undefined, apiId);
      const metadataFilters = getThreadSearchMetadataFilters(finalAssistantId);

      if (metadataFilters.length === 0) return [];

      const results = await Promise.all(
        metadataFilters.map((metadata) =>
          client.threads.search({
            metadata,
            limit: 100,
          }),
        ),
      );

      const dedupedThreads: Thread[] = [];
      const seenIds = new Set<string>();

      for (const threadList of results) {
        for (const thread of threadList) {
          if (seenIds.has(thread.thread_id)) continue;
          seenIds.add(thread.thread_id);
          dedupedThreads.push(thread);
        }
      }

      if (!cleanBackendUrl || !apiId) {
        return [];
      }

      try {
        const res = await fetch(`${cleanBackendUrl}/threads/verify`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-login-id": apiId,
          },
          body: JSON.stringify({
            thread_ids: dedupedThreads.map((thread) => thread.thread_id),
          }),
        });

        if (!res.ok) {
          return [];
        }

        const data = (await res.json()) as { owned_thread_ids?: string[] };
        const ownedIds = new Set(data.owned_thread_ids ?? []);
        return dedupedThreads.filter((thread) =>
          ownedIds.has(thread.thread_id),
        );
      } catch (err) {
        console.error(err);
        return [];
      }
    })();

    inFlightThreadsRequestRef.current = request;

    try {
      return await request;
    } finally {
      if (inFlightThreadsRequestRef.current === request) {
        inFlightThreadsRequestRef.current = null;
      }
    }
  }, [finalApiUrl, finalAssistantId, apiId, cleanBackendUrl]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const refresh = async (withLoading = false) => {
      if (withLoading) {
        setThreadsLoading(true);
      }
      try {
        const results = await getThreads();
        setThreads(results);
      } catch (err) {
        console.error(err);
      } finally {
        if (withLoading) {
          setThreadsLoading(false);
        }
      }
    };

    void refresh(true);

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void refresh(false);
      }
    };

    const handleFocus = () => {
      void refresh(false);
    };

    const intervalId = window.setInterval(() => {
      void refresh(false);
    }, 60000);

    window.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleFocus);

    return () => {
      window.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleFocus);
      window.clearInterval(intervalId);
    };
  }, [getThreads, setThreads]);

  const value = {
    getThreads,
    threads,
    setThreads,
    threadsLoading,
    setThreadsLoading,
    hiddenThreadIds,
    hideThread,
    unhideThread,
    renameThread,
    deleteThread,
  };

  return (
    <ThreadContext.Provider value={value}>{children}</ThreadContext.Provider>
  );
}

export function useThreads() {
  const context = useContext(ThreadContext);
  if (context === undefined) {
    throw new Error("useThreads must be used within a ThreadProvider");
  }
  return context;
}
