/**
 * Per-Record Versions Route
 *
 *   GET /api/records/:entity/:id/versions
 *
 * Returns the version history for a specific record, sourced from
 * log.entity_lifecycle_log.  Each meaningful status transition IS a version
 * checkpoint — no separate snapshot table is required.
 *
 * Data sources:
 *   log.entity_lifecycle_log  — version index + payload snapshot
 *   master.principal_profile  — actor display names
 *
 * Response shape:
 *   {
 *     data: [{
 *       version_no, revision_no, revision_label,
 *       record_status, change_type, change_reason, change_summary,
 *       created_at, created_by_name, is_current
 *     }],
 *     current_version_no: number
 *   }
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

export interface VersionsRouteDeps {
  db:   AnyDb;
  auth: { verifyToken(token: string): Promise<Record<string, unknown>> };
  logger?: {
    error(event: string, fields?: Record<string, unknown>): void;
    warn(event:  string, fields?: Record<string, unknown>): void;
  };
}

interface LifecycleLogRow {
  id:             string;
  to_status:      string;
  operation_code: string | null;
  remarks:        string | null;
  payload:        Record<string, unknown> | null;
  revision_no:    number | null;
  revision_label: string | null;
  created_at:     string;
  display_name:   string | null;
}

const CHANGE_TYPE_VALUES = new Set(["original", "amendment", "reversal", "correction"]);

function deriveChangeType(
  payload: Record<string, unknown> | null,
  opCode: string | null,
): string {
  const fromPayload = payload?.["change_type"];
  if (typeof fromPayload === "string" && CHANGE_TYPE_VALUES.has(fromPayload)) {
    return fromPayload;
  }
  const op = (opCode ?? "").toLowerCase();
  if (op.includes("revers")) return "reversal";
  if (op.includes("amend"))  return "amendment";
  if (op.includes("correct")) return "correction";
  return "original";
}

export function createVersionsRoute(router: Router, deps: VersionsRouteDeps): Router {
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

      // ── Query lifecycle log (the version index) ───────────────────────────
      let rows: LifecycleLogRow[] = [];
      try {
        rows = await (db as any)
          .selectFrom("log.entity_lifecycle_log as ell")
          .leftJoin(
            "master.principal_profile as pp",
            "pp.principal_id" as never,
            "ell.actor_id" as never,
          )
          .select([
            "ell.id",
            "ell.to_status",
            "ell.operation_code",
            "ell.remarks",
            "ell.payload",
            "ell.revision_no",
            "ell.revision_label",
            "ell.created_at",
            "pp.display_name",
          ] as never[])
          .where("ell.tenant_id"   as never, "=", tenantId   as never)
          .where("ell.entity_type" as never, "=", entityCode as never)
          .where("ell.entity_id"   as never, "=", recordId   as never)
          .orderBy("ell.created_at" as never, "asc" as never)
          .limit(200)
          .execute() as LifecycleLogRow[];
      } catch (err) {
        logger?.warn("versions_query_failed", { entityCode, recordId, err: String(err) });
      }

      const lastIdx = rows.length - 1;

      const data = rows.map((row, idx) => {
        const payload  = isRecord(row.payload) ? row.payload : null;
        const revNo    = typeof row.revision_no === "number" ? row.revision_no : 0;
        const revLabel = row.revision_label
          ?? (revNo === 0 ? "Original" : `Amendment ${revNo}`);

        return {
          version_no:      idx + 1,
          revision_no:     revNo,
          revision_label:  revLabel,
          record_status:   row.to_status,
          change_type:     deriveChangeType(payload, row.operation_code),
          change_reason:   row.remarks ?? null,
          change_summary:  typeof payload?.["change_summary"] === "string"
                             ? payload["change_summary"]
                             : null,
          created_at:      String(row.created_at),
          created_by_name: row.display_name ?? null,
          is_current:      idx === lastIdx,
        };
      });

      res.json({
        data,
        current_version_no: data.length,
      });
    } catch (err) {
      logger?.error("versions_route_error", { err: String(err) });
      next(err);
    }
  };

  // Dual-mount: canonical + legacy alias (rename window).
  router.get("/runtime/v1/entities/:entity/:id/versions", handler);
  router.get("/records/:entity/:id/versions",             handler);

  // ── POST /records/:entity/:id/amend ──────────────────────────────────────────
  // Opens a new amendment cycle for the record.  Transitions status to 'amending';
  // the trg_pi_lifecycle_log trigger fires and increments revision_no automatically.
  // The caller (DocumentDetailPage) hits this URL directly rather than going
  // through the action-dispatcher so the intent is unambiguous.
  const amendHandler: RequestHandler = async (req, res, next) => {
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

      // Resolve entity table
      const entityRow = await (db as any)
        .selectFrom("control.entity as e")
        .select(["e.table_schema", "e.table_name"] as never[])
        .where("e.name" as never, "=", entityCode as never)
        .where("e.tenant_id" as never, "is", null as never)
        .executeTakeFirst() as { table_schema: string; table_name: string } | undefined;

      if (!entityRow) {
        res.status(404).json({ error: "ENTITY_NOT_FOUND", message: `Entity '${entityCode}' not found` });
        return;
      }

      const fullTable = `${entityRow.table_schema}.${entityRow.table_name}`;

      // Fetch current record status
      const record = await (db as any)
        .selectFrom(fullTable)
        .select(["id", "status", "row_version"] as never[])
        .where("id" as never, "=", recordId as never)
        .where("tenant_id" as never, "=", tenantId as never)
        .executeTakeFirst() as { id: string; status: string; row_version?: number } | undefined;

      if (!record) {
        res.status(404).json({ error: "RECORD_NOT_FOUND", message: `Record '${recordId}' not found` });
        return;
      }

      // Statuses that cannot be amended (terminal or already in draft/amending)
      const NON_AMENDABLE = new Set(["draft", "amending", "cancelled", "void", "archived"]);
      if (NON_AMENDABLE.has((record.status ?? "").toLowerCase())) {
        res.status(422).json({
          error:   "AMEND_NOT_ALLOWED",
          message: `Record in status '${record.status}' cannot be amended`,
        });
        return;
      }

      const now = new Date();
      const updated = await (db as any)
        .updateTable(fullTable)
        .set({
          status:            "amending",
          status_changed_at: now,
          updated_at:        now,
        })
        .where("id" as never, "=", recordId as never)
        .where("tenant_id" as never, "=", tenantId as never)
        .where("status" as never, "=", record.status as never) // optimistic lock
        .returningAll()
        .executeTakeFirst() as Record<string, unknown> | undefined;

      if (!updated) {
        res.status(409).json({ error: "CONFLICT", message: "Record was modified by another process. Please retry." });
        return;
      }

      logger?.warn("versions_amend_opened", { entityCode, tenantId, recordId, from: record.status });
      res.json({ ok: true, record: updated });
    } catch (err) {
      logger?.error("versions_amend_error", { err: String(err) });
      next(err);
    }
  };

  router.post("/runtime/v1/entities/:entity/:id/amend", amendHandler);
  router.post("/records/:entity/:id/amend",             amendHandler);

  return router;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
