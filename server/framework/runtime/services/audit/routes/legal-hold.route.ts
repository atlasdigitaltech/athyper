/**
 * Legal Hold Routes
 *
 * GET    /audit/legal-holds                      — list all holds (filter: status)
 * POST   /audit/legal-holds                      — create a new hold
 * GET    /audit/legal-holds/:id                  — hold detail + manifest
 * PATCH  /audit/legal-holds/:id/release          — release an active hold
 * POST   /audit/legal-holds/:id/manifest/refresh — recompute blocked-partition manifest
 *
 * Legal holds block the partition archive worker from detaching / archiving log
 * partitions whose time range overlaps the hold scope. The manifest tracks which
 * partitions are currently blocked by each hold.
 */

import type { RequestHandler, Router } from "express";
import type { Kysely } from "kysely";
import { sql } from "kysely";
import {
  verifyBearer,
  isUuid,
  resolveTenantId,
  extractOrgHeaders,
  parsePagination,
} from "../../shared/route-helpers.js";
import { withDomainSpan } from "../../shared/tracing.js";

// ── Deps ──────────────────────────────────────────────────────────────────────

export interface LegalHoldRouteDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>;
  auth: { verifyToken(token: string): Promise<Record<string, unknown>> };
  logger?: { error(event: string, fields?: Record<string, unknown>): void };
}

// ── Serialisers ───────────────────────────────────────────────────────────────

function toHold(row: Record<string, unknown>) {
  return {
    id:               row["id"],
    holdName:         row["hold_name"],
    holdCode:         row["hold_code"],
    description:      row["description"] ?? null,
    custodianId:      row["custodian_id"],
    scopeEntityType:  row["scope_entity_type"] ?? null,
    scopeDateFrom:    row["scope_date_from"] ?? null,
    scopeDateTo:      row["scope_date_to"] ?? null,
    scopeLogSchemas:  row["scope_log_schemas"] ?? null,
    status:           row["status"],
    effectiveFrom:    row["effective_from"],
    effectiveTo:      row["effective_to"] ?? null,
    releaseDate:      row["release_date"] ?? null,
    releaseReason:    row["release_reason"] ?? null,
    releasedBy:       row["released_by"] ?? null,
    createdAt:        row["created_at"],
    createdBy:        row["created_by"],
    updatedAt:        row["updated_at"] ?? null,
  };
}

function toManifestRow(row: Record<string, unknown>) {
  return {
    id:               row["id"],
    legalHoldId:      row["legal_hold_id"],
    partitionSchema:  row["partition_schema"],
    partitionTable:   row["partition_table"],
    partitionRangeLo: row["partition_range_lo"],
    partitionRangeHi: row["partition_range_hi"],
    isReleased:       row["is_released"],
    releasedAt:       row["released_at"] ?? null,
    createdAt:        row["created_at"],
  };
}

// ── Route factory ─────────────────────────────────────────────────────────────

