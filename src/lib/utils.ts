import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

declare global {
  interface Window {
    __ENV__?: Record<string, string | undefined>;
  }
}

type RuntimeEnvKey =
  | "NEXT_PUBLIC_VIDEO_BACKEND_URL"
  | "NEXT_PUBLIC_API_URL"
  | "NEXT_PUBLIC_ASSISTANT_ID"
  | "DEMO";

const buildTimeEnv: Record<RuntimeEnvKey, string | undefined> = {
  NEXT_PUBLIC_VIDEO_BACKEND_URL: process.env.NEXT_PUBLIC_VIDEO_BACKEND_URL,
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  NEXT_PUBLIC_ASSISTANT_ID: process.env.NEXT_PUBLIC_ASSISTANT_ID,
  DEMO: process.env.DEMO,
};

export function getRuntimeEnv(key: RuntimeEnvKey) {
  if (typeof window !== "undefined") {
    const runtimeEnv = window.__ENV__;
    if (runtimeEnv && Object.prototype.hasOwnProperty.call(runtimeEnv, key)) {
      return runtimeEnv[key];
    }
  }

  return buildTimeEnv[key];
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
