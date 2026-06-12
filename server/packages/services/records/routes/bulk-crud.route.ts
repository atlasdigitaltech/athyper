/**
 * Bulk CRUD Routes — Sprint 40
 *
 *   PATCH  /api/records/:entity/bulk
 *     Body: { selectionMode: "ids"|"filter", ids?: string[], patch: Record<string, unknown> }
 *     Applies a multi-field patch to a set of records.
 *     Returns: { ok, succeeded, failed, rows[] }
 *
 *   DELETE /api/records/:entity/bulk
 *     Body: { selectionMode: "ids"|"filter", ids?: string[] }
 *     Soft-deletes records: sets deleted_at + deleted_by if the column exists,
 *     otherwise sets status = 'deleted'. Row-by-row with error capture.
 *     Returns: { ok, succeeded, failed, rows[] }
 *
 * Response shape used by runtime bulk action clients:
 *   { succeeded: number, failed: number, rows: { id, success, error? }[] }
 *
 * Protected columns cannot be patched:
 *   id, tenant_id, created_by, created_at, status_changed_by, status_changed_at,
 *   deleted_at, deleted_by
 *
 * Optimistic concurrency: row-by-row updates with tenant_id guard. Rows that
 * disappear between read and write count as failures.
 *
 * Max IDs per request: 500 (BULK_MAX_IDS).
 */

import type { RequestHandler, Router } from "express";
import type { Kysely } from "kysely";
import { sql } from "kysely";
import {
  verifyBearer,
  isUuid,
  resolveTenantId,
  resolvePrincipalIdOrNull,
  resolveFieldMap,
  extractOrgHeaders,
} from "@athyper/svc-shared";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

// ─── Deps ─────────────────────────────────────────────────────────────────────

