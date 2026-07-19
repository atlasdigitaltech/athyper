// {GET|POST|PUT|PATCH|DELETE} /api/iam/[...path] — BFF relay to runtime /api/iam/*. Groups, roles, principals, bindings, delegations admin.
import { NextResponse } from "next/server";
import { makeModuleRelay } from "@/lib/server/make-module-relay";
import { getRuntimeConfigurationSnapshot } from "@/lib/server/runtime-configuration-snapshots";
import type {
  AthyperCacheState,
  RuntimeListDiagnosticRecorder,
} from "@/lib/server/runtime-list-observability";

const relay = makeModuleRelay("iam");

export async function GET(
  ...args: Parameters<typeof relay.GET>
): ReturnType<typeof relay.GET> {
  const [request, context] = args;
  const { path } = await context.params;
  if (path.length !== 2 || path[0] !== "parameters" || path[1] !== "effective") {
    return relay.GET(...args);
  }

  const namespace = new URL(request.url).searchParams.get("namespace")?.trim();
  if (!namespace) return relay.GET(...args);

  let cacheState: AthyperCacheState = "bypass";
  let durationMs = 0;
  const diagnostics: RuntimeListDiagnosticRecorder = {
    record(operation, duration, state) {
      if (operation !== "session_config") return;
      durationMs += duration;
      cacheState = state ?? "bypass";
    },
  };
  const snapshot = await getRuntimeConfigurationSnapshot(namespace, diagnostics);
  if (!snapshot) return relay.GET(...args);

  return NextResponse.json(snapshot, {
    headers: {
      "Cache-Control": "no-store",
      "X-Athyper-Cache": cacheState,
      "Server-Timing": `session_config;dur=${roundDuration(durationMs)}`,
    },
  });
}

export const POST = relay.POST;
export const PUT = relay.PUT;
export const PATCH = relay.PATCH;
export const DELETE = relay.DELETE;

function roundDuration(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.round(value * 100) / 100;
}
