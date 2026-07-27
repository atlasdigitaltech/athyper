/**
 * Metadata Admin Routes
 *
 * Operational-metadata CRUD endpoints consumed by the admin setup pages.
 * All writes require a principal (extracted from the Bearer token sub claim).
 * Tenant-scoped reads include both platform rows (tenant_id IS NULL) and
 * tenant-owned rows; writes always set tenant_id = current tenant.
 *
 * Routes registered:
 *
 *  Lookup domains (listing + CRUD on domain headers)
 *   GET    /metadata/admin/lookup-domains
 *   POST   /metadata/admin/lookup-domains
 *   PATCH  /metadata/admin/lookup-domains/:code
 *
 *  Entity lifecycle bindings
 *   GET    /metadata/admin/lifecycle-bindings
 *   POST   /metadata/admin/lifecycle-bindings
 *   PATCH  /metadata/admin/lifecycle-bindings/:id
 *   DELETE /metadata/admin/lifecycle-bindings/:id
 *
 *  Entity operations
 *   GET    /metadata/admin/entity-operations
 *   POST   /metadata/admin/entity-operations
 *   PATCH  /metadata/admin/entity-operations/:id
 *   DELETE /metadata/admin/entity-operations/:id
 *
 *  Field groups
 *   GET    /metadata/admin/field-groups
 *   POST   /metadata/admin/field-groups
 *   PATCH  /metadata/admin/field-groups/:key
 *   DELETE /metadata/admin/field-groups/:key
 *
 *  Entity policies (access / audit / scope / retention per entity)
 *   GET    /metadata/admin/entity-policies
 *   POST   /metadata/admin/entity-policies
 *   PATCH  /metadata/admin/entity-policies/:id
 *   DELETE /metadata/admin/entity-policies/:id
 *
 *  Lifecycles catalogue (read-only — for picker dropdowns)
 *   GET    /metadata/admin/lifecycles
 *
 *  Entities catalogue (read-only — for picker dropdowns)
 *   GET    /metadata/admin/entities
 *
 *  Legacy entity contract writes (retired; return 410)
 *   PATCH  /metadata/admin/entities/:id/contracts
 *   PATCH  /metadata/admin/entity-fields/:id/contracts
 *  Use the strict version-scoped Contract v2 Studio route instead.
 */

import type { RequestHandler, Router } from "express";
import type { Kysely } from "kysely";
import { sql } from "kysely";
import { extractOrgHeaders, resolveTenantId, verifyBearer } from "@athyper/svc-shared";
import {
  projectCompiledEntityResponse,
  readCompiledEntityContract,
  type CompiledEntityProjectionProvider,
} from "../src/compiled-entity-projection.js";

// ─── Deps ─────────────────────────────────────────────────────────────────────

export interface MetadataAdminRoutesDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>;
  auth: {
    verifyToken(token: string): Promise<Record<string, unknown>>;
  };
  logger?: {
    error(event: string, fields?: Record<string, unknown>): void;
    warn?(event: string, fields?: Record<string, unknown>): void;
  };
  /** Authoritative Phase B compiler projection for runtime entity reads. */
  compiledEntityProvider?: CompiledEntityProjectionProvider;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function tenantId(claims: Record<string, unknown>): string | null {
  const t = claims["tenant_id"];
  return typeof t === "string" && t ? t : null;
}

function principalId(claims: Record<string, unknown>): string | null {
  const s = claims["sub"] ?? claims["principal_id"];
  return typeof s === "string" && s ? s : null;
}

function notFound(res: { status: (c: number) => { json: (b: unknown) => void } }, msg: string) {
  res.status(404).json({ error: "NOT_FOUND", message: msg });
}

