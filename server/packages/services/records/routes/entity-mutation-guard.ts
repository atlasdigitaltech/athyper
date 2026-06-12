import type { Response } from "express";
import type { Kysely } from "kysely";
import { checkPermission } from "@athyper/svc-iam";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

export type EntityMutationAction = "create" | "update" | "delete";

export interface EntityMutationTableInfo {
  entity_id: string;
  version_id: string;
  name: string;
  table_schema: string;
  table_name: string;
  backing_type: string;
  entity_class: string;
  mutability: string;
  feature_flags: Record<string, unknown>;
}

export interface EntityWriteFieldRule {
  name: string;
  column_name: string;
  origin: string | null;
  is_read_only: boolean;
  is_computed: boolean;
  is_write_once: boolean;
  editability: Record<string, unknown>;
}

interface MutationGuardLogger {
  error(event: string, fields?: Record<string, unknown>): void;
  warn?(event: string, fields?: Record<string, unknown>): void;
}

interface EntityPolicyRow {
  access_mode: string;
  company_scope_mode: string;
  audit_mode: string;
}

interface OperationRow {
  permission_code: string;
  is_enabled: boolean;
  tenant_id: string | null;
}

const SYSTEM_WRITE_COLUMNS = new Set([
  "id",
  "tenant_id",
  "created_at",
  "created_by",
  "updated_at",
  "updated_by",
  "deleted_at",
  "deleted_by",
  "is_active",
  "is_deleted",
  "row_version",
  "status_changed_at",
  "status_changed_by",
]);

const MUTATION_PERMISSION_TOKENS: Record<EntityMutationAction, string[]> = {
  create: ["create", "new", "insert", "add"],
  update: ["edit", "update", "write", "save", "patch"],
  delete: ["delete", "remove", "destroy"],
};

/**
 * Pure-decision outcome of an entity mutation authorization check.
 *
 * Phase 7 (#5): split from {@link authorizeEntityMutation} so callers that
 * need to *report* the decision without writing a response (e.g. the edit-
 * context endpoint surfacing `canUpdate`) can do so without mocking `res`.
 *
 * The existing res-writing wrapper {@link authorizeEntityMutation} is now
 * a thin shim around this function — all gate logic lives here.
 */
export type EntityMutationAuthorizeOutcome =
  | { allowed: true }
  | {
      allowed: false;
      status: number;
      error: string;
      message: string;
      decision?: string;
    };

export interface CheckEntityMutationAuthorizationArgs {
  db: AnyDb;
  table: EntityMutationTableInfo;
  entityCode: string;
  tenantId: string;
  principalId: string | null | undefined;
  action: EntityMutationAction;
  recordId?: string | null;
  logger?: MutationGuardLogger;
}

export async function checkEntityMutationAuthorization(
  args: CheckEntityMutationAuthorizationArgs,
): Promise<EntityMutationAuthorizeOutcome> {
  const { db, table, entityCode, tenantId, principalId, action, recordId, logger } = args;

  const tableBlock = mutationTableBlock(table, action);
  if (tableBlock) {
    return {
      allowed: false,
      status: tableBlock.status,
      error: tableBlock.error,
      message: tableBlock.message,
    };
  }

  if (!principalId || !isUuid(principalId)) {
    return {
      allowed: false,
      status: 403,
      error: "PRINCIPAL_NOT_FOUND",
      message: "No principal is bound to this session.",
    };
  }

  const policy = await resolveEntityPolicy(db, table, tenantId);
  if (!policy) {
    return {
      allowed: false,
      status: 403,
      error: "ENTITY_POLICY_REQUIRED",
      message: `Entity '${entityCode}' has no active tenant policy.`,
    };
  }

  if (policy.access_mode === "default_deny") {
    return {
      allowed: false,
      status: 403,
      error: "ENTITY_POLICY_DENIED",
      message: `Entity '${entityCode}' is denied by tenant policy.`,
    };
  }

  const operation = await resolveMutationOperation(db, entityCode, tenantId, action);
  if (!operation) {
    return {
      allowed: false,
      status: 403,
      error: "ENTITY_OPERATION_REQUIRED",
      message: `Entity '${entityCode}' does not expose a ${action} operation.`,
    };
  }

  if (!operation.is_enabled) {
    return {
      allowed: false,
      status: 403,
      error: "ENTITY_OPERATION_DISABLED",
      message: `Entity '${entityCode}' ${action} operation is disabled.`,
    };
  }

  const permissionLogger = logger?.warn
    ? { error: logger.error.bind(logger), warn: logger.warn.bind(logger) }
    : undefined;
  const permissionResult = await checkPermission(
    db,
    tenantId,
    principalId,
    operation.permission_code,
    {
      entity_type: entityCode,
      entity_id: recordId ?? undefined,
    },
    permissionLogger,
  );

  if (permissionResult.decision !== "allow") {
    return {
      allowed: false,
      status: 403,
      error: "PERMISSION_DENIED",
      message: `Permission '${operation.permission_code}' is required to ${action} '${entityCode}'.`,
      decision: permissionResult.decision,
    };
  }

  return { allowed: true };
}

