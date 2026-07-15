"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  createMetadataClient,
  createRecordsClient,
  createPlatformClient,
  ApiError,
} from "@athyper/api-client";
import { setClients } from "@athyper/query";
import { registerDefaultFieldRenderers } from "@athyper/runtime-canvas/fields";
import { getCsrfToken, setBffClientPlane } from "@athyper/runtime-shared/client";
// Cleanup-plan v5 P5.5 — top-level import runs the document-runtime
// registry bootstrap (composer / sidecar / strategy registrations).
// Idempotent + HMR-safe per amendment 8.
import "@/lib/bootstrap-document-runtime";
import { ToastProvider, useToast } from "@athyper/ui/composites";
import { AuthFailureBridge } from "@athyper/identity-gate";
import { PLANE_KEY } from "@/lib/plane";

// Plane-specific csrf cookie (__csrf) — must run before any client component
// reads the token. Idempotent: HMR-safe.
setBffClientPlane(PLANE_KEY);

// Relay-based fetch — no access token needed client-side; the relay BFF at
// /api/relay/[...path] injects Authorization + all org-context headers server-side.
async function relayFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api/relay${path}`, withCsrfForMutation(options));
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as Record<string, unknown>;
    throw new ApiError(
      response.status,
      typeof body["error"] === "string" ? body["error"] : "UNKNOWN",
      typeof body["message"] === "string" ? body["message"] : response.statusText,
    );
  }
  if (response.status === 204 || response.status === 205) {
    return undefined as T;
  }

  const text = await response.text();
  if (!text) return undefined as T;

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return JSON.parse(text) as T;
  }
  return text as T;
}

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function withCsrfForMutation(options: RequestInit): RequestInit {
  const method = (options.method ?? "GET").toUpperCase();
  if (!MUTATING_METHODS.has(method)) return options;

  const headers = new Headers(options.headers);
  if (!headers.has("X-CSRF-Token")) {
    const token = getCsrfToken();
    if (token) headers.set("X-CSRF-Token", token);
  }
  return { ...options, headers };
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
    <ToastProvider>
      <QueryClientProvider client={queryClient}>
        <AuthFailureBridgeWired />
        {children}
      </QueryClientProvider>
    </ToastProvider>
  );
}

// Adapts the @athyper/ui useToast + Next router into the AuthFailureBridge
// dispatcher contract. Lives inside both providers so it can read the toast
// + react-query contexts. Telemetry is wired to a console beacon in dev; CI
// can swap it for a real beacon by editing this file (kept here so the wiring
// is visible during code review).
function AuthFailureBridgeWired() {
  const { toast } = useToast();
  const router = useRouter();
  return (
    <AuthFailureBridge
      planeRoot=""
      emitToast={(input) => {
        toast({
          title: input.title,
          ...(input.description ? { description: input.description } : {}),
          intent: input.intent,
          ...(input.action ? { action: input.action } : {}),
        });
      }}
      navigate={(href) => router.push(href)}
      recordTelemetry={(input) => {
        if (typeof window === "undefined") return;
        if (process.env.NODE_ENV !== "production") {
          // eslint-disable-next-line no-console
          console.info("[telemetry]", input.event, input);
        }
        // Beacon hook — replace with your real sink (posthog, plausible, etc.)
        window.dispatchEvent(new CustomEvent("athyper:auth-failure", { detail: input }));
      }}
    />
  );
}
