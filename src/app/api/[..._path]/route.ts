import { initApiPassthrough } from "langgraph-nextjs-api-passthrough";

// This file acts as a proxy for requests to your LangGraph server.
// Read the [Going to Production](https://github.com/langchain-ai/agent-chat-ui?tab=readme-ov-file#going-to-production) section for more information.

const apiUrl = process.env.LANGGRAPH_API_URL;
const apiKey = process.env.LANGSMITH_API_KEY;

const missingHandler = async () =>
  new Response("LANGGRAPH_API_URL is not configured", { status: 500 });

const passthrough = apiUrl
  ? initApiPassthrough({
      apiUrl,
      apiKey,
      runtime: "edge",
    })
  : {
      GET: missingHandler,
      POST: missingHandler,
      PUT: missingHandler,
      PATCH: missingHandler,
      DELETE: missingHandler,
      OPTIONS: missingHandler,
      runtime: "edge" as const,
    };

export const { GET, POST, PUT, PATCH, DELETE, OPTIONS, runtime } = passthrough;
