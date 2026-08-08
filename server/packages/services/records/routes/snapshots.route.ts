/**
 * Per-Record Snapshots Routes — graph-checkpoint feed for the Versions tab.
 *
 *   GET /api/runtime/v1/entities/:entity/:id/snapshots
 *   GET /api/runtime/v1/entities/:entity/:id/snapshots/:snapshotId
 *
 * Reads from snapshot.document_snapshot — the hash-chained graph checkpoint
 * store written by snapshot.fn_capture_full() at every lifecycle gate event
 * (authoring_lock / commitment / financial_post / amendment_baseline /
 * reversal). Distinct from log.entity_lifecycle_log (consumed by versions.route)
 * which records state-machine transitions, not document graphs.
 *
 * Pairing:
 *   GET /entities/:entity/:id/versions   → state-transition timeline   (Lifecycle tab)
 *   GET /entities/:entity/:id/snapshots  → graph-checkpoint timeline   (Versions tab)
 *
 * Index endpoint returns metadata only (no payload). Detail endpoint returns
 * the full graph JSON (header + lines + components + distributions + schedules
 * + related). Detail powers the "View Snapshot" CTA in the Versions panel
 * and the future Compare / Restore actions.
 */

import type { RequestHandler, Router } from "express";
import type { Kysely } from "kysely";
import { sql } from "kysely";
import {
  verifyBearer,
  isUuid,
  resolveTenantId,
  extractOrgHeaders,
  resolvePrincipalIdWithJit,
} from "@athyper/svc-shared";
import { checkPermission, requireAllow } from "@athyper/svc-iam";
import { computeSnapshotDiff } from "@athyper/svc-business";
import {
  restoreFromSnapshot,
  RestoreError,
} from "@athyper/svc-business";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

export interface SnapshotsRouteDeps {
  db:   AnyDb;
  auth: { verifyToken(token: string): Promise<Record<string, unknown>> };
  logger?: {
    error(event: string, fields?: Record<string, unknown>): void;
    warn(event:  string, fields?: Record<string, unknown>): void;
  };
}

interface SnapshotIndexRow {
  id:                 string;
  document_code:      string | null;
  version_number:     number;
  gate_event:         string;
  gate_event_kind:    string;
  payload_hash:       string;
  chain_seq:          number;
  previous_snapshot_id: string | null;
  captured_at:        string;
  capture_source:     string;
  display_name:       string | null;
}

interface SnapshotDetailRow extends SnapshotIndexRow {
  header_json:        Record<string, unknown>;
  lines_json:         Record<string, unknown>[] | null;
  components_json:    Record<string, unknown>[] | null;
  distributions_json: Record<string, unknown>[] | null;
  schedules_json:     Record<string, unknown>[] | null;
  related_json:       Record<string, unknown> | null;
}

