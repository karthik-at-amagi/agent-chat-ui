import { Client } from "@langchain/langgraph-sdk";

export function createClient(
  apiUrl: string,
  apiKey: string | undefined,
  apiId?: string | null,
) {
  return new Client({
    apiKey,
    apiUrl,
    defaultHeaders: apiId
      ? {
          "x-login-id": apiId,
        }
      : undefined,
  });
}
