import Image from "next/image";
import React, {
  createContext,
  useContext,
  ReactNode,
  useState,
  useEffect,
} from "react";
import { getRuntimeEnv } from "@/lib/utils";
import {
  useStream,
  type UseStream,
  type UseStreamOptions,
} from "@langchain/langgraph-sdk/react";
import { type Message } from "@langchain/langgraph-sdk";
import {
  uiMessageReducer,
  isUIMessage,
  isRemoveUIMessage,
  type UIMessage,
  type RemoveUIMessage,
} from "@langchain/langgraph-sdk/react-ui";
import { useQueryState } from "nuqs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { LangGraphLogoSVG } from "@/components/icons/langgraph";
import { Label } from "@/components/ui/label";
import { ArrowRight } from "lucide-react";
import { PasswordInput } from "@/components/ui/password-input";
import { getApiKey } from "@/lib/api-key";
import { useThreads } from "./Thread";
import { toast } from "sonner";
import { useAuth } from "./Auth";

export type StateType = { messages: Message[]; ui?: UIMessage[] };

export interface PromoSpine {
  label: string;
  type: string;
  premise: string;
  trajectory: string[];
  ends_on: string;
  grounding: string;
}

export interface MCPElicitationEvent {
  type: "mcp_elicitation_request";
  elicitation_id: string;
  thread_id?: string | null;
  server_name: string;
  tool_name: string;
  text: string;
  kind?: "spine" | "clip_selection" | "edit_decisions_review";
  spines_json: string;
  payload_json?: string;
}

type StreamBag = {
  UpdateType: {
    messages?: Message[] | Message | string;
    ui?: (UIMessage | RemoveUIMessage)[] | UIMessage | RemoveUIMessage;
    context?: Record<string, unknown>;
  };
  CustomEventType: UIMessage | RemoveUIMessage | MCPElicitationEvent;
};

const useTypedStream: (
  options: UseStreamOptions<StateType, StreamBag>,
) => UseStream<StateType, StreamBag> = useStream;

type StreamContextType = ReturnType<typeof useTypedStream>;
const StreamContext = createContext<StreamContextType | undefined>(undefined);

interface ElicitationContextType {
  pendingElicitation: MCPElicitationEvent | null;
  clearElicitation: () => void;
}
const ElicitationContext = createContext<ElicitationContextType>({
  pendingElicitation: null,
  clearElicitation: () => {},
});

async function checkGraphStatus(
  apiUrl: string,
  apiKey: string | null,
  apiId?: string | null,
): Promise<boolean> {
  try {
    const headers: Record<string, string> = {};
    if (apiKey) {
      headers["X-Api-Key"] = apiKey;
    }
    if (apiId) {
      headers["x-login-id"] = apiId;
    }

    const res = await fetch(`${apiUrl}/info`, {
      headers: Object.keys(headers).length > 0 ? headers : undefined,
    });

    return res.ok;
  } catch (e) {
    console.error(e);
    return false;
  }
}

