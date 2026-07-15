import type { Response } from "express";
import type { Kysely } from "kysely";
import {
  checkPermission,
  readVerifiedRequestContext,
  type VerifiedRequestContext,
} from "@athyper/svc-iam";

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
  primary_key: string;
  tenant_column: string | null;
  read_capability: string;
  write_capability: string;
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
  /** Identity/scope fields are system-managed by the storage contract. */
  system_managed?: boolean;
  /** Present when the rule came from the compiler-owned capability snapshot. */
  compiled?: {
    createWritable: boolean;
    updateWritable: boolean;
    readOnly: boolean;
    computed: boolean;
    systemManaged: boolean;
    systemOrigin: boolean;
    writeOnce: boolean;
    statusLimited: boolean;
    editableInStatuses: string[];
  };
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
  /** Immutable request identity used as the scope for promise memoization. */
  authorizationContext?: VerifiedRequestContext;
}

const requestAuthorizationMemos = new WeakMap<
  VerifiedRequestContext,
  Map<string, Promise<EntityMutationAuthorizeOutcome>>
>();

export async function checkEntityMutationAuthorization(
  args: CheckEntityMutationAuthorizationArgs,
): Promise<EntityMutationAuthorizeOutcome> {
  const { authorizationContext } = args;
  if (authorizationContext) {
    let memo = requestAuthorizationMemos.get(authorizationContext);
    if (!memo) {
      memo = new Map();
      requestAuthorizationMemos.set(authorizationContext, memo);
    }
    const key = [
      authorizationContext.authEpoch,
      authorizationContext.profileHash,
      args.tenantId,
      args.principalId ?? "",
      args.table.entity_id,
      args.table.version_id,
      args.entityCode,
      args.action,
      args.recordId ?? "",
    ].join("\0");
    const existing = memo.get(key);
    if (existing) return existing;
    const pending = checkEntityMutationAuthorization({
      ...args,
      authorizationContext: undefined,
    });
    memo.set(key, pending);
    return pending;
  }

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
  const outcome = await checkEntityMutationAuthorization({
    ...rest,
    authorizationContext: rest.authorizationContext ?? readVerifiedRequestContext(res),
  });
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
  const compiledRules = await resolveCompiledEntityWriteFieldRules(db, name);
  if (compiledRules) return compiledRules;

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
      "e.primary_key",
      "e.tenant_column",
    ] as never[])
    .where("e.name" as never, "=" as never, name as never)
    .where("e.tenant_id" as never, "is", null)
    .where("e.runtime_enabled" as never, "=", true as never)
    .where("e.status" as never, "=", "ACTIVE" as never)
    .where("e.is_active" as never, "=", true as never)
    .where("e.read_capability" as never, "<>", "none" as never)
    .where("e.write_capability" as never, "<>", "none" as never)
    .where("ev.status" as never, "=", "EFFECTIVE" as never)
    .where("ef.is_active" as never, "=", true as never)
    .where("ef.runtime_enabled" as never, "=", true as never)
    .execute() as Array<{
      name: string;
      column_name: string;
      origin: string | null;
      is_read_only: boolean;
      is_computed: boolean;
      is_write_once: boolean;
      editability: unknown;
      primary_key: string | null;
      tenant_column: string | null;
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
      system_managed: row.column_name === row.primary_key
        || (row.tenant_column !== null && row.column_name === row.tenant_column),
    });
  }
  return rules;
}