export function createSnapshotsRoute(router: Router, deps: SnapshotsRouteDeps): Router {
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

      // Index read — chain_seq DESC so the most recent snapshot is row 0.
      // Joins principal_profile for the captured-by display name; LEFT JOIN
      // keeps system-captured rows visible even when no profile is registered.
      // Hard cap at 200 — matches the versions route ceiling. Future cursor
      // pagination lands when documents accrue more amendment cycles than
      // that, which the prototype won't hit.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let rows: SnapshotIndexRow[] = [];
      try {
        rows = await (db as any)
          .selectFrom("snapshot.document_snapshot as ds")
          .leftJoin(
            "master.principal_profile as pp",
            "pp.principal_id" as never,
            "ds.captured_by" as never,
          )
          .select([
            "ds.id",
            "ds.document_code",
            "ds.version_number",
            "ds.gate_event",
            "ds.gate_event_kind",
            "ds.payload_hash",
            "ds.chain_seq",
            "ds.previous_snapshot_id",
            "ds.captured_at",
            "ds.capture_source",
            "pp.display_name",
          ] as never[])
          .where("ds.tenant_id"   as never, "=", tenantId   as never)
          .where("ds.entity_type" as never, "=", entityCode as never)
          .where("ds.entity_id"   as never, "=", recordId   as never)
          .orderBy("ds.chain_seq" as never, "desc" as never)
          .limit(200)
          .execute() as SnapshotIndexRow[];
      } catch (err) {
        logger?.warn("snapshots_query_failed", { entityCode, recordId, err: String(err) });
      }

      const data = rows.map((row) => ({
        id:                   row.id,
        document_code:        row.document_code ?? null,
        version_number:       row.version_number,
        gate_event:           row.gate_event,
        gate_event_kind:      row.gate_event_kind,
        payload_hash:         row.payload_hash,
        chain_seq:            row.chain_seq,
        previous_snapshot_id: row.previous_snapshot_id,
        captured_at:          String(row.captured_at),
        capture_source:       row.capture_source,
        captured_by_name:     row.display_name ?? null,
      }));

      res.json({
        data,
        total: data.length,
      });
    } catch (err) {
      logger?.error("snapshots_route_error", { err: String(err) });
      next(err);
    }
  };

  // ── Detail handler — full graph for one snapshot id ──────────────────────
  // Payload-bearing; ~50KB-200KB for a typical PI (gzip-friendly). Powers
  // the View Snapshot CTA and is the data source for the future Compare
  // (Phase 9a) and Restore (Phase 9b) flows.
  const detailHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const entityCode = (req.params["entity"] as string).replace(/-/g, "_").toLowerCase();
      const recordId   = String(req.params["id"] ?? "");
      const snapshotId = String(req.params["snapshotId"] ?? "");

      if (!isUuid(recordId)) {
        res.status(400).json({ error: "INVALID_ID", message: "Record id must be a valid UUID" });
        return;
      }
      if (!isUuid(snapshotId)) {
        res.status(400).json({ error: "INVALID_SNAPSHOT_ID", message: "Snapshot id must be a valid UUID" });
        return;
      }

      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) {
        res.status(400).json({ error: "MISSING_TENANT", message: "X-Org header is required" });
        return;
      }

      // Tenant + entity + id guard scopes against cross-tenant probes — the
      // snapshot id alone is unguessable, but defense-in-depth requires the
      // tuple to match what the caller can already see in the index.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let row: SnapshotDetailRow | undefined;
      try {
        row = await (db as any)
          .selectFrom("snapshot.document_snapshot as ds")
          .leftJoin(
            "master.principal_profile as pp",
            "pp.principal_id" as never,
            "ds.captured_by" as never,
          )
          .select([
            "ds.id",
            "ds.document_code",
            "ds.version_number",
            "ds.gate_event",
            "ds.gate_event_kind",
            "ds.payload_hash",
            "ds.chain_seq",
            "ds.previous_snapshot_id",
            "ds.captured_at",
            "ds.capture_source",
            "pp.display_name",
            "ds.header_json",
            "ds.lines_json",
            "ds.components_json",
            "ds.distributions_json",
            "ds.schedules_json",
            "ds.related_json",
          ] as never[])
          .where("ds.tenant_id"   as never, "=", tenantId   as never)
          .where("ds.entity_type" as never, "=", entityCode as never)
          .where("ds.entity_id"   as never, "=", recordId   as never)
          .where("ds.id"          as never, "=", snapshotId as never)
          .executeTakeFirst() as SnapshotDetailRow | undefined;
      } catch (err) {
        logger?.warn("snapshot_detail_query_failed", { entityCode, recordId, snapshotId, err: String(err) });
      }

      if (!row) {
        res.status(404).json({ error: "SNAPSHOT_NOT_FOUND", message: "Snapshot not found for this record" });
        return;
      }

      res.json({
        id:                   row.id,
        document_code:        row.document_code ?? null,
        version_number:       row.version_number,
        gate_event:           row.gate_event,
        gate_event_kind:      row.gate_event_kind,
        payload_hash:         row.payload_hash,
        chain_seq:            row.chain_seq,
        previous_snapshot_id: row.previous_snapshot_id,
        captured_at:          String(row.captured_at),
        capture_source:       row.capture_source,
        captured_by_name:     row.display_name ?? null,
        header_json:          row.header_json,
        lines_json:           row.lines_json,
        components_json:      row.components_json,
        distributions_json:   row.distributions_json,
        schedules_json:       row.schedules_json,
        related_json:         row.related_json,
      });
    } catch (err) {
      logger?.error("snapshot_detail_route_error", { err: String(err) });
      next(err);
    }
  };

  // ── Compare handler — sectioned diff between two snapshots ──────────────
  // Both ids must belong to the same (tenant, entity, recordId) tuple — the
  // tuple guard is the same defense-in-depth the detail handler uses.
  //
  // Snapshot vs current workspace-draft state is intentionally out of scope —
  // that needs to reassemble the live document graph (header + lines + PC +
  // AD + SL) which is significant additional surgery (see
  // snapshot-capture.service for the loader fan-out we'd need to extract).
  // Two-snapshot comparison is the more useful audit operation anyway —
  // gate-to-gate diffs answer "what changed between submit and post?".
  const compareHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const entityCode = (req.params["entity"] as string).replace(/-/g, "_").toLowerCase();
      const recordId   = String(req.params["id"] ?? "");

      if (!isUuid(recordId)) {
        res.status(400).json({ error: "INVALID_ID", message: "Record id must be a valid UUID" });
        return;
      }

      const body = (req.body ?? {}) as { leftSnapshotId?: unknown; rightSnapshotId?: unknown };
      const leftId  = typeof body.leftSnapshotId  === "string" ? body.leftSnapshotId  : "";
      const rightId = typeof body.rightSnapshotId === "string" ? body.rightSnapshotId : "";

      if (!isUuid(leftId) || !isUuid(rightId)) {
        res.status(400).json({
          error:   "INVALID_SNAPSHOT_IDS",
          message: "leftSnapshotId and rightSnapshotId must both be valid UUIDs",
        });
        return;
      }
      if (leftId === rightId) {
        res.status(400).json({
          error:   "SAME_SNAPSHOT",
          message: "Cannot compare a snapshot to itself; pick two distinct snapshots",
        });
        return;
      }

      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) {
        res.status(400).json({ error: "MISSING_TENANT", message: "X-Org header is required" });
        return;
      }

      // Single query pulls both rows; PG handles the ANY(...) cleanly and
      // the (tenant, entity, id) tuple guard is enforced on both rows.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let rows: SnapshotDetailRow[] = [];
      try {
        rows = await (db as any)
          .selectFrom("snapshot.document_snapshot as ds")
          .leftJoin(
            "master.principal_profile as pp",
            "pp.principal_id" as never,
            "ds.captured_by" as never,
          )
          .select([
            "ds.id",
            "ds.document_code",
            "ds.version_number",
            "ds.gate_event",
            "ds.gate_event_kind",
            "ds.payload_hash",
            "ds.chain_seq",
            "ds.previous_snapshot_id",
            "ds.captured_at",
            "ds.capture_source",
            "pp.display_name",
            "ds.header_json",
            "ds.lines_json",
            "ds.components_json",
            "ds.distributions_json",
            "ds.schedules_json",
            "ds.related_json",
          ] as never[])
          .where("ds.tenant_id"   as never, "=", tenantId   as never)
          .where("ds.entity_type" as never, "=", entityCode as never)
          .where("ds.entity_id"   as never, "=", recordId   as never)
          .where("ds.id"          as never, "in", [leftId, rightId] as never)
          .execute() as SnapshotDetailRow[];
      } catch (err) {
        logger?.warn("snapshot_compare_query_failed", { entityCode, recordId, err: String(err) });
      }

      const leftRow  = rows.find((r) => r.id === leftId);
      const rightRow = rows.find((r) => r.id === rightId);
      if (!leftRow || !rightRow) {
        res.status(404).json({
          error:   "SNAPSHOT_NOT_FOUND",
          message: "One or both snapshots were not found for this record",
        });
        return;
      }

      const diff = computeSnapshotDiff({
        left: {
          header_json:        leftRow.header_json,
          lines_json:         leftRow.lines_json,
          components_json:    leftRow.components_json,
          distributions_json: leftRow.distributions_json,
          schedules_json:     leftRow.schedules_json,
        },
        right: {
          header_json:        rightRow.header_json,
          lines_json:         rightRow.lines_json,
          components_json:    rightRow.components_json,
          distributions_json: rightRow.distributions_json,
          schedules_json:     rightRow.schedules_json,
        },
      });

      // Toggle the left/right perspective if the user picked them out of
      // chronological order. Always emit left=older, right=newer so the
      // UI's "before / after" framing is consistent regardless of which
      // row the user clicked first.
      const [olderRow, newerRow] = leftRow.chain_seq < rightRow.chain_seq
        ? [leftRow, rightRow]
        : [rightRow, leftRow];
      const swapped = leftRow.chain_seq >= rightRow.chain_seq;

      res.json({
        left: snapshotMetaPayload(olderRow),
        right: snapshotMetaPayload(newerRow),
        swapped,
        sections: swapped ? diff.sections.map(swapSection) : diff.sections,
        total_differences: diff.total_differences,
      });
    } catch (err) {
      logger?.error("snapshot_compare_route_error", { err: String(err) });
      next(err);
    }
  };

  // ── Restore handler — destructive replay of the snapshot graph ──────────
  // Wraps snapshot-restore.service. Resolves the change-reason FK + principal
  // before handing off; translates RestoreError codes to HTTP responses.
  const restoreHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const { sub } = claims as { sub: string };

      const entityCode = (req.params["entity"] as string).replace(/-/g, "_").toLowerCase();
      const recordId   = String(req.params["id"]         ?? "");
      const snapshotId = String(req.params["snapshotId"] ?? "");

      if (!isUuid(recordId)) {
        res.status(400).json({ error: "INVALID_ID", message: "Record id must be a valid UUID" });
        return;
      }
      if (!isUuid(snapshotId)) {
        res.status(400).json({ error: "INVALID_SNAPSHOT_ID", message: "Snapshot id must be a valid UUID" });
        return;
      }

      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) {
        res.status(400).json({ error: "MISSING_TENANT", message: "X-Org header is required" });
        return;
      }

      // Resolve JWT sub → master.principal.id (FK target for audit + row
      // audit fields). Same pattern the AD route uses.
      const principalId = sub
        ? await resolvePrincipalIdWithJit(db, sub, tenantId, xRealm, claims)
        : sub;

      // Permission gate (Phase 11). Snapshot restore is destructive replay
      // of arbitrary historical graph state — owner+admin only per the
      // 018_persona_permission seed. Per-entity codes (PI.* here) instead
      // of one generic SNAPSHOT.RESTORE so IAM can grant restore on PI
      // without also granting it on commitments / receipts.
      const restorePermissionCode = permissionCodeForRestore(entityCode);
      if (restorePermissionCode) {
        const decision = await checkPermission(db, tenantId, principalId, restorePermissionCode);
        if (!requireAllow(decision, res)) return;
      }
      // If we don't have a permission mapping for this entity type yet,
      // the engine's own UNSUPPORTED_ENTITY_TYPE guard will reject; we
      // don't fail-open by skipping the IAM check above.

      // Look up the system 'restore_snapshot' reason code. The engine takes
      // a FK uuid; if the seed didn't apply, we fail loudly rather than
      // writing a NULL reason on a restore (every restore must carry one).
      const reasonResult = await sql<{ id: string }>`
        SELECT id
          FROM master.change_reason_code
         WHERE code      = 'restore_snapshot'
           AND status    = 'active'
           AND (tenant_id IS NULL OR tenant_id = ${tenantId}::uuid)
         ORDER BY (tenant_id IS NOT NULL) DESC
         LIMIT 1
      `.execute(db);
      const reasonCodeId = reasonResult.rows[0]?.id;
      if (!reasonCodeId) {
        res.status(500).json({
          error:   "REASON_CODE_NOT_SEEDED",
          message: "Required system reason code 'restore_snapshot' is not present. Re-apply seed 005_change_reason_code.",
        });
        return;
      }

      try {
        const result = await restoreFromSnapshot(db, {
          tenantId,
          entityType: entityCode,
          entityId:   recordId,
          snapshotId,
          principalId,
          reasonCodeId,
        });
        res.json(result);
      } catch (err) {
        if (err instanceof RestoreError) {
          const status = err.code === "ENTITY_LOCKED"           ? 409
            :          err.code === "STATUS_NOT_RESTORABLE"     ? 422
            :          err.code === "ENTITY_NOT_FOUND"          ? 404
            :          err.code === "SNAPSHOT_NOT_FOUND"        ? 404
            :          err.code === "SNAPSHOT_TAMPERED"         ? 500
            :          err.code === "UNSUPPORTED_ENTITY_TYPE"   ? 400
            : 500;
          // Log SNAPSHOT_TAMPERED loudly — this is a data-integrity incident
          // that should page on-call rather than be silently surfaced to the
          // user. Other RestoreError codes are user-actionable; log at warn.
          if (err.code === "SNAPSHOT_TAMPERED") {
            logger?.error("snapshot_restore_tamper_detected", {
              snapshot_id: snapshotId,
              entity:      entityCode,
              record_id:   recordId,
              tenant_id:   tenantId,
              details:     err.details,
            });
          }
          res.status(status).json({
            error:   err.code,
            message: err.message,
            details: err.details,
          });
          return;
        }
        throw err;
      }
    } catch (err) {
      logger?.error("snapshot_restore_route_error", { err: String(err) });
      next(err);
    }
  };

  // Canonical-only mounts. Unlike the legacy sub-resources that dual-mount
  // under both /records/* and /runtime/v1/entities/*, these endpoints are
  // new — no /records/* callers exist to preserve, so the legacy alias
  // would just teach future developers the wrong default.
  router.get ("/runtime/v1/entities/:entity/:id/snapshots",                       handler);
  router.get ("/runtime/v1/entities/:entity/:id/snapshots/:snapshotId",           detailHandler);
  router.post("/runtime/v1/entities/:entity/:id/snapshots/compare",               compareHandler);
  router.post("/runtime/v1/entities/:entity/:id/snapshots/:snapshotId/restore",   restoreHandler);

  return router;
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers — keep small projection + side-swapping out of the request body
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Per-entity permission code for snapshot restore. Each entity gets its own
 * code so IAM can grant restore granularly (e.g. PI restore but not PR
 * restore). Returns null when no permission has been seeded for the entity
 * — in which case the engine's UNSUPPORTED_ENTITY_TYPE guard rejects the
 * call. We never fail-open by skipping the check.
 */
