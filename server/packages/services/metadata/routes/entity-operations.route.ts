/**
 * Metadata Routes - GET /api/metadata/entities/:entity/operations
 *
 * Returns the action operations the current principal may see for an entity.
 * Permission evaluation stays server-side; the header renders this result as
 * data and never infers authorization from labels.
 */

import type { RequestHandler, Router } from "express";
import type { Kysely } from "kysely";
import {
  extractOrgHeaders,
  resolvePrincipalIdWithJit,
  resolveTenantId,
  verifyBearer,
} from "@athyper/svc-shared";
import { isActiveApproverFor } from "@athyper/svc-workflow";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

export interface EntityOperationsRoutesDeps {
  db: AnyDb;
  auth: {
    verifyToken(token: string): Promise<Record<string, unknown>>;
  };
  logger?: {
    error(event: string, fields?: Record<string, unknown>): void;
    warn?(event: string, fields?: Record<string, unknown>): void;
  };
  checkPermissionBatch?: (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db: Kysely<any>,
    tenantId: string,
    principalId: string,
    personaId: string,
  ) => Promise<Record<string, { decision: string } | undefined>>;
}

type PermissionDecision = "allow" | "deny" | "not_found" | "not_in_plan" | "addon_required" | "not_granted";
type ActionGroup = "lifecycle" | "record" | "general" | "workflow_task";
type ActionIntent = "neutral" | "success" | "warning" | "danger";

interface EntityOperationRow {
  id: string;
  entity_name: string;
  permission_code: string;
  surface: string;
  placement: string;
  handler_type: string;
  handler_target: string | null;
  execution_target: string | null;
  is_record_required: boolean;
  sort_order: number;
  label_override: string | null;
  icon_override: string | null;
  is_enabled: boolean;
  selection_config: unknown;
  tenant_id: string | null;
  permission_risk_level: string;
  permission_metadata: unknown;
  permission_category_code: string;
}

interface LifecycleTransitionInfo {
  transition_id: string;
  lifecycle_id: string;
  from_state: string;
  to_state: string;
  requires_reason?: boolean;
  requires_confirmation?: boolean;
}

const ZERO_UUID = "00000000-0000-0000-0000-000000000000";
const WORKFLOW_TASK_DECISIONS = new Set([
  "approve",
  "deny",
  "reject",
  "return",
  "request_info",
  "request_more_info",
  "more_info",
]);
const DANGER_LEAVES = new Set(["cancel", "delete", "delete_draft", "deny", "reject", "remove", "reverse", "void"]);
const SUCCESS_LEAVES = new Set(["activate", "post", "publish", "reopen", "restore", "submit"]);
const RECORD_CATEGORY_CODES = new Set(["entity", "utility", "bulk", "delegation"]);

// Phase 4 helper: project an EffectivePermissionContext (Phase 2 DTO) into
// the per-code decision map this route already uses. Anything not in `allowed`
// and not in `denied` is treated as a missing grant (not_found).
function decisionsFromContext(
  ctx: { allowed: ReadonlySet<string>; denied: ReadonlySet<string> },
): Record<string, { decision: string } | undefined> {
  const out: Record<string, { decision: string }> = {};
  for (const code of ctx.allowed) out[code] = { decision: "allow" };
  for (const code of ctx.denied)  out[code] = { decision: "deny"  };
  return out;
}