/**
 * Authorize a mutation and, on denial, write the appropriate 4xx response.
 *
 * Thin wrapper around {@link checkEntityMutationAuthorization}. Existing
 * callers (PATCH/POST/DELETE handlers) are unchanged — same signature,
 * same behavior on failure (writes JSON to `res`).
 */
export async function authorizeEntityMutation(args: CheckEntityMutationAuthorizationArgs & {
  res: Response;
}): Promise<boolean> {
  const { res, ...rest } = args;
  const outcome = await checkEntityMutationAuthorization(rest);
  if (outcome.allowed) return true;

  res.status(outcome.status).json({
    error: outcome.error,
    message: outcome.message,
    ...(outcome.decision !== undefined ? { decision: outcome.decision } : {}),
  });
  return false;
}

export async function resolveEntityWriteFieldRules(
  db: AnyDb,
  entityCode: string,
): Promise<Map<string, EntityWriteFieldRule>> {
  const name = entityCode.replace(/-/g, "_");
  const rows = await db
    .selectFrom("control.entity_field as ef")
    .innerJoin("control.entity_version as ev", "ev.id" as never, "ef.entity_version_id" as never)
    .innerJoin("control.entity as e", "e.id" as never, "ev.entity_id" as never)
    .select([
      "ef.name",
      "ef.column_name",
      "ef.origin",
      "ef.is_read_only",
      "ef.is_computed",
      "ef.is_write_once",
      "ef.editability",
    ] as never[])
    .where("e.name" as never, "=" as never, name as never)
    .where("e.tenant_id" as never, "is", null)
    .where("ev.status" as never, "=", "EFFECTIVE" as never)
    .where("ef.is_active" as never, "=", true as never)
    .execute() as Array<{
      name: string;
      column_name: string;
      origin: string | null;
      is_read_only: boolean;
      is_computed: boolean;
      is_write_once: boolean;
      editability: unknown;
    }>;

  const rules = new Map<string, EntityWriteFieldRule>();
  for (const row of rows) {
    rules.set(row.name, {
      name: row.name,
      column_name: row.column_name,
      origin: row.origin,
      is_read_only: row.is_read_only,
      is_computed: row.is_computed,
      is_write_once: row.is_write_once,
      editability: asRecord(row.editability),
    });
  }
  return rules;
}

export type FieldNonWritableReason =
  | "FIELD_NOT_REGISTERED"
  | "FIELD_READ_ONLY"
  | "FIELD_COMPUTED"
  | "FIELD_WRITE_ONCE"
  | "FIELD_SYSTEM_MANAGED"
  | "FIELD_SYSTEM_ORIGIN"
  | "FIELD_NOT_EDITABLE"
  | "FIELD_LOCKED_BY_STATUS";

export type FieldWritabilityResult =
  | { writable: true }
  | { writable: false; reason: FieldNonWritableReason };

function deny(reason: FieldNonWritableReason): FieldWritabilityResult {
  return { writable: false, reason };
}

/**
 * Reads editable_in_status from editability JSON (with aliases).
 * Returns null when no status gate is configured.
 */
function readEditableInStatus(editability: Record<string, unknown>): string[] | null {
  const aliases = ["editable_in_status", "editableInStatus", "editable_in", "editableInStatuses"];
  for (const key of aliases) {
    const raw = editability[key];
    if (Array.isArray(raw)) {
      const out = raw.flatMap((x) => typeof x === "string" && x.trim() ? [x.trim()] : []);
      if (out.length > 0) return out;
    }
  }
  return null;
}

export function isEntityFieldWritable(
  rule: EntityWriteFieldRule | undefined,
  action: "create" | "update",
  recordStatus?: string | null,
): FieldWritabilityResult {
  if (!rule) return deny("FIELD_NOT_REGISTERED");
  if (rule.is_read_only) return deny("FIELD_READ_ONLY");
  if (rule.is_computed) return deny("FIELD_COMPUTED");
  if (rule.is_write_once && action === "update") return deny("FIELD_WRITE_ONCE");
  if (SYSTEM_WRITE_COLUMNS.has(storageColumnName(rule.column_name))) return deny("FIELD_SYSTEM_MANAGED");
  if (rule.origin === "system" && rule.name !== "status") return deny("FIELD_SYSTEM_ORIGIN");

  const editability = rule.editability;
  if (editability["editable"] === false) return deny("FIELD_NOT_EDITABLE");
  if (editability["readonly"] === true || editability["read_only"] === true) return deny("FIELD_READ_ONLY");
  if (editability["mode"] === "readonly" || editability["mode"] === "read_only") return deny("FIELD_READ_ONLY");
  if (Array.isArray(editability["editable_in"]) && editability["editable_in"].length === 0) return deny("FIELD_NOT_EDITABLE");

  // Status-driven lock. Only enforced on UPDATE — CREATE has no record status yet.
  if (action === "update") {
    const allowed = readEditableInStatus(editability);
    if (allowed && allowed.length > 0) {
      const current = (recordStatus ?? "").toLowerCase().trim();
      if (current && !allowed.map((s) => s.toLowerCase()).includes(current)) {
        return deny("FIELD_LOCKED_BY_STATUS");
      }
    }
  }

  return { writable: true };
}

