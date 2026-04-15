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
 */

import type { RequestHandler, Router } from "express";
import type { Kysely } from "kysely";
import { sql } from "kysely";
import { verifyBearer } from "@athyper/svc-shared";

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

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createMetadataAdminRoutes(router: Router, deps: MetadataAdminRoutesDeps): Router {
  const { db, auth, logger } = deps;

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

  // ═══════════════════════════════════════════════════════════════════════════
  // LOOKUP DOMAINS
  // ═══════════════════════════════════════════════════════════════════════════

  // GET /metadata/admin/lookup-domains
  const listDomainsHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const q = typeof req.query["q"] === "string" ? req.query["q"].toLowerCase().trim() : "";
      const tId = tenantId(claims);

      const rows = await db
        .selectFrom("control.lookup_domain as ld")
        .leftJoin("control.lookup_value as lv", "lv.domain_code", "ld.code")
        .select([
          "ld.id", "ld.code", "ld.name", "ld.description",
          "ld.source_schema", "ld.is_extensible", "ld.status",
          db.fn.count<number>("lv.id").as("value_count"),
        ])
        .where((eb) => eb.or([
          eb("ld.tenant_id", "is", null),
          ...(tId ? [eb("ld.tenant_id", "=", tId)] : []),
        ]))
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

      const tId = tenantId(claims);
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
          sql<string>`l.status`.as("lifecycle_status"),
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
        .leftJoin("shared.permission as p", "p.code", "eo.permission_code")
        .select([
          "eo.id", "eo.entity_name", "eo.permission_code",
          "eo.surface", "eo.placement", "eo.handler_type", "eo.handler_target",
          "eo.is_record_required", "eo.sort_order",
          "eo.label_override", "eo.icon_override", "eo.tcode_alias", "eo.is_enabled",
          "eo.created_at",
          sql<string>`p.label`.as("permission_label"),
          sql<string>`p.description`.as("permission_description"),
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

      res.json({
        items: rows.map((r) => ({
          id: r.id as string,
          entity_name: r.entity_name as string,
          permission_code: r.permission_code as string,
          permission_label: (r.permission_label ?? null) as string | null,
          permission_description: (r.permission_description ?? null) as string | null,
          surface: r.surface as string,
          placement: r.placement as string,
          handler_type: r.handler_type as string,
          handler_target: (r.handler_target ?? null) as string | null,
          is_record_required: Boolean(r.is_record_required),
          sort_order: Number(r.sort_order ?? 0),
          label_override: (r.label_override ?? null) as string | null,
          icon_override: (r.icon_override ?? null) as string | null,
          tcode_alias: (r.tcode_alias ?? null) as string | null,
          is_enabled: Boolean(r.is_enabled),
          created_at: r.created_at as string,
        })),
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
        handler_type, handler_target, is_record_required,
        sort_order, label_override, icon_override, tcode_alias,
      } = req.body as {
        entity_name?: string; permission_code?: string;
        surface?: string; placement?: string;
        handler_type?: string; handler_target?: string;
        is_record_required?: boolean; sort_order?: number;
        label_override?: string; icon_override?: string; tcode_alias?: string;
      };

      if (!entity_name?.trim()) return badRequest(res as never, "entity_name is required");
      if (!permission_code?.trim()) return badRequest(res as never, "permission_code is required");

      const inserted = await db
        .insertInto("control.entity_operation")
        .values({
          entity_name: entity_name.trim(),
          permission_code: permission_code.trim(),
          surface: surface ?? "BOTH",
          placement: placement ?? "TOOLBAR",
          handler_type: handler_type ?? "API",
          handler_target: handler_target ?? null,
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

      const { surface, placement, handler_type, handler_target, is_record_required,
              sort_order, label_override, icon_override, tcode_alias, is_enabled } = req.body as Record<string, unknown>;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updates: Record<string, any> = { updated_by: ctx.pId, updated_at: new Date() };
      if (surface !== undefined) updates["surface"] = surface;
      if (placement !== undefined) updates["placement"] = placement;
      if (handler_type !== undefined) updates["handler_type"] = handler_type;
      if (handler_target !== undefined) updates["handler_target"] = handler_target;
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
        .select(["l.id", "l.code", "l.name", "l.status", "l.description"])
        .where("l.status", "=", "active")
        .orderBy("l.name", "asc")
        .execute();

      res.json({ items: rows });
    } catch (err) {
      logger?.error("meta_admin_list_lifecycles", { err: String(err) });
      next(err);
    }
  };

  // GET /metadata/admin/entities  — list control.entity names+ids for picker
  const listEntitiesHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const rows = await db
        .selectFrom("control.entity as e")
        .select(["e.id", "e.name", "e.label_singular", "e.entity_class", "e.module_id"])
        .where("e.tenant_id", "is", null)
        .orderBy("e.name", "asc")
        .execute();

      res.json({ items: rows });
    } catch (err) {
      logger?.error("meta_admin_list_entities", { err: String(err) });
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

  // ─── Route Registration ────────────────────────────────────────────────────

  router.get("/metadata/admin/erd",                     getErdHandler);

  router.get("/metadata/admin/lookup-domains",          listDomainsHandler);
  router.post("/metadata/admin/lookup-domains",         createDomainHandler);
  router.patch("/metadata/admin/lookup-domains/:code",  updateDomainHandler);

  router.get("/metadata/admin/lifecycle-bindings",           listLifecycleBindingsHandler);
  router.post("/metadata/admin/lifecycle-bindings",          createLifecycleBindingHandler);
  router.patch("/metadata/admin/lifecycle-bindings/:id",     updateLifecycleBindingHandler);
  router.delete("/metadata/admin/lifecycle-bindings/:id",    deleteLifecycleBindingHandler);

  router.get("/metadata/admin/entity-operations",            listEntityOperationsHandler);
  router.post("/metadata/admin/entity-operations",           createEntityOperationHandler);
  router.patch("/metadata/admin/entity-operations/:id",      updateEntityOperationHandler);
  router.delete("/metadata/admin/entity-operations/:id",     deleteEntityOperationHandler);

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

  return router;
}
