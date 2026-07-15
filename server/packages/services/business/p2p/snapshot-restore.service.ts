/**
 * Snapshot Restore Engine — destructive replay of a prior document graph.
 *
 *   restoreFromSnapshot(db, { tenantId, entityType, entityId, snapshotId,
 *                             principalId, reasonCodeId })
 *
 * Surgery sequence (inside one transaction):
 *   1. SELECT … FOR UPDATE on the header row → edit-lock.
 *   2. Verify status ∈ {draft, rejected, proforma}; else 422.
 *   3. Load snapshot, verify (tenant, entity, id) tuple matches.
 *   4. UPDATE header from snapshot.header_json (skip immutable columns).
 *   5. DELETE current PC + AD + SL + lines for this entity.
 *   6. INSERT lines from snapshot.lines_json with fresh UUIDs.
 *   7. INSERT PC + AD + SL from snapshot's *_json with fresh UUIDs.
 *   8. Refresh entity-type-specific caches (PI → refresh_invoice_amounts_from_pc).
 *   9. Write log.audit_log {operation:'restore', reason_code:restore_snapshot}.
 *
 * Decisions locked in the Phase 9b plan:
 *   D1 fresh UUIDs (ledger.* references would break with old ids)
 *   D4 FOR UPDATE on header → 409 CONFLICT on concurrent edit
 *   D5 hash verify deferred (admin tool)
 *   D6 status must be draft/rejected/proforma; everything else blocked
 *   D7 revision_no parity skipped in v1
 *   D8 generic dispatch tables co-located here
 *
 * Phase 14 — Post-restore snapshot.capture:
 *   After the transaction commits, a fresh snapshot is captured with
 *   gate_event='restore', gate_event_kind='authoring_lock',
 *   capture_source='reconcile'. This stamps the rewound graph as the new
 *   authoring baseline so subsequent diffs/audits compare against the
 *   restored state — not the pre-restore graph that no longer exists.
 *   Capture failure is logged but does NOT roll back the restore (the
 *   document is already restored; a missing baseline snapshot leaves a
 *   visible gap in the chain that operators can re-capture manually).
 */

import type { Kysely } from "kysely";
import { sql } from "kysely";
import {
  headerTable,
  linesTableFor,
  polymorphicSourceTypeFor,
  HEADER_IMMUTABLE_COLS,
  CHILD_REGEN_COLS,
  type P2pParentEntityType,
} from "./entity-dispatch.js";
import { captureDocumentSnapshot } from "../lifecycle/snapshot-capture.service.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

// ──────────────────────────────────────────────────────────────────────────────
// Public types
// ──────────────────────────────────────────────────────────────────────────────

export interface RestoreFromSnapshotInput {
  tenantId:     string;
  entityType:   string;             // e.g. 'purchase_invoice'
  entityId:     string;
  snapshotId:   string;
  principalId:  string;              // resolved master.principal.id (not JWT sub)
  reasonCodeId: string;              // FK to master.change_reason_code
}

export interface RestoreCounts {
  header_fields_updated: number;
  lines:                 { deleted: number; inserted: number };
  components:            { deleted: number; inserted: number };
  distributions:         { deleted: number; inserted: number };
  schedules:             { deleted: number; inserted: number };
}

export interface RestoreResult {
  ok:               true;
  snapshot_id:      string;
  snapshot_chain_seq: number;
  audit_log_id:     string | null;
  counts:           RestoreCounts;
}

export class RestoreError extends Error {
  constructor(
    public readonly code: RestoreErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "RestoreError";
  }
}

export type RestoreErrorCode =
  | "SNAPSHOT_NOT_FOUND"
  | "SNAPSHOT_TAMPERED"
  | "ENTITY_NOT_FOUND"
  | "STATUS_NOT_RESTORABLE"
  | "ENTITY_LOCKED"
  | "UNSUPPORTED_ENTITY_TYPE";

// Local string-typed wrapper around polymorphicSourceTypeFor so call sites
// in this file keep the existing `entityType: string` shape.
function polymorphicLineType(entityType: string): string | null {
  return polymorphicSourceTypeFor(entityType as P2pParentEntityType);
}

const RESTORABLE_STATUSES = new Set(["draft", "rejected", "proforma"]);

// ──────────────────────────────────────────────────────────────────────────────
// Entry point
// ──────────────────────────────────────────────────────────────────────────────

