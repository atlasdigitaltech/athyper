/**
 * Metadata Routes — Lookup API (Platform Contract)
 *
 * GET  /api/metadata/lookups/:domain
 *   Returns a LookupDomainBundle with platform values merged with tenant
 *   overrides. Tenant values supersede platform values on code collision.
 *
 *   Query params:
 *     ?q=<search>              — typeahead over code + name (case-insensitive)
 *     ?include_inactive=true   — include deprecated values
 *     ?after=<code>            — cursor for next page
 *     ?limit=<n>               — page size (default 200, max 500)
 *
 * POST /api/metadata/lookups/:domain/values
 *   Add a tenant-scoped value to an extensible domain.
 *   Body: { code, name, description?, sort_order?, metadata? }
 *
 * PATCH /api/metadata/lookups/:domain/values/:code
 *   Update a tenant-scoped value.
 *   Body: { name?, description?, sort_order?, metadata?, status? }
 */

import type { RequestHandler, Router } from "express";
import { sql, type Kysely } from "kysely";
import { verifyBearer } from "@athyper/svc-shared";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface LookupRoutesDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>;
  auth: {
    verifyToken(token: string): Promise<Record<string, unknown>>;
  };
  logger?: {
    error(event: string, fields?: Record<string, unknown>): void;
  };
}