async function registerThreadOwnership(
  threadId: string,
  backendUrl: string | undefined,
  apiId?: string | null,
) {
  if (!threadId || !backendUrl || !apiId) return;

  try {
    await fetch(`${backendUrl}/threads/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-login-id": apiId,
      },
      body: JSON.stringify({ thread_id: threadId }),
    });
  } catch (e) {
    console.error(e);
  }
}

const StreamSession = ({
  children,
  apiKey,
  apiUrl,
  assistantId,
  apiId,
  accountId,
}: {
  children: ReactNode;
  apiKey: string | null;
  apiUrl: string;
  assistantId: string;
  apiId: string | null;
  accountId: string | null;
}) => {
  const [threadId, setThreadId] = useQueryState("threadId");
  const { getThreads, setThreads } = useThreads();
  const backendUrl = getRuntimeEnv("NEXT_PUBLIC_VIDEO_BACKEND_URL");
  const cleanBackendUrl = backendUrl?.endsWith("/")
    ? backendUrl.slice(0, -1)
    : backendUrl;
  const [pendingElicitation, setPendingElicitation] =
    useState<MCPElicitationEvent | null>(null);
  const clearElicitation = () => setPendingElicitation(null);
  const streamOptions: UseStreamOptions<StateType, StreamBag> & {
    streamSubgraphs?: boolean;
  } = {
    apiUrl,
    apiKey: apiKey ?? undefined,
    assistantId,
    threadId: threadId ?? null,
    fetchStateHistory: true,
    reconnectOnMount: true,
    defaultHeaders: {
      ...(apiId ? { "x-login-id": apiId } : {}),
      ...(accountId ? { "x-account-id": accountId } : {}),
    },
    // Surface events from subagents (e.g. the transition subagent invoked by
    // finalize_promo) so their tool activity is visible in the run stream.
    streamSubgraphs: true,
    onCustomEvent: (event, options) => {
      if (isUIMessage(event) || isRemoveUIMessage(event)) {
        options.mutate((prev: StateType) => {
          const ui = uiMessageReducer(prev.ui ?? [], event);
          return { ...prev, ui };
        });
      } else if (
        (event as MCPElicitationEvent).type === "mcp_elicitation_request"
      ) {
        setPendingElicitation(event as MCPElicitationEvent);
      }
    },
    onThreadId: (id: string) => {
      setThreadId(id);
      void registerThreadOwnership(id, cleanBackendUrl, apiId);
      // Refetch threads list when thread ID changes.
      getThreads().then(setThreads).catch(console.error);
    },
  };
  const streamValue = useTypedStream(streamOptions);

  useEffect(() => {
    if (!threadId || !apiUrl) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const base = apiUrl.endsWith("/") ? apiUrl.slice(0, -1) : apiUrl;
        const res = await fetch(
          `${base}/elicitations?thread_id=${encodeURIComponent(threadId)}`,
          {
            headers: {
              ...(apiKey ? { "X-Api-Key": apiKey } : {}),
              ...(apiId ? { "x-login-id": apiId } : {}),
              ...(accountId ? { "x-account-id": accountId } : {}),
            },
          },
        );
        if (!res.ok) return;
        const data = await res.json();
        const request = data?.pending?.[0]?.request as
          | MCPElicitationEvent
          | undefined;
        if (!cancelled && request?.type === "mcp_elicitation_request") {
          setPendingElicitation((current) =>
            current?.elicitation_id === request.elicitation_id
              ? current
              : request,
          );
        }
      } catch (e) {
        console.error(e);
      }
    };
    void poll();
    const interval = window.setInterval(poll, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [accountId, apiId, apiKey, apiUrl, threadId]);

  useEffect(() => {
    checkGraphStatus(apiUrl, apiKey, apiId).then((ok) => {
      if (!ok) {
        toast.error("Failed to connect to Agent API", {
          description: () => (
            <p>
              Please ensure your Agent API is running at <code>{apiUrl}</code>.
            </p>
          ),
          duration: 10000,
          richColors: true,
          closeButton: true,
        });
      }
    });
  }, [apiKey, apiUrl, apiId]);

  return (
    <ElicitationContext.Provider
      value={{ pendingElicitation, clearElicitation }}
    >
      <StreamContext.Provider value={streamValue}>
        {children}
      </StreamContext.Provider>
    </ElicitationContext.Provider>
  );
};

// Default values for the form
const DEFAULT_API_URL = "http://localhost:2024";
const DEFAULT_ASSISTANT_ID = "agent";

export const StreamProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  // Get environment variables
  const envApiUrl: string | undefined = getRuntimeEnv("NEXT_PUBLIC_API_URL");
  const envAssistantId: string | undefined = getRuntimeEnv(
    "NEXT_PUBLIC_ASSISTANT_ID",
  );
  const envVideoBackendUrl: string | undefined = getRuntimeEnv(
    "NEXT_PUBLIC_VIDEO_BACKEND_URL",
  );
  const envDemo: string | undefined = getRuntimeEnv("DEMO");

  const { apiId, accountId } = useAuth();

  // Use URL params with env var fallbacks
  const [apiUrl, setApiUrl] = useQueryState("apiUrl");
  const [assistantId, setAssistantId] = useQueryState("assistantId");

  useEffect(() => {
    if (envDemo === "true") {
      if (!apiUrl && envVideoBackendUrl) {
        void setApiUrl(envVideoBackendUrl);
      }
      if (!assistantId && envAssistantId) {
        void setAssistantId(envAssistantId);
      }
    }
  }, [
    envDemo,
    apiUrl,
    assistantId,
    envVideoBackendUrl,
    envAssistantId,
    setApiUrl,
    setAssistantId,
  ]);

  // For API key, use localStorage with env var fallback
  const [apiKey, _setApiKey] = useState(() => {
    const storedKey = getApiKey();
    return storedKey || "";
  });

  const setApiKey = (key: string) => {
    window.localStorage.setItem("lg:chat:apiKey", key);
    _setApiKey(key);
  };

  // Determine final values to use, prioritizing URL params then env vars if DEMO is true
  const finalApiUrl =
    apiUrl || (envDemo === "true" ? envVideoBackendUrl : undefined);
  const finalAssistantId =
    assistantId || (envDemo === "true" ? envAssistantId : undefined);

  // Show the form if we: don't have an API URL, or don't have an assistant ID
  if (!finalApiUrl || !finalAssistantId) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center p-4">
        <div className="animate-in fade-in-0 zoom-in-95 bg-background flex max-w-3xl flex-col rounded-lg border shadow-lg">
          <div className="mt-14 flex flex-col gap-2 border-b p-6">
            <div className="flex flex-col items-start gap-2">
              <Image
                src="/logo.png"
                alt="Video Lens Mascot Picky"
                width={45}
                height={45}
                className="rounded-lg"
              />
              <h1 className="text-xl font-semibold tracking-tight">
                Video Lens
              </h1>
            </div>
            <p className="text-muted-foreground">
              Welcome to Video Lens! Before you get started, you need to enter
              the URL of the deployment and the assistant / graph ID.
            </p>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();

              const form = e.target as HTMLFormElement;
              const formData = new FormData(form);
              const apiUrl = formData.get("apiUrl") as string;
              const assistantId = formData.get("assistantId") as string;

              setApiUrl(apiUrl);
              setAssistantId(assistantId);

              form.reset();
            }}
            className="bg-muted/50 flex flex-col gap-6 p-6"
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="apiUrl">
                Deployment URL<span className="text-rose-500">*</span>
              </Label>
              <p className="text-muted-foreground text-sm">
                This is the URL of your Video Lens deployment. Can be a local,
                or production deployment.
              </p>
              <Input
                id="apiUrl"
                name="apiUrl"
                className="bg-background"
                defaultValue={apiUrl || envApiUrl || DEFAULT_API_URL}
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="assistantId">
                Assistant / Graph ID<span className="text-rose-500">*</span>
              </Label>
              <p className="text-muted-foreground text-sm">
                This is the ID of the assistant to fetch threads from, and
                invoke when actions are taken.
              </p>
              <Input
                id="assistantId"
                name="assistantId"
                className="bg-background"
                defaultValue={
                  assistantId || envAssistantId || DEFAULT_ASSISTANT_ID
                }
                required
              />
            </div>

            <div className="mt-2 flex justify-end">
              <Button
                type="submit"
                size="lg"
              >
                Continue
                <ArrowRight className="size-5" />
              </Button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <StreamSession
      apiKey={apiKey}
      apiUrl={finalApiUrl}
      assistantId={finalAssistantId}
      apiId={apiId}
      accountId={accountId}
    >
      {children}
    </StreamSession>
  );
};

// Create a custom hook to use the context
export const useStreamContext = (): StreamContextType => {
  const context = useContext(StreamContext);
  if (context === undefined) {
    throw new Error("useStreamContext must be used within a StreamProvider");
  }
  return context;
};

export const useElicitation = (): ElicitationContextType =>
  useContext(ElicitationContext);

export default StreamContext;