export interface BulkCrudRouteDeps {
  db:    AnyDb;
  auth:  { verifyToken(token: string): Promise<Record<string, unknown>> };
  logger?: {
    error(event: string, fields?: Record<string, unknown>): void;
    warn(event: string, fields?: Record<string, unknown>): void;
    info(event: string, fields?: Record<string, unknown>): void;
  };
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const BULK_MAX_IDS = 500;

// ─── Lifecycle helpers (mirrors bulk-action.route.ts) ──────────────────────────

interface StatusRouteCompiled {
  allowed_transitions: Record<string, string[]>;
  terminal_states?:    string[];
  deletable_states?:   string[];
}

/** Ordered list of status codes to try when archiving a non-deletable record. */
const ARCHIVE_STATUS_CANDIDATES = ["archived", "inactive", "cancelled", "voided", "closed"] as const;

async function loadStatusRoute(
  db:         AnyDb,
  entityName: string,
  tenantId:   string,
): Promise<StatusRouteCompiled | null> {
  const row = await db
    .selectFrom("snapshot.status_route as sr")
    .select(["sr.compiled_json"])
    .where("sr.entity_name" as never, "=", entityName as never)
    .where("sr.tenant_id"   as never, "=", tenantId   as never)
    .orderBy("sr.updated_at" as never, "desc")
    .limit(1)
    .executeTakeFirst() as { compiled_json: StatusRouteCompiled | null } | undefined;

  return row?.compiled_json ?? null;
}

/**
 * Finds the first archive-like status that is reachable from `currentStatus`
 * according to the compiled status route.  Returns null if no valid target exists.
 */
function resolveArchiveTarget(route: StatusRouteCompiled, currentStatus: string): string | null {
  const allowed = route.allowed_transitions[currentStatus] ?? [];
  for (const candidate of ARCHIVE_STATUS_CANDIDATES) {
    if (allowed.includes(candidate)) return candidate;
  }
  // Fallback: any terminal state reachable from here
  for (const ts of (route.terminal_states ?? [])) {
    if (allowed.includes(ts)) return ts;
  }
  return null;
}

const PROTECTED_PATCH_COLUMNS = new Set([
  "id", "tenant_id", "created_by", "created_at",
  "status_changed_by", "status_changed_at", "deleted_at", "deleted_by",
]);

// ─── Result shape ──────────────────────────────────────────────────────────────

interface BulkRowResult {
  id:       string;
  success:  boolean;
  error?:   { code: string; message: string };
}

interface BulkOpResult {
  succeeded: number;
  failed:    number;
  rows:      BulkRowResult[];
}

// ─── Auth helper ──────────────────────────────────────────────────────────────

async function resolveAuth(
  req:      Parameters<RequestHandler>[0],
  res:      Parameters<RequestHandler>[1],
  db:       AnyDb,
  auth:     BulkCrudRouteDeps["auth"],
): Promise<{ tenantId: string; principalId: string | null } | null> {
  const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
  if (!claims) return null;

  const { xOrg, xRealm } = extractOrgHeaders(req);
  const tenantId = await resolveTenantId(db, xOrg, xRealm);
  if (!tenantId) {
    res.status(400).json({ error: "MISSING_TENANT", message: "X-Org header is required" });
    return null;
  }

  const sub = typeof claims.sub === "string" ? claims.sub : "";
  const principalId = sub ? (await resolvePrincipalIdOrNull(db, sub, tenantId, xRealm) ?? sub) : null;
  return { tenantId, principalId };
}

// ─── IDs parser ────────────────────────────────────────────────────────────────

function parseIds(
  body:   Record<string, unknown>,
  res:    Parameters<RequestHandler>[1],
): string[] | null {
  const selectionMode = String(body["selectionMode"] ?? "ids");
  if (selectionMode !== "ids") {
    // "filter" mode (v2) — not supported yet
    res.status(400).json({ error: "UNSUPPORTED_SELECTION_MODE", message: "Only selectionMode='ids' is supported" });
    return null;
  }

  const rawIds = Array.isArray(body["ids"]) ? (body["ids"] as unknown[]).map(String) : [];
  if (rawIds.length === 0) {
    res.status(400).json({ error: "MISSING_IDS", message: "'ids' array must be non-empty" });
    return null;
  }
  if (rawIds.length > BULK_MAX_IDS) {
    res.status(400).json({ error: "TOO_MANY_IDS", message: `Maximum ${BULK_MAX_IDS} ids per request` });
    return null;
  }
  if (!rawIds.every(isUuid)) {
    res.status(400).json({ error: "INVALID_IDS", message: "All ids must be valid UUIDs" });
    return null;
  }
  return rawIds;
}

// ─── Route factory ─────────────────────────────────────────────────────────────

export function createBulkCrudRoutes(router: Router, deps: BulkCrudRouteDeps): Router {
  const { db, auth, logger } = deps;

  // ── PATCH /records/:entity/bulk — multi-field patch ────────────────────────
  const patchHandler: RequestHandler = async (req, res, next) => {
    try {
      const ctx = await resolveAuth(req, res, db, auth);
      if (!ctx) return;
      const { tenantId, principalId } = ctx;

      const entityCode = (req.params["entity"] as string).replace(/-/g, "_");
      const body = req.body as Record<string, unknown>;

      const ids = parseIds(body, res);
      if (!ids) return;

      const rawPatch = body["patch"];
      if (!rawPatch || typeof rawPatch !== "object" || Array.isArray(rawPatch)) {
        res.status(400).json({ error: "MISSING_PATCH", message: "'patch' must be a non-empty object" });
        return;
      }
      const patch = rawPatch as Record<string, unknown>;

      if (Object.keys(patch).length === 0) {
        res.status(400).json({ error: "EMPTY_PATCH", message: "'patch' must have at least one field" });
        return;
      }

      // Resolve entity table
      const entityRow = await db
        .selectFrom("control.entity as e")
        .select(["e.table_schema", "e.table_name"])
        .where("e.name", "=", entityCode)
        .where("e.tenant_id", "is", null)
        .executeTakeFirst() as { table_schema: string; table_name: string } | undefined;

      if (!entityRow) {
        res.status(404).json({ error: "ENTITY_NOT_FOUND", message: `Entity '${entityCode}' not found` });
        return;
      }

      // Resolve logical field names → physical column names
      const fieldMap = await resolveFieldMap(db, entityCode);
      const columnPatch: Record<string, unknown> = {};

      for (const [field, value] of Object.entries(patch)) {
        const col = fieldMap.get(field) ?? field;
        if (PROTECTED_PATCH_COLUMNS.has(col)) {
          res.status(400).json({
            error:   "PROTECTED_FIELD",
            message: `Field '${field}' cannot be set via bulk patch`,
          });
          return;
        }
        columnPatch[col] = value;
      }

      const fullTable = `${entityRow.table_schema}.${entityRow.table_name}` as `${string}.${string}`;
      const succeeded: BulkRowResult[] = [];
      const failed:    BulkRowResult[] = [];

      for (const id of ids) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const result = await (db.updateTable(fullTable) as any)
            .set({
              ...columnPatch,
              updated_at: new Date(),
              updated_by: principalId,
            })
            .where("id",        "=", id)
            .where("tenant_id", "=", tenantId)
            .executeTakeFirst() as { numUpdatedRows?: bigint } | undefined;

          if (Number(result?.numUpdatedRows ?? 0) > 0) {
            succeeded.push({ id, success: true });
          } else {
            failed.push({ id, success: false, error: { code: "RECORD_NOT_FOUND", message: "Record not found or already modified" } });
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message.slice(0, 200) : String(err);
          failed.push({ id, success: false, error: { code: "UPDATE_FAILED", message: msg } });
        }
      }

      logger?.info("bulk_patch", {
        entity: entityCode, tenantId,
        total: ids.length, succeeded: succeeded.length, failed: failed.length,
      });

      const result: BulkOpResult = {
        succeeded: succeeded.length,
        failed:    failed.length,
        rows:      [...succeeded, ...failed],
      };
      res.json({ ok: true, ...result });
    } catch (err) {
      logger?.error("bulk_patch_error", { err: String(err) });
      next(err);
    }
  };

