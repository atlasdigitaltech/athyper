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

interface VersionEntityContract {
  table_schema: string;
  table_name: string;
  primary_key: string;
  tenant_column: string | null;
  write_capability: string;
}

async function resolveVersionEntity(db: AnyDb, entityCode: string): Promise<VersionEntityContract | null> {
  return (db as any)
    .selectFrom("control.entity as e")
    .innerJoin("control.entity_version as ev", "ev.entity_id", "e.id")
    .select([
      "e.table_schema", "e.table_name", "e.primary_key", "e.tenant_column", "e.write_capability",
    ])
    .where("e.name", "=", entityCode)
    .where("e.tenant_id", "is", null)
    .where("e.runtime_enabled", "=", true)
    .where("e.status", "=", "ACTIVE")
    .where("e.is_active", "=", true)
    .where("e.read_capability", "<>", "none")
    .where("e.primary_key", "is not", null)
    .where("e.backing_type", "=", "table")
    .where("ev.status", "=", "EFFECTIVE")
    .executeTakeFirst() as Promise<VersionEntityContract | null>;
}

function scopeVersionRecord(query: any, entity: VersionEntityContract, tenantId: string, recordId: string): any {
  let scoped = query.where(entity.primary_key, "=", recordId);
  if (entity.tenant_column) scoped = scoped.where(entity.tenant_column, "=", tenantId);
  return scoped;
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

      if (!recordId || recordId.length > 256) {
        res.status(400).json({ error: "INVALID_ID", message: "Record id must be a non-empty key of at most 256 characters" });
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

      if (!recordId || recordId.length > 256) {
        res.status(400).json({ error: "INVALID_ID", message: "Record id must be a non-empty key of at most 256 characters" });
        return;
      }

      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) {
        res.status(400).json({ error: "MISSING_TENANT", message: "X-Org header is required" });
        return;
      }

      // Resolve entity table
      const entityRow = await resolveVersionEntity(db, entityCode);

      if (!entityRow) {
        res.status(404).json({ error: "ENTITY_NOT_FOUND", message: `Entity '${entityCode}' not found` });
        return;
      }

      const fullTable = `${entityRow.table_schema}.${entityRow.table_name}`;

      if (entityRow.write_capability === "none") {
        res.status(403).json({ error: "ENTITY_READ_ONLY", message: `Entity '${entityCode}' does not allow amendments.` });
        return;
      }

      // Fetch current record status
      let recordQuery = (db as any)
        .selectFrom(fullTable)
        .select([entityRow.primary_key, "status", "row_version"]);
      recordQuery = scopeVersionRecord(recordQuery, entityRow, tenantId, recordId);
      const record = await recordQuery.executeTakeFirst() as { status: string; row_version?: number } | undefined;

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
      let updateQuery = (db as any)
        .updateTable(fullTable)
        .set({
          status:            "amending",
          status_changed_at: now,
          updated_at:        now,
        });
      updateQuery = scopeVersionRecord(updateQuery, entityRow, tenantId, recordId)
        .where("status", "=", record.status); // optimistic lock
      const updated = await updateQuery.returningAll().executeTakeFirst() as Record<string, unknown> | undefined;

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