export function createEntityOperationsRoute(router: Router, deps: EntityOperationsRoutesDeps): Router {
  const { db, auth, logger, checkPermissionBatch } = deps;

  const handler: RequestHandler = async (req, res, next) => {
    try {
      const recordOverlayOnly = req.path.endsWith("/record-operations");
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const entityCode = (req.params["entity"] as string).replace(/-/g, "_");
      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) {
        res.json([]);
        return;
      }

      const sub = typeof claims.sub === "string" ? claims.sub : "";
      const upstreamCtxAvailable = Boolean(
        (res.locals as Record<string, unknown>)["effectivePermissionContext"],
      );
      // When the Phase 2 middleware has run, we don't need a sub or the
      // legacy checkPermissionBatch — the context already encodes the
      // resolved permission matrix. Fall back to inline resolution otherwise.
      if (!upstreamCtxAvailable && (!sub || !checkPermissionBatch)) {
        res.json([]);
        return;
      }

      // Optional record-context query param. When provided, the route gates
      // workflow_task operations (approve / deny / request_info) on whether
      // the principal is the active approver for this record. When absent,
      // workflow_task ops stay dropped — entity-level callers (list views,
      // bulk pages) have no record to gate against.
      const recordIdParam = typeof req.query["recordId"] === "string"
        ? req.query["recordId"].trim()
        : "";
      const recordId = recordIdParam.length > 0 ? recordIdParam : null;
      if (recordOverlayOnly && !recordId) {
        res.status(400).json({ error: "RECORD_ID_REQUIRED" });
        return;
      }

      // Phase 4: prefer the EffectivePermissionContext built upstream by the
      // permission-context middleware (Phase 2). When the middleware has run,
      // res.locals.effectivePermissionContext carries the allowed set already,
      // so we skip the inline persona query + checkPermissionBatch round-trip.
      // When the middleware is NOT wired (legacy route consumers, sysadmin
      // tooling) we fall back to the inline resolution that has shipped since
      // Phase 1.
      const upstreamCtx = (res.locals as Record<string, unknown>)["effectivePermissionContext"] as
        | { allowed: ReadonlySet<string>; denied: ReadonlySet<string> }
        | undefined;

      let permissionDecisions: Record<string, { decision: string } | undefined>;
      let principalId: string | null = null;
      if (upstreamCtx) {
        permissionDecisions = decisionsFromContext(upstreamCtx);
        // Upstream-ctx path doesn't resolve principalId — only resolve when
        // we actually need it for the active-approver gate, which costs one
        // extra DB round-trip on record-context calls only.
        if (recordId) {
          principalId = sub
            ? await resolvePrincipalIdWithJit(db, sub, tenantId, xRealm, claims)
            : null;
        }
      } else {
        // Guaranteed by the early-return guard above, but TypeScript can't
        // narrow `checkPermissionBatch` across that branch.
        if (!checkPermissionBatch) { res.json([]); return; }
        principalId = await resolvePrincipalIdWithJit(db, sub, tenantId, xRealm, claims);
        const personaRow = await db
          .selectFrom("master.principal_persona as pp" as never)
          .select(["pp.persona_id"] as never[])
          .where("pp.tenant_id" as never, "=" as never, tenantId as never)
          .where("pp.principal_id" as never, "=" as never, principalId as never)
          .executeTakeFirst() as { persona_id: string } | undefined;

        permissionDecisions = await checkPermissionBatch(
          db,
          tenantId,
          principalId,
          personaRow?.persona_id ?? ZERO_UUID,
        );
      }

      // Active-approver gate: only run when we have both a record context and
      // a resolved principalId. Result is folded into the flatMap below to
      // decide whether workflow_task ops are emitted.
      const isActiveApprover = recordId && principalId
        ? await isActiveApproverFor({ db, tenantId, principalId, entityCode, recordId })
        : false;

      const rows = await loadOperationRows(db, entityCode, tenantId);
      const lifecycleTransitions = await loadLifecycleTransitions(db, entityCode, tenantId);
      const seen = dedupeTenantOperations(rows);

      const operations = [...seen.values()]
        .sort((a, b) => a.sort_order - b.sort_order)
        .flatMap((row) => {
          const decision = normalizeDecision(permissionDecisions[row.permission_code]?.decision);
          if (decision !== "allow") return [];

          const metadata = asRecord(row.permission_metadata);
          // workflow_task ops (approve / deny / request_info) only render when
          // the principal is the active approver for this specific record.
          // Without a record context — or when the principal isn't the active
          // approver — drop them so a stale workflow.approve permission grant
          // can't surface those buttons against records routed elsewhere.
          if (isWorkflowTaskOperation(row, metadata) && !isActiveApprover) return [];

          const transitions = lifecycleTransitions.get(row.permission_code) ?? [];
          return [{
            id: row.id,
            entity_name: row.entity_name,
            permission_code: row.permission_code,
            surface: row.surface,
            placement: row.placement,
            handler_type: row.handler_type,
            handler_target: row.handler_target,
            execution_target: row.execution_target,
            is_record_required: row.is_record_required,
            sort_order: row.sort_order,
            label_override: row.label_override,
            icon_override: row.icon_override,
            is_enabled: row.is_enabled,
            disabled_reason: null,
            action_group: resolveActionGroup(row, metadata, transitions),
            intent: resolveIntent(row, metadata),
            requires_confirmation: resolveRequiresConfirmation(row, metadata),
            requires_reason: resolveRequiresReason(metadata, transitions),
            source: transitions.length > 0 ? "lifecycle_transition" : "entity_operation",
            permission_decision: decision,
            selection_config: row.selection_config,
            lifecycle_transitions: transitions.length > 0 ? transitions : undefined,
          }];
        });

      if (recordOverlayOnly) {
        res.json({
          schemaVersion: 1,
          entityCode,
          recordId: recordId!,
          operations: operations.filter((operation) => operation.action_group === "workflow_task"),
        });
      } else {
        res.json(operations);
      }
    } catch (err) {
      logger?.error("entity_operations_route_error", { err: String(err) });
      next(err);
    }
  };

  router.get("/metadata/entities/:entity/operations", handler);
  router.get("/metadata/entities/:entity/record-operations", handler);
  return router;
}