  // ── DELETE /records/:entity/bulk — lifecycle-aware soft-delete ────────────
  //
  // Guard chain (applied in order):
  //   1. Legal hold  — check governance.legal_hold_manifest for unreleased holds;
  //                    block the entire batch with 409 if any active hold exists.
  //   2. Deletable states — read snapshot.status_route.compiled_json.deletable_states;
  //                         records in those states are soft-deleted (deleted_at / status='deleted').
  //                         Records NOT in deletable_states are transitioned to the nearest
  //                         archive-like status (archived → inactive → first reachable terminal).
  //   3. No lifecycle bound — fall back to the original soft-delete behaviour.
  const deleteHandler: RequestHandler = async (req, res, next) => {
    try {
      const ctx = await resolveAuth(req, res, db, auth);
      if (!ctx) return;
      const { tenantId, principalId } = ctx;

      const entityCode = (req.params["entity"] as string).replace(/-/g, "_");
      const body = req.body as Record<string, unknown>;

      const ids = parseIds(body, res);
      if (!ids) return;

      // Resolve entity table
      const entityRow = await db
        .selectFrom("control.entity as e")
        .select(["e.table_schema", "e.table_name"])
        .where("e.name", "=", entityCode)
        .where("e.tenant_id", "is", null)
        .executeTakeFirst() as { table_schema: string; table_name: string } | undefined;

      if (!entityRow) {
        res.status(404).json({ error: "ENTITY_NOT_FOUND", message: `Entity '${entityCode}' not found` });
        return;
      }

      const fullTable = `${entityRow.table_schema}.${entityRow.table_name}` as `${string}.${string}`;

      // ── Guard 1: Legal hold ───────────────────────────────────────────────
      // Check governance.legal_hold_manifest for any unreleased manifest entries
      // tied to an active hold for this tenant.  A hold with outstanding manifest
      // rows means partitions (and the records they cover) are still protected.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const legalHoldRow = await (db.selectFrom("governance.legal_hold_manifest as lhm" as never) as any)
        .innerJoin("governance.legal_hold as lh", "lh.id", "lhm.legal_hold_id")
        .select(["lh.id as hold_id", "lh.hold_name"])
        .where("lh.tenant_id",    "=", tenantId)
        .where("lh.status",       "=", "active")
        .where("lhm.is_released", "=", false)
        .limit(1)
        .executeTakeFirst() as { hold_id: string; hold_name: string } | undefined;

      if (legalHoldRow) {
        res.status(409).json({
          error:   "LEGAL_HOLD_ACTIVE",
          message: `Bulk delete blocked: active legal hold '${legalHoldRow.hold_name}' has unreleased manifest entries. Release the hold before archiving or deleting records.`,
          holdId:  legalHoldRow.hold_id,
        });
        return;
      }

      // ── Guard 2: Lifecycle — deletable_states ─────────────────────────────
      // Load the compiled status route (null = no lifecycle bound → open delete).
      const statusRoute = await loadStatusRoute(db, entityCode, tenantId);
      const deletableStates: ReadonlySet<string> = statusRoute?.deletable_states
        ? new Set(statusRoute.deletable_states)
        : new Set<string>();
      const hasLifecycle = statusRoute !== null;

      // ── Probe for deleted_at column ───────────────────────────────────────
      const probe = await db
        .selectFrom(fullTable)
        .selectAll()
        .where("tenant_id" as never, "=", tenantId as never)
        .limit(1)
        .executeTakeFirst() as Record<string, unknown> | undefined;

      const hasDeletedAt = probe !== undefined
        ? Object.prototype.hasOwnProperty.call(probe, "deleted_at")
        : true; // assume it exists if no rows to probe

      const succeeded: BulkRowResult[] = [];
      const failed:    BulkRowResult[] = [];

      for (const id of ids) {
        try {
          // Fetch current record status for lifecycle check
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const current = await (db.selectFrom(fullTable) as any)
            .select(["status"])
            .where("id",        "=", id)
            .where("tenant_id", "=", tenantId)
            .executeTakeFirst() as { status: string } | undefined;

          if (!current) {
            failed.push({ id, success: false, error: { code: "RECORD_NOT_FOUND", message: "Record not found" } });
            continue;
          }

          if (hasLifecycle && !deletableStates.has(current.status)) {
            // ── Non-deletable state: transition to nearest archive-like status ──
            const archiveTarget = resolveArchiveTarget(statusRoute!, current.status);
            if (!archiveTarget) {
              failed.push({
                id,
                success: false,
                error: {
                  code:    "NOT_DELETABLE",
                  message: `Record in state '${current.status}' cannot be deleted or archived. No reachable archive state in lifecycle.`,
                },
              });
              continue;
            }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const result = await (db.updateTable(fullTable) as any)
              .set({
                status:            archiveTarget,
                status_changed_at: new Date(),
                status_changed_by: principalId,
                updated_at:        new Date(),
                updated_by:        principalId,
              })
              .where("id",        "=", id)
              .where("tenant_id", "=", tenantId)
              .where("status",    "=", current.status) // optimistic lock
              .executeTakeFirst() as { numUpdatedRows?: bigint } | undefined;

            if (Number(result?.numUpdatedRows ?? 0) > 0) {
              succeeded.push({ id, success: true });
            } else {
              failed.push({ id, success: false, error: { code: "RECORD_NOT_FOUND", message: "Record modified concurrently" } });
            }
            continue;
          }

          // ── Deletable state (or no lifecycle) → soft-delete ───────────────
          const setClause = hasDeletedAt
            ? { deleted_at: new Date(), deleted_by: principalId, updated_at: new Date(), updated_by: principalId }
            : { status: "deleted" as const, updated_at: new Date(), updated_by: principalId };

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const result = await (db.updateTable(fullTable) as any)
            .set(setClause)
            .where("id",        "=", id)
            .where("tenant_id", "=", tenantId)
            // Don't re-delete already deleted rows — optimistic guard
            .$if(hasDeletedAt, (qb: any) => qb.where("deleted_at" as never, "is", null))
            .executeTakeFirst() as { numUpdatedRows?: bigint } | undefined;

          if (Number(result?.numUpdatedRows ?? 0) > 0) {
            succeeded.push({ id, success: true });
          } else {
            failed.push({ id, success: false, error: { code: "RECORD_NOT_FOUND", message: "Record not found or already deleted" } });
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message.slice(0, 200) : String(err);
          failed.push({ id, success: false, error: { code: "DELETE_FAILED", message: msg } });
        }
      }

      logger?.info("bulk_delete", {
        entity: entityCode, tenantId, hasLifecycle,
        total: ids.length, succeeded: succeeded.length, failed: failed.length,
      });

      const result: BulkOpResult = {
        succeeded: succeeded.length,
        failed:    failed.length,
        rows:      [...succeeded, ...failed],
      };
      res.json({ ok: true, ...result });
    } catch (err) {
      logger?.error("bulk_delete_error", { err: String(err) });
      next(err);
    }
  };

  router.patch("/records/:entity/bulk",  patchHandler);
  router.delete("/records/:entity/bulk", deleteHandler);

  return router;
}