interface LookupValue {
  id: string;
  code: string;
  name: string;
  domain_code: string;
  description: string | null;
  sort_order: number;
  is_system: boolean;
  is_default: boolean;
  parent_code: string | null;
  metadata: Record<string, unknown> | null;
  status: "active" | "deprecated";
  tenant_owned: boolean;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function resolveTenantId(claims: Record<string, unknown>): string | null {
  const t = claims["tenant_id"];
  return typeof t === "string" && t ? t : null;
}

function resolvePrincipalId(claims: Record<string, unknown>): string | null {
  const s = claims["sub"] ?? claims["principal_id"];
  return typeof s === "string" && s ? s : null;
}

/** Stable ETag for a lookup bundle based on domain + values content */
function etag(domainCode: string, values: LookupValue[]): string {
  let h = 5381;
  const str = domainCode + values.map((v) => `${v.code}:${v.status}:${v.name}`).join("|");
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return `"lkp-${(h >>> 0).toString(16)}"`;
}

// ─── Route factory ─────────────────────────────────────────────────────────────

export function createLookupRoute(router: Router, deps: LookupRoutesDeps): Router {
  const { db, auth, logger } = deps;

  // ── GET /metadata/lookups/:domain ────────────────────────────────────────────
  const getHandler: RequestHandler = async (req, res, next) => {
    try {
      // Auth
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const tenantId = resolveTenantId(claims);
      const domainCode = decodeURIComponent(req.params["domain"] as string);

      // Query params
      const searchQ = typeof req.query["q"] === "string" ? req.query["q"].trim() : null;
      const includeInactive = req.query["include_inactive"] === "true";
      const afterCursor = typeof req.query["after"] === "string" ? req.query["after"].trim() : null;
      const limit = Math.min(Math.max(parseInt(String(req.query["limit"] ?? "200"), 10) || 200, 1), 500);

      // Domain header
      const domainRow = await db
        .selectFrom("control.lookup_domain as ld")
        .select(["ld.id", "ld.code", "ld.name", "ld.description", "ld.source_schema", "ld.is_extensible", "ld.status"])
        .where("ld.code", "=", domainCode)
        .executeTakeFirst();

      if (!domainRow) {
        res.status(404).json({ error: "NOT_FOUND", message: `Lookup domain '${domainCode}' not found` });
        return;
      }

      // ── Fetch values: platform (tenant_id IS NULL) + tenant overrides ─────────
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query = db
        .selectFrom("control.lookup_value as lv")
        .select([
          "lv.id", "lv.code", "lv.name", "lv.domain_code",
          "lv.description", "lv.sort_order", "lv.is_system",
          "lv.metadata", "lv.status", "lv.tenant_id",
        ])
        .where("lv.domain_code", "=", domainCode)
        .where((eb) =>
          eb.or([
            eb("lv.tenant_id", "is", null),
            ...(tenantId ? [eb("lv.tenant_id", "=", tenantId)] : []),
          ])
        )
        .orderBy("lv.sort_order", "asc")
        .orderBy("lv.code", "asc");

      if (!includeInactive) {
        query = query.where("lv.status", "=", "active") as typeof query;
      }

      const rawRows = await query.execute();

      // ── Merge: build map keyed by code; tenant values supersede platform ───────
      const byCode = new Map<string, LookupValue>();

      for (const row of rawRows) {
        const isOwnedByTenant = row.tenant_id !== null;
        const existing = byCode.get(row.code as string);

        // Tenant values always win over platform values on code collision
        if (!existing || isOwnedByTenant) {
          byCode.set(row.code as string, {
            id: row.id as string,
            code: row.code as string,
            name: row.name as string,
            domain_code: row.domain_code as string,
            description: (row.description ?? null) as string | null,
            sort_order: Number(row.sort_order ?? 0),
            is_system: Boolean(row.is_system),
            is_default: false,
            parent_code: null,
            metadata: (row.metadata && typeof row.metadata === "object" && Object.keys(row.metadata as object).length > 0)
              ? row.metadata as Record<string, unknown>
              : null,
            status: row.status as "active" | "deprecated",
            tenant_owned: isOwnedByTenant,
          });
        }
      }

      let values = Array.from(byCode.values());

      // ── Typeahead search ──────────────────────────────────────────────────────
      if (searchQ) {
        const lower = searchQ.toLowerCase();
        values = values.filter(
          (v) => v.code.toLowerCase().includes(lower) || v.name.toLowerCase().includes(lower)
        );
      }

      // ── Cursor paging ─────────────────────────────────────────────────────────
      // Values are already sorted by (sort_order, code). Cursor is the last `code` returned.
      let startIdx = 0;
      if (afterCursor) {
        const idx = values.findIndex((v) => v.code === afterCursor);
        if (idx >= 0) startIdx = idx + 1;
      }
      const page = values.slice(startIdx, startIdx + limit);
      const nextCursor = page.length === limit && startIdx + limit < values.length
        ? page[page.length - 1]!.code
        : null;

      // ── ETag / 304 ────────────────────────────────────────────────────────────
      const etagValue = etag(domainCode, values);
      res.setHeader("ETag", etagValue);
      res.setHeader("Cache-Control", "no-cache");

      if (req.headers["if-none-match"] === etagValue) {
        res.status(304).end();
        return;
      }

      res.json({
        domain: {
          id: domainRow.id as string,
          code: domainRow.code as string,
          name: domainRow.name as string,
          description: (domainRow.description ?? null) as string | null,
          source_schema: domainRow.source_schema as string,
          is_extensible: Boolean(domainRow.is_extensible),
          status: domainRow.status as "active" | "deprecated",
        },
        values: page,
        pagination: {
          limit,
          total: values.length,
          next_cursor: nextCursor,
        },
      });
    } catch (err) {
      logger?.error("lookup_get_error", { err: String(err) });
      next(err);
    }
  };

  // ── POST /metadata/lookups/:domain/values — create tenant value ──────────────
  const createHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const tenantId = resolveTenantId(claims);
      const principalId = resolvePrincipalId(claims);
      if (!tenantId || !principalId) {
        res.status(400).json({ error: "MISSING_TENANT_OR_PRINCIPAL" });
        return;
      }

      const domainCode = decodeURIComponent(req.params["domain"] as string);

      // Verify domain exists and is extensible
      const domain = await db
        .selectFrom("control.lookup_domain as ld")
        .select(["ld.id", "ld.is_extensible"])
        .where("ld.code", "=", domainCode)
        .executeTakeFirst();

      if (!domain) {
        res.status(404).json({ error: "NOT_FOUND", message: `Domain '${domainCode}' not found` });
        return;
      }
      if (!domain.is_extensible) {
        res.status(403).json({ error: "NOT_EXTENSIBLE", message: `Domain '${domainCode}' is not tenant-extensible` });
        return;
      }

      const { code, name, description, sort_order, metadata } = req.body as {
        code?: string;
        name?: string;
        description?: string;
        sort_order?: number;
        metadata?: Record<string, unknown>;
      };

      if (!code || typeof code !== "string" || !/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/.test(code) || code.length > 80) {
        res.status(400).json({ error: "INVALID_CODE", message: "code must be lowercase, start with a letter, and contain only letters/digits/underscores/dots (e.g. 'open', 'in_progress', 'payment.domestic')" });
        return;
      }
      if (!name || typeof name !== "string") {
        res.status(400).json({ error: "MISSING_NAME" });
        return;
      }

      // Uniqueness check within (domain_code, code, tenant_id)
      const existing = await db
        .selectFrom("control.lookup_value as lv")
        .select("lv.id")
        .where("lv.domain_code", "=", domainCode)
        .where("lv.code", "=", code)
        .where("lv.tenant_id", "=", tenantId)
        .executeTakeFirst();

      if (existing) {
        res.status(409).json({ error: "DUPLICATE_CODE", message: `Value '${code}' already exists for this tenant in domain '${domainCode}'` });
        return;
      }

      const inserted = await db
        .insertInto("control.lookup_value")
        .values({
          domain_code: domainCode,
          code,
          name,
          description: description ?? null,
          sort_order: sort_order ?? 0,
          metadata: metadata ?? null,
          tenant_id: tenantId,
          is_system: false,
          status: "active",
          created_by: principalId,
        })
        .returningAll()
        .executeTakeFirst();

      res.status(201).json(inserted);
    } catch (err) {
      logger?.error("lookup_create_error", { err: String(err) });
      next(err);
    }
  };

  // ── PATCH /metadata/lookups/:domain/values/:code — update tenant value ────────
  const updateHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const tenantId = resolveTenantId(claims);
      const principalId = resolvePrincipalId(claims);
      if (!tenantId || !principalId) {
        res.status(400).json({ error: "MISSING_TENANT_OR_PRINCIPAL" });
        return;
      }

      const domainCode = decodeURIComponent(req.params["domain"] as string);
      const valueCode = decodeURIComponent(req.params["code"] as string);

      // Only tenant-owned values may be mutated
      const existing = await db
        .selectFrom("control.lookup_value as lv")
        .select(["lv.id", "lv.tenant_id"])
        .where("lv.domain_code", "=", domainCode)
        .where("lv.code", "=", valueCode)
        .where("lv.tenant_id", "=", tenantId)
        .executeTakeFirst();

      if (!existing) {
        res.status(404).json({ error: "NOT_FOUND", message: `Tenant value '${valueCode}' not found in domain '${domainCode}'` });
        return;
      }

      const { name, description, sort_order, metadata, status } = req.body as {
        name?: string;
        description?: string;
        sort_order?: number;
        metadata?: Record<string, unknown>;
        status?: "active" | "deprecated";
      };

      if (status && !["active", "deprecated"].includes(status)) {
        res.status(400).json({ error: "INVALID_STATUS" });
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updates: Record<string, any> = { updated_by: principalId, updated_at: new Date() };
      if (name !== undefined) updates["name"] = name;
      if (description !== undefined) updates["description"] = description;
      if (sort_order !== undefined) updates["sort_order"] = sort_order;
      if (metadata !== undefined) updates["metadata"] = metadata;
      if (status !== undefined) updates["status"] = status;

      const updated = await db
        .updateTable("control.lookup_value")
        .set(updates)
        .where("id", "=", existing.id as string)
        .returningAll()
        .executeTakeFirst();

      res.json(updated);
    } catch (err) {
      logger?.error("lookup_update_error", { err: String(err) });
      next(err);
    }
  };

  // ── GET /metadata/lookups/hot-set — batch fetch for bootstrapHotSet() ────────
  // Returns all lookup domains flagged with metadata->>'is_hot_set' = 'true',
  // merged with tenant overrides. Called once at session start by lookup-provider.ts.
  const hotSetHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const tenantId = resolveTenantId(claims);

      const domains = await db
        .selectFrom("control.lookup_domain as ld")
        .select(["ld.id", "ld.code", "ld.name", "ld.description", "ld.source_schema", "ld.is_extensible", "ld.status"])
        .where("ld.status", "=", "active")
        .where((eb) =>
          // Domains opted in to hot-set via metadata flag
          eb("ld.metadata", "@>", JSON.stringify({ is_hot_set: true }) as never)
        )
        .orderBy("ld.code", "asc")
        .execute();

      // For each domain fetch values (same merge logic as getHandler)
      const bundles = await Promise.all(
        domains.map(async (domainRow) => {
          const rawRows = await db
            .selectFrom("control.lookup_value as lv")
            .select([
              "lv.id", "lv.code", "lv.name", "lv.domain_code",
              "lv.description", "lv.sort_order", "lv.is_system",
              "lv.metadata", "lv.status", "lv.tenant_id",
            ])
            .where("lv.domain_code", "=", domainRow.code as string)
            .where((eb) =>
              eb.or([
                eb("lv.tenant_id", "is", null),
                ...(tenantId ? [eb("lv.tenant_id", "=", tenantId)] : []),
              ])
            )
            .where("lv.status", "=", "active")
            .orderBy("lv.sort_order", "asc")
            .orderBy("lv.code", "asc")
            .execute();

          const byCode = new Map<string, LookupValue>();
          for (const row of rawRows) {
            const isOwnedByTenant = row.tenant_id !== null;
            const existing = byCode.get(row.code as string);
            if (!existing || isOwnedByTenant) {
              byCode.set(row.code as string, {
                id: row.id as string,
                code: row.code as string,
                name: row.name as string,
                domain_code: row.domain_code as string,
                description: (row.description ?? null) as string | null,
                sort_order: Number(row.sort_order ?? 0),
                is_system: Boolean(row.is_system),
                is_default: false,
                parent_code: null,
                metadata: (row.metadata && typeof row.metadata === "object" && Object.keys(row.metadata as object).length > 0)
                  ? row.metadata as Record<string, unknown>
                  : null,
                status: row.status as "active" | "deprecated",
                tenant_owned: isOwnedByTenant,
              });
            }
          }

          return {
            domain: {
              id: domainRow.id as string,
              code: domainRow.code as string,
              name: domainRow.name as string,
              description: (domainRow.description ?? null) as string | null,
              source_schema: domainRow.source_schema as string,
              is_extensible: Boolean(domainRow.is_extensible),
              status: domainRow.status as string,
            },
            values: Array.from(byCode.values()),
          };
        })
      );

      res.setHeader("Cache-Control", "no-cache");
      res.json(bundles);
    } catch (err) {
      logger?.error("lookup_hot_set_error", { err: String(err) });
      next(err);
    }
  };

  // hot-set must be registered before /:domain to avoid being swallowed as a domain param
  router.get("/metadata/lookups/hot-set", hotSetHandler);
  router.get("/metadata/lookups/:domain", getHandler);
  router.post("/metadata/lookups/:domain/values", createHandler);
  router.patch("/metadata/lookups/:domain/values/:code", updateHandler);

  return router;
}