function mutationTableBlock(
  table: EntityMutationTableInfo,
  action: EntityMutationAction,
): { status: number; error: string; message: string } | null {
  if (readBoolean(table.feature_flags, "records_api_disabled")
    || readBoolean(table.feature_flags, "generic_runtime_disabled")) {
    return {
      status: 404,
      error: "ENTITY_NOT_FOUND",
      message: `Entity '${table.name}' is not exposed through the generic records API.`,
    };
  }

  if (table.backing_type !== "table") {
    return {
      status: 403,
      error: "ENTITY_BACKING_READ_ONLY",
      message: `Entity '${table.name}' is backed by ${table.backing_type} and cannot be mutated by the generic records API.`,
    };
  }

  const mutability = table.mutability.toLowerCase();
  if (readBoolean(table.feature_flags, "is_readonly")
    || mutability === "immutable"
    || mutability === "locked") {
    return {
      status: 403,
      error: "ENTITY_READ_ONLY",
      message: `Entity '${table.name}' is read-only.`,
    };
  }

  if (action === "delete" && !hardDeleteEnabled(table.feature_flags)) {
    return {
      status: 403,
      error: "GENERIC_DELETE_DISABLED",
      message: `Entity '${table.name}' does not allow generic hard delete.`,
    };
  }

  return null;
}

async function resolveEntityPolicy(
  db: AnyDb,
  table: EntityMutationTableInfo,
  tenantId: string,
): Promise<EntityPolicyRow | null> {
  const rows = await db
    .selectFrom("control.entity_policy as ep")
    .select([
      "ep.access_mode",
      "ep.company_scope_mode",
      "ep.audit_mode",
      "ep.entity_version_id",
    ] as never[])
    .where("ep.tenant_id" as never, "=" as never, tenantId as never)
    .where("ep.entity_id" as never, "=" as never, table.entity_id as never)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .where((eb: any) => eb.or([
      eb("ep.entity_version_id" as never, "is", null),
      eb("ep.entity_version_id" as never, "=", table.version_id as never),
    ]))
    .execute() as Array<EntityPolicyRow & { entity_version_id: string | null }>;

  const exact = rows.find((row) => row.entity_version_id === table.version_id);
  return exact ?? rows.find((row) => row.entity_version_id === null) ?? null;
}

async function resolveMutationOperation(
  db: AnyDb,
  entityCode: string,
  tenantId: string,
  action: EntityMutationAction,
): Promise<OperationRow | null> {
  const rows = await db
    .selectFrom("control.entity_operation as eo")
    .innerJoin("shared.permission as p", "p.code" as never, "eo.permission_code" as never)
    .select([
      "eo.permission_code",
      "eo.is_enabled",
      "eo.tenant_id",
    ] as never[])
    .where("eo.entity_name" as never, "=" as never, entityCode as never)
    .where("p.status" as never, "=" as never, "active" as never)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .where((eb: any) => eb.or([
      eb("eo.tenant_id" as never, "is", null),
      eb("eo.tenant_id" as never, "=", tenantId as never),
    ]))
    .execute() as OperationRow[];

  const deduped = new Map<string, OperationRow>();
  for (const row of rows.sort((a, b) => (a.tenant_id === tenantId ? -1 : 0) - (b.tenant_id === tenantId ? -1 : 0))) {
    if (!deduped.has(row.permission_code)) deduped.set(row.permission_code, row);
  }

  const matches = [...deduped.values()].filter((row) => permissionMatchesAction(row.permission_code, action));
  return matches.find((row) => row.is_enabled) ?? matches[0] ?? null;
}

function permissionMatchesAction(permissionCode: string, action: EntityMutationAction): boolean {
  const normalized = permissionCode.toLowerCase().replace(/[^a-z0-9]+/g, "_");
  const tokens = new Set(normalized.split("_").filter(Boolean));
  return MUTATION_PERMISSION_TOKENS[action].some((token) => tokens.has(token));
}

function hardDeleteEnabled(featureFlags: Record<string, unknown>): boolean {
  return readBoolean(featureFlags, "generic_hard_delete_enabled")
    || readBoolean(featureFlags, "hard_delete_enabled")
    || readBoolean(featureFlags, "allow_hard_delete");
}

function storageColumnName(columnName: string): string {
  const dotIdx = columnName.indexOf(".");
  return dotIdx > 0 ? columnName.slice(0, dotIdx) : columnName;
}

function readBoolean(record: Record<string, unknown>, key: string): boolean {
  return record[key] === true;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
