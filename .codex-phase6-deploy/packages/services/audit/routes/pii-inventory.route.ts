/**
 * PII Inventory Route — GET /api/entity/pii-inventory
 *
 * Returns all fields registered in control.field_security_policy that carry a
 * PII-tier classification (pii | spii | sensitive), grouped by entity.
 * The response is read-only and cached per-tenant for 5 minutes in-process.
 *
 * Response shape:
 *   { items: Array<{ entityName, fields: Array<{ fieldPath, classification,
 *                     maskingType, requiredRoles }> }> }
 *
 * HTTP headers:
 *   X-Cache: HIT | MISS
 *   Cache-Control: private, max-age=300
 */

import type { RequestHandler, Router } from "express";
import type { Kysely } from "kysely";
import {
  verifyBearer,
  resolveTenantId,
  extractOrgHeaders,
} from "@athyper/svc-shared";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<any>;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PiiInventoryRouteDeps {
  db: AnyDb;
  auth: {
    verifyToken(token: string): Promise<Record<string, unknown>>;
  };
  logger?: {
    error(event: string, fields?: Record<string, unknown>): void;
  };
}

interface PiiField {
  fieldPath:    string;
  classification: string;
  maskingType:  string;
  requiredRoles: string[];
}

interface PiiEntityGroup {
  entityName: string;
  fields:     PiiField[];
}

// ── In-process cache ──────────────────────────────────────────────────────────

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const cache = new Map<string, { data: PiiEntityGroup[]; fetchedAt: number }>();

// ── Route factory ─────────────────────────────────────────────────────────────

export function createPiiInventoryRoute(router: Router, deps: PiiInventoryRouteDeps): void {
  const { db, auth, logger } = deps;

  const handler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) {
        res.status(404).json({ error: "TENANT_NOT_FOUND" });
        return;
      }

      // ── Cache check ──────────────────────────────────────────────────────────
      const cached = cache.get(tenantId);
      if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
        res.setHeader("X-Cache", "HIT");
        res.setHeader("Cache-Control", "private, max-age=300");
        res.json({ items: cached.data });
        return;
      }

      // ── Query ────────────────────────────────────────────────────────────────
      // Join field_security_policy directly to control.entity via entity_id.
      // Filter: only PII-tier classifications + active policies.
      // Include global policies (tenant_id IS NULL) and tenant-specific overrides.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows = await (db as any)
        .selectFrom("control.field_security_policy as fsp")
        .innerJoin("control.entity as e", "e.id", "fsp.entity_id")
        .select([
          "e.name as entity_name",
          "fsp.field_path",
          "fsp.pii_classification as classification",
          "fsp.mask_strategy as masking_type",
          "fsp.role_list as required_roles",
        ])
        .where("fsp.pii_classification", "in", ["pii", "spii", "sensitive"])
        .where("fsp.is_active", "=", true)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .where((eb: any) =>
          eb.or([
            eb("fsp.tenant_id", "is",  null),
            eb("fsp.tenant_id", "=",   tenantId),
          ])
        )
        .orderBy("e.name",       "asc")
        .orderBy("fsp.field_path", "asc")
        .execute() as Array<{
          entity_name:   string;
          field_path:    string;
          classification: string;
          masking_type:  string;
          required_roles: string[] | null;
        }>;

      // ── Group by entity ───────────────────────────────────────────────────────
      const grouped = new Map<string, PiiField[]>();
      for (const row of rows) {
        if (!grouped.has(row.entity_name)) grouped.set(row.entity_name, []);
        grouped.get(row.entity_name)!.push({
          fieldPath:     row.field_path,
          classification: row.classification,
          maskingType:   row.masking_type,
          requiredRoles: Array.isArray(row.required_roles) ? row.required_roles : [],
        });
      }

      const data: PiiEntityGroup[] = [...grouped.entries()].map(
        ([entityName, fields]) => ({ entityName, fields }),
      );

      cache.set(tenantId, { data, fetchedAt: Date.now() });

      res.setHeader("X-Cache", "MISS");
      res.setHeader("Cache-Control", "private, max-age=300");
      res.json({ items: data });
    } catch (err) {
      logger?.error("pii_inventory_error", { err: String(err) });
      next(err);
    }
  };

  router.get("/entity/pii-inventory", handler);
}
