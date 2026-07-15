/**
 * Change Reason Codes Route — controlled-vocabulary lookup for high-risk
 * audit-log entries.
 *
 *   GET /api/runtime/v1/change-reason-codes?category=accounting
 *
 * Reads from master.change_reason_code (the table Phase 3 added). Returns
 * tenant-visible active rows (system rows with tenant_id IS NULL + the
 * caller tenant's custom rows). Optional `category` query filters to one
 * of: workflow / accounting / financial / snapshot.
 *
 * Consumer: AccountingDistributionDrawer's ReasonCodePicker — populates
 * the dropdown that appears when the user changes gl_account_id. Other
 * future high-risk paths (workflow correction, posting adjustment,
 * snapshot restore) call the same endpoint with a different category.
 *
 * Cached by the picker client-side; codes change rarely.
 */

import type { RequestHandler, Router } from "express";
import type { Kysely } from "kysely";
import { sql } from "kysely";
import {
  verifyBearer,
  resolveTenantId,
  extractOrgHeaders,
} from "@athyper/svc-shared";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

export interface ChangeReasonCodesRouteDeps {
  db:   AnyDb;
  auth: { verifyToken(token: string): Promise<Record<string, unknown>> };
  logger?: {
    error(event: string, fields?: Record<string, unknown>): void;
    warn(event:  string, fields?: Record<string, unknown>): void;
  };
}

const ALLOWED_CATEGORIES = new Set([
  "workflow",
  "accounting",
  "financial",
  "snapshot",
]);

interface ChangeReasonCodeRow {
  id:           string;
  code:         string;
  name:         string;
  description:  string | null;
  category:     string;
  severity:     string;
  is_system:    boolean;
  sort_order:   number;
}

export function createChangeReasonCodesRoute(
  router: Router,
  deps: ChangeReasonCodesRouteDeps,
): Router {
  const { db, auth, logger } = deps;

  const handler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) {
        res.status(400).json({ error: "MISSING_TENANT", message: "X-Org header is required" });
        return;
      }

      const categoryRaw = typeof req.query["category"] === "string"
        ? req.query["category"].trim().toLowerCase()
        : "";
      const category = ALLOWED_CATEGORIES.has(categoryRaw) ? categoryRaw : null;

      // Tenant-visible active codes: system rows (tenant_id IS NULL) merged
      // with the caller tenant's custom rows. Order by sort_order so the
      // dropdown's recommended default lands first.
      let rows: ChangeReasonCodeRow[] = [];
      try {
        const result = await sql<ChangeReasonCodeRow>`
          SELECT id, code, name, description, category, severity, is_system, sort_order
            FROM master.change_reason_code
           WHERE status = 'active'
             AND (tenant_id IS NULL OR tenant_id = ${tenantId}::uuid)
             AND (${category}::text IS NULL OR category = ${category}::text)
           ORDER BY sort_order ASC, code ASC
        `.execute(db);
        rows = result.rows;
      } catch (err) {
        logger?.warn("change_reason_codes_query_failed", { err: String(err) });
      }

      res.json({
        data: rows.map((row) => ({
          id:           row.id,
          code:         row.code,
          name:         row.name,
          description:  row.description,
          category:     row.category,
          severity:     row.severity,
          is_system:    row.is_system,
          sort_order:   row.sort_order,
        })),
        total: rows.length,
      });
    } catch (err) {
      logger?.error("change_reason_codes_route_error", { err: String(err) });
      next(err);
    }
  };

  // Canonical-only mount — net-new tenant-scoped lookup endpoint. No /records
  // legacy alias (the route never lived under /records/*; only canonical
  // /runtime/v1/* applies).
  router.get("/runtime/v1/change-reason-codes", handler);

  return router;
}
