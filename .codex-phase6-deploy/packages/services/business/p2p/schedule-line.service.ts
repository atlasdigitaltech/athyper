/**
 * Schedule Line Writer Service (Phase 2 tail)
 *
 * Single owner of writes to document.schedule_line. The contract is documented
 * in docs/architecture/p2p.md §5.
 *
 * Polymorphic source types:
 *   purchase_requisition_line  — created on PR line insert
 *   commitment_line            — created on PO line insert (copy-from-PR or buyer-authored)
 *   purchase_invoice_line      — created on PI line insert (non-PO billing-milestone flow only)
 *
 * Schedule kinds:
 *   delivery            — physical/service delivery date (default for PR/PO)
 *   billing_milestone   — invoice-issued-at date (used by milestone-billed POs)
 *   release_window      — open window for blanket POs / framework agreements
 *
 * Versioning lifecycle:
 *   create     → INSERT with is_current_version=true, version_number=1
 *   supersede  → flip prior to is_current_version=false + supersedes_at=now();
 *                INSERT new version with previous_version_id pointing back
 *                and version_number = previous + 1
 *   retire     → set terminal_status='CANCELED' on remaining current versions;
 *                leaves is_current_version=true so historical reads still find it
 *
 * The PO-approve dispatcher (Phase 5.3) consumes
 *   WHERE source_doc_type='commitment_line'
 *     AND source_doc_id   = :commitment_id
 *     AND source_line_id  = :commitment_line_id
 *     AND is_current_version = true
 *     AND terminal_status IS NULL
 *
 * fulfilled_quantity / fulfillment_status are trigger-synced by
 * document.trg_schedule_line_fulfilled_from_* (see 06y_schedule_line_triggers.sql).
 */

import type { Kysely } from "kysely";
import { sql } from "kysely";
import {
  resolveCurrentScheduleLines,
  type P2pPolymorphicSourceType,
} from "./child-current-rows.service.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

export type ScheduleSourceDocType =
  | "purchase_requisition_line"
  | "commitment_line"
  | "purchase_invoice_line";

export type ScheduleKind =
  | "delivery"
  | "billing_milestone"
  | "release_window";

export interface ScheduleLineSpec {
  scheduleNo:        number;
  scheduleKind?:     ScheduleKind;
  scheduledQuantity: number;
  scheduledAmount?:  number | null;
  scheduledDate:     string;            // YYYY-MM-DD
  currencyCode?:     string | null;
  metadata?:         Record<string, unknown>;
}

export interface ScheduleLineRow {
  id:                string;
  schedule_no:       number;
  schedule_kind:     ScheduleKind;
  scheduled_quantity: number;
  scheduled_date:    string;
  fulfilled_quantity: number;
  fulfillment_status: string;
  version_number:    number;
  is_current_version: boolean;
  terminal_status:   string | null;
}

// ──────────────────────────────────────────────────────────────────────────────
// Creation paths
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Create one delivery schedule for a PR line. Called from the PR line-write
 * handler immediately after the line is inserted.
 *
 * The default is a single schedule with the line's required_by_date and full
 * quantity. The line-write handler may pass multiple specs for split
 * deliveries (rare on PRs but supported).
 */
export async function createSchedulesForPrLine(
  db:        AnyDb,
  ctx: {
    tenantId:               string;
    purchaseRequisitionId:  string;
    prLineId:               string;
    principalId:            string;
    specs:                  ScheduleLineSpec[];
  },
): Promise<{ insertedIds: string[] }> {
  if (ctx.specs.length === 0) {
    return { insertedIds: [] };
  }
  return insertSchedules(db, {
    tenantId:      ctx.tenantId,
    sourceDocType: "purchase_requisition_line",
    sourceDocId:   ctx.purchaseRequisitionId,
    sourceLineId:  ctx.prLineId,
    principalId:   ctx.principalId,
    specs:         ctx.specs,
  });
}

/**
 * Create schedules for a commitment (PO) line. Two entry points:
 *   - copyFromPrLineId: when the commitment line is created via PR→PO
 *     conversion, copy the current-version PR schedules into the commitment.
 *   - specs: when the PO is buyer-authored (no PR), the caller supplies the
 *     schedules directly.
 *
 * If copyFromPrLineId is set, specs is ignored.
 */
export async function createSchedulesForCommitmentLine(
  db:        AnyDb,
  ctx: {
    tenantId:           string;
    commitmentId:       string;
    commitmentLineId:   string;
    principalId:        string;
    copyFromPrLineId?:  string | null;
    specs?:             ScheduleLineSpec[];
  },
): Promise<{ insertedIds: string[] }> {
  if (ctx.copyFromPrLineId) {
    const prRows = await getCurrentSchedules(db, ctx.tenantId, "purchase_requisition_line", ctx.copyFromPrLineId);
    const specs: ScheduleLineSpec[] = prRows.map((r) => ({
      scheduleNo:        r.schedule_no,
      scheduleKind:      r.schedule_kind,
      scheduledQuantity: r.scheduled_quantity,
      scheduledDate:     r.scheduled_date,
    }));
    if (specs.length === 0) {
      return { insertedIds: [] };
    }
    return insertSchedules(db, {
      tenantId:      ctx.tenantId,
      sourceDocType: "commitment_line",
      sourceDocId:   ctx.commitmentId,
      sourceLineId:  ctx.commitmentLineId,
      principalId:   ctx.principalId,
      specs,
    });
  }

  const specs = ctx.specs ?? [];
  if (specs.length === 0) {
    return { insertedIds: [] };
  }
  return insertSchedules(db, {
    tenantId:      ctx.tenantId,
    sourceDocType: "commitment_line",
    sourceDocId:   ctx.commitmentId,
    sourceLineId:  ctx.commitmentLineId,
    principalId:   ctx.principalId,
    specs,
  });
}

