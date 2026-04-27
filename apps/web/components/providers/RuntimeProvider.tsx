"use client";

/**
 * RuntimeProvider — entity runtime bootstrap
 *
 * Performs two one-time startup tasks that must run in the browser:
 *
 *   1. registerDefaults()  — populates the field-renderer registry with all
 *      built-in renderers (text, number, date, money, enum, uuid, json).
 *      Called once at module-load time so it happens before any entity page
 *      tries to resolve a renderer.
 *
 *   2. setClients()  — injects typed API clients into @athyper/query hooks.
 *      All clients use a BFF-aware fetch adapter that proxies calls through
 *      /api/relay/* so the browser never holds a raw bearer token.
 *      Re-runs whenever the active org changes (context switch).
 *
 * Mount this inside <SessionProvider> in (shell)/layout.tsx so it has
 * access to the session context and re-initializes after context switches.
 */

import { useEffect, type ReactNode } from "react";
import { registerDefaults } from "@athyper/entity-runtime/field-renderers";
import { registerDocumentRenderers } from "@athyper/document-runtime/register";
import {
  createMetadataClient,
  createRecordsClient,
  createDocumentsClient,
  createWorkflowClient,
  createPlatformClient,
} from "@athyper/api-client";
import { setClients } from "@athyper/query";
import { useShellSession } from "@/components/providers/SessionProvider";

// ── Register all built-in field renderers once at module load ─────────────────
// This must happen before any EntityListPage / EntityDetailPage renders.
registerDefaults();

// ── Register all lines renderers once at module load ──────────────────────────
// Wires generic / journal / payment renderer keys into the renderer-registry
// so resolveLinesRenderer() works in ApprovableDetailPage.
registerDocumentRenderers();

// ── Initialize API clients once at module load ────────────────────────────────
// relayFetch is stateless (reads CSRF from cookie, org from server-side session),
// so clients can be created immediately without waiting for the React component
// tree to mount. This prevents useLookupDomain / useCompiledEntity from failing
// on the very first render before the useEffect below has run.
setClients(
  createMetadataClient(relayFetch),
  createRecordsClient(relayFetch),
  createWorkflowClient(relayFetch),
  createPlatformClient(relayFetch),
  createDocumentsClient(relayFetch),
);

// ── CSRF helper ───────────────────────────────────────────────────────────────

function getCsrfToken(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(/(?:^|;\s*)__csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]!) : "";
}

// ── BFF relay fetch adapter ───────────────────────────────────────────────────
//
// Wraps every API client call so requests go through /api/relay/* instead of
// directly to the runtime API. The relay BFF injects the bearer token
// server-side, so the browser never holds it.
//
// Path mapping:  /api/records/VENDOR  →  /api/relay/api/records/VENDOR
//
// The relay route handler strips the leading segment and forwards to RUNTIME_API_URL.

async function relayFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method ?? "GET").toUpperCase();
  const relayUrl = `/api/relay${path}`;

  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  // Attach CSRF token for mutating requests (double-submit pattern)
  if (method !== "GET" && method !== "HEAD") {
    headers.set("X-CSRF-Token", getCsrfToken());
  }

  const response = await fetch(relayUrl, { ...options, method, headers });

  if (!response.ok) {
    let body: { errors?: Array<{ code?: string; message?: string }>; error?: string; message?: string } = {};
    const ct = response.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      body = await response.json().catch(() => ({})) as typeof body;
    }
    const msg = body.errors?.[0]?.message ?? body.message ?? body.error ?? response.statusText;
    const err = new Error(msg) as Error & { status: number };
    err.status = response.status;
    throw err;
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

// ── Provider ──────────────────────────────────────────────────────────────────

interface RuntimeProviderProps {
  children: ReactNode;
}

export function RuntimeProvider({ children }: RuntimeProviderProps) {
  const { bff } = useShellSession();

  useEffect(() => {
    // Re-initialize all clients whenever the active org changes.
    // The relay fetch adapter is stateless (reads CSRF from cookie on each call),
    // so a single shared instance is safe across context switches.
    const metadata = createMetadataClient(relayFetch);
    const records = createRecordsClient(relayFetch);
    const documents = createDocumentsClient(relayFetch);
    const workflow = createWorkflowClient(relayFetch);
    const platform = createPlatformClient(relayFetch);

    setClients(metadata, records, workflow, platform, documents);
  }, [bff.activeOrg]);

  return <>{children}</>;
}
