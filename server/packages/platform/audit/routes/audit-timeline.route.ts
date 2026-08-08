/**
 * P2P Audit Timeline Routes — Phase 9
 *
 * GET /audit/timeline/:entityType/:entityId
 *   Returns the interleaved activity log + snapshot rows for a single P2P
 *   record from snapshot.v_p2p_audit_timeline.
 *
 * Tenant isolation: RLS on audit.audit_log + snapshot.document_snapshot;
 * tenant resolved from bearer token (no manual WHERE).
 *
 * Pagination: keyset on activity_at DESC (most recent first).
 * Response shape:
 *   {
 *     items: TimelineRow[],
 *     next:  string | null,    // ISO8601 cursor (activity_at of last item)
 *   }
 *
 * Entity types accepted: the 7 P2P entities plus schedule_line — the view
 * itself filters to this set, but we validate at the route boundary for
 * cleaner 4xx error messages.
 */

import type { RequestHandler, Router } from "express";
import type { Kysely } from "kysely";
import { sql } from "kysely";
import {
  verifyBearer,
  isUuid,
  resolveTenantId,
  extractOrgHeaders,
} from "@athyper/svc-shared";

// ── Deps ──────────────────────────────────────────────────────────────────────

export interface AuditTimelineRouteDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>;
  auth: {
    verifyToken(token: string): Promise<Record<string, unknown>>;
  };
  logger?: {
    error(event: string, fields?: Record<string, unknown>): void;
  };
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SUPPORTED_ENTITY_TYPES = new Set<string>([
  "purchase_requisition",
  "commitment",
  "purchase_order",                // alias of commitment in P2P parlance
  "purchase_order_confirmation",
  "delivery_note",
  "receipt",
  "service_sheet",
  "purchase_invoice",
  "schedule_line",
]);

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE     = 200;

interface TimelineRow {
  entity_type:               string;
  entity_id:                 string;
  domain:                    string | null;
  activity_type:             string | null;
  actor_id:                  string | null;
  actor_type:                string | null;
  activity_detail:           Record<string, unknown> | null;
  correlation_id:            string | null;
  activity_at:               string;
  activity_by:               string | null;
  snapshot_id:               string | null;
  gate_event:                string | null;
  gate_event_kind:           string | null;
  snapshot_version_number:   number | null;
  snapshot_chain_seq:        number | null;
  snapshot_payload_hash:     string | null;
  snapshot_captured_at:      string | null;
  snapshot_captured_by:      string | null;
  snapshot_capture_source:   string | null;
}

// ── Route factory ─────────────────────────────────────────────────────────────

export function createAuditTimelineRoute(
  router: Router,
  deps:   AuditTimelineRouteDeps,
): void {
  const { db, auth, logger } = deps;

  const handler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId         = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) {
        res.status(400).json({ error: "TENANT_NOT_RESOLVED" });
        return;
      }

      const entityType = String(req.params["entityType"] ?? "");
      const entityId   = String(req.params["entityId"]   ?? "");

      if (!SUPPORTED_ENTITY_TYPES.has(entityType)) {
        res.status(400).json({
          error:   "UNSUPPORTED_ENTITY_TYPE",
          message: `entityType '${entityType}' is not a P2P audit timeline source.`,
          supported: [...SUPPORTED_ENTITY_TYPES],
        });
        return;
      }
      if (!isUuid(entityId)) {
        res.status(400).json({ error: "INVALID_ENTITY_ID", message: "entityId must be a UUID." });
        return;
      }

      // Pagination
      const pageSizeRaw = Number(req.query["pageSize"] ?? DEFAULT_PAGE_SIZE);
      const pageSize    = Math.max(1, Math.min(MAX_PAGE_SIZE, Number.isFinite(pageSizeRaw) ? pageSizeRaw : DEFAULT_PAGE_SIZE));
      const cursor      = typeof req.query["cursor"] === "string" ? req.query["cursor"] : null;

      // Query — RLS scopes to tenant. Cursor is exclusive ('<' rather than '<=').
      const rows = await sql<TimelineRow>`
        SELECT
          entity_type,
          entity_id::text                 AS entity_id,
          domain,
          activity_type,
          actor_id::text                  AS actor_id,
          actor_type,
          activity_detail,
          correlation_id::text            AS correlation_id,
          activity_at::text               AS activity_at,
          activity_by::text               AS activity_by,
          snapshot_id::text               AS snapshot_id,
          gate_event,
          gate_event_kind,
          snapshot_version_number,
          snapshot_chain_seq,
          snapshot_payload_hash,
          snapshot_captured_at::text      AS snapshot_captured_at,
          snapshot_captured_by::text      AS snapshot_captured_by,
          snapshot_capture_source
        FROM snapshot.v_p2p_audit_timeline
        WHERE tenant_id   = ${tenantId}::uuid
          AND entity_type = ${entityType}::text
          AND entity_id   = ${entityId}::uuid
          ${cursor
            ? sql`AND activity_at < ${cursor}::timestamptz`
            : sql``}
        ORDER BY activity_at DESC
        LIMIT ${pageSize + 1}::int
      `.execute(db);

      const items   = rows.rows.slice(0, pageSize);
      const hasMore = rows.rows.length > pageSize;
      const next    = hasMore && items.length > 0
        ? items[items.length - 1]!.activity_at
        : null;

      res.json({ items, next });
    } catch (err) {
      logger?.error("audit_timeline_query_failed", {
        error: err instanceof Error ? err.message : String(err),
      });
      next(err);
    }
  };

  router.get("/audit/timeline/:entityType/:entityId", handler);
}
