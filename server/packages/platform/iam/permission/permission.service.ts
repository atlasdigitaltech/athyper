import type { Response } from "express";
import type { Kysely } from "kysely";

import type {
  CanonicalDecisionRequest,
  CollectionMaterialization,
  DecisionReason,
} from "../authorization-evaluator/index.js";
import {
  createNeonAuthorizationRuntime,
  withNormalizedOperationScopeRollout,
  SqlNormalizedEntitlementResolver,
  SqlOperationScopeRolloutResolver,
  SqlSessionV2CatalogRepository,
  type CanonicalAuthorizationRuntime,
} from "../authorization-runtime/index.js";
import type {
  PermissionBatchResult,
  PermissionContext,
  PermissionDecisionReason,
  PermissionDecisionResult,
  ResolvedScope,
} from "./permission.types.js";
import { appendSecurityEvent } from "@athyper/svc-audit";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = any;

interface PermissionLogger {
  error(event: string, fields?: Record<string, unknown>): void;
  warn(event: string, fields?: Record<string, unknown>): void;
}

interface CanonicalPermissionRow {
  permission_id: string;
  canonical_code: string;
  registered_non_entity: boolean;
}

const runtimes = new WeakMap<object, CanonicalAuthorizationRuntime>();

function runtimeFor(db: Kysely<AnyDb>): CanonicalAuthorizationRuntime {
  const key = db as object;
  const cached = runtimes.get(key);
  if (cached) return cached;
  const legacy = createNeonAuthorizationRuntime({
    db: db as never,
    plane: "neon",
    expectedDatabaseName: "athyper_neon",
    evaluatorRevision:
      process.env["AUTHORIZATION_EVALUATOR_REVISION"] ?? "unpublished",
  });
  const runtime = withNormalizedOperationScopeRollout(legacy, {
    db: db as never,
    plane: "neon",
    expectedDatabaseName: "athyper_neon",
    evaluatorRevision: process.env["AUTHORIZATION_EVALUATOR_REVISION"] ?? "unpublished",
    entitlementResolver: new SqlNormalizedEntitlementResolver(db as never, "neon"),
    rollout: new SqlOperationScopeRolloutResolver(db as never, "neon"),
  });
  runtimes.set(key, runtime);
  return runtime;
}

async function loadPermission(
  db: Kysely<AnyDb>,
  permissionCode: string,
): Promise<CanonicalPermissionRow | null> {
  const row = await db
    .selectFrom("authz.permission as permission")
    .select([
      "permission.id as permission_id",
      "permission.canonical_code",
    ])
    .where("permission.canonical_code", "=", permissionCode)
    .where("permission.status", "=", "published")
    .executeTakeFirst() as
      | Omit<CanonicalPermissionRow, "registered_non_entity">
      | undefined;
  return row
    ? { ...row, registered_non_entity: true }
    : null;
}

export async function checkPermission(
  db: Kysely<AnyDb>,
  tenantId: string,
  principalId: string,
  permissionCode: string,
  context?: PermissionContext,
  logger?: PermissionLogger,
): Promise<PermissionDecisionResult> {
  const startedAt = performance.now();
  try {
    const permission = await loadPermission(db, permissionCode);
    if (!permission) return denied(startedAt, "no_grant_found", "not_found");

    const evaluatedAt = new Date();
    let request: CanonicalDecisionRequest;
    if (permission.registered_non_entity) {
      request = {
        requestId: context?.request_id ?? crypto.randomUUID(),
        mode: "registered_capability",
        subject: {
          plane: "neon",
          tenantOrAccountId: tenantId,
          principalId,
        },
        permissionId: permission.permission_id,
        evaluatedAt,
      };
    } else {
      return denied(startedAt, "no_grant_found", "deny");
    }

    const envelope = await runtimeFor(db).decisions.decide(request);
    const result: PermissionDecisionResult = {
      decision: envelope.result.decision,
      reason: legacyReason(envelope.result.reason),
      scope: scopeFromDecision(envelope.result.mode === "collection"
        ? envelope.result.materialization
        : undefined),
      evaluation_ms: performance.now() - startedAt,
    };

    if (envelope.result.reason === "explicit_deny" && context?.plane) {
      void appendSecurityEvent(db, {
        plane: context.plane,
        tenant_id: tenantId,
        principal_id: principalId,
        event_code: "authz.permission_denied",
        category: "authorization",
        severity: "warning",
        outcome: "denied",
        context: {
          permission_code: permissionCode,
          entity_type: context.entity_type ?? null,
          entity_id: context.entity_id ?? null,
        },
      });
    }

    return result;
  } catch (error) {
    logger?.error("canonical_permission_evaluation_failed", {
      permissionCode,
      error: error instanceof Error ? error.message : String(error),
    });
    return denied(startedAt, "no_grant_found", "deny");
  }
}