export function createLegalHoldRoutes(router: Router, deps: LegalHoldRouteDeps): void {
  const { db, auth, logger } = deps;

  // ── GET /audit/legal-holds ────────────────────────────────────────────────

  const listHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.status(400).json({ error: "MISSING_TENANT" }); return; }

      const { limit, offset } = parsePagination(req.query as Record<string, unknown>);
      const statusFilter = req.query["status"] as string | undefined;

      let q = db
        .selectFrom("governance.legal_hold as lh" as never)
        .selectAll("lh" as never)
        .where("lh.tenant_id" as never, "=", tenantId as never)
        .orderBy("lh.created_at" as never, "desc")
        .limit(limit + 1)
        .offset(offset);

      if (statusFilter) {
        q = q.where("lh.status" as never, "=", statusFilter as never);
      }

      const rows = await q.execute() as Record<string, unknown>[];
      const hasMore = rows.length > limit;

      res.json({ ok: true, data: rows.slice(0, limit).map(toHold), hasMore });
    } catch (err) {
      logger?.error("legal_hold_list_error", { err: String(err) });
      next(err);
    }
  };

  // ── POST /audit/legal-holds ───────────────────────────────────────────────

  const createHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.status(400).json({ error: "MISSING_TENANT" }); return; }

      const _claimsSub = claims["sub"]; const principalId = typeof _claimsSub === "string" && _claimsSub ? _claimsSub : null;
      if (!principalId) { res.status(401).json({ error: "MISSING_PRINCIPAL" }); return; }

      const {
        holdName, holdCode, description,
        custodianId, scopeEntityType,
        scopeDateFrom, scopeDateTo, scopeLogSchemas,
        effectiveTo,
      } = req.body as {
        holdName?: string;
        holdCode?: string;
        description?: string;
        custodianId?: string;
        scopeEntityType?: string;
        scopeDateFrom?: string;
        scopeDateTo?: string;
        scopeLogSchemas?: string[];
        effectiveTo?: string;
      };

      if (!holdName?.trim()) { res.status(400).json({ error: "MISSING_HOLD_NAME" }); return; }
      if (!holdCode?.trim() || !/^[a-z0-9-]{1,60}$/.test(holdCode)) {
        res.status(400).json({ error: "INVALID_HOLD_CODE", message: "holdCode must be 1–60 lowercase alphanumeric/hyphen characters" });
        return;
      }
      if (!custodianId || !isUuid(custodianId)) {
        res.status(400).json({ error: "INVALID_CUSTODIAN_ID" }); return;
      }

      // At least one scope dimension required
      if (!scopeEntityType && !scopeDateFrom && !scopeLogSchemas?.length) {
        res.status(400).json({
          error: "MISSING_SCOPE",
          message: "At least one of scopeEntityType, scopeDateFrom, or scopeLogSchemas must be provided",
        });
        return;
      }

      // Duplicate code check
      const existing = await db
        .selectFrom("governance.legal_hold as lh" as never)
        .select("lh.id" as never)
        .where("lh.tenant_id" as never, "=", tenantId as never)
        .where("lh.hold_code" as never, "=", holdCode as never)
        .executeTakeFirst() as Record<string, unknown> | undefined;

      if (existing) {
        res.status(409).json({ error: "DUPLICATE_HOLD_CODE", message: `Hold code '${holdCode}' already exists` });
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const insertValues: Record<string, any> = {
        tenant_id:    tenantId,
        hold_name:    holdName.trim(),
        hold_code:    holdCode.trim(),
        description:  description?.trim() ?? null,
        custodian_id: custodianId,
        status:       "active",
        created_by:   principalId,
      };

      if (scopeEntityType) insertValues["scope_entity_type"] = scopeEntityType;
      if (scopeDateFrom)   insertValues["scope_date_from"] = new Date(scopeDateFrom);
      if (scopeDateTo)     insertValues["scope_date_to"] = new Date(scopeDateTo);
      if (scopeLogSchemas?.length) insertValues["scope_log_schemas"] = scopeLogSchemas;
      if (effectiveTo)     insertValues["effective_to"] = new Date(effectiveTo);

      const hold = await withDomainSpan("governance.legal_hold.create", {
        tenant_id: tenantId,
        operation: "create",
        scope_entity_type: scopeEntityType ?? "all",
        has_scope_date_from: Boolean(scopeDateFrom),
        has_scope_date_to: Boolean(scopeDateTo),
      }, async (span) => {
        const created = await db
          .insertInto("governance.legal_hold" as never)
          .values(insertValues as never)
          .returningAll()
          .executeTakeFirst() as Record<string, unknown>;
        span.setAttribute("legal_hold_id", String(created["id"] ?? ""));
        return created;
      });

      res.status(201).json({ ok: true, data: toHold(hold) });
    } catch (err) {
      logger?.error("legal_hold_create_error", { err: String(err) });
      next(err);
    }
  };

  // ── GET /audit/legal-holds/:id ────────────────────────────────────────────

  const getHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.status(400).json({ error: "MISSING_TENANT" }); return; }

      const id = req.params["id"] as string;
      if (!isUuid(id)) { res.status(400).json({ error: "INVALID_ID" }); return; }

      const hold = await db
        .selectFrom("governance.legal_hold as lh" as never)
        .selectAll("lh" as never)
        .where("lh.id" as never, "=", id as never)
        .where("lh.tenant_id" as never, "=", tenantId as never)
        .executeTakeFirst() as Record<string, unknown> | undefined;

      if (!hold) { res.status(404).json({ error: "NOT_FOUND" }); return; }

      // Manifest rows
      const manifest = await db
        .selectFrom("governance.legal_hold_manifest as lhm" as never)
        .selectAll("lhm" as never)
        .where("lhm.legal_hold_id" as never, "=", id as never)
        .where("lhm.tenant_id" as never, "=", tenantId as never)
        .orderBy("lhm.partition_range_lo" as never, "desc")
        .execute() as Record<string, unknown>[];

      res.json({
        ok: true,
        data: {
          ...toHold(hold),
          manifest: manifest.map(toManifestRow),
        },
      });
    } catch (err) {
      logger?.error("legal_hold_get_error", { err: String(err) });
      next(err);
    }
  };

  // ── PATCH /audit/legal-holds/:id/release ─────────────────────────────────

  const releaseHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.status(400).json({ error: "MISSING_TENANT" }); return; }

      const _claimsSub = claims["sub"]; const principalId = typeof _claimsSub === "string" && _claimsSub ? _claimsSub : null;
      if (!principalId) { res.status(401).json({ error: "MISSING_PRINCIPAL" }); return; }

      const id = req.params["id"] as string;
      if (!isUuid(id)) { res.status(400).json({ error: "INVALID_ID" }); return; }

      const { releaseReason } = req.body as { releaseReason?: string };
      if (!releaseReason?.trim()) {
        res.status(400).json({ error: "MISSING_RELEASE_REASON", message: "releaseReason is required to release a hold" });
        return;
      }

      const now = new Date();

      // Release the hold — only active holds may be released
      const updated = await withDomainSpan("governance.legal_hold.release", {
        tenant_id: tenantId,
        legal_hold_id: id,
        operation: "release",
      }, async (span) => {
        const released = await db
          .updateTable("governance.legal_hold" as never)
          .set({
            status:         "released",
            release_date:   now,
            release_reason: releaseReason.trim(),
            released_by:    principalId,
            updated_at:     now,
            updated_by:     principalId,
          } as never)
          .where("id" as never, "=", id as never)
          .where("tenant_id" as never, "=", tenantId as never)
          .where("status" as never, "=", "active" as never)
          .returningAll()
          .executeTakeFirst() as Record<string, unknown> | undefined;
        span.setAttribute("result", released ? "released" : "not_active_or_missing");
        return released;
      });

      if (!updated) {
        // Check if it exists at all
        const exists = await db
          .selectFrom("governance.legal_hold as lh" as never)
          .select(sql<string>`lh.status`.as("status") as never)
          .where("lh.id" as never, "=", id as never)
          .where("lh.tenant_id" as never, "=", tenantId as never)
          .executeTakeFirst() as Record<string, unknown> | undefined;

        if (!exists) { res.status(404).json({ error: "NOT_FOUND" }); return; }
        res.status(409).json({ error: "NOT_ACTIVE", message: `Hold is already ${String(exists["status"])}` });
        return;
      }

      // Mark manifest rows as released
      await db
        .updateTable("governance.legal_hold_manifest" as never)
        .set({ is_released: true, released_at: now, updated_at: now, updated_by: principalId } as never)
        .where("legal_hold_id" as never, "=", id as never)
        .where("tenant_id" as never, "=", tenantId as never)
        .where("is_released" as never, "=", false as never)
        .execute();

      res.json({ ok: true, data: toHold(updated) });
    } catch (err) {
      logger?.error("legal_hold_release_error", { err: String(err) });
      next(err);
    }
  };

  // ── POST /audit/legal-holds/:id/manifest/refresh ─────────────────────────
  // Scans PostgreSQL partition metadata and upserts manifest rows for partitions
  // whose time range overlaps this hold's scope_date_from / scope_date_to.

  const manifestRefreshHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.status(400).json({ error: "MISSING_TENANT" }); return; }

      const _claimsSub = claims["sub"]; const principalId = typeof _claimsSub === "string" && _claimsSub ? _claimsSub : null;
      if (!principalId) { res.status(401).json({ error: "MISSING_PRINCIPAL" }); return; }

      const id = req.params["id"] as string;
      if (!isUuid(id)) { res.status(400).json({ error: "INVALID_ID" }); return; }

      const hold = await db
        .selectFrom("governance.legal_hold as lh" as never)
        .select(["lh.id", "lh.status", "lh.scope_date_from", "lh.scope_date_to", "lh.scope_log_schemas"] as never[])
        .where("lh.id" as never, "=", id as never)
        .where("lh.tenant_id" as never, "=", tenantId as never)
        .executeTakeFirst() as Record<string, unknown> | undefined;

      if (!hold) { res.status(404).json({ error: "NOT_FOUND" }); return; }
      if (hold["status"] !== "active") {
        res.status(409).json({ error: "NOT_ACTIVE", message: "Only active holds can have their manifest refreshed" });
        return;
      }

      // Query pg_inherits to find partitioned log table children and their ranges
      // using pg_get_expr(c.relpartbound, c.oid) for the partition bound expression.
      const schemaFilter = Array.isArray(hold["scope_log_schemas"]) && hold["scope_log_schemas"].length > 0
        ? (hold["scope_log_schemas"] as string[])
        : ["log", "audit"];

      const partitionRows = await sql<{
        partition_schema: string;
        partition_table:  string;
        range_lo:         string;
        range_hi:         string;
      }>`
        SELECT
          n.nspname                                        AS partition_schema,
          c.relname                                        AS partition_table,
          (regexp_match(
            pg_get_expr(c.relpartbound, c.oid),
            'FROM \(''([^'']+)''\)'
          ))[1]                                            AS range_lo,
          (regexp_match(
            pg_get_expr(c.relpartbound, c.oid),
            'TO \(''([^'']+)''\)'
          ))[1]                                            AS range_hi
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relispartition = true
          AND n.nspname = ANY(${sql.val(schemaFilter)})
          AND pg_get_expr(c.relpartbound, c.oid) ~ 'FROM'
      `.execute(db);

      const holdDateFrom = hold["scope_date_from"] ? new Date(hold["scope_date_from"] as string) : null;
      const holdDateTo   = hold["scope_date_to"]   ? new Date(hold["scope_date_to"] as string)   : null;

      let upsertedCount = 0;

      for (const p of partitionRows.rows) {
        if (!p.range_lo || !p.range_hi) continue;

        const partLo = new Date(p.range_lo);
        const partHi = new Date(p.range_hi);

        // Overlap check: partition overlaps the hold's date scope
        const overlaps =
          (!holdDateFrom || partHi > holdDateFrom) &&
          (!holdDateTo   || partLo < holdDateTo);

        if (!overlaps) continue;

        // Upsert — ON CONFLICT DO NOTHING if already tracked and not released
        await db
          .insertInto("governance.legal_hold_manifest" as never)
          .values({
            tenant_id:         tenantId,
            legal_hold_id:     id,
            partition_schema:  p.partition_schema,
            partition_table:   p.partition_table,
            partition_range_lo: partLo,
            partition_range_hi: partHi,
            is_released:       false,
            created_by:        principalId,
          } as never)
          .onConflict((oc) =>
            (oc as ReturnType<typeof oc.columns>)
              .columns(["tenant_id", "legal_hold_id", "partition_schema", "partition_table"] as never[])
              .doNothing()
          )
          .execute();

        upsertedCount++;
      }

      res.json({ ok: true, partitionsScanned: partitionRows.rows.length, manifestRowsAdded: upsertedCount });
    } catch (err) {
      logger?.error("legal_hold_manifest_refresh_error", { err: String(err) });
      next(err);
    }
  };

  // ── Register ──────────────────────────────────────────────────────────────

  router.get("/audit/legal-holds",                           listHandler);
  router.post("/audit/legal-holds",                          createHandler);
  router.get("/audit/legal-holds/:id",                       getHandler);
  router.patch("/audit/legal-holds/:id/release",             releaseHandler);
  router.post("/audit/legal-holds/:id/manifest/refresh",     manifestRefreshHandler);
}