async function resolveCompiledEntityWriteFieldRules(
  db: AnyDb,
  entityCode: string,
): Promise<Map<string, EntityWriteFieldRule> | null> {
  const row = await (db.selectFrom("snapshot.entity_compiled as ec" as never) as any)
    .innerJoin("control.entity_version as ev", "ev.id", "ec.entity_version_id")
    .innerJoin("control.entity as e", "e.id", "ev.entity_id")
    .select(["ec.compiled_json", "ev.id as effective_version_id"])
    .where((eb: any) => eb.or([
      eb("e.name", "=", entityCode),
      eb("e.entity_code", "=", entityCode),
      eb("e.slug", "=", entityCode),
    ]))
    .where("e.tenant_id", "is", null)
    .where("e.runtime_enabled", "=", true)
    .where("e.status", "=", "ACTIVE")
    .where("e.is_active", "=", true)
    .where("e.read_capability", "<>", "none")
    .where("e.write_capability", "<>", "none")
    .where("ev.status", "=", "EFFECTIVE")
    .where("ec.artifact_kind", "=", "execution")
    .executeTakeFirst() as { compiled_json?: unknown; effective_version_id?: string } | undefined;
  if (!row?.compiled_json) return null;

  let compiled: unknown = row.compiled_json;
  if (typeof compiled === "string") {
    try { compiled = JSON.parse(compiled) as unknown; } catch { return null; }
  }
  const root = asRecord(compiled);
  const capability = asRecord(root["capability_manifest"]);
  const write = asRecord(capability["write"]);
  if (write["entityVersionId"] !== row.effective_version_id || !Array.isArray(write["fields"])) return null;

  const rules = new Map<string, EntityWriteFieldRule>();
  for (const value of write["fields"]) {
    const decision = asRecord(value);
    const writable = asRecord(decision["writable"]);
    const fieldName = typeof decision["name"] === "string" ? decision["name"] : null;
    const columnName = typeof decision["columnName"] === "string" ? decision["columnName"] : null;
    if (!fieldName || !columnName) return null;
    const statuses = Array.isArray(decision["editableInStatuses"])
      ? decision["editableInStatuses"].filter((item): item is string => typeof item === "string")
      : [];
    const statusLimited = decision["statusLimited"] === true;
    rules.set(fieldName, {
      name: fieldName,
      column_name: columnName,
      origin: decision["systemOrigin"] === true ? "system" : null,
      is_read_only: decision["readOnly"] === true,
      is_computed: decision["computed"] === true,
      is_write_once: decision["writeOnce"] === true,
      editability: statusLimited ? { editable_in_status: statuses } : {},
      compiled: {
        createWritable: writable["create"] === true,
        updateWritable: writable["update"] === true,
        readOnly: decision["readOnly"] === true,
        computed: decision["computed"] === true,
        systemManaged: decision["systemManaged"] === true,
        systemOrigin: decision["systemOrigin"] === true,
        writeOnce: decision["writeOnce"] === true,
        statusLimited,
        editableInStatuses: statuses,
      },
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
  if (rule.compiled) {
    if (rule.compiled.readOnly) return deny("FIELD_READ_ONLY");
    if (rule.compiled.computed) return deny("FIELD_COMPUTED");
    if (rule.compiled.writeOnce && action === "update") return deny("FIELD_WRITE_ONCE");
    if (rule.compiled.systemManaged) return deny("FIELD_SYSTEM_MANAGED");
    if (rule.compiled.systemOrigin && rule.name !== "status") return deny("FIELD_SYSTEM_ORIGIN");
    if (action === "create" && !rule.compiled.createWritable) return deny("FIELD_NOT_EDITABLE");
    if (action === "update") {
      if (!rule.compiled.updateWritable) return deny("FIELD_NOT_EDITABLE");
      if (rule.compiled.statusLimited) {
        const current = (recordStatus ?? "").toLowerCase().trim();
        if (current && !rule.compiled.editableInStatuses.includes(current)) {
          return deny("FIELD_LOCKED_BY_STATUS");
        }
      }
    }
    return { writable: true };
  }
  if (rule.is_read_only) return deny("FIELD_READ_ONLY");
  if (rule.is_computed) return deny("FIELD_COMPUTED");
  if (rule.is_write_once && action === "update") return deny("FIELD_WRITE_ONCE");
  if (rule.system_managed) return deny("FIELD_SYSTEM_MANAGED");
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
  if (table.read_capability === "none") {
    return {
      status: 404,
      error: "ENTITY_NOT_FOUND",
      message: `Entity '${table.name}' is not readable through the records API.`,
    };
  }

  if (!table.primary_key.trim()) {
    return {
      status: 404,
      error: "ENTITY_NOT_FOUND",
      message: `Entity '${table.name}' has no runtime storage identity.`,
    };
  }

  if (table.write_capability === "none") {
    return {
      status: 405,
      error: "ENTITY_WRITE_DISABLED",
      message: `Entity '${table.name}' is compiled as read-only.`,
    };
  }

  if (table.write_capability === "append_only" && action !== "create") {
    return {
      status: 405,
      error: "ENTITY_APPEND_ONLY",
      message: `Entity '${table.name}' accepts append-only writes; '${action}' is not supported.`,
    };
  }

  if (table.backing_type !== "table") {
    // View / function-backed entities are mutable only when an explicit
    // write facade is declared in feature_flags. The facade owns the fan-out
    // to physical tables and the post-write read-back from the view.
    const facadeName = readStringFlag(table.feature_flags, "write_facade");
    if (!facadeName) {
      return {
        status: 403,
        error: "ENTITY_BACKING_READ_ONLY",
        message: `Entity '${table.name}' is backed by ${table.backing_type} and cannot be mutated by the generic records API.`,
      };
    }
    if (action === "delete") {
      return {
        status: 403,
        error: "ENTITY_WRITE_FACADE_UNSUPPORTED_ACTION",
        message: `Write facade '${facadeName}' for entity '${table.name}' does not implement '${action}'. Deletes and lifecycle transitions go through the action dispatcher.`,
      };
    }
    // create + facade declared: createHandler looks up the registry and dispatches.
    // update + facade declared: let generic UPDATE target the view; view-backed
    // documents own their fan-out with INSTEAD OF UPDATE triggers.
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
  const ranked = matches.sort((left, right) =>
    mutationPermissionRank(left.permission_code, action) - mutationPermissionRank(right.permission_code, action)
  );
  return ranked.find((row) => row.is_enabled) ?? ranked[0] ?? null;
}

function permissionMatchesAction(permissionCode: string, action: EntityMutationAction): boolean {
  const normalized = permissionCode.toLowerCase().replace(/[^a-z0-9]+/g, "_");
  const tokens = new Set(normalized.split("_").filter(Boolean));
  return MUTATION_PERMISSION_TOKENS[action].some((token) => tokens.has(token));
}

function mutationPermissionRank(permissionCode: string, action: EntityMutationAction): number {
  const normalized = permissionCode.toLowerCase().replace(/[^a-z0-9]+/g, "_");
  if (normalized === action) return 0;
  if (MUTATION_PERMISSION_TOKENS[action].includes(normalized)) return 1;
  return 10;
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

function readStringFlag(record: Record<string, unknown>, key: string): string | null {
  const v = record[key];
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