function badRequest(res: { status: (c: number) => { json: (b: unknown) => void } }, msg: string) {
  res.status(400).json({ error: "BAD_REQUEST", message: msg });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function operationMatches(permissionCode: string, action: "view" | "create" | "edit" | "delete"): boolean {
  const normalized = permissionCode.toLowerCase().replace(/[^a-z0-9]+/g, "_");
  const tokens = new Set(normalized.split("_").filter(Boolean));
  if (action === "view") return ["read", "view", "open", "list"].some((token) => tokens.has(token));
  if (action === "create") return ["create", "new", "insert", "add"].some((token) => tokens.has(token));
  if (action === "edit") return ["edit", "update", "write", "save", "patch"].some((token) => tokens.has(token));
  return ["delete", "remove", "destroy"].some((token) => tokens.has(token));
}

type AdminActionGroup = "lifecycle" | "record" | "general" | "workflow_task";
type AdminActionIntent = "neutral" | "success" | "warning" | "danger";
type AdminOperationSource = "entity_operation" | "lifecycle_transition" | "workflow_task";

interface AdminLifecycleTransitionInfo {
  transition_id: string;
  lifecycle_id: string;
  from_state: string;
  to_state: string;
  requires_reason?: boolean;
  requires_confirmation?: boolean;
}

interface AdminOperationPermissionInfo {
  label: string | null;
  description: string | null;
  risk_level: string | null;
  metadata: Record<string, unknown>;
  category_code: string | null;
}

const ADMIN_WORKFLOW_TASK_DECISIONS = new Set([
  "approve",
  "deny",
  "reject",
  "return",
  "request_info",
  "request_more_info",
  "more_info",
]);
const ADMIN_DANGER_LEAVES = new Set(["cancel", "delete", "delete_draft", "deny", "reject", "remove", "reverse", "void"]);
const ADMIN_SUCCESS_LEAVES = new Set(["activate", "post", "publish", "reopen", "restore", "submit"]);
const ADMIN_RECORD_CATEGORY_CODES = new Set(["entity", "utility", "bulk", "delegation"]);

function readAdminString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readAdminBoolean(record: Record<string, unknown>, key: string): boolean | undefined {
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
  const normalized = permissionCode.toLowerCase().replace(/[^a-z0-9]+/g, "_");
  return normalized.split("_").filter(Boolean).at(-1) ?? normalized;
}

function readAdminActionGroup(record: Record<string, unknown>, key: string): AdminActionGroup | null {
  const value = readAdminString(record, key);
  return value === "lifecycle" || value === "record" || value === "general" || value === "workflow_task"
    ? value
    : null;
}

function readAdminIntent(record: Record<string, unknown>, key: string): AdminActionIntent | null {
  const value = readAdminString(record, key);
  return value === "neutral" || value === "success" || value === "warning" || value === "danger"
    ? value
    : null;
}

function resolveAdminActionGroup(
  permissionCode: string,
  permissionCategoryCode: string | null,
  metadata: Record<string, unknown>,
  transitions: AdminLifecycleTransitionInfo[],
): AdminActionGroup {
  const explicit = readAdminActionGroup(metadata, "action_group") ?? readAdminActionGroup(metadata, "actionGroup");
  if (explicit) return explicit;
  if (transitions.length > 0) return "lifecycle";
  if (permissionCategoryCode && ADMIN_RECORD_CATEGORY_CODES.has(permissionCategoryCode)) return "record";
  if (permissionCategoryCode === "workflow" && ADMIN_WORKFLOW_TASK_DECISIONS.has(permissionLeaf(permissionCode))) return "workflow_task";
  return "general";
}

function resolveAdminIntent(permissionCode: string, riskLevel: string | null, metadata: Record<string, unknown>): AdminActionIntent {
  const explicit = readAdminIntent(metadata, "intent");
  if (explicit) return explicit;
  const leaf = permissionLeaf(permissionCode);
  if (ADMIN_DANGER_LEAVES.has(leaf) || riskLevel === "critical") return "danger";
  if (ADMIN_SUCCESS_LEAVES.has(leaf)) return "success";
  if (riskLevel === "high") return "warning";
  return "neutral";
}

function resolveAdminOperationSource(
  metadata: Record<string, unknown>,
  actionGroup: AdminActionGroup,
  transitions: AdminLifecycleTransitionInfo[],
): AdminOperationSource {
  const explicit = readAdminString(metadata, "source") ?? readAdminString(metadata, "operation_source");
  if (explicit === "entity_operation" || explicit === "lifecycle_transition" || explicit === "workflow_task") return explicit;
  if (transitions.length > 0) return "lifecycle_transition";
  if (actionGroup === "workflow_task") return "workflow_task";
  return "entity_operation";
}

async function loadAdminLifecycleTransitions(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>,
  entityNames: string[],
  tenantIdValue: string | null,
): Promise<Map<string, AdminLifecycleTransitionInfo[]>> {
  const uniqueEntityNames = [...new Set(entityNames.filter(Boolean))];
  if (uniqueEntityNames.length === 0) return new Map();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyDb = db as any;
  const rows = await anyDb
    .selectFrom("control.entity_lifecycle as el")
    .innerJoin("control.lifecycle_transition as lt", "lt.lifecycle_id", "el.lifecycle_id")
    .innerJoin("control.lifecycle_state as fs", "fs.id", "lt.from_state_id")
    .innerJoin("control.lifecycle_state as ts", "ts.id", "lt.to_state_id")
    .select([
      "el.entity_name as entity_name",
      "lt.id as transition_id",
      "lt.lifecycle_id",
      "lt.operation_code",
      "lt.config",
      "fs.code as from_state",
      "ts.code as to_state",
    ])
    .where("el.entity_name", "in", uniqueEntityNames)
    .where("lt.is_active", "=", true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .where((eb: any) => eb.or([
      eb("el.tenant_id", "is", null),
      ...(tenantIdValue ? [eb("el.tenant_id", "=", tenantIdValue)] : []),
    ]))
    .orderBy("el.priority", "asc")
    .execute() as Array<{
      entity_name: string;
      transition_id: string;
      lifecycle_id: string;
      operation_code: string;
      config: unknown;
      from_state: string;
      to_state: string;
    }>;

  const byOperation = new Map<string, AdminLifecycleTransitionInfo[]>();
  for (const row of rows) {
    const config = asRecord(row.config) ?? {};
    const item: AdminLifecycleTransitionInfo = {
      transition_id: row.transition_id,
      lifecycle_id: row.lifecycle_id,
      from_state: row.from_state,
      to_state: row.to_state,
      requires_reason: readAdminBoolean(config, "requires_reason")
        ?? readAdminBoolean(config, "require_reason")
        ?? readAdminBoolean(config, "require_comment"),
      requires_confirmation: readAdminBoolean(config, "requires_confirmation")
        ?? readAdminBoolean(config, "confirm"),
    };
    const key = `${row.entity_name}:${row.operation_code}`;
    const current = byOperation.get(key) ?? [];
    current.push(item);
    byOperation.set(key, current);
  }
  return byOperation;
}

async function loadAdminOperationPermissionInfo(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>,
  permissionCodes: string[],
): Promise<Map<string, AdminOperationPermissionInfo>> {
  const uniquePermissionCodes = [...new Set(permissionCodes.filter(Boolean))];
  if (uniquePermissionCodes.length === 0) return new Map();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyDb = db as any;
  const rows = await anyDb
    .selectFrom("shared.permission as p")
    .leftJoin("shared.permission_category as pc", "pc.id", "p.category_id")
    .select([
      "p.code as permission_code",
      "p.name as permission_label",
      "p.risk_level as permission_risk_level",
      "p.metadata as permission_metadata",
      "pc.code as permission_category_code",
    ])
    .where("p.code", "in", uniquePermissionCodes)
    .execute() as Array<{
      permission_code: string;
      permission_label: string | null;
      permission_risk_level: string | null;
      permission_metadata: unknown;
      permission_category_code: string | null;
    }>;

  const byPermission = new Map<string, AdminOperationPermissionInfo>();
  for (const row of rows) {
    const metadata = asRecord(row.permission_metadata) ?? {};
    byPermission.set(row.permission_code, {
      label: row.permission_label,
      description: readAdminString(metadata, "description") ?? readAdminString(metadata, "help_text"),
      risk_level: row.permission_risk_level,
      metadata,
      category_code: row.permission_category_code,
    });
  }
  return byPermission;
}

function emptyAdminOperationPermissionInfo(): AdminOperationPermissionInfo {
  return {
    label: null,
    description: null,
    risk_level: null,
    metadata: {},
    category_code: null,
  };
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createMetadataAdminRoutes(router: Router, deps: MetadataAdminRoutesDeps): Router {
  const { db, auth, logger, compiledEntityProvider } = deps;

  // ── Auth guard ─────────────────────────────────────────────────────────────
  async function guard(
    req: Parameters<RequestHandler>[0],
    res: Parameters<RequestHandler>[1],
  ): Promise<{ claims: Record<string, unknown>; tId: string; pId: string } | null> {
    const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
    if (!claims) return null;

    const tId = tenantId(claims);
    const pId = principalId(claims);
    if (!tId || !pId) {
      (res as unknown as { status: (c: number) => { json: (b: unknown) => void } })
        .status(400)
        .json({ error: "MISSING_TENANT_OR_PRINCIPAL" });
      return null;
    }
    return { claims, tId, pId };
  }

  // Platform-admin guard — used for routes that operate on platform-owned rows
  // (tenant_id IS NULL). Admin plane JWTs carry no tenant_id claim; only pId
  // is required here for the updated_by audit trail.
  async function guardPlatformAdmin(
    req: Parameters<RequestHandler>[0],
    res: Parameters<RequestHandler>[1],
  ): Promise<{ claims: Record<string, unknown>; pId: string } | null> {
    const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
    if (!claims) return null;

    const pId = principalId(claims);
    if (!pId) {
      (res as unknown as { status: (c: number) => { json: (b: unknown) => void } })
        .status(400)
        .json({ error: "MISSING_PRINCIPAL" });
      return null;
    }
    return { claims, pId };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LOOKUP DOMAINS
  // ═══════════════════════════════════════════════════════════════════════════

  // PATCH /metadata/admin/entities/:id/contracts
  const updateEntityContractsHandler: RequestHandler = async (req, res, next) => {
    try {
      const ctx = await guardPlatformAdmin(req, res);
      if (!ctx) return;

      res.status(410).json({
        error: "META_ENTITY_CONTRACT_V2_REQUIRED",
        message: "Legacy entity contract writes are retired. Edit the complete DRAFT graph at /metadata/studio/entity-versions/:id/contract-v2.",
      });
      return;

      // Admin plane is a platform editor — reject writes against tenant-owned entities.
    } catch (err) {
      logger?.error("meta_admin_update_entity_contracts", { err: String(err) });
      next(err);
    }
  };

  // PATCH /metadata/admin/entity-fields/:id/contracts
  const updateEntityFieldContractsHandler: RequestHandler = async (req, res, next) => {
    try {
      const ctx = await guardPlatformAdmin(req, res);
      if (!ctx) return;

      res.status(410).json({
        error: "META_ENTITY_CONTRACT_V2_REQUIRED",
        message: "Legacy field contract writes are retired. Edit the complete DRAFT graph at /metadata/studio/entity-versions/:id/contract-v2.",
      });
      return;

      // Admin plane only edits platform field definitions. Business/custom fields belong to tenants.
    } catch (err) {
      logger?.error("meta_admin_update_entity_field_contracts", { err: String(err) });
      next(err);
    }
  };

  // GET /metadata/admin/lookup-domains
  const listDomainsHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const q = typeof req.query["q"] === "string" ? req.query["q"].toLowerCase().trim() : "";

      // control.lookup_domain is platform-scoped (SCOPE=N) — no tenant_id column.
      // Count only platform (system) values so tenant extensions don't inflate the count.
      const rows = await db
        .selectFrom("control.lookup_domain as ld")
        .leftJoin("control.lookup_value as lv", (join) =>
          join.onRef("lv.domain_code", "=", "ld.code").on("lv.tenant_id", "is", null),
        )
        .select([
          "ld.id", "ld.code", "ld.name", "ld.description",
          "ld.source_schema", "ld.is_extensible", "ld.status",
          db.fn.count<number>("lv.id").as("value_count"),
        ])
        .groupBy(["ld.id", "ld.code", "ld.name", "ld.description", "ld.source_schema", "ld.is_extensible", "ld.status"])
        .orderBy("ld.code", "asc")
        .execute();

      const items = rows
        .filter((r) =>
          !q ||
          (r.code as string).toLowerCase().includes(q) ||
          (r.name as string).toLowerCase().includes(q)
        )
        .map((r) => ({
          id: r.id as string,
          code: r.code as string,
          name: r.name as string,
          description: (r.description ?? null) as string | null,
          source_schema: r.source_schema as string,
          is_extensible: Boolean(r.is_extensible),
          status: r.status as string,
          value_count: Number(r.value_count ?? 0),
        }));

      res.json({ items, total: items.length });
    } catch (err) {
      logger?.error("meta_admin_list_domains", { err: String(err) });
      next(err);
    }
  };

  // POST /metadata/admin/lookup-domains
  const createDomainHandler: RequestHandler = async (req, res, next) => {
    try {
      const ctx = await guard(req, res);
      if (!ctx) return;

      const { code, name, description, source_schema, is_extensible } = req.body as {
        code?: string; name?: string; description?: string;
        source_schema?: string; is_extensible?: boolean;
      };

      if (!code || !/^[a-z][a-z0-9_.]*$/.test(code))
        return badRequest(res as never, "code must match ^[a-z][a-z0-9_.]*$");
      if (!name?.trim())
        return badRequest(res as never, "name is required");

      const existing = await db
        .selectFrom("control.lookup_domain")
        .select("id")
        .where("code", "=", code)
        .executeTakeFirst();
      if (existing) {
        res.status(409).json({ error: "DUPLICATE_CODE", message: `Domain '${code}' already exists` });
        return;
      }

      const inserted = await db
        .insertInto("control.lookup_domain")
        .values({
          code,
          name: name.trim(),
          description: description?.trim() ?? null,
          source_schema: source_schema ?? "tenant",
          is_extensible: is_extensible ?? true,
          status: "active",
          created_by: ctx.pId,
        })
        .returningAll()
        .executeTakeFirst();

      res.status(201).json(inserted);
    } catch (err) {
      logger?.error("meta_admin_create_domain", { err: String(err) });
      next(err);
    }
  };

  // PATCH /metadata/admin/lookup-domains/:code
  const updateDomainHandler: RequestHandler = async (req, res, next) => {
    try {
      const ctx = await guard(req, res);
      if (!ctx) return;

      const code = req.params["code"] as string;
      const row = await db.selectFrom("control.lookup_domain").select("id").where("code", "=", code).executeTakeFirst();
      if (!row) return notFound(res as never, `Domain '${code}' not found`);

      const { name, description, is_extensible, status } = req.body as {
        name?: string; description?: string; is_extensible?: boolean; status?: string;
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updates: Record<string, any> = { updated_by: ctx.pId, updated_at: new Date() };
      if (name !== undefined) updates["name"] = name.trim();
      if (description !== undefined) updates["description"] = description.trim() || null;
      if (is_extensible !== undefined) updates["is_extensible"] = is_extensible;
      if (status !== undefined) updates["status"] = status;

      const updated = await db
        .updateTable("control.lookup_domain")
        .set(updates)
        .where("id", "=", row.id as string)
        .returningAll()
        .executeTakeFirst();

      res.json(updated);
    } catch (err) {
      logger?.error("meta_admin_update_domain", { err: String(err) });
      next(err);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // ENTITY LIFECYCLE BINDINGS
  // ═══════════════════════════════════════════════════════════════════════════

  // GET /metadata/admin/lifecycle-bindings
  const listLifecycleBindingsHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tId = tenantId(claims) ?? (xOrg ? await resolveTenantId(db, xOrg, xRealm) : null);
      const entityName = typeof req.query["entity"] === "string" ? req.query["entity"] : null;

      let query = db
        .selectFrom("control.entity_lifecycle as el")
        .leftJoin("control.lifecycle as l", "l.id", "el.lifecycle_id")
        .select([
          "el.id", "el.entity_name", "el.lifecycle_id",
          "el.conditions", "el.priority",
          "el.created_at", "el.updated_at",
          sql<string>`l.code`.as("lifecycle_code"),
          sql<string>`l.name`.as("lifecycle_name"),
          sql<string>`CASE WHEN l.is_active THEN 'active' ELSE 'inactive' END`.as("lifecycle_status"),
        ])
        .where((eb) => eb.or([
          eb("el.tenant_id", "is", null),
          ...(tId ? [eb("el.tenant_id", "=", tId)] : []),
        ]))
        .orderBy("el.entity_name", "asc")
        .orderBy("el.priority", "asc");

      if (entityName) {
        query = query.where("el.entity_name", "=", entityName) as typeof query;
      }

      const rows = await query.execute();

      res.json({
        items: rows.map((r) => ({
          id: r.id as string,
          entity_name: r.entity_name as string,
          lifecycle_id: r.lifecycle_id as string,
          lifecycle_code: (r.lifecycle_code ?? null) as string | null,
          lifecycle_name: (r.lifecycle_name ?? null) as string | null,
          lifecycle_status: (r.lifecycle_status ?? null) as string | null,
          conditions: r.conditions ?? null,
          priority: Number(r.priority ?? 100),
          created_at: r.created_at as string,
          updated_at: (r.updated_at ?? null) as string | null,
        })),
      });
    } catch (err) {
      logger?.error("meta_admin_list_lifecycle", { err: String(err) });
      next(err);
    }
  };

  // POST /metadata/admin/lifecycle-bindings
  const createLifecycleBindingHandler: RequestHandler = async (req, res, next) => {
    try {
      const ctx = await guard(req, res);
      if (!ctx) return;

      const { entity_name, lifecycle_id, conditions, priority } = req.body as {
        entity_name?: string; lifecycle_id?: string;
        conditions?: unknown; priority?: number;
      };

      if (!entity_name?.trim()) return badRequest(res as never, "entity_name is required");
      if (!lifecycle_id) return badRequest(res as never, "lifecycle_id is required");

      const inserted = await db
        .insertInto("control.entity_lifecycle")
        .values({
          entity_name: entity_name.trim(),
          lifecycle_id,
          conditions: conditions ?? null,
          priority: priority ?? 100,
          tenant_id: ctx.tId,
          created_by: ctx.pId,
        })
        .returningAll()
        .executeTakeFirst();

      res.status(201).json(inserted);
    } catch (err) {
      logger?.error("meta_admin_create_lifecycle", { err: String(err) });
      next(err);
    }
  };

  // PATCH /metadata/admin/lifecycle-bindings/:id
  const updateLifecycleBindingHandler: RequestHandler = async (req, res, next) => {
    try {
      const ctx = await guard(req, res);
      if (!ctx) return;

      const id = req.params["id"] as string;
      const row = await db.selectFrom("control.entity_lifecycle").select("id").where("id", "=", id).executeTakeFirst();
      if (!row) return notFound(res as never, `Lifecycle binding '${id}' not found`);

      const { conditions, priority } = req.body as { conditions?: unknown; priority?: number };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updates: Record<string, any> = { updated_by: ctx.pId, updated_at: new Date() };
      if (conditions !== undefined) updates["conditions"] = conditions;
      if (priority !== undefined) updates["priority"] = priority;

      const updated = await db
        .updateTable("control.entity_lifecycle")
        .set(updates)
        .where("id", "=", id)
        .returningAll()
        .executeTakeFirst();

      res.json(updated);
    } catch (err) {
      logger?.error("meta_admin_update_lifecycle", { err: String(err) });
      next(err);
    }
  };

  // DELETE /metadata/admin/lifecycle-bindings/:id
  const deleteLifecycleBindingHandler: RequestHandler = async (req, res, next) => {
    try {
      const ctx = await guard(req, res);
      if (!ctx) return;

      const id = req.params["id"] as string;
      await db.deleteFrom("control.entity_lifecycle").where("id", "=", id).execute();
      res.status(204).end();
    } catch (err) {
      logger?.error("meta_admin_delete_lifecycle", { err: String(err) });
      next(err);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // ENTITY OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  // GET /metadata/admin/entity-operations
  const listEntityOperationsHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const tId = tenantId(claims);
      const entityName = typeof req.query["entity"] === "string" ? req.query["entity"] : null;

      let query = db
        .selectFrom("control.entity_operation as eo")
        .select([
          "eo.id", "eo.entity_name", "eo.permission_code",
          "eo.surface", "eo.placement", "eo.handler_type", "eo.handler_target", "eo.execution_target",
          "eo.is_record_required", "eo.sort_order",
          "eo.label_override", "eo.icon_override", "eo.tcode_alias", "eo.is_enabled",
          "eo.created_at", "eo.updated_at",
        ])
        .where((eb) => eb.or([
          eb("eo.tenant_id", "is", null),
          ...(tId ? [eb("eo.tenant_id", "=", tId)] : []),
        ]))
        .orderBy("eo.entity_name", "asc")
        .orderBy("eo.sort_order", "asc");

      if (entityName) {
        query = query.where("eo.entity_name", "=", entityName) as typeof query;
      }

      const rows = await query.execute();
      let permissionInfoByCode = new Map<string, AdminOperationPermissionInfo>();
      try {
        permissionInfoByCode = await loadAdminOperationPermissionInfo(
          db,
          rows.map((row) => row.permission_code as string),
        );
      } catch (err) {
        logger?.warn?.("meta_admin_operation_permission_enrichment_failed", { err: String(err) });
      }

      let lifecycleTransitions = new Map<string, AdminLifecycleTransitionInfo[]>();
      try {
        lifecycleTransitions = await loadAdminLifecycleTransitions(
          db,
          rows.map((row) => row.entity_name as string),
          tId,
        );
      } catch (err) {
        logger?.warn?.("meta_admin_operation_lifecycle_enrichment_failed", { err: String(err) });
      }

      res.json({
        items: rows.map((r) => {
          const entity = r.entity_name as string;
          const permissionCode = r.permission_code as string;
          const permissionInfo = permissionInfoByCode.get(permissionCode) ?? emptyAdminOperationPermissionInfo();
          const metadata = permissionInfo.metadata;
          const transitions = lifecycleTransitions.get(`${entity}:${permissionCode}`) ?? [];
          const actionGroup = resolveAdminActionGroup(permissionCode, permissionInfo.category_code, metadata, transitions);
          const intent = resolveAdminIntent(permissionCode, permissionInfo.risk_level, metadata);
          const source = resolveAdminOperationSource(metadata, actionGroup, transitions);
          const requiresConfirmation = readAdminBoolean(metadata, "requires_confirmation")
            ?? readAdminBoolean(metadata, "requiresConfirmation")
            ?? intent === "danger";
          const requiresReason = readAdminBoolean(metadata, "requires_reason")
            ?? readAdminBoolean(metadata, "requiresReason")
            ?? transitions.some((transition) => transition.requires_reason);
          return {
            id: r.id as string,
            entity_name: entity,
            permission_code: permissionCode,
            permission_label: permissionInfo.label,
            permission_description: permissionInfo.description,
            surface: r.surface as string,
            placement: r.placement as string,
            handler_type: r.handler_type as string,
            handler_target: (r.handler_target ?? null) as string | null,
            execution_target: (r.execution_target ?? null) as string | null,
            is_record_required: Boolean(r.is_record_required),
            sort_order: Number(r.sort_order ?? 0),
            label_override: (r.label_override ?? null) as string | null,
            icon_override: (r.icon_override ?? null) as string | null,
            tcode_alias: (r.tcode_alias ?? null) as string | null,
            is_enabled: Boolean(r.is_enabled),
            disabled_reason: Boolean(r.is_enabled) ? null : "Operation disabled",
            action_group: actionGroup,
            intent,
            requires_confirmation: requiresConfirmation,
            requires_reason: requiresReason,
            source,
            permission_decision: null,
            lifecycle_transitions: transitions.length > 0 ? transitions : undefined,
            created_at: r.created_at as string,
            updated_at: (r.updated_at ?? null) as string | null,
          };
        }),
      });
    } catch (err) {
      logger?.error("meta_admin_list_operations", { err: String(err) });
      next(err);
    }
  };

  // POST /metadata/admin/entity-operations
  const createEntityOperationHandler: RequestHandler = async (req, res, next) => {
    try {
      const ctx = await guard(req, res);
      if (!ctx) return;

      const {
        entity_name, permission_code, surface, placement,
        handler_type, handler_target, execution_target, is_record_required,
        sort_order, label_override, icon_override, tcode_alias,
      } = req.body as {
        entity_name?: string; permission_code?: string;
        surface?: string; placement?: string;
        handler_type?: string; handler_target?: string; execution_target?: string | null;
        is_record_required?: boolean; sort_order?: number;
        label_override?: string; icon_override?: string; tcode_alias?: string;
      };

      if (!entity_name?.trim()) return badRequest(res as never, "entity_name is required");
      if (!permission_code?.trim()) return badRequest(res as never, "permission_code is required");
      if (execution_target != null
        && !/^[a-z][a-z0-9_]*:[a-z][a-z0-9_]*$/.test(execution_target)) {
        return badRequest(res as never, "execution_target must use namespace:command format");
      }

      const inserted = await db
        .insertInto("control.entity_operation")
        .values({
          entity_name: entity_name.trim(),
          permission_code: permission_code.trim(),
          surface: surface ?? "BOTH",
          placement: placement ?? "TOOLBAR",
          handler_type: handler_type ?? "API",
          handler_target: handler_target ?? null,
          execution_target: execution_target ?? null,
          is_record_required: is_record_required ?? false,
          sort_order: sort_order ?? 0,
          label_override: label_override ?? null,
          icon_override: icon_override ?? null,
          tcode_alias: tcode_alias ?? null,
          is_enabled: true,
          tenant_id: ctx.tId,
          created_by: ctx.pId,
        })
        .returningAll()
        .executeTakeFirst();

      res.status(201).json(inserted);
    } catch (err) {
      logger?.error("meta_admin_create_operation", { err: String(err) });
      next(err);
    }
  };

  // PATCH /metadata/admin/entity-operations/:id
  const updateEntityOperationHandler: RequestHandler = async (req, res, next) => {
    try {
      const ctx = await guard(req, res);
      if (!ctx) return;

      const id = req.params["id"] as string;
      const row = await db.selectFrom("control.entity_operation").select("id").where("id", "=", id).executeTakeFirst();
      if (!row) return notFound(res as never, `Operation '${id}' not found`);

      const { surface, placement, handler_type, handler_target, execution_target, is_record_required,
              sort_order, label_override, icon_override, tcode_alias, is_enabled } = req.body as Record<string, unknown>;

      if (execution_target != null
        && (typeof execution_target !== "string"
          || !/^[a-z][a-z0-9_]*:[a-z][a-z0-9_]*$/.test(execution_target))) {
        return badRequest(res as never, "execution_target must use namespace:command format");
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updates: Record<string, any> = { updated_by: ctx.pId, updated_at: new Date() };
      if (surface !== undefined) updates["surface"] = surface;
      if (placement !== undefined) updates["placement"] = placement;
      if (handler_type !== undefined) updates["handler_type"] = handler_type;
      if (handler_target !== undefined) updates["handler_target"] = handler_target;
      if (execution_target !== undefined) updates["execution_target"] = execution_target;
      if (is_record_required !== undefined) updates["is_record_required"] = is_record_required;
      if (sort_order !== undefined) updates["sort_order"] = sort_order;
      if (label_override !== undefined) updates["label_override"] = label_override;
      if (icon_override !== undefined) updates["icon_override"] = icon_override;
      if (tcode_alias !== undefined) updates["tcode_alias"] = tcode_alias;
      if (is_enabled !== undefined) updates["is_enabled"] = is_enabled;

      const updated = await db
        .updateTable("control.entity_operation")
        .set(updates)
        .where("id", "=", id)
        .returningAll()
        .executeTakeFirst();

      res.json(updated);
    } catch (err) {
      logger?.error("meta_admin_update_operation", { err: String(err) });
      next(err);
    }
  };

  // DELETE /metadata/admin/entity-operations/:id
  const deleteEntityOperationHandler: RequestHandler = async (req, res, next) => {
    try {
      const ctx = await guard(req, res);
      if (!ctx) return;

      const id = req.params["id"] as string;
      await db.deleteFrom("control.entity_operation").where("id", "=", id).execute();
      res.status(204).end();
    } catch (err) {
      logger?.error("meta_admin_delete_operation", { err: String(err) });
      next(err);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // FIELD GROUPS
  // ═══════════════════════════════════════════════════════════════════════════

  // GET /metadata/admin/field-groups
  const listFieldGroupsHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const rows = await db
        .selectFrom("control.field_group as fg")
        .leftJoin("control.field_group_member as fgm", "fgm.group_key", "fg.group_key")
        .select([
          "fg.group_key", "fg.label", "fg.description",
          "fg.applies_to_classes", "fg.sort_order",
          db.fn.count<number>("fgm.id").as("member_count"),
        ])
        .groupBy(["fg.group_key", "fg.label", "fg.description", "fg.applies_to_classes", "fg.sort_order"])
        .orderBy("fg.sort_order", "asc")
        .orderBy("fg.group_key", "asc")
        .execute();

      res.json({
        items: rows.map((r) => ({
          group_key: r.group_key as string,
          label: r.label as string,
          description: (r.description ?? null) as string | null,
          applies_to_classes: (r.applies_to_classes ?? []) as string[],
          sort_order: Number(r.sort_order ?? 0),
          member_count: Number(r.member_count ?? 0),
        })),
      });
    } catch (err) {
      logger?.error("meta_admin_list_field_groups", { err: String(err) });
      next(err);
    }
  };

  // POST /metadata/admin/field-groups
  const createFieldGroupHandler: RequestHandler = async (req, res, next) => {
    try {
      const ctx = await guard(req, res);
      if (!ctx) return;

      const { group_key, label, description, applies_to_classes, sort_order } = req.body as {
        group_key?: string; label?: string; description?: string;
        applies_to_classes?: string[]; sort_order?: number;
      };

      if (!group_key || !/^[a-z][a-z0-9_]*$/.test(group_key))
        return badRequest(res as never, "group_key must match ^[a-z][a-z0-9_]*$");
      if (!label?.trim())
        return badRequest(res as never, "label is required");

      const existing = await db
        .selectFrom("control.field_group")
        .select("group_key")
        .where("group_key", "=", group_key)
        .executeTakeFirst();
      if (existing) {
        res.status(409).json({ error: "DUPLICATE_KEY", message: `Field group '${group_key}' already exists` });
        return;
      }

      const inserted = await db
        .insertInto("control.field_group")
        .values({
          group_key,
          label: label.trim(),
          description: description?.trim() ?? null,
          applies_to_classes: applies_to_classes ?? [],
          sort_order: sort_order ?? 0,
        })
        .returningAll()
        .executeTakeFirst();

      res.status(201).json(inserted);
    } catch (err) {
      logger?.error("meta_admin_create_field_group", { err: String(err) });
      next(err);
    }
  };

  // PATCH /metadata/admin/field-groups/:key
  const updateFieldGroupHandler: RequestHandler = async (req, res, next) => {
    try {
      const ctx = await guard(req, res);
      if (!ctx) return;

      const key = req.params["key"] as string;
      const row = await db.selectFrom("control.field_group").select("group_key").where("group_key", "=", key).executeTakeFirst();
      if (!row) return notFound(res as never, `Field group '${key}' not found`);

      const { label, description, applies_to_classes, sort_order } = req.body as {
        label?: string; description?: string; applies_to_classes?: string[]; sort_order?: number;
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updates: Record<string, any> = {};
      if (label !== undefined) updates["label"] = label.trim();
      if (description !== undefined) updates["description"] = description.trim() || null;
      if (applies_to_classes !== undefined) updates["applies_to_classes"] = applies_to_classes;
      if (sort_order !== undefined) updates["sort_order"] = sort_order;

      const updated = await db
        .updateTable("control.field_group")
        .set(updates)
        .where("group_key", "=", key)
        .returningAll()
        .executeTakeFirst();

      res.json(updated);
    } catch (err) {
      logger?.error("meta_admin_update_field_group", { err: String(err) });
      next(err);
    }
  };

  // DELETE /metadata/admin/field-groups/:key
  const deleteFieldGroupHandler: RequestHandler = async (req, res, next) => {
    try {
      const ctx = await guard(req, res);
      if (!ctx) return;

      const key = req.params["key"] as string;

      // Guard: refuse if members exist
      const memberCount = await db
        .selectFrom("control.field_group_member")
        .select(db.fn.count<number>("id").as("cnt"))
        .where("group_key", "=", key)
        .executeTakeFirst();

      if (Number(memberCount?.cnt ?? 0) > 0) {
        res.status(409).json({
          error: "HAS_MEMBERS",
          message: `Field group '${key}' has ${memberCount?.cnt} member(s). Remove them first.`,
        });
        return;
      }

      await db.deleteFrom("control.field_group").where("group_key", "=", key).execute();
      res.status(204).end();
    } catch (err) {
      logger?.error("meta_admin_delete_field_group", { err: String(err) });
      next(err);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // READ-ONLY CATALOGUES (for picker dropdowns)
  // ═══════════════════════════════════════════════════════════════════════════

  // GET /metadata/admin/lifecycles  — list control.lifecycle for picker
  const listLifecyclesHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const rows = await db
        .selectFrom("control.lifecycle as l")
        .select([
          "l.id",
          "l.code",
          "l.name",
          "l.description",
          sql<string>`CASE WHEN l.is_active THEN 'active' ELSE 'inactive' END`.as("status"),
        ])
        .where("l.is_active", "=", true)
        .orderBy("l.name", "asc")
        .execute();

      res.json({ items: rows });
    } catch (err) {
      logger?.error("meta_admin_list_lifecycles", { err: String(err) });
      next(err);
    }
  };

  // GET /metadata/admin/entities — enriched entity browser list (platform rows only)
  const listEntitiesHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const q = typeof req.query["q"] === "string" ? req.query["q"].toLowerCase().trim() : "";
      const moduleFilter = typeof req.query["module"] === "string" ? req.query["module"].trim() : null;
      const classFilter = typeof req.query["entity_class"] === "string" ? req.query["entity_class"].trim() : null;

      // Fields are version-bound. Join through the EFFECTIVE version to count them.
      let query = db
        .selectFrom("control.entity as e")
        .leftJoin("shared.module as m", (join) =>
          join.on(sql<boolean>`m.id::text = e.module_id OR m.code = e.module_id`),
        )
        .leftJoin("shared.workspace as w", "w.id", "m.workspace_id")
        .leftJoin(
          db
            .selectFrom("control.entity_version as ev")
            .select(["ev.entity_id", "ev.id as version_id"])
            .where("ev.status", "=", "EFFECTIVE")
            .as("eff_ver"),
          (join) => join.onRef("eff_ver.entity_id", "=", "e.id"),
        )
        .leftJoin("control.entity_field as ef", (join) =>
          join.onRef("ef.entity_version_id", "=", "eff_ver.version_id"),
        )
        .select([
          "e.id", "e.name", "e.entity_code", "e.entity_short",
          "e.label_singular", "e.label_plural",
          "e.entity_class", "e.module_id", "e.kind", "e.ownership_model",
          "e.table_schema", "e.table_name", "e.backing_type",
          "e.runtime_enabled", "e.primary_key", "e.tenant_column",
          "e.read_capability", "e.write_capability",
          "e.icon_key", "e.color_token", "e.status",
          "m.code as module_code", "m.name as module_name",
          "w.id as workspace_id", "w.code as workspace_code",
          "w.name as workspace_name", "w.sort_order as workspace_sort_order",
          db.fn.count<number>("ef.id").as("field_count"),
        ])
        .where("e.tenant_id", "is", null)
        .groupBy([
          "e.id", "e.name", "e.entity_code", "e.entity_short",
          "e.label_singular", "e.label_plural",
          "e.entity_class", "e.module_id", "e.kind", "e.ownership_model",
          "e.table_schema", "e.table_name", "e.backing_type",
          "e.runtime_enabled", "e.primary_key", "e.tenant_column",
          "e.read_capability", "e.write_capability",
          "e.icon_key", "e.color_token", "e.status",
          "m.code", "m.name",
          "w.id", "w.code", "w.name", "w.sort_order",
        ])
        .orderBy("w.sort_order", "asc")
        .orderBy("w.code", "asc")
        .orderBy("e.module_id", "asc")
        .orderBy("e.name", "asc");

      if (moduleFilter) query = query.where("e.module_id", "=", moduleFilter) as typeof query;
      if (classFilter)  query = query.where("e.entity_class", "=", classFilter) as typeof query;

      const rows = await query.execute();
      const tId = tenantId(claims);
      const entityNames = rows
        .map((r) => String((r.entity_code ?? r.name) as string))
        .filter(Boolean);

      const operationRows = entityNames.length > 0
        ? await db
          .selectFrom("control.entity_operation as eo")
          .select(["eo.entity_name", "eo.permission_code", "eo.is_enabled"] as never[])
          .where("eo.tenant_id", "is", null)
          .where("eo.entity_name", "in", entityNames)
          .execute() as Array<{ entity_name: string; permission_code: string; is_enabled: boolean }>
        : [];

      const operationsByEntity = new Map<string, Array<{ permission_code: string; is_enabled: boolean }>>();
      for (const operation of operationRows) {
        const list = operationsByEntity.get(operation.entity_name) ?? [];
        list.push({ permission_code: operation.permission_code, is_enabled: operation.is_enabled });
        operationsByEntity.set(operation.entity_name, list);
      }

      const policyRows = tId && rows.length > 0
        ? await db
          .selectFrom("control.entity_policy as ep")
          .select(["ep.entity_id", "ep.access_mode", "ep.audit_mode", "ep.company_scope_mode"] as never[])
          .where("ep.tenant_id", "=", tId)
          .where("ep.entity_id", "in", rows.map((r) => r.id as string))
          .execute() as Array<{ entity_id: string; access_mode: string; audit_mode: string; company_scope_mode: string }>
        : [];

      const policyByEntityId = new Map(policyRows.map((policy) => [policy.entity_id, policy]));

      const items = rows
        .filter((r) => {
          if (!q) return true;
          const name = (r.name as string).toLowerCase();
          const code = ((r.entity_code ?? "") as string).toLowerCase();
          const label = ((r.label_singular ?? "") as string).toLowerCase();
          return name.includes(q) || code.includes(q) || label.includes(q);
        })
        .map((r) => ({
          id: r.id as string,
          name: r.name as string,
          entity_code: (r.entity_code ?? null) as string | null,
          entity_short: (r.entity_short ?? null) as string | null,
          label_singular: (r.label_singular ?? null) as string | null,
          label_plural: (r.label_plural ?? null) as string | null,
          entity_class: r.entity_class as string,
          module_id: r.module_id as string,
          module_code: (r.module_code ?? null) as string | null,
          module_name: (r.module_name ?? null) as string | null,
          workspace_id: (r.workspace_id ?? null) as string | null,
          workspace_code: (r.workspace_code ?? null) as string | null,
          workspace_name: (r.workspace_name ?? null) as string | null,
          workspace_sort_order: Number(r.workspace_sort_order ?? 9999),
          kind: (r.kind ?? null) as string | null,
          ownership_model: (r.ownership_model ?? null) as string | null,
          table_schema: (r.table_schema ?? null) as string | null,
          table_name: (r.table_name ?? null) as string | null,
          backing_type: (r.backing_type ?? null) as string | null,
          icon_key: (r.icon_key ?? null) as string | null,
          color_token: (r.color_token ?? null) as string | null,
          status: r.status as string,
          field_count: Number(r.field_count ?? 0),
          operation_count: operationsByEntity.get((r.entity_code ?? r.name) as string)?.length ?? 0,
          can_view: (operationsByEntity.get((r.entity_code ?? r.name) as string) ?? []).some((op) => op.is_enabled && operationMatches(op.permission_code, "view")),
          can_create: (operationsByEntity.get((r.entity_code ?? r.name) as string) ?? []).some((op) => op.is_enabled && operationMatches(op.permission_code, "create")),
          can_edit: (operationsByEntity.get((r.entity_code ?? r.name) as string) ?? []).some((op) => op.is_enabled && operationMatches(op.permission_code, "edit")),
          can_delete: (operationsByEntity.get((r.entity_code ?? r.name) as string) ?? []).some((op) => op.is_enabled && operationMatches(op.permission_code, "delete")),
          runtime_enabled: Boolean(r.runtime_enabled),
          primary_key: (r.primary_key ?? null) as string | null,
          tenant_column: (r.tenant_column ?? null) as string | null,
          read_capability: String(r.read_capability ?? "none"),
          write_capability: String(r.write_capability ?? "none"),
          policy_access_mode: policyByEntityId.get(r.id as string)?.access_mode ?? null,
          policy_audit_mode: policyByEntityId.get(r.id as string)?.audit_mode ?? null,
          policy_company_scope_mode: policyByEntityId.get(r.id as string)?.company_scope_mode ?? null,
          has_policy: policyByEntityId.has(r.id as string),
        }));

      res.json({ items, total: items.length });
    } catch (err) {
      logger?.error("meta_admin_list_entities", { err: String(err) });
      next(err);
    }
  };

  // GET /metadata/admin/entities/:id — single entity with canonical fields
  const getEntityDetailHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const id = req.params["id"] as string;

      const entity = await db
        .selectFrom("control.entity as e")
        .selectAll("e")
        .where("e.id", "=", id)
        .where("e.tenant_id", "is", null)
        .executeTakeFirst() as Record<string, unknown> | undefined;

      if (!entity) return notFound(res as never, `Entity '${id}' not found`);

      const code = typeof entity["entity_code"] === "string"
        ? entity["entity_code"]
        : typeof entity["name"] === "string" ? entity["name"] : null;
      const tId = tenantId(claims);
      if (compiledEntityProvider && code && tId) {
        const compiled = await compiledEntityProvider.loadRuntimeCompiledEntity(code, tId);
        if (compiled) {
          const contract = readCompiledEntityContract(compiled);
          if (contract.catalog.id === id) {
            res.json({
              ...entity,
              ...projectCompiledEntityResponse(compiled),
              version_id: contract.version_contract.entity_version_id,
              version_status: "EFFECTIVE",
              fields: compiled.fields,
            });
            return;
          }
        }
      }

      // Fields live on the EFFECTIVE entity version. Canonical fields
      // (entity_version_id IS NULL in entity_field) are the global dictionary
      // and are not entity-specific — we want the version-bound fields instead.
      const effectiveVersion = await db
        .selectFrom("control.entity_version as ev")
        .select(["ev.id", "ev.status"])
        .where("ev.entity_id", "=", id)
        .where("ev.status", "=", "EFFECTIVE")
        .orderBy("ev.version_no", "desc")
        .executeTakeFirst() as { id: string; status: string } | undefined;

      const fields = effectiveVersion
        ? await db
            .selectFrom("control.entity_field as ef")
            .select([
              "ef.id", "ef.name", "ef.column_name", "ef.label",
              "ef.data_type", "ef.cardinality", "ef.origin", "ef.is_required",
              "ef.is_unique", "ef.is_filterable", "ef.is_sortable", "ef.is_groupable", "ef.is_aggregatable",
              "ef.semantic_roles", "ef.type_config", "ef.defaults",
              "ef.default_value", "ef.sort_order",
            ])
            .where("ef.entity_version_id", "=", effectiveVersion.id)
            .orderBy("ef.sort_order", "asc")
            .orderBy("ef.name", "asc")
            .execute()
        : [];

      res.json({ ...entity, version_id: effectiveVersion?.id ?? null, version_status: effectiveVersion?.status ?? null, fields });
    } catch (err) {
      logger?.error("meta_admin_get_entity_detail", { err: String(err) });
      next(err);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // ENTITY POLICIES
  // ═══════════════════════════════════════════════════════════════════════════

  // GET /metadata/admin/entity-policies
  const listEntityPoliciesHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const tId = tenantId(claims);
      const entityId = typeof req.query["entity_id"] === "string" ? req.query["entity_id"] : null;

      let query = db
        .selectFrom("control.entity_policy as ep")
        .leftJoin("control.entity as e", "e.id", "ep.entity_id")
        .select([
          "ep.id", "ep.entity_id", "ep.entity_version_id",
          "ep.access_mode", "ep.company_scope_mode", "ep.audit_mode",
          "ep.retention_policy", "ep.default_filters", "ep.cache_flags",
          "ep.created_at", "ep.updated_at",
          sql<string>`e.name`.as("entity_name"),
          sql<string>`e.label_singular`.as("entity_label"),
          sql<string>`e.entity_class`.as("entity_class"),
        ])
        .where("ep.tenant_id", "=", tId ?? "")
        .orderBy(sql`e.name`, "asc");

      if (entityId) {
        query = query.where("ep.entity_id", "=", entityId) as typeof query;
      }

      const rows = await query.execute();

      res.json({
        items: rows.map((r) => ({
          id: r.id as string,
          entity_id: r.entity_id as string,
          entity_name: (r.entity_name ?? null) as string | null,
          entity_label: (r.entity_label ?? null) as string | null,
          entity_class: (r.entity_class ?? null) as string | null,
          entity_version_id: (r.entity_version_id ?? null) as string | null,
          access_mode: r.access_mode as string,
          company_scope_mode: r.company_scope_mode as string,
          audit_mode: r.audit_mode as string,
          retention_policy: (r.retention_policy ?? {}) as Record<string, unknown>,
          default_filters: (r.default_filters ?? {}) as Record<string, unknown>,
          cache_flags: (r.cache_flags ?? {}) as Record<string, unknown>,
          created_at: r.created_at as string,
          updated_at: (r.updated_at ?? null) as string | null,
        })),
      });
    } catch (err) {
      logger?.error("meta_admin_list_entity_policies", { err: String(err) });
      next(err);
    }
  };

  // POST /metadata/admin/entity-policies
  const createEntityPolicyHandler: RequestHandler = async (req, res, next) => {
    try {
      const ctx = await guard(req, res);
      if (!ctx) return;

      const {
        entity_id, entity_version_id,
        access_mode, company_scope_mode, audit_mode,
        retention_policy, default_filters, cache_flags,
      } = req.body as {
        entity_id?: string;
        entity_version_id?: string;
        access_mode?: string;
        company_scope_mode?: string;
        audit_mode?: string;
        retention_policy?: Record<string, unknown>;
        default_filters?: Record<string, unknown>;
        cache_flags?: Record<string, unknown>;
      };

      if (!entity_id) return badRequest(res as never, "entity_id is required");

      const entity = await db
        .selectFrom("control.entity")
        .select("id")
        .where("id", "=", entity_id)
        .executeTakeFirst();
      if (!entity) return badRequest(res as never, `Entity '${entity_id}' not found`);

      const existing = await db
        .selectFrom("control.entity_policy")
        .select("id")
        .where("entity_id", "=", entity_id)
        .where("tenant_id", "=", ctx.tId)
        .$if(!entity_version_id, (qb) => qb.where("entity_version_id", "is", null))
        .$if(!!entity_version_id, (qb) => qb.where("entity_version_id", "=", entity_version_id!))
        .executeTakeFirst();
      if (existing) {
        res.status(409).json({
          error: "DUPLICATE_POLICY",
          message: "A policy for this entity (+ version) already exists. Use PATCH to update it.",
        });
        return;
      }

      const inserted = await db
        .insertInto("control.entity_policy")
        .values({
          tenant_id: ctx.tId,
          entity_id,
          entity_version_id: entity_version_id ?? null,
          access_mode: access_mode ?? "default_deny",
          company_scope_mode: company_scope_mode ?? "none",
          audit_mode: audit_mode ?? "enabled",
          retention_policy: retention_policy ?? {},
          default_filters: default_filters ?? {},
          cache_flags: cache_flags ?? {},
          created_by: ctx.pId,
        })
        .returningAll()
        .executeTakeFirst();

      res.status(201).json(inserted);
    } catch (err) {
      logger?.error("meta_admin_create_entity_policy", { err: String(err) });
      next(err);
    }
  };

  // PATCH /metadata/admin/entity-policies/:id
  const updateEntityPolicyHandler: RequestHandler = async (req, res, next) => {
    try {
      const ctx = await guard(req, res);
      if (!ctx) return;

      const id = req.params["id"] as string;
      const row = await db
        .selectFrom("control.entity_policy")
        .select("id")
        .where("id", "=", id)
        .where("tenant_id", "=", ctx.tId)
        .executeTakeFirst();
      if (!row) return notFound(res as never, `Entity policy '${id}' not found`);

      const {
        access_mode, company_scope_mode, audit_mode,
        retention_policy, default_filters, cache_flags,
      } = req.body as Record<string, unknown>;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updates: Record<string, any> = { updated_by: ctx.pId, updated_at: new Date() };
      if (access_mode !== undefined) updates["access_mode"] = access_mode;
      if (company_scope_mode !== undefined) updates["company_scope_mode"] = company_scope_mode;
      if (audit_mode !== undefined) updates["audit_mode"] = audit_mode;
      if (retention_policy !== undefined) updates["retention_policy"] = retention_policy;
      if (default_filters !== undefined) updates["default_filters"] = default_filters;
      if (cache_flags !== undefined) updates["cache_flags"] = cache_flags;

      const updated = await db
        .updateTable("control.entity_policy")
        .set(updates)
        .where("id", "=", id)
        .returningAll()
        .executeTakeFirst();

      res.json(updated);
    } catch (err) {
      logger?.error("meta_admin_update_entity_policy", { err: String(err) });
      next(err);
    }
  };

  // DELETE /metadata/admin/entity-policies/:id
  const deleteEntityPolicyHandler: RequestHandler = async (req, res, next) => {
    try {
      const ctx = await guard(req, res);
      if (!ctx) return;

      const id = req.params["id"] as string;
      await db
        .deleteFrom("control.entity_policy")
        .where("id", "=", id)
        .where("tenant_id", "=", ctx.tId)
        .execute();
      res.status(204).end();
    } catch (err) {
      logger?.error("meta_admin_delete_entity_policy", { err: String(err) });
      next(err);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // SCHEMA ERD
  // ═══════════════════════════════════════════════════════════════════════════

  // GET /metadata/admin/erd?module=<module_id>
  // Returns entity nodes + relation edges for the ERD viewer.
  // Relations are resolved through the entity's published (EFFECTIVE) version.
  const getErdHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const tId = tenantId(claims);
      const moduleFilter =
        typeof req.query["module"] === "string" ? req.query["module"].trim() || null : null;

      // 1. Entity nodes
      let entityQ = db
        .selectFrom("control.entity as e")
        .select(["e.id", "e.name", "e.label_singular", "e.entity_class", "e.module_id"])
        .where((eb) =>
          eb.or([
            eb("e.tenant_id", "is", null),
            ...(tId ? [eb("e.tenant_id", "=", tId)] : []),
          ]),
        )
        .orderBy("e.module_id", "asc")
        .orderBy("e.name", "asc");

      if (moduleFilter) {
        entityQ = entityQ.where("e.module_id", "=", moduleFilter) as typeof entityQ;
      }

      const entityRows = await entityQ.execute();

      // 2. Relation edges — joined through the effective entity version
      const relationRows = await db
        .selectFrom("control.entity_relation as er")
        .innerJoin("control.entity_version as ev", "ev.id", "er.entity_version_id")
        .innerJoin("control.entity as e", "e.id", "ev.entity_id")
        .select([
          "er.id",
          sql<string>`er.name`.as("relation_name"),
          "er.relation_kind",
          "er.target_entity",
          "er.fk_field",
          sql<string>`e.name`.as("from_entity"),
        ])
        .where("ev.status", "=", "EFFECTIVE")
        .where((eb) =>
          eb.or([
            eb("er.tenant_id", "is", null),
            ...(tId ? [eb("er.tenant_id", "=", tId)] : []),
          ]),
        )
        .execute();

      // 3. Distinct module list for filter dropdown
      const moduleRows = await db
        .selectFrom("control.entity as e")
        .select("e.module_id")
        .where((eb) =>
          eb.or([
            eb("e.tenant_id", "is", null),
            ...(tId ? [eb("e.tenant_id", "=", tId)] : []),
          ]),
        )
        .groupBy("e.module_id")
        .orderBy("e.module_id", "asc")
        .execute();

      res.json({
        nodes: entityRows.map((r) => ({
          id: r.id as string,
          name: r.name as string,
          label: (r.label_singular ?? null) as string | null,
          entity_class: r.entity_class as string,
          module_id: r.module_id as string,
        })),
        edges: relationRows.map((r) => ({
          id: r.id as string,
          from_entity: r.from_entity as string,
          to_entity: r.target_entity as string,
          relation_name: r.relation_name as string,
          relation_kind: r.relation_kind as string,
          fk_field: (r.fk_field ?? null) as string | null,
        })),
        modules: moduleRows.map((r) => r.module_id as string),
      });
    } catch (err) {
      logger?.error("meta_admin_erd", { err: String(err) });
      next(err);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // LOOKUP VALUES  (platform values only — is_system=true, tenant_id IS NULL)
  // ═══════════════════════════════════════════════════════════════════════════

  // GET /metadata/admin/lookup-domains/:code/values
  const listDomainValuesHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const code = req.params["code"] as string;
      const q = typeof req.query["q"] === "string" ? req.query["q"].toLowerCase().trim() : "";

      const domain = await db
        .selectFrom("control.lookup_domain")
        .select("code")
        .where("code", "=", code)
        .executeTakeFirst();
      if (!domain) return notFound(res as never, `Lookup domain '${code}' not found`);

      const rows = await db
        .selectFrom("control.lookup_value as lv")
        .select([
          "lv.id", "lv.code", "lv.name", "lv.description",
          "lv.category", "lv.sort_order", "lv.status", "lv.is_system",
          "lv.metadata", "lv.created_at", "lv.updated_at",
        ])
        .where("lv.domain_code", "=", code)
        .where("lv.tenant_id", "is", null)
        .orderBy("lv.sort_order", "asc")
        .orderBy("lv.code", "asc")
        .execute();

      const items = rows
        .filter((r) => {
          if (!q) return true;
          return (
            (r.code as string).toLowerCase().includes(q) ||
            (r.name as string).toLowerCase().includes(q)
          );
        })
        .map((r) => ({
          id: r.id as string,
          code: r.code as string,
          name: r.name as string,
          description: (r.description ?? null) as string | null,
          category: (r.category ?? null) as string | null,
          sort_order: Number(r.sort_order ?? 0),
          status: r.status as string,
          is_system: Boolean(r.is_system),
          metadata: (r.metadata ?? {}) as Record<string, unknown>,
          created_at: r.created_at as string,
          updated_at: (r.updated_at ?? null) as string | null,
        }));

      res.json({ items, total: items.length });
    } catch (err) {
      logger?.error("meta_admin_list_domain_values", { err: String(err) });
      next(err);
    }
  };

  // POST /metadata/admin/lookup-domains/:code/values
  const createDomainValueHandler: RequestHandler = async (req, res, next) => {
    try {
      const ctx = await guard(req, res);
      if (!ctx) return;

      const code = req.params["code"] as string;

      const domain = await db
        .selectFrom("control.lookup_domain")
        .select(["code", "is_extensible"])
        .where("code", "=", code)
        .executeTakeFirst() as { code: string; is_extensible: boolean } | undefined;
      if (!domain) return notFound(res as never, `Lookup domain '${code}' not found`);
      if (!domain.is_extensible) {
        res.status(409).json({
          error: "DOMAIN_NOT_EXTENSIBLE",
          message: `Domain '${code}' is schema-defined and cannot be extended via the admin UI.`,
        });
        return;
      }

      const { code: valueCode, name, description, category, sort_order } = req.body as {
        code?: string; name?: string; description?: string; category?: string; sort_order?: number;
      };

      if (!valueCode || !/^[a-z][a-z0-9_.]*$/.test(valueCode))
        return badRequest(res as never, "code must match ^[a-z][a-z0-9_.]*$");
      if (!name?.trim())
        return badRequest(res as never, "name is required");

      const existing = await db
        .selectFrom("control.lookup_value")
        .select("id")
        .where("domain_code", "=", code)
        .where("code", "=", valueCode)
        .where("tenant_id", "is", null)
        .executeTakeFirst();
      if (existing) {
        res.status(409).json({ error: "DUPLICATE_VALUE_CODE", message: `Value '${valueCode}' already exists in domain '${code}'.` });
        return;
      }

      const inserted = await db
        .insertInto("control.lookup_value")
        .values({
          domain_code: code,
          code: valueCode,
          name: name.trim(),
          description: description?.trim() ?? null,
          category: category?.trim() ?? null,
          sort_order: sort_order ?? 0,
          is_system: true,
          status: "active",
          created_by: ctx.pId,
        })
        .returningAll()
        .executeTakeFirst();

      res.status(201).json(inserted);
    } catch (err) {
      logger?.error("meta_admin_create_domain_value", { err: String(err) });
      next(err);
    }
  };

  // PATCH /metadata/admin/lookup-domains/:code/values/:id
  const updateDomainValueHandler: RequestHandler = async (req, res, next) => {
    try {
      const ctx = await guard(req, res);
      if (!ctx) return;

      const { code, id } = req.params as { code: string; id: string };

      const row = await db
        .selectFrom("control.lookup_value")
        .select(["id", "tenant_id"])
        .where("id", "=", id)
        .where("domain_code", "=", code)
        .executeTakeFirst() as { id: string; tenant_id: string | null } | undefined;
      if (!row) return notFound(res as never, `Lookup value '${id}' not found in domain '${code}'`);

      if (row.tenant_id !== null) {
        res.status(403).json({
          error: "PLATFORM_ROW_ONLY",
          message: "Admin plane can only edit platform-owned lookup values (tenant_id IS NULL).",
        });
        return;
      }

      const { name, description, category, sort_order, status } = req.body as {
        name?: string; description?: string; category?: string; sort_order?: number; status?: string;
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updates: Record<string, any> = { updated_by: ctx.pId, updated_at: new Date() };
      if (name !== undefined) updates["name"] = name.trim();
      if (description !== undefined) updates["description"] = description.trim() || null;
      if (category !== undefined) updates["category"] = category.trim() || null;
      if (sort_order !== undefined) updates["sort_order"] = sort_order;
      if (status !== undefined) updates["status"] = status;

      const updated = await db
        .updateTable("control.lookup_value")
        .set(updates)
        .where("id", "=", id)
        .returningAll()
        .executeTakeFirst();

      res.json(updated);
    } catch (err) {
      logger?.error("meta_admin_update_domain_value", { err: String(err) });
      next(err);
    }
  };

  // DELETE /metadata/admin/lookup-domains/:code/values/:id
  const deleteDomainValueHandler: RequestHandler = async (req, res, next) => {
    try {
      const ctx = await guard(req, res);
      if (!ctx) return;

      const { code, id } = req.params as { code: string; id: string };

      const row = await db
        .selectFrom("control.lookup_value")
        .select(["id", "tenant_id"])
        .where("id", "=", id)
        .where("domain_code", "=", code)
        .executeTakeFirst() as { id: string; tenant_id: string | null } | undefined;
      if (!row) return notFound(res as never, `Lookup value '${id}' not found in domain '${code}'`);

      if (row.tenant_id !== null) {
        res.status(403).json({
          error: "PLATFORM_ROW_ONLY",
          message: "Admin plane can only delete platform-owned lookup values (tenant_id IS NULL).",
        });
        return;
      }

      await db.deleteFrom("control.lookup_value").where("id", "=", id).execute();
      res.status(204).end();
    } catch (err) {
      logger?.error("meta_admin_delete_domain_value", { err: String(err) });
      next(err);
    }
  };

  // ─── Route Registration ────────────────────────────────────────────────────

  const contractStudioRequiredHandler: RequestHandler = (req, res) => {
    logger?.warn?.("legacy_metadata_mutation_blocked", {
      method: req.method,
      path: req.path,
      route: req.route?.path,
      user_agent: req.headers["user-agent"],
      request_id: req.headers["x-request-id"],
    });
    res.status(409).json({
      error: "CONTRACT_STUDIO_REQUIRED",
      message: "This projection is Contract-owned. Edit and publish it through Meta Entity Studio.",
      studio_path: "/setup/metadata",
    });
  };

  router.get("/metadata/admin/erd",                     getErdHandler);

  router.patch("/metadata/admin/entities/:id/contracts",       updateEntityContractsHandler);
  router.patch("/metadata/admin/entity-fields/:id/contracts",  updateEntityFieldContractsHandler);

  router.get("/metadata/admin/lookup-domains",          listDomainsHandler);
  router.post("/metadata/admin/lookup-domains",         createDomainHandler);
  router.patch("/metadata/admin/lookup-domains/:code",  updateDomainHandler);

  router.get("/metadata/admin/lifecycle-bindings",           listLifecycleBindingsHandler);
  router.post("/metadata/admin/lifecycle-bindings",          contractStudioRequiredHandler);
  router.patch("/metadata/admin/lifecycle-bindings/:id",     contractStudioRequiredHandler);
  router.delete("/metadata/admin/lifecycle-bindings/:id",    contractStudioRequiredHandler);

  router.get("/metadata/admin/entity-operations",            listEntityOperationsHandler);
  router.post("/metadata/admin/entity-operations",           contractStudioRequiredHandler);
  router.patch("/metadata/admin/entity-operations/:id",      contractStudioRequiredHandler);
  router.delete("/metadata/admin/entity-operations/:id",     contractStudioRequiredHandler);

  router.get("/metadata/admin/field-groups",             listFieldGroupsHandler);
  router.post("/metadata/admin/field-groups",            createFieldGroupHandler);
  router.patch("/metadata/admin/field-groups/:key",      updateFieldGroupHandler);
  router.delete("/metadata/admin/field-groups/:key",     deleteFieldGroupHandler);

  router.get("/metadata/admin/entity-policies",           listEntityPoliciesHandler);
  router.post("/metadata/admin/entity-policies",          createEntityPolicyHandler);
  router.patch("/metadata/admin/entity-policies/:id",     updateEntityPolicyHandler);
  router.delete("/metadata/admin/entity-policies/:id",    deleteEntityPolicyHandler);

  router.get("/metadata/admin/lifecycles",               listLifecyclesHandler);
  router.get("/metadata/admin/entities",                 listEntitiesHandler);
  router.get("/metadata/admin/entities/:id",             getEntityDetailHandler);

  router.get("/metadata/admin/lookup-domains/:code/values",        listDomainValuesHandler);
  router.post("/metadata/admin/lookup-domains/:code/values",       createDomainValueHandler);
  router.patch("/metadata/admin/lookup-domains/:code/values/:id",  updateDomainValueHandler);
  router.delete("/metadata/admin/lookup-domains/:code/values/:id", deleteDomainValueHandler);

  return router;
}