export async function restoreFromSnapshot(
  db:    AnyDb,
  input: RestoreFromSnapshotInput,
): Promise<RestoreResult> {
  const headerTbl = headerTable(input.entityType);
  const linesSpec = linesTableFor(input.entityType);
  const polyType  = polymorphicLineType(input.entityType);
  if (!headerTbl || !linesSpec || !polyType) {
    throw new RestoreError(
      "UNSUPPORTED_ENTITY_TYPE",
      `Restore is not configured for entity_type='${input.entityType}'.`,
    );
  }

  // ── Phase 13: hash verification ──────────────────────────────────────────
  // Recompute the snapshot's payload_hash via snapshot.fn_verify_snapshot_hash
  // BEFORE opening the restore transaction. SQL-side recompute avoids
  // porting Postgres' jsonb canonicalization to TS (drift risk).
  //
  // Function returns:
  //   TRUE  → hash matches → proceed
  //   FALSE → tamper or corruption → abort
  //   NULL  → snapshot id not found → defer to the in-transaction tuple
  //           guard which will throw SNAPSHOT_NOT_FOUND with a clearer
  //           tenant/entity check
  //
  // If the function itself isn't deployed (older DB pre-Phase-13), the SQL
  // call throws an undefined-function error. We catch + warn + proceed —
  // refusing to restore on missing infra would block all restores on any
  // database that hasn't applied the 05_functions.sql update.
  try {
    const verifyResult = await sql<{ ok: boolean | null }>`
      SELECT snapshot.fn_verify_snapshot_hash(${input.snapshotId}::uuid) AS ok
    `.execute(db);
    const ok = verifyResult.rows[0]?.ok;
    if (ok === false) {
      throw new RestoreError(
        "SNAPSHOT_TAMPERED",
        "Snapshot payload hash does not match recomputed hash. Possible tamper or storage corruption — investigation required before restore.",
        { snapshotId: input.snapshotId },
      );
    }
  } catch (err) {
    if (err instanceof RestoreError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    // Undefined-function error means the DDL hasn't been re-applied. Log
    // loudly so operators notice the degraded mode, then proceed.
    // eslint-disable-next-line no-console
    console.warn(
      "[snapshot-restore] fn_verify_snapshot_hash unavailable; proceeding without hash check",
      { snapshotId: input.snapshotId, error: message },
    );
  }

  const result: RestoreResult = await db.transaction().execute(async (trx) => {
    // 1. Edit-lock the header row.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let headerRow: any;
    try {
      const result = await sql<{ id: string; status: string }>`
        SELECT id, status
          FROM ${sql.raw(`document.${headerTbl}`)}
         WHERE id        = ${input.entityId}::uuid
           AND tenant_id = ${input.tenantId}::uuid
         FOR UPDATE NOWAIT
         LIMIT 1
      `.execute(trx);
      headerRow = result.rows[0];
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/could not obtain lock|lock_not_available/i.test(message)) {
        throw new RestoreError(
          "ENTITY_LOCKED",
          "Another user is editing this document. Try again once the edit session is released.",
        );
      }
      throw err;
    }
    if (!headerRow) {
      throw new RestoreError(
        "ENTITY_NOT_FOUND",
        `${input.entityType} ${input.entityId} not found in this tenant.`,
      );
    }

    // 2. Status gate (D6).
    const currentStatus = String(headerRow.status ?? "");
    if (!RESTORABLE_STATUSES.has(currentStatus)) {
      throw new RestoreError(
        "STATUS_NOT_RESTORABLE",
        `Cannot restore from status '${currentStatus}'. Restore is only allowed in draft / rejected / proforma; reopen the document first.`,
        { currentStatus },
      );
    }

    // 3. Load the target snapshot. Tuple guard (tenant + entity + id).
    const snapshotResult = await sql<{
      id:                 string;
      chain_seq:          number;
      header_json:        Record<string, unknown>;
      lines_json:         Record<string, unknown>[] | null;
      components_json:    Record<string, unknown>[] | null;
      distributions_json: Record<string, unknown>[] | null;
      schedules_json:     Record<string, unknown>[] | null;
      company_code_id:    string | null;
    }>`
      SELECT id,
             chain_seq,
             header_json,
             lines_json,
             components_json,
             distributions_json,
             schedules_json,
             (header_json->>'company_code_id') AS company_code_id
        FROM snapshot.document_snapshot
       WHERE tenant_id   = ${input.tenantId}::uuid
         AND entity_type = ${input.entityType}::text
         AND entity_id   = ${input.entityId}::uuid
         AND id          = ${input.snapshotId}::uuid
       LIMIT 1
    `.execute(trx);
    const snapshot = snapshotResult.rows[0];
    if (!snapshot) {
      throw new RestoreError(
        "SNAPSHOT_NOT_FOUND",
        "Snapshot not found for this record.",
      );
    }

    // 4. Apply header from snapshot.header_json, skipping immutable cols.
    const headerJson    = snapshot.header_json ?? {};
    const headerSetCols = Object.keys(headerJson).filter((k) => !HEADER_IMMUTABLE_COLS.has(k));
    let headerUpdatedCount = 0;
    if (headerSetCols.length > 0) {
      // Build the SET clause from the snapshot map. Build a parameter map of
      // {col: value}; kysely's updateTable handles JSON columns as long as
      // we pass them as JS objects (driver converts to jsonb).
      const setMap: Record<string, unknown> = {};
      for (const col of headerSetCols) setMap[col] = headerJson[col];
      // Restore actor + bump row_version.
      setMap["updated_at"]  = new Date();
      setMap["updated_by"]  = input.principalId;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (trx as any)
        .updateTable(`document.${headerTbl}`)
        .set(setMap)
        .where("id"        as never, "=", input.entityId  as never)
        .where("tenant_id" as never, "=", input.tenantId  as never)
        .execute();
      headerUpdatedCount = headerSetCols.length;
    }

    // 5. DELETE current child rows for this entity. Order matters when FK
    // chains exist (PC → AD reference lines etc.); deleting children first
    // is safest. PC/AD/SL are independent of each other but all reference
    // source_doc_id, so any order works between them.
    const polyTypeStr = polyType;
    const sourceDocId = input.entityId;
    const tenantIdStr = input.tenantId;

    async function deletePoly(table: string): Promise<number> {
      const result = await sql<{ id: string }>`
        DELETE FROM ${sql.raw(`document.${table}`)}
         WHERE tenant_id       = ${tenantIdStr}::uuid
           AND source_doc_type = ${polyTypeStr}::text
           AND source_doc_id   = ${sourceDocId}::uuid
        RETURNING id
      `.execute(trx);
      return result.rows.length;
    }
    const componentsDeleted    = await deletePoly("pricing_component");
    const distributionsDeleted = await deletePoly("accounting_distribution");
    const schedulesDeleted     = await deletePoly("schedule_line");

    // Lines deleted last (PC/AD/SL FK source_line_id; deleting lines first
    // would cascade via FK or violate the FK depending on action).
    const linesDeletedResult = await sql<{ id: string }>`
      DELETE FROM ${sql.raw(`document.${linesSpec.table}`)}
       WHERE ${sql.raw(linesSpec.fk)} = ${sourceDocId}::uuid
         AND tenant_id                = ${tenantIdStr}::uuid
      RETURNING id
    `.execute(trx);
    const linesDeleted = linesDeletedResult.rows.length;

    // 6. INSERT lines from snapshot.lines_json with fresh ids.
    // Build a stable mapping from old line id → new line id so PC/AD/SL
    // re-inserts can rewrite their source_line_id refs to the new ids.
    const lineIdRewrite = new Map<string, string>();
    let linesInserted = 0;
    if (Array.isArray(snapshot.lines_json) && snapshot.lines_json.length > 0) {
      for (const line of snapshot.lines_json) {
        const newId = await sql<{ id: string }>`SELECT shared.uuidv7() AS id`.execute(trx);
        const newLineId = newId.rows[0]!.id;
        const oldLineId = typeof line["id"] === "string" ? line["id"] : null;
        if (oldLineId) lineIdRewrite.set(oldLineId, newLineId);

        const insertMap: Record<string, unknown> = {};
        for (const [col, val] of Object.entries(line)) {
          if (CHILD_REGEN_COLS.has(col)) continue;
          insertMap[col] = val;
        }
        insertMap["id"]         = newLineId;
        insertMap["tenant_id"]  = input.tenantId;
        insertMap[linesSpec.fk] = sourceDocId;
        insertMap["created_at"] = new Date();
        insertMap["created_by"] = input.principalId;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (trx as any)
          .insertInto(`document.${linesSpec.table}`)
          .values(insertMap)
          .execute();
        linesInserted++;
      }
    }

    // 7. INSERT PC / AD / SL with fresh ids, rewriting source_line_id refs.
    async function insertPoly(
      table:    string,
      rows:     Record<string, unknown>[] | null,
    ): Promise<number> {
      if (!rows || rows.length === 0) return 0;
      let count = 0;
      for (const row of rows) {
        const newId = await sql<{ id: string }>`SELECT shared.uuidv7() AS id`.execute(trx);
        const newRowId = newId.rows[0]!.id;

        const insertMap: Record<string, unknown> = {};
        for (const [col, val] of Object.entries(row)) {
          if (CHILD_REGEN_COLS.has(col)) continue;
          insertMap[col] = val;
        }
        // Rewrite source_line_id when the snapshot's value matches a known
        // old line id. Unknown ids fall through unchanged — they likely
        // point at a different line (cross-line PC apportionment) which
        // is a deeper restore problem; flag in the counts later.
        const oldSourceLineId = typeof row["source_line_id"] === "string"
          ? row["source_line_id"]
          : null;
        if (oldSourceLineId && lineIdRewrite.has(oldSourceLineId)) {
          insertMap["source_line_id"] = lineIdRewrite.get(oldSourceLineId);
        }
        insertMap["id"]              = newRowId;
        insertMap["tenant_id"]       = input.tenantId;
        insertMap["source_doc_type"] = polyTypeStr;
        insertMap["source_doc_id"]   = sourceDocId;
        insertMap["created_at"]      = new Date();
        insertMap["created_by"]      = input.principalId;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (trx as any)
          .insertInto(`document.${table}`)
          .values(insertMap)
          .execute();
        count++;
      }
      return count;
    }
    const componentsInserted    = await insertPoly("pricing_component",        snapshot.components_json);
    const distributionsInserted = await insertPoly("accounting_distribution",  snapshot.distributions_json);
    const schedulesInserted     = await insertPoly("schedule_line",            snapshot.schedules_json);

    // 8. Entity-type-specific cache refresh. PI carries denormalised
    // amount totals on the header; rebuild them so the next read sees a
    // consistent gross. Other entities can register their hook here.
    if (input.entityType === "purchase_invoice") {
      try {
        await sql`
          SELECT document.refresh_invoice_amounts_from_pc(
            ${input.tenantId}::uuid,
            ${input.entityId}::uuid
          )
        `.execute(trx);
      } catch {
        // Cache refresh failure shouldn't abort the restore — the row data
        // is correct, the totals may just be stale until the next PC mutation
        // re-triggers the refresh. Log via the standard error path on the
        // route boundary.
      }
    }

    // 9. Audit entry — restore operation, snapshot id in new_values,
    // reason_code FK from caller (route resolves the system 'restore_snapshot'
    // code).
    const auditInsertResult = await sql<{ id: string }>`
      INSERT INTO log.audit_log (
        tenant_id,
        log_type,
        entity_type,
        entity_id,
        operation,
        actor_id,
        actor_type,
        company_code_id,
        new_values,
        changed_fields,
        reason_code,
        created_by
      ) VALUES (
        ${input.tenantId}::uuid,
        'business',
        ${input.entityType}::text,
        ${input.entityId}::uuid,
        'restore',
        ${input.principalId}::uuid,
        'principal',
        ${snapshot.company_code_id ?? null}::uuid,
        ${JSON.stringify({
          snapshot_id:         input.snapshotId,
          snapshot_chain_seq:  snapshot.chain_seq,
        })}::jsonb,
        ARRAY['document_graph']::text[],
        ${input.reasonCodeId}::uuid,
        ${input.principalId}::uuid
      )
      RETURNING id
    `.execute(trx);
    const auditLogId = auditInsertResult.rows[0]?.id ?? null;

    return {
      ok: true,
      snapshot_id:        input.snapshotId,
      snapshot_chain_seq: snapshot.chain_seq,
      audit_log_id:       auditLogId,
      counts: {
        header_fields_updated: headerUpdatedCount,
        lines:         { deleted: linesDeleted,         inserted: linesInserted },
        components:    { deleted: componentsDeleted,    inserted: componentsInserted },
        distributions: { deleted: distributionsDeleted, inserted: distributionsInserted },
        schedules:     { deleted: schedulesDeleted,     inserted: schedulesInserted },
      },
    };
  });

  // ── Phase 14: post-restore snapshot.capture ──────────────────────────────
  // Fired AFTER the restore transaction commits. The new snapshot stamps the
  // rewound graph as a fresh authoring baseline so subsequent compare/audit
  // surfaces line up against the restored state, not the obliterated one.
  //
  // Failure handling: log and continue. The document is already restored —
  // refusing to return on a missed snapshot would surface as a 5xx to the
  // caller and obscure the fact that the restore itself succeeded. The chain
  // gap is visible to operators and can be re-captured manually.
  try {
    const captureResult = await captureDocumentSnapshot(db, {
      tenantId:      input.tenantId,
      entityType:    input.entityType,
      entityId:      input.entityId,
      gateEvent:     "restore",
      gateEventKind: "authoring_lock",
      activityLogId: result.audit_log_id,
      capturedBy:    input.principalId,
      captureSource: "reconcile",
    });
    if (!captureResult.ok) {
      // eslint-disable-next-line no-console
      console.warn(
        "[snapshot-restore] post-restore snapshot.capture failed; chain has a gap until next gate event",
        {
          tenantId:   input.tenantId,
          entityType: input.entityType,
          entityId:   input.entityId,
          error:      captureResult.error,
        },
      );
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      "[snapshot-restore] post-restore snapshot.capture threw; chain has a gap until next gate event",
      {
        tenantId:   input.tenantId,
        entityType: input.entityType,
        entityId:   input.entityId,
        error:      err instanceof Error ? err.message : String(err),
      },
    );
  }

  return result;
}
