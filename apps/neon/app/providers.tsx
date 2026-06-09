"use client";

import { useEffect, useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMetadataClient,
  createRecordsClient,
  createPlatformClient,
  ApiError,
} from "@athyper/api-client";
import { setClients } from "@athyper/query";
import { registerDefaultFieldRenderers } from "@athyper/runtime-canvas/fields";
import { applyThemePreferences } from "@/lib/preferences/theme-dom";

// Relay-based fetch — no access token needed client-side; the relay BFF at
// /api/relay/[...path] injects Authorization + all org-context headers server-side.
async function relayFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api/relay${path}`, options);
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as Record<string, unknown>;
    throw new ApiError(
      response.status,
      typeof body["error"] === "string" ? body["error"] : "UNKNOWN",
      typeof body["message"] === "string" ? body["message"] : response.statusText,
    );
  }
  return response.json() as Promise<T>;
}

// Initialize once at module load — safe because relayFetch is stateless.
setClients(
  createMetadataClient(relayFetch),
  createRecordsClient(relayFetch),
  undefined,                          // workflow client — not needed in neon plane
  createPlatformClient(relayFetch),   // saved views
);

// Populate the shared field renderer registry used by runtime-canvas views.
registerDefaultFieldRenderers();

export function NeonProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  }));

  return (
    <QueryClientProvider client={queryClient}>
      <PreferencesDomHydrator />
      {children}
    </QueryClientProvider>
  );
}

function PreferencesDomHydrator() {
  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/user/preferences", {
      cache: "no-store",
      credentials: "include",
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() as Promise<Record<string, unknown>> : null))
      .then((profile) => {
        if (!profile) return;
        applyThemePreferences(profile);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
      });

    return () => controller.abort();
  }, []);

  return null;
}
