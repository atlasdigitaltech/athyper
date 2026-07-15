import { NextResponse } from "next/server";
import type { SectionBatchResponse } from "@athyper/runtime-contracts";
import { maskFieldSecurityResponse } from "@/lib/server/meta-entity-write-validation";
import { getMetaEntityProcessRuntimeState } from "@/lib/server/meta-entity-process-state";
import {
  buildDocumentEditCorePayload,
  buildDocumentEditSectionBatch,
} from "@/lib/server/document-edit-runtime-data";
import {
  loadDocumentEditRuntimeRouteContext,
} from "@/lib/server/document-edit-runtime-route-context";
import { buildDocumentEditCoordinatorIdentity } from "@/lib/server/document-edit-coordinator-identity";
import { mintDocumentEditWorkspaceToken } from "@/lib/server/document-edit-workspace-token";
import {
  resolveDocumentEditPhysicalRecordId,
  resolveDocumentEditPlanHash,
  resolveDocumentEditWorkspaceProfile,
} from "@/lib/server/document-edit-workspace-validation";
import {
  documentEditMetricTenant,
  recordDocumentEditMetric,
} from "@/lib/server/document-edit-observability";
import { buildDocumentWorkspaceDraftContext } from "@/lib/server/document-workspace-draft-context";
import { getMetaEntityRuntimeDescriptorCacheState } from "@/lib/server/meta-entity-runtime";
import { resolveDocumentOpenRollout } from "@/lib/server/document-runtime-feature-flags";
import {
  loadDocumentChildCompiledProjections,
  loadDocumentRuleProjection,
} from "@/lib/server/document-open-projections";

export const dynamic = "force-dynamic";