export async function checkPermissionBatch(
  db: Kysely<AnyDb>,
  tenantId: string,
  principalId: string,
): Promise<PermissionBatchResult> {
  const startedAt = performance.now();
  const evaluatedAt = new Date();
  const runtime = runtimeFor(db);
  const catalog = await new SqlSessionV2CatalogRepository(
    db as never,
    "neon",
  ).load({
    plane: "neon",
    tenantOrAccountId: tenantId,
    evaluatedAt,
  });
  const requests: CanonicalDecisionRequest[] = catalog.entries.map(
    (entry, index) => entry.entityOperationId
      ? {
          requestId: `permission-batch:${index}:${entry.entityOperationId}`,
          mode: "collection",
          subject: {
            plane: "neon",
            tenantOrAccountId: tenantId,
            principalId,
          },
          entityOperationId: entry.entityOperationId,
          evaluatedAt,
        }
      : {
          requestId: `permission-batch:${index}:${entry.permissionId}`,
          mode: "registered_capability",
          subject: {
            plane: "neon",
            tenantOrAccountId: tenantId,
            principalId,
          },
          permissionId: entry.permissionId,
          evaluatedAt,
        },
  );
  const batch = await runtime.decisions.decideBatch(requests);
  if (batch.results.length !== catalog.entries.length) {
    throw new Error("canonical permission batch is incomplete");
  }
  const evaluationMs = performance.now() - startedAt;
  return Object.fromEntries(batch.results.map((envelope, index) => {
    const entry = catalog.entries[index]!;
    const organizational = envelope.result.mode !== "collection"
      || envelope.result.materialization.organizationalAllowClauses.length > 0;
    return [entry.canonicalCode, {
      decision:
        envelope.result.decision === "allow" && organizational
          ? "allow"
          : "deny",
      reason: legacyReason(envelope.result.reason),
      scope: scopeFromDecision(
        envelope.result.mode === "collection"
          ? envelope.result.materialization
          : undefined,
      ),
      evaluation_ms: evaluationMs,
    }];
  }));
}

function scopeFromDecision(
  materialization?: CollectionMaterialization,
): ResolvedScope {
  if (!materialization || materialization.denyScopes.length > 0) {
    return { visibility: "own", company_code_ids: [] };
  }
  const constraints = materialization.organizationalAllowClauses.flatMap(
    (clause) => clause.intersection,
  );
  return {
    visibility: constraints.some((constraint) => constraint.tenantWide)
      ? "all"
      : "own",
    company_code_ids: [...new Set(constraints.flatMap(
      (constraint) => constraint.dimensions.company_code ?? [],
    ))].sort(),
  };
}

function legacyReason(reason: DecisionReason): PermissionDecisionReason {
  if (reason === "allowed") return "grant_granted";
  if (reason === "entitlement_unavailable") return "plan_gate_denied";
  if (reason === "explicit_deny") return "explicit_deny";
  return "no_grant_found";
}

function denied(
  startedAt: number,
  reason: PermissionDecisionReason,
  decision: "deny" | "not_found",
): PermissionDecisionResult {
  return {
    decision,
    reason,
    scope: { visibility: "own", company_code_ids: [] },
    evaluation_ms: performance.now() - startedAt,
  };
}

export function requireAllow(
  result: PermissionDecisionResult,
  res: Response,
): boolean {
  if (result.decision === "allow") return true;
  const statusCode =
    result.decision === "not_in_plan" || result.decision === "addon_required"
      ? 402
      : 403;
  res.status(statusCode).json({
    error: result.decision.toUpperCase(),
    reason: result.reason,
  });
  return false;
}
