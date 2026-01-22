export function getApiKey(): string | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem("lg:chat:apiKey") ?? null;
  } catch {
    // no-op
  }

  return null;
}

export function getApiId(): string | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem("lg:chat:apiId") ?? null;
  } catch {
    // no-op
  }

  return null;
}

export function setApiId(id: string | null): void {
  try {
    if (typeof window === "undefined") return;
    if (id === null) {
      window.localStorage.removeItem("lg:chat:apiId");
    } else {
      window.localStorage.setItem("lg:chat:apiId", id);
    }
  } catch {
    // no-op
  }
}