/**
 * Bounded document workspace bootstrap. This composes existing core and
 * section builders after one route-context/permission/record load; legacy
 * /core and /sections remain compatibility adapters during client rollout.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ entity: string; id: string }> },
) {
  const startedAt = performance.now();
  const serverTimings: Array<{ name: string; durationMs: number }> = [];

  const loaded = await loadDocumentEditRuntimeRouteContext({
    request,
    params,
    mode: "edit",
    unauthenticatedMessage: "Sign in again to open this document.",
    validatePermissionStamp: false,
  });
  if (!loaded.ok) return loaded.response;

  const { session, entityCode, recordId, descriptor, editRuntime, record } = loaded.context;
  const planHash = resolveDocumentEditPlanHash(loaded.context);
  if (!planHash) {
    recordDocumentEditMetric({
      event: "workspace_open",
      entityCode,
      tenantId: documentEditMetricTenant(loaded.context),
      transportMode: "workspace_submit",
      outcome: "failure",
      statusCode: 503,
      reason: "plan_unavailable",
      durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
    });
      return NextResponse.json({
        error: "WORKSPACE_PLAN_UNAVAILABLE",
        message: "The compiler-owned document workspace plan is unavailable.",
      }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  const markTiming = (name: string, durationMs: number): void => {
    serverTimings.push({ name, durationMs: Math.max(0, Math.round(durationMs)) });
  };

  if (loaded.context.timings) {
    markTiming("session", loaded.context.timings.sessionMs);
    markTiming("descriptor", loaded.context.timings.descriptorMs);
    markTiming("record", loaded.context.timings.recordMs);
    if (loaded.context.timings.recordSource === "initiation_bootstrap") {
      markTiming("initiation-bootstrap", loaded.context.timings.recordMs);
    }
    if (typeof loaded.context.timings.permissionValidationMs === "number") {
      markTiming("permissions", loaded.context.timings.permissionValidationMs);
    }
  }

  const openReason = request.headers.get("X-Document-Edit-Open-Reason") === "refresh" ? "refresh" : "initial";
  const maskedRecord = maskFieldSecurityResponse(record, descriptor);
  const descriptorCacheState = getMetaEntityRuntimeDescriptorCacheState(descriptor);
  const rollout = resolveDocumentOpenRollout({ session, entityCode });
  const defaultBootstrapKeys = editRuntime.sections
    .filter((section) => section.accessible && (section.loadPolicy === "core" || section.loadPolicy === "eager_parallel"))
    .map((section) => section.key);
  const provisionalEmptyCandidate = isProvisionalPurchaseOrder(descriptor, record);
  const initialBootstrapKeys = provisionalEmptyCandidate
    ? resolveEmptyDraftBootstrapKeys(editRuntime, defaultBootstrapKeys)
    : defaultBootstrapKeys;

  const processStateStart = performance.now();
  const sectionsStart = performance.now();
  const [processState, initialSections, rulesProjection, childMetadataProjection] = await Promise.all([
    canSkipProvisionalProcessState(descriptor, record)
      ? Promise.resolve(null)
      : getMetaEntityProcessRuntimeState(entityCode, recordId, descriptor, record),
    buildDocumentEditSectionBatch({
      session,
      descriptor,
      editRuntime,
      recordId,
      record,
      requestedKeys: initialBootstrapKeys,
      signal: request.signal,
    }),
    loadOptionalOpenProjection(
      rollout.openRulesBootstrap,
      () => loadDocumentRuleProjection({ session, entityCode, signal: request.signal }),
    ),
    loadOptionalOpenProjection(
      rollout.openChildMetadataBootstrap,
      () => loadDocumentChildCompiledProjections({ session, descriptor }),
    ),
  ]);
  const rules = rulesProjection.value;
  const compiledEntities = childMetadataProjection.value;
  let sections = initialSections;
  let bootstrapKeys = initialBootstrapKeys;
  if (provisionalEmptyCandidate && sectionBatchHasRows(initialSections)) {
    const remainingKeys = defaultBootstrapKeys.filter((key) => !initialBootstrapKeys.includes(key));
    if (remainingKeys.length > 0) {
      const remaining = await buildDocumentEditSectionBatch({
        session,
        descriptor,
        editRuntime,
        recordId,
        record,
        requestedKeys: remainingKeys,
        signal: request.signal,
      });
      sections = { sections: [...initialSections.sections, ...remaining.sections] };
      bootstrapKeys = defaultBootstrapKeys;
    }
  }
  markTiming("process", performance.now() - processStateStart);
  markTiming("sections", performance.now() - sectionsStart);
  markTiming("rules", rulesProjection.durationMs);
  markTiming("child-metadata", childMetadataProjection.durationMs);
  recordProjectionMetric(loaded.context, rollout.stage, "rules", rulesProjection);
  recordProjectionMetric(loaded.context, rollout.stage, "child_metadata", childMetadataProjection);
  recordProjectionValidationMetrics(loaded.context, rules, compiledEntities, editRuntime);
  for (const section of sections.sections) {
    recordDocumentEditMetric({
      event: "workspace_section",
      entityCode,
      tenantId: documentEditMetricTenant(loaded.context),
      transportMode: "workspace_submit",
      outcome: section.status,
      durationMs: section.timing?.serverMs,
      reason: section.status === "ok" ? "healthy" : section.status,
    });
  }
  const draftContext = buildDocumentWorkspaceDraftContext({ descriptor, record, recordId });

  const workspaceTokenStart = performance.now();
  const identity = buildDocumentEditCoordinatorIdentity(session, maskedRecord as Record<string, unknown>);
  const physicalRecordId = resolveDocumentEditPhysicalRecordId(record, recordId);
  const workspaceProfile = resolveDocumentEditWorkspaceProfile(loaded.context);
  const workspaceId = identity
    ? mintDocumentEditWorkspaceToken({
        tenantId: identity.tenantId,
        principalId: identity.effectivePrincipal,
        entityCode,
        recordId: physicalRecordId,
        permissionStamp: identity.permissionStamp,
        planHash,
        profile: workspaceProfile,
      })
    : null;
  if (!workspaceId) {
    recordDocumentEditMetric({
      event: "workspace_open",
      entityCode,
      tenantId: documentEditMetricTenant(loaded.context),
      transportMode: "workspace_submit",
      outcome: "failure",
      statusCode: 503,
      reason: "signing_unavailable",
      durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
    });
    return NextResponse.json({
      error: "WORKSPACE_TOKEN_UNAVAILABLE",
      message: "Document workspace signing is not configured for this environment.",
    }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  markTiming("workspace-token", performance.now() - workspaceTokenStart);

  const serializeStart = performance.now();
  const responsePayload = {
    workspace: {
      id: workspaceId,
      entityCode,
      recordId: physicalRecordId,
      profile: workspaceProfile,
      bootstrapKeys,
      planHash,
    },
    core: {
      ...buildDocumentEditCorePayload({
        entityCode,
        recordId,
        descriptor,
        editRuntime,
        record: maskedRecord,
        processState: processState ?? undefined,
      }),
      draftContext,
      ...(rules ? { rules } : {}),
      ...(compiledEntities ? { compiledEntities } : {}),
    },
    transport: {
      save: "workspace_submit",
      saveAndTransition: editRuntime.submitPolicy.saveAndTransitionEnabled !== false,
      events: "workspace_events",
    },
    sections,
  };
  markTiming("serialize", performance.now() - serializeStart);
  const serverMs = Math.max(0, Math.round(performance.now() - startedAt));
  const serverTimingHeader = buildServerTimingHeader(serverTimings);

  recordDocumentEditMetric({
    event: "workspace_open",
    entityCode,
    tenantId: documentEditMetricTenant(loaded.context),
    transportMode: "workspace_submit",
    outcome: "success",
    statusCode: 200,
    reason: `${openReason}:${descriptorCacheState}`,
    durationMs: serverMs,
  });

  return NextResponse.json(responsePayload, {
    headers: {
      "Cache-Control": "no-store",
      "X-Document-Edit-Lifecycle": "open",
      "X-Document-Edit-Server-Ms": String(serverMs),
      "X-Document-Edit-Cache-State": descriptorCacheState,
      "X-Document-Open-Rollout-Stage": rollout.stage,
      "X-Document-Open-Rules": rulesProjection.status,
      "X-Document-Open-Child-Metadata": childMetadataProjection.status,
      "X-Document-Open-Rollout-Guard": rollout.guard.disabled ? "disabled" : "enabled",
      "X-Document-Open-Rollout-Guard-Reason": rollout.guard.reason ?? "none",
      "Server-Timing": serverTimingHeader,
    },
  });
}

type OpenProjectionStatus = "disabled" | "included" | "fallback";

interface OpenProjectionResult<T> {
  value: T | null;
  status: OpenProjectionStatus;
  durationMs: number;
}

async function loadOptionalOpenProjection<T>(
  enabled: boolean,
  loader: () => Promise<T | null>,
): Promise<OpenProjectionResult<T>> {
  if (!enabled) return { value: null, status: "disabled", durationMs: 0 };
  const startedAt = performance.now();
  try {
    const value = await loader();
    return {
      value,
      status: value === null ? "fallback" : "included",
      durationMs: performance.now() - startedAt,
    };
  } catch {
    return {
      value: null,
      status: "fallback",
      durationMs: performance.now() - startedAt,
    };
  }
}

function recordProjectionMetric(
  context: Parameters<typeof documentEditMetricTenant>[0] & { entityCode: string },
  stage: string,
  projection: "rules" | "child_metadata",
  result: OpenProjectionResult<unknown>,
): void {
  recordDocumentEditMetric({
    event: result.status === "fallback" ? "workspace_compatibility_fetch" : "workspace_projection",
    entityCode: context.entityCode,
    tenantId: documentEditMetricTenant(context),
    transportMode: "workspace_submit",
    outcome: result.status,
    durationMs: result.durationMs,
    reason: `${projection}:${stage}`,
  });
}

function recordProjectionValidationMetrics(
  context: Parameters<typeof documentEditMetricTenant>[0] & { entityCode: string },
  rules: unknown,
  compiledEntities: unknown,
  editRuntime: { childCollections: Array<{ key: string; entityCode: string }> },
): void {
  if (rules !== null) {
    const fieldMasksPresent = isRecord(rules) && isRecord(rules["field_rules"]);
    recordDocumentEditMetric({
      event: "workspace_projection_validation",
      entityCode: context.entityCode,
      tenantId: documentEditMetricTenant(context),
      transportMode: "workspace_submit",
      outcome: fieldMasksPresent ? "success" : "failure",
      reason: fieldMasksPresent ? "field_masks_present" : "missing_field_mask",
    });
  }
  if (compiledEntities !== null) {
    const expectedChildren = editRuntime.childCollections
      .filter((collection) => collection.key === "lines"
        || collection.key === "items"
        || collection.entityCode === "commitment_line")
      .map((collection) => collection.entityCode);
    const childCapabilitiesPresent = isRecord(compiledEntities)
      && expectedChildren.every((entityCode) => isRecord(compiledEntities[entityCode]));
    recordDocumentEditMetric({
      event: "workspace_projection_validation",
      entityCode: context.entityCode,
      tenantId: documentEditMetricTenant(context),
      transportMode: "workspace_submit",
      outcome: childCapabilitiesPresent ? "success" : "failure",
      reason: childCapabilitiesPresent ? "child_capabilities_present" : "incorrect_child_capability",
    });
  }
}

function isProvisionalPurchaseOrder(
  descriptor: { entityCode: string; createMode: string },
  record: Record<string, unknown>,
): boolean {
  const data = isRecord(record["data"]) ? record["data"] : record;
  return descriptor.entityCode === "purchase_order"
    && descriptor.createMode === "EARLY_DRAFT"
    && data["is_provisional"] === true;
}

function canSkipProvisionalProcessState(
  descriptor: { entityCode: string; createMode: string },
  record: Record<string, unknown>,
): boolean {
  if (!isProvisionalPurchaseOrder(descriptor, record)) return false;
  const data = isRecord(record["data"]) ? record["data"] : record;
  return !data["workflow_request_id"]
    && !data["process_instance_id"]
    && !isRecord(data["processState"]);
}

function resolveEmptyDraftBootstrapKeys(
  editRuntime: { sections: Array<{ key: string; loadPolicy: string }>; childCollections: Array<{ key: string; sectionKey: string; entityCode: string }> },
  fallback: string[],
): string[] {
  const lineSectionKeys = new Set(editRuntime.childCollections
    .filter((collection) => collection.key === "lines"
      || collection.key === "items"
      || collection.entityCode === "commitment_line")
    .map((collection) => collection.sectionKey));
  const selected = editRuntime.sections
    .filter((section) => section.loadPolicy === "core" || lineSectionKeys.has(section.key))
    .map((section) => section.key);
  return selected.length > 0 ? [...new Set(selected)] : fallback;
}

function sectionBatchHasRows(batch: SectionBatchResponse): boolean {
  return batch.sections.some((section) => {
    if (!isRecord(section.data)) return false;
    const collections = section.data["childCollections"];
    if (!Array.isArray(collections)) return false;
    return collections.some((collection) => isRecord(collection)
      && isRecord(collection["pagination"])
      && typeof collection["pagination"]["total"] === "number"
      && collection["pagination"]["total"] > 0);
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function buildServerTimingHeader(entries: Array<{ name: string; durationMs: number }>): string {
  const safe = entries
    .filter((entry) => Number.isFinite(entry.durationMs))
    .map((entry) => `${entry.name};dur=${Math.max(0, Math.round(entry.durationMs))}`);
  return safe.join(",");
}