/** Principal-agnostic operation declarations for the cached runtime bootstrap. */
export async function loadPublicEntityOperations(
  db: AnyDb,
  entityCode: string,
  tenantId: string,
): Promise<Array<Record<string, unknown>>> {
  const rows = await loadOperationRows(db, entityCode, tenantId);
  const lifecycleTransitions = await loadLifecycleTransitions(db, entityCode, tenantId);
  return [...dedupeTenantOperations(rows).values()]
    .sort((a, b) => a.sort_order - b.sort_order)
    .flatMap((row) => {
      const metadata = asRecord(row.permission_metadata);
      if (isWorkflowTaskOperation(row, metadata)) return [];
      const transitions = lifecycleTransitions.get(row.permission_code) ?? [];
      return [{
        id: row.id,
        entity_name: row.entity_name,
        permission_code: row.permission_code,
        surface: row.surface,
        placement: row.placement,
        handler_type: row.handler_type,
        handler_target: row.handler_target,
        execution_target: row.execution_target,
        is_record_required: row.is_record_required,
        sort_order: row.sort_order,
        label_override: row.label_override,
        icon_override: row.icon_override,
        is_enabled: row.is_enabled,
        disabled_reason: null,
        action_group: resolveActionGroup(row, metadata, transitions),
        intent: resolveIntent(row, metadata),
        requires_confirmation: resolveRequiresConfirmation(row, metadata),
        requires_reason: resolveRequiresReason(metadata, transitions),
        source: transitions.length > 0 ? "lifecycle_transition" : "entity_operation",
        selection_config: row.selection_config,
        lifecycle_transitions: transitions.length > 0 ? transitions : undefined,
      }];
    });
}

async function loadOperationRows(
  db: AnyDb,
  entityCode: string,
  tenantId: string,
): Promise<EntityOperationRow[]> {
  return await db
    .selectFrom("control.entity_operation as eo")
    .innerJoin("shared.permission as p", "p.code" as never, "eo.permission_code" as never)
    .innerJoin("shared.permission_category as pc", "pc.id" as never, "p.category_id" as never)
    .select([
      "eo.id",
      "eo.entity_name",
      "eo.permission_code",
      "eo.surface",
      "eo.placement",
      "eo.handler_type",
      "eo.handler_target",
      "eo.execution_target",
      "eo.is_record_required",
      "eo.sort_order",
      "eo.label_override",
      "eo.icon_override",
      "eo.is_enabled",
      "eo.selection_config",
      "eo.tenant_id",
      "p.risk_level as permission_risk_level",
      "p.metadata as permission_metadata",
      "pc.code as permission_category_code",
    ] as never[])
    .where("eo.entity_name" as never, "=" as never, entityCode as never)
    .where("eo.is_enabled" as never, "=" as never, true as never)
    .where("p.status" as never, "=" as never, "active" as never)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .where((eb: any) =>
      eb.or([
        eb("eo.tenant_id" as never, "is", null),
        eb("eo.tenant_id" as never, "=", tenantId as never),
      ]),
    )
    .orderBy("eo.sort_order" as never, "asc")
    .execute() as EntityOperationRow[];
}

async function loadLifecycleTransitions(
  db: AnyDb,
  entityCode: string,
  tenantId: string,
): Promise<Map<string, LifecycleTransitionInfo[]>> {
  const rows = await db
    .selectFrom("control.entity_lifecycle as el")
    .innerJoin("control.lifecycle_transition as lt", "lt.lifecycle_id" as never, "el.lifecycle_id" as never)
    .innerJoin("control.lifecycle_state as fs", "fs.id" as never, "lt.from_state_id" as never)
    .innerJoin("control.lifecycle_state as ts", "ts.id" as never, "lt.to_state_id" as never)
    .select([
      "lt.id as transition_id",
      "lt.lifecycle_id",
      "lt.operation_code",
      "lt.config",
      "fs.code as from_state",
      "ts.code as to_state",
    ] as never[])
    .where("el.entity_name" as never, "=" as never, entityCode as never)
    .where("lt.is_active" as never, "=" as never, true as never)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .where((eb: any) =>
      eb.or([
        eb("el.tenant_id" as never, "is", null),
        eb("el.tenant_id" as never, "=", tenantId as never),
      ]),
    )
    .orderBy("el.priority" as never, "asc")
    .execute() as Array<{
      transition_id: string;
      lifecycle_id: string;
      operation_code: string;
      config: unknown;
      from_state: string;
      to_state: string;
    }>;

  const byOperation = new Map<string, LifecycleTransitionInfo[]>();
  for (const row of rows) {
    const config = asRecord(row.config);
    const item: LifecycleTransitionInfo = {
      transition_id: row.transition_id,
      lifecycle_id: row.lifecycle_id,
      from_state: row.from_state,
      to_state: row.to_state,
      requires_reason: readBoolean(config, "requires_reason")
        ?? readBoolean(config, "require_reason")
        ?? readBoolean(config, "require_comment"),
      requires_confirmation: readBoolean(config, "requires_confirmation")
        ?? readBoolean(config, "confirm"),
    };
    const current = byOperation.get(row.operation_code) ?? [];
    current.push(item);
    byOperation.set(row.operation_code, current);
  }

  return byOperation;
}

