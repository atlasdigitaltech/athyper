// {GET|POST|PUT|PATCH|DELETE} /api/me/[...path] — BFF relay to runtime /api/me/*. Identity, preferences, MFA self-service, delegations.
import { NextResponse } from "next/server";
import { makeModuleRelay } from "@/lib/server/make-module-relay";
import { getNeonServerSession } from "@/lib/server/session";
import {
  getRuntimeUserPreferences,
  invalidateRuntimeUserPreferences,
  RuntimeUserPreferencesUpstreamError,
} from "@/lib/server/runtime-user-preferences";
import type {
  AthyperCacheState,
  RuntimeListDiagnosticRecorder,
} from "@/lib/server/runtime-list-observability";

const relay = makeModuleRelay("me");

export async function GET(...args: Parameters<typeof relay.GET>): ReturnType<typeof relay.GET> {
  const [, context] = args;
  const { path } = await context.params;
  if (path.length !== 1 || path[0] !== "preferences") return relay.GET(...args);

  let cacheState: AthyperCacheState = "bypass";
  let durationMs = 0;
  const diagnostics: RuntimeListDiagnosticRecorder = {
    record(operation, duration, state) {
      if (operation !== "session_config") return;
      durationMs += duration;
      cacheState = state ?? "bypass";
    },
  };
  try {
    const preferences = await getRuntimeUserPreferences(diagnostics);
    if (preferences === null) return relay.GET(...args);
    return NextResponse.json(preferences, {
      headers: preferenceCacheHeaders(cacheState, durationMs),
    });
  } catch (error) {
    if (error instanceof RuntimeUserPreferencesUpstreamError) {
      return NextResponse.json(error.payload, {
        status: error.status,
        headers: preferenceCacheHeaders("bypass", durationMs),
      });
    }
    return relay.GET(...args);
  }
}

export async function PATCH(...args: Parameters<typeof relay.PATCH>): ReturnType<typeof relay.PATCH> {
  const [, context] = args;
  const { path } = await context.params;
  const response = await relay.PATCH(...args);
  if (response.ok && path.length === 1 && path[0] === "preferences") {
    const session = await getNeonServerSession();
    if (session) invalidateRuntimeUserPreferences(session, "preferences_updated");
  }
  return response;
}

export const POST = relay.POST;
export const PUT = relay.PUT;
export const DELETE = relay.DELETE;

function preferenceCacheHeaders(cacheState: AthyperCacheState, durationMs: number): Record<string, string> {
  return {
    "Cache-Control": "private, no-store",
    "X-Athyper-Cache": cacheState,
    "Server-Timing": `session_config;dur=${roundDuration(durationMs)};desc=\"cache=${cacheState}\"`,
  };
}

function roundDuration(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.round(value * 100) / 100;
}
