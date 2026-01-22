"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { getApiId, setApiId as saveApiId } from "@/lib/api-key";
import { PasswordInput } from "@/components/ui/password-input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ArrowRight, Loader2, AlertCircle } from "lucide-react";
import { getRuntimeEnv } from "@/lib/utils";
import Image from "next/image";

interface AuthContextType {
  apiId: string | null;
  displayName: string | null;
  permissions: string[];
  setApiId: (id: string, displayName?: string, permissions?: string[]) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [apiId, setInternalApiId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const storedApiId = getApiId();
    const storedDisplayName = window.localStorage.getItem(
      "lg:chat:displayName",
    );
    const storedPermissions = window.localStorage.getItem(
      "lg:chat:permissions",
    );

    if (storedApiId && !storedDisplayName) {
      // Force re-login if we have a token but no display name (migration)
      logout();
    } else {
      setInternalApiId(storedApiId);
      setDisplayName(storedDisplayName);
      if (storedPermissions) {
        try {
          setPermissions(JSON.parse(storedPermissions));
        } catch {
          setPermissions([]);
        }
      }
    }
    setIsLoaded(true);
  }, []);

  const setApiId = (id: string, name?: string, perms?: string[]) => {
    saveApiId(id);
    if (name) {
      window.localStorage.setItem("lg:chat:displayName", name);
      setDisplayName(name);
    }
    if (perms) {
      window.localStorage.setItem("lg:chat:permissions", JSON.stringify(perms));
      setPermissions(perms);
    }
    setInternalApiId(id);
  };

  const logout = () => {
    saveApiId(null);
    window.localStorage.removeItem("lg:chat:displayName");
    window.localStorage.removeItem("lg:chat:permissions");
    setInternalApiId(null);
    setDisplayName(null);
    setPermissions([]);
  };

  const handleVerify = async (id: string) => {
    setIsVerifying(true);
    setError(null);
    const backendUrl = getRuntimeEnv("NEXT_PUBLIC_VIDEO_BACKEND_URL");

    if (!backendUrl) {
      setError("Video backend URL not configured");
      setIsVerifying(false);
      return;
    }

    try {
      const cleanBackendUrl = backendUrl.endsWith("/")
        ? backendUrl.slice(0, -1)
        : backendUrl;

      const res = await fetch(`${cleanBackendUrl}/auth/verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-login-id": id,
        },
      });

      if (res.ok) {
        const data = await res.json();
        // Use display_name, fallback to identity, then to the id itself
        setApiId(
          id,
          data.display_name || data.identity || id,
          data.permissions || [],
        );
      } else {
        setError("auth failed check your api key");
      }
    } catch (e) {
      console.error(e);
      setError("Failed to connect to authentication server");
    } finally {
      setIsVerifying(false);
    }
  };

  if (!isLoaded) {
    return null;
  }

  if (!apiId) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center p-4">
        <div className="animate-in fade-in-0 zoom-in-95 bg-background flex w-full max-w-md flex-col rounded-2xl border shadow-xl">
          <div className="flex flex-col items-center gap-4 border-b p-8 text-center">
            <div className="flex flex-col items-center gap-3">
              <Image
                src="/logo.png"
                alt="Agentic Search Logo"
                width={64}
                height={64}
                className="rounded-2xl shadow-sm"
              />
              <h1 className="text-foreground text-2xl font-bold tracking-tight">
                Agentic Search
              </h1>
            </div>
            <p className="text-muted-foreground text-sm">
              Please enter your API Token to continue.
            </p>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.target as HTMLFormElement;
              const formData = new FormData(form);
              const id = formData.get("apiId") as string;
              if (id) {
                handleVerify(id);
              }
            }}
            className="bg-muted/30 flex flex-col gap-6 p-8"
          >
            <div className="flex flex-col gap-3">
              <Label
                htmlFor="apiId"
                className="text-sm font-medium"
              >
                API Token
              </Label>
              <div className="relative">
                <PasswordInput
                  id="apiId"
                  name="apiId"
                  placeholder="Enter your API token"
                  required
                  autoFocus
                  className="bg-background h-11"
                  disabled={isVerifying}
                />
              </div>
              {error && (
                <div className="animate-in fade-in-0 slide-in-from-top-1 border-destructive/20 bg-destructive/10 text-destructive flex items-center gap-2 rounded-lg border p-3">
                  <AlertCircle className="size-4 shrink-0" />
                  <p className="text-sm leading-none font-medium">{error}</p>
                </div>
              )}
            </div>
            <Button
              type="submit"
              size="lg"
              className="h-11 w-full text-base font-medium transition-all"
              disabled={isVerifying}
            >
              {isVerifying ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Verifying...
                </>
              ) : (
                <>
                  Continue
                  <ArrowRight className="ml-2 size-4" />
                </>
              )}
            </Button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <AuthContext.Provider
      value={{ apiId, displayName, permissions, setApiId, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
