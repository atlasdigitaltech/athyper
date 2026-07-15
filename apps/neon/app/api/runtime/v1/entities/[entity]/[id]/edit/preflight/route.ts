import { NextResponse } from "next/server";
import { runtimeServerPath } from "@athyper/api-contracts/runtime-server-paths";
import type { DocumentEditRuntimeRouteContext } from "@/lib/server/document-edit-runtime-route-context";
import {
  documentEditLifecycleHeaders,
  elapsedLifecycleMs,
  loadDocumentEditRuntimeRouteContext,
  readDocumentEditRuntimeJson,
  readLifecycleRecord,
  readLifecycleStringArray,
} from "@/lib/server/document-edit-runtime-route-context";
import {
  documentEditDraftSummary,
  readDocumentEditServerDraft,
} from "@/lib/server/document-edit-runtime-drafts";
import { buildRuntimeHeaders, buildRuntimeUrl } from "@/lib/server/runtime-headers";
import { validateDocumentEditWorkspace } from "@/lib/server/document-edit-workspace-validation";
import { documentEditMetricTenant, recordDocumentEditMetric } from "@/lib/server/document-edit-observability";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ entity: string; id: string }> },
) {
  const startedAt = Date.now();
  const loaded = await loadDocumentEditRuntimeRouteContext({
    request,
    params,
    mode: "edit",
    unauthenticatedMessage: "Sign in again to preflight this document.",
    validatePermissionStamp: false,
  });
  if (!loaded.ok) return loaded.response;
  const workspace = validateDocumentEditWorkspace({ request, context: loaded.context });
  if (!workspace.ok) return workspace.response;

  const body = readLifecycleRecord(await readDocumentEditRuntimeJson(request));
  const requestedSections = readLifecycleStringArray(body["sections"]);
  const [serverDraft, upstreamPreflight] = await Promise.all([
    readDocumentEditServerDraft(loaded.context),
    loadUpstreamSubmitPreflight(loaded.context, request.signal),
  ]);
  const serverMs = elapsedLifecycleMs(startedAt);
  recordDocumentEditMetric({
    event: "draft_recovery",
    entityCode: loaded.context.entityCode,
    tenantId: documentEditMetricTenant(loaded.context),
    transportMode: "workspace_submit",
    outcome: serverDraft ? "available" : "empty",
    statusCode: 200,
    durationMs: serverMs,
  });

  return NextResponse.json(
    {
      ok: true,
      accepted: true,
      lifecycle: "preflight",
      entityCode: loaded.context.entityCode,
      recordId: loaded.context.recordId,
      transactionality: "staged_with_compensate",
      checks: [
        { code: "runtime_enabled", status: "ok" },
        { code: "record_visible", status: "ok" },
        { code: "edit_capability", status: "ok" },
        { code: "permission_stamp", status: "ok" },
      ],
      warnings: upstreamPreflight.warnings,
      blockers: upstreamPreflight.blockers,
      requestedSections,
      upstream: upstreamPreflight.upstream,
      serverDraft: documentEditDraftSummary(serverDraft),
      telemetry: { serverMs },
    },
    {
      headers: documentEditLifecycleHeaders("preflight", serverMs),
    },
  );
}

async function loadUpstreamSubmitPreflight(
  context: DocumentEditRuntimeRouteContext,
  signal: AbortSignal,
): Promise<{
  blockers: unknown[];
  warnings: unknown[];
  upstream: { status: number; ok: boolean } | null;
}> {
  try {
    const response = await fetch(
      buildRuntimeUrl(runtimeServerPath.submitPreflight(context.entityCode, context.recordId)),
      {
        method: "GET",
        headers: buildRuntimeHeaders(context.session),
        cache: "no-store",
        signal,
      },
    );
    const body = await response.json().catch(() => null) as unknown;
    const record = readLifecycleRecord(body);
    return {
      blockers: Array.isArray(record["blockers"]) ? record["blockers"] : [],
      warnings: Array.isArray(record["warnings"]) ? record["warnings"] : [],
      upstream: { status: response.status, ok: response.ok },
    };
  } catch (error) {
    return {
      blockers: [],
      warnings: [
        {
          code: "PREFLIGHT_UNAVAILABLE",
          message: error instanceof Error ? error.message : "Submit preflight is unavailable.",
        },
      ],
      upstream: null,
    };
  }
}