function dedupeTenantOperations(rows: EntityOperationRow[]): Map<string, EntityOperationRow> {
  const seen = new Map<string, EntityOperationRow>();
  for (const row of rows) {
    const existing = seen.get(row.permission_code);
    if (!existing || (row.tenant_id !== null && existing.tenant_id === null)) {
      seen.set(row.permission_code, row);
    }
  }
  return seen;
}

function resolveActionGroup(
  row: EntityOperationRow,
  metadata: Record<string, unknown>,
  transitions: LifecycleTransitionInfo[],
): ActionGroup {
  const explicit = readActionGroup(metadata, "action_group") ?? readActionGroup(metadata, "actionGroup");
  if (explicit) return explicit;
  // Workflow-task ops (approve / deny / request_info / return / reject) must
  // self-classify so chrome filters keyed on `action_group === "workflow_task"`
  // (e.g. edit-mode hides forward-only ops) actually match. Detected via
  // permission_category_code === "workflow" + WORKFLOW_TASK_DECISIONS leaf.
  if (isWorkflowTaskOperation(row, metadata)) return "workflow_task";
  if (transitions.length > 0) return "lifecycle";
  if (RECORD_CATEGORY_CODES.has(row.permission_category_code)) return "record";
  return "general";
}

function resolveIntent(row: EntityOperationRow, metadata: Record<string, unknown>): ActionIntent {
  const explicit = readIntent(metadata, "intent");
  if (explicit) return explicit;

  const leaf = permissionLeaf(row.permission_code);
  if (DANGER_LEAVES.has(leaf) || row.permission_risk_level === "critical") return "danger";
  if (SUCCESS_LEAVES.has(leaf)) return "success";
  if (row.permission_risk_level === "high") return "warning";
  return "neutral";
}

function resolveRequiresConfirmation(row: EntityOperationRow, metadata: Record<string, unknown>): boolean {
  return readBoolean(metadata, "requires_confirmation")
    ?? readBoolean(metadata, "requiresConfirmation")
    ?? resolveIntent(row, metadata) === "danger";
}

function resolveRequiresReason(
  metadata: Record<string, unknown>,
  transitions: LifecycleTransitionInfo[],
): boolean {
  return readBoolean(metadata, "requires_reason")
    ?? readBoolean(metadata, "requiresReason")
    ?? transitions.some((transition) => transition.requires_reason);
}

function isWorkflowTaskOperation(row: EntityOperationRow, metadata: Record<string, unknown>): boolean {
  const explicitSource = readString(metadata, "source") ?? readString(metadata, "operation_source");
  const explicitGroup = readString(metadata, "action_group") ?? readString(metadata, "actionGroup");
  if (explicitSource === "workflow_task" || explicitGroup === "workflow_task") return true;
  return row.permission_category_code === "workflow" && WORKFLOW_TASK_DECISIONS.has(permissionLeaf(row.permission_code));
}

function normalizeDecision(value: string | undefined): PermissionDecision {
  if (
    value === "allow"
    || value === "deny"
    || value === "not_found"
    || value === "not_in_plan"
    || value === "addon_required"
    || value === "not_granted"
  ) {
    return value;
  }
  return "not_found";
}

function readActionGroup(record: Record<string, unknown>, key: string): ActionGroup | null {
  const value = readString(record, key);
  return value === "lifecycle" || value === "record" || value === "general" || value === "workflow_task"
    ? value
    : null;
}

function readIntent(record: Record<string, unknown>, key: string): ActionIntent | null {
  const value = readString(record, key);
  return value === "neutral" || value === "success" || value === "warning" || value === "danger"
    ? value
    : null;
}

function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readBoolean(record: Record<string, unknown>, key: string): boolean | undefined {
  const value = record[key];
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (["true", "t", "yes", "y", "1", "enabled", "on"].includes(normalized)) return true;
  if (["false", "f", "no", "n", "0", "disabled", "off"].includes(normalized)) return false;
  return undefined;
}

function permissionLeaf(permissionCode: string): string {
  return permissionCode.toLowerCase().split(/[.:_/-]+/).filter(Boolean).at(-1) ?? "";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}