/**
 * Create billing-milestone schedules for a non-PO PI line. Used when the
 * invoice carries milestone-based billing dates (no goods receipt trail).
 */
export async function createBillingMilestoneSchedulesForPiLine(
  db:        AnyDb,
  ctx: {
    tenantId:          string;
    purchaseInvoiceId: string;
    piLineId:          string;
    principalId:       string;
    specs:             ScheduleLineSpec[];
  },
): Promise<{ insertedIds: string[] }> {
  if (ctx.specs.length === 0) {
    return { insertedIds: [] };
  }
  const stamped = ctx.specs.map((s) => ({ ...s, scheduleKind: "billing_milestone" as const }));
  return insertSchedules(db, {
    tenantId:      ctx.tenantId,
    sourceDocType: "purchase_invoice_line",
    sourceDocId:   ctx.purchaseInvoiceId,
    sourceLineId:  ctx.piLineId,
    principalId:   ctx.principalId,
    specs:         stamped,
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Lifecycle ops
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Supersede the current schedules for a source line and write new versions.
 * Used on POC amendment-accepted and PI amendment publish.
 *
 *   - For each current-version row owned by sourceLineId:
 *       set is_current_version=false, supersedes_at=now()
 *   - Insert the new specs with version_number = prev_max + 1 and
 *     previous_version_id pointing to the just-superseded row
 *     (matched by schedule_no).
 */
export async function supersedeSchedulesForLine(
  db:        AnyDb,
  ctx: {
    tenantId:      string;
    sourceDocType: ScheduleSourceDocType;
    sourceDocId:   string;
    sourceLineId:  string;
    principalId:   string;
    newSpecs:      ScheduleLineSpec[];
  },
): Promise<{ insertedIds: string[]; supersededCount: number }> {
  const current = await getCurrentSchedules(
    db, ctx.tenantId, ctx.sourceDocType, ctx.sourceLineId,
  );

  // Flip current rows to superseded (atomic with the new inserts below)
  const flipResult = await sql<{ id: string; schedule_no: number; version_number: number }>`
    UPDATE document.schedule_line
       SET is_current_version = false,
           supersedes_at      = now(),
           status             = 'superseded',
           updated_at         = now(),
           updated_by         = ${ctx.principalId}::uuid,
           row_version        = row_version + 1
     WHERE tenant_id          = ${ctx.tenantId}::uuid
       AND source_doc_type    = ${ctx.sourceDocType}::text
       AND source_line_id     = ${ctx.sourceLineId}::uuid
       AND is_current_version = true
       AND terminal_status    IS NULL
   RETURNING id, schedule_no, version_number
  `.execute(db);

  // Build a previous-version map: schedule_no → { id, version_number }
  const prevMap = new Map<number, { id: string; version: number }>();
  for (const row of flipResult.rows) {
    prevMap.set(row.schedule_no, { id: row.id, version: row.version_number });
  }
  // Also include the snapshot from getCurrentSchedules in case the UPDATE missed any
  for (const row of current) {
    if (!prevMap.has(row.schedule_no)) {
      prevMap.set(row.schedule_no, { id: row.id, version: row.version_number });
    }
  }

  const insertedIds: string[] = [];
  for (const spec of ctx.newSpecs) {
    const prev = prevMap.get(spec.scheduleNo);
    const nextVersion = (prev?.version ?? 0) + 1;
    const result = await sql<{ id: string }>`
      INSERT INTO document.schedule_line (
        tenant_id, source_doc_type, source_doc_id, source_line_id,
        schedule_no, schedule_kind,
        scheduled_quantity, scheduled_amount, scheduled_date, currency_code,
        version_number, previous_version_id, is_current_version,
        metadata, status, created_by
      ) VALUES (
        ${ctx.tenantId}::uuid,
        ${ctx.sourceDocType}::text,
        ${ctx.sourceDocId}::uuid,
        ${ctx.sourceLineId}::uuid,
        ${spec.scheduleNo}::smallint,
        ${spec.scheduleKind ?? "delivery"}::text,
        ${spec.scheduledQuantity}::numeric,
        ${spec.scheduledAmount ?? null}::numeric,
        ${spec.scheduledDate}::date,
        ${spec.currencyCode ?? null}::char(3),
        ${nextVersion}::int,
        ${prev?.id ?? null}::uuid,
        true,
        ${JSON.stringify(spec.metadata ?? {})}::jsonb,
        'active',
        ${ctx.principalId}::uuid
      ) RETURNING id
    `.execute(db);
    if (result.rows[0]) {
      insertedIds.push(result.rows[0].id);
    }
  }

  return { insertedIds, supersededCount: flipResult.rows.length };
}

/**
 * Retire all current-version schedules for a source line. Used on PO cancel /
 * short_close. terminal_status='CANCELED' is sticky — these rows cannot be
 * re-activated; history is preserved (is_current_version stays true).
 */
export async function retireSchedulesForLine(
  db:        AnyDb,
  ctx: {
    tenantId:      string;
    sourceDocType: ScheduleSourceDocType;
    sourceLineId:  string;
    principalId:   string;
    reason?:       string;
  },
): Promise<{ retiredCount: number }> {
  const result = await sql<{ id: string }>`
    UPDATE document.schedule_line
       SET terminal_status    = 'CANCELED',
           status             = 'retired',
           status_source      = 'terminal',
           metadata           = COALESCE(metadata, '{}'::jsonb)
                              || jsonb_build_object(
                                   'retired_at',     to_jsonb(now()),
                                   'retired_by',     to_jsonb(${ctx.principalId}::uuid),
                                   'retired_reason', ${ctx.reason ?? null}::text
                                 ),
           updated_at         = now(),
           updated_by         = ${ctx.principalId}::uuid,
           row_version        = row_version + 1
     WHERE tenant_id          = ${ctx.tenantId}::uuid
       AND source_doc_type    = ${ctx.sourceDocType}::text
       AND source_line_id     = ${ctx.sourceLineId}::uuid
       AND is_current_version = true
       AND terminal_status    IS NULL
   RETURNING id
  `.execute(db);
  return { retiredCount: result.rows.length };
}

// ──────────────────────────────────────────────────────────────────────────────
// Reads
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Read the current-version, non-terminal schedules for a source line.
 * This is the contract the PO-approve dispatcher consumes.
 */
export async function getCurrentSchedules(
  db:           AnyDb,
  tenantId:     string,
  sourceDocType: ScheduleSourceDocType,
  sourceLineId: string,
): Promise<ScheduleLineRow[]> {
  // Read goes through the shared resolver so the "current" rule
  // (is_current_version=true AND terminal_status IS NULL) lives in
  // child-current-rows.service.ts only. The narrow projection is rebuilt
  // here so this function's typed return shape stays stable for callers.
  const rows = await resolveCurrentScheduleLines(db, {
    tenantId,
    sourceDocType: sourceDocType as P2pPolymorphicSourceType,
    sourceLineId,
  });
  return rows.map((row): ScheduleLineRow => ({
    id:                 String(row["id"]),
    schedule_no:        Number(row["schedule_no"]),
    schedule_kind:      row["schedule_kind"] as ScheduleKind,
    scheduled_quantity: Number(row["scheduled_quantity"]),
    scheduled_date:     String(row["scheduled_date"]),
    fulfilled_quantity: Number(row["fulfilled_quantity"] ?? 0),
    fulfillment_status: String(row["fulfillment_status"] ?? ""),
    version_number:     Number(row["version_number"]),
    is_current_version: Boolean(row["is_current_version"]),
    terminal_status:    row["terminal_status"] == null ? null : String(row["terminal_status"]),
  }));
}

// ──────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ──────────────────────────────────────────────────────────────────────────────

async function insertSchedules(
  db: AnyDb,
  ctx: {
    tenantId:      string;
    sourceDocType: ScheduleSourceDocType;
    sourceDocId:   string;
    sourceLineId:  string;
    principalId:   string;
    specs:         ScheduleLineSpec[];
  },
): Promise<{ insertedIds: string[] }> {
  const insertedIds: string[] = [];
  for (const spec of ctx.specs) {
    const result = await sql<{ id: string }>`
      INSERT INTO document.schedule_line (
        tenant_id, source_doc_type, source_doc_id, source_line_id,
        schedule_no, schedule_kind,
        scheduled_quantity, scheduled_amount, scheduled_date, currency_code,
        version_number, is_current_version,
        metadata, status, created_by
      ) VALUES (
        ${ctx.tenantId}::uuid,
        ${ctx.sourceDocType}::text,
        ${ctx.sourceDocId}::uuid,
        ${ctx.sourceLineId}::uuid,
        ${spec.scheduleNo}::smallint,
        ${spec.scheduleKind ?? "delivery"}::text,
        ${spec.scheduledQuantity}::numeric,
        ${spec.scheduledAmount ?? null}::numeric,
        ${spec.scheduledDate}::date,
        ${spec.currencyCode ?? null}::char(3),
        1::int,
        true,
        ${JSON.stringify(spec.metadata ?? {})}::jsonb,
        'active',
        ${ctx.principalId}::uuid
      ) RETURNING id
    `.execute(db);
    if (result.rows[0]) {
      insertedIds.push(result.rows[0].id);
    }
  }
  return { insertedIds };
}
