/**
 * Per-Record Audit-Log Route — column-level mutation history.
 *
 *   GET /api/runtime/v1/entities/:entity/:id/audit-log
 *
 * Reads from log.audit_log (the table Phase 3 added the reason_code column
 * to). Each row is one INSERT / UPDATE / DELETE / status_change carrying
 * old_values, new_values, changed_fields, and an optional controlled
 * reason_code FK to master.change_reason_code.
 *
 * Distinct from:
 *   /versions  → state transitions (log.entity_lifecycle_log) — Lifecycle tab
 *   /snapshots → graph checkpoints (snapshot.document_snapshot) — Versions tab
 *   /audit-log → column-level mutations (log.audit_log)        — Audit tab
 *
 * Joins:
 *   - master.principal_profile for the actor display name
 *   - master.change_reason_code for the reason label + category + severity
 */

import type { RequestHandler, Router } from "express";
import type { Kysely } from "kysely";
import {
  verifyBearer,
  isUuid,
  resolveTenantId,
  extractOrgHeaders,
} from "@athyper/svc-shared";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

export interface AuditLogRouteDeps {
  db:   AnyDb;
  auth: { verifyToken(token: string): Promise<Record<string, unknown>> };
  logger?: {
    error(event: string, fields?: Record<string, unknown>): void;
    warn(event:  string, fields?: Record<string, unknown>): void;
  };
}

interface AuditLogRow {
  id:                   string;
  operation:            string;
  actor_id:             string | null;
  actor_type:           string | null;
  actor_display_name:   string | null;
  changed_fields:       string[] | null;
  old_values:           Record<string, unknown> | null;
  new_values:           Record<string, unknown> | null;
  reason_code_id:       string | null;
  reason_code:          string | null;
  reason_code_name:     string | null;
  reason_code_category: string | null;
  reason_code_severity: string | null;
  correlation_id:       string | null;
  created_at:           string;
}

export function createAuditLogRoute(router: Router, deps: AuditLogRouteDeps): Router {
  const { db, auth, logger } = deps;

  const handler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const entityCode = (req.params["entity"] as string).replace(/-/g, "_").toLowerCase();
      const recordId   = String(req.params["id"] ?? "");

      if (!isUuid(recordId)) {
        res.status(400).json({ error: "INVALID_ID", message: "Record id must be a valid UUID" });
        return;
      }

      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) {
        res.status(400).json({ error: "MISSING_TENANT", message: "X-Org header is required" });
        return;
      }

      // Hard cap at 200 — matches the versions / snapshots ceiling. Cursor
      // pagination lands when records accrue more than 200 mutations.
      let rows: AuditLogRow[] = [];
      try {
        rows = await (db as any)
          .selectFrom("log.audit_log as al")
          .leftJoin(
            "master.principal_profile as pp",
            "pp.principal_id" as never,
            "al.actor_id" as never,
          )
          .leftJoin(
            "master.change_reason_code as crc",
            "crc.id" as never,
            "al.reason_code" as never,
          )
          .select([
            "al.id",
            "al.operation",
            "al.actor_id",
            "al.actor_type",
            "pp.display_name as actor_display_name",
            "al.changed_fields",
            "al.old_values",
            "al.new_values",
            "al.reason_code as reason_code_id",
            "crc.code as reason_code",
            "crc.name as reason_code_name",
            "crc.category as reason_code_category",
            "crc.severity as reason_code_severity",
            "al.correlation_id",
            "al.created_at",
          ] as never[])
          .where("al.tenant_id"   as never, "=", tenantId   as never)
          .where("al.entity_type" as never, "=", entityCode as never)
          .where("al.entity_id"   as never, "=", recordId   as never)
          .orderBy("al.created_at" as never, "desc" as never)
          .limit(200)
          .execute() as AuditLogRow[];
      } catch (err) {
        logger?.warn("audit_log_query_failed", { entityCode, recordId, err: String(err) });
      }

      const data = rows.map((row) => ({
        id:                   row.id,
        operation:            row.operation,
        actor_id:             row.actor_id,
        actor_type:           row.actor_type,
        actor_name:           row.actor_display_name,
        changed_fields:       row.changed_fields ?? [],
        old_values:           row.old_values,
        new_values:           row.new_values,
        reason_code_id:       row.reason_code_id,
        reason_code:          row.reason_code,
        reason_code_name:     row.reason_code_name,
        reason_code_category: row.reason_code_category,
        reason_code_severity: row.reason_code_severity,
        correlation_id:       row.correlation_id,
        created_at:           String(row.created_at),
      }));

      res.json({
        data,
        total: data.length,
      });
    } catch (err) {
      logger?.error("audit_log_route_error", { err: String(err) });
      next(err);
    }
  };

  // Canonical-only mount — net-new endpoint, no legacy /records/* aliasing.
  router.get("/runtime/v1/entities/:entity/:id/audit-log", handler);

  return router;
}