function permissionCodeForRestore(entityCode: string): string | null {
  switch (entityCode) {
    case "purchase_invoice": return "PI.SNAPSHOT_RESTORE";
    // Other P2P entities (PR / commitment / receipt / service_sheet) get
    // their codes seeded as restore wires in for those entities. Until
    // then, returning null forces the engine's UNSUPPORTED_ENTITY_TYPE
    // path which 400s with a clear message.
    default:                 return null;
  }
}

function snapshotMetaPayload(row: SnapshotDetailRow) {
  return {
    id:                row.id,
    document_code:     row.document_code ?? null,
    version_number:    row.version_number,
    gate_event:        row.gate_event,
    gate_event_kind:   row.gate_event_kind,
    payload_hash:      row.payload_hash,
    chain_seq:         row.chain_seq,
    captured_at:       String(row.captured_at),
    capture_source:    row.capture_source,
    captured_by_name:  row.display_name ?? null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function swapSection(section: any): any {
  // When the user picked rows out of chronological order, computeSnapshotDiff
  // already ran on (caller-left, caller-right); we flip each FieldDelta's
  // left/right and swap added↔removed buckets so the response always reads
  // "older → newer".
  return {
    ...section,
    added:   section.removed,
    removed: section.added,
    changed: section.changed.map((row: any) => ({
      ...row,
      fields: row.fields.map((f: any) => ({ field: f.field, left: f.right, right: f.left })),
    })),
  };
}
