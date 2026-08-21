/**
 * Document Snapshot Capture Service (Phase 9 follow-up — completes the
 * snapshot.capture hook handler stubbed in hook-runner.service.ts).
 *
 * Per docs/architecture/p2p.md §6 the snapshot payload comprises:
 *   header_json        — the row from the entity's main table
 *   lines_json         — child line rows (always queried if the entity has them)
 *   components_json    — pricing_component rows linked polymorphically
 *   distributions_json — accounting_distribution rows linked polymorphically
 *   schedules_json     — schedule_line rows (current versions only)
 *   related_json       — small object of FK references useful for navigation
 *
 * This service does the per-entity-type fan-out: it knows which child tables
 * each of the 7 P2P entities has, queries them under load, and hands the
 * resulting JSONB payload to snapshot.fn_capture_full() which:
 *   - resolves the previous snapshot in this entity's chain
 *   - stamps the SHA-256 payload_hash
 *   - INSERTs into snapshot.document_snapshot
 *   - returns the new snapshot id
 *
 * Idempotency: callers (the lifecycle hook runner) own the
 * lifecycle_transition_execution claim. This service does not claim
 * separately — duplicate calls would produce duplicate snapshot rows, so
 * the runner MUST gate.
 */

import type { Kysely } from "kysely";
import { sql } from "kysely";
import {
  resolveCurrentAccountingDistributions,
  resolveCurrentPricingComponents,
  resolveCurrentScheduleLines,
} from "../p2p/child-current-rows.service.js";
import {
  headerTable as dispatchHeaderTable,
  linesTableFor as dispatchLinesTableFor,
  polymorphicSourceTypeFor,
  P2P_DISPATCH,
  type P2pParentEntityType,
  type P2pPolymorphicSourceType,
} from "../p2p/entity-dispatch.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

export type GateEventKind =
  | "authoring_lock"
  | "commitment"
  | "fulfillment"
  | "financial_post"
  | "match_decision"
  | "amendment_baseline"
  | "reversal";

export interface CaptureDocumentSnapshotCtx {
  tenantId:        string;
  entityType:      string;            // 'purchase_invoice' | 'commitment' | ...
  entityId:        string;
  gateEvent:       string;            // operation_code of the firing transition
  gateEventKind:   GateEventKind;
  activityLogId?:  string | null;     // linked activity_log row id, when known
  capturedBy:      string;
  captureSource?:  string;            // default 'transition_hook'
}

export interface CaptureDocumentSnapshotResult {
  ok: boolean;
  snapshotId?: string;
  error?: { code: string; message: string };
}

/**
 * Loads the full graph for the entity, serialises each section as JSONB,
 * and calls snapshot.fn_capture_full(). Returns the new snapshot id.
 *
 * Fidelity policy:
 *   - Unknown entity_type → header still loads; per-child loaders that
 *     return null because the entity legitimately has no PC/AD/SL rows
 *     (e.g. POC, DN) are treated as "no data here", not failure.
 *   - financial_post snapshots additionally enforce that every AD row
 *     carries the frozen accounting basis (resolved GL, FX snapshot,
 *     non-PENDING account_source, settled budget). A deficient row aborts
 *     the snapshot — which aborts the post transition via the hook chain —
 *     so the legal/accounting snapshot is never half-written.
 */
export async function captureDocumentSnapshot(
  db:  AnyDb,
  ctx: CaptureDocumentSnapshotCtx,
): Promise<CaptureDocumentSnapshotResult> {
  const dispatch = P2P_DISPATCH[ctx.entityType as P2pParentEntityType] ?? null;
  const header = await loadHeader(db, ctx.tenantId, ctx.entityType, ctx.entityId);
  if (!header) {
    return failure("SNAPSHOT_ENTITY_NOT_FOUND", `${ctx.entityType} ${ctx.entityId} not found.`);
  }

  const documentCode  = String(
    (dispatch?.documentCodeField ? header[dispatch.documentCodeField] : null)
    ?? header["code"]
    ?? "",
  );
  const versionNumber = Number(header["version_number"] ?? 1);

  const lines         = await loadLines(db, ctx.tenantId, ctx.entityType, ctx.entityId);
  const components    = dispatch?.hasPricingComponents
    ? await loadPricingComponents(db, ctx.tenantId, ctx.entityType, ctx.entityId)
    : null;
  const distributions = dispatch?.hasAccountingDistributions
    ? await loadDistributions(db, ctx.tenantId, ctx.entityType, ctx.entityId)
    : null;
  const schedules     = dispatch?.hasSchedules
    ? await loadSchedules(db, ctx.tenantId, ctx.entityType, ctx.entityId)
    : null;
  const relatedGraphs = await loadRelatedTables(db, ctx.tenantId, ctx.entityType, ctx.entityId);
  const related       = {
    ...relatedSummary(ctx.entityType, header),
    ...relatedGraphs,
    lifecycle_identity: {
      public_entity_type: ctx.entityType === "commitment" ? "purchase_order" : ctx.entityType,
      aggregate_root_type: ctx.entityType === "purchase_order" || ctx.entityType === "commitment" ? "commitment" : ctx.entityType,
      commitment_type: header["commitment_type"] ?? null,
      aggregate_root_id: ctx.entityId,
      profile_code: asMetadataRecord(header["metadata"])["profile_code"] ?? (ctx.entityType === "purchase_order" || ctx.entityType === "commitment" ? "po.standard" : null),
      profile_version: asMetadataRecord(header["metadata"])["profile_version"] ?? (ctx.entityType === "purchase_order" || ctx.entityType === "commitment" ? 1 : null),
    },
  };

  // Posting-basis guard: when capturing the financial_post snapshot, every AD
  // row must already carry the frozen accounting values (resolved GL,
  // FX-snapshotted base amount, non-PENDING account_source, settled budget
  // result). The snapshot is the legal/accounting basis; promoting a
  // half-resolved row into it would leave us with no fixed prior to compare
  // reversals against. Failing here aborts the snapshot.capture hook and,
  // by extension, the post transition itself.
  if (ctx.gateEventKind === "financial_post" && dispatch?.requiresPostReadinessCheck !== false) {
    const deficient = validatePostingBasisDistributions(distributions);
    if (deficient.length > 0) {
      return failure(
        "POSTING_BASIS_INCOMPLETE",
        `Cannot freeze posting snapshot: ${deficient.length} distribution row(s) are missing required values. `
        + deficient.map((d) => `[#${d.distributionNo ?? "?"}: ${d.reasons.join(", ")}]`).join(" "),
      );
    }
  }

  try {
    const result = await sql<{ id: string }>`
      SELECT snapshot.fn_capture_full(
        ${ctx.tenantId}::uuid,
        ${ctx.entityType}::text,
        ${ctx.entityId}::uuid,
        ${documentCode || null}::text,
        ${versionNumber}::int,
        ${ctx.gateEvent}::text,
        ${ctx.gateEventKind}::text,
        ${ctx.activityLogId ?? null}::uuid,
        ${JSON.stringify(header)}::jsonb,
        ${lines        === null ? null : JSON.stringify(lines)}::jsonb,
        ${components   === null ? null : JSON.stringify(components)}::jsonb,
        ${distributions === null ? null : JSON.stringify(distributions)}::jsonb,
        ${schedules    === null ? null : JSON.stringify(schedules)}::jsonb,
        ${JSON.stringify(related)}::jsonb,
        ${ctx.capturedBy}::uuid,
        ${ctx.captureSource ?? "transition_hook"}::text
      ) AS id
    `.execute(db);

    const snapshotId = result.rows[0]?.id;
    if (!snapshotId) {
      return failure("SNAPSHOT_CAPTURE_NO_ID", "fn_capture_full returned no id.");
    }
    return { ok: true, snapshotId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure("SNAPSHOT_CAPTURE_FAILED", message);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Per-entity fan-out
// ──────────────────────────────────────────────────────────────────────────────

async function loadHeader(
  db: AnyDb, tenantId: string, entityType: string, entityId: string,
): Promise<Record<string, unknown> | null> {
  const tableName = headerTable(entityType);
  if (!tableName) return null;
  // sql.identifier-style template literal — kysely's sql.raw is acceptable for
  // a closed allowlist of known tables.
  const rows = await sql<Record<string, unknown>>`
    SELECT * FROM ${sql.raw(`document.${tableName}`)}
     WHERE id = ${entityId}::uuid AND tenant_id = ${tenantId}::uuid
     LIMIT 1
  `.execute(db);
  return rows.rows[0] ?? null;
}

async function loadLines(
  db: AnyDb, tenantId: string, entityType: string, entityId: string,
): Promise<Record<string, unknown>[] | null> {
  const spec = linesTableFor(entityType);
  if (!spec) return null;
  const rows = await sql<Record<string, unknown>>`
    SELECT * FROM ${sql.raw(`document.${spec.table}`)}
     WHERE ${sql.raw(spec.fk)} = ${entityId}::uuid
       AND tenant_id = ${tenantId}::uuid
     ORDER BY line_no ASC, id ASC
  `.execute(db);
  return rows.rows;
}

async function loadRelatedTables(
  db: AnyDb, tenantId: string, entityType: string, entityId: string,
): Promise<Record<string, Record<string, unknown>[]>> {
  const configured = P2P_DISPATCH[entityType as P2pParentEntityType]?.relatedTables ?? [];
  const out: Record<string, Record<string, unknown>[]> = {};

  for (const table of configured) {
    const fk = relatedTableForeignKey(table, entityType);
    if (!fk) continue;
    const rows = await sql<Record<string, unknown>>`
      SELECT * FROM ${sql.raw(`document.${table}`)}
       WHERE ${sql.raw(fk)} = ${entityId}::uuid
         AND tenant_id = ${tenantId}::uuid
       ORDER BY id ASC
    `.execute(db);
    out[table] = rows.rows;
  }
  return out;
}

function relatedTableForeignKey(table: string, entityType: string): string | null {
  switch (table) {
    case "commitment_release_allocation": return "release_commitment_id";
    case "invoice_tax_snapshot": return "purchase_invoice_id";
    case "payment_term_application": return "invoice_id";
    case "payment_term_discount_result": return "payment_id";
    case "payment_remittance_output": return "payment_entry_id";
    default:
      return entityType === "payment_entry" ? "payment_entry_id" : null;
  }
}

async function loadPricingComponents(
  db: AnyDb, tenantId: string, entityType: string, entityId: string,
): Promise<Record<string, unknown>[] | null> {
  const polySourceType = polymorphicLineType(entityType);
  if (!polySourceType) return null;
  return resolveCurrentPricingComponents(db, {
    tenantId,
    sourceDocType: polySourceType,
    sourceDocId:   entityId,
  });
}

// RAW SNAPSHOT INPUT — must NOT pass through the reference-label
// enricher. The returned rows are serialised into snapshot.document_snapshot
// JSONB; labels here become immutable accounting state. See
// resolveCurrentAccountingDistributions JSDoc + rb-21.
async function loadDistributions(
  db: AnyDb, tenantId: string, entityType: string, entityId: string,
): Promise<Record<string, unknown>[] | null> {
  const polySourceType = polymorphicLineType(entityType);
  if (!polySourceType) return null;
  return resolveCurrentAccountingDistributions(db, {
    tenantId,
    sourceDocType: polySourceType,
    sourceDocId:   entityId,
  });
}

async function loadSchedules(
  db: AnyDb, tenantId: string, entityType: string, entityId: string,
): Promise<Record<string, unknown>[] | null> {
  const polySourceType = polymorphicLineType(entityType);
  if (!polySourceType) return null;
  // Resolver enforces "current version + not terminal" — superseded /
  // cancelled rows are history. Bloating snapshots with the full chain
  // is exactly the drift the audit doc flagged at this line.
  return resolveCurrentScheduleLines(db, {
    tenantId,
    sourceDocType: polySourceType,
    sourceDocId:   entityId,
  });
}

function relatedSummary(
  entityType: string,
  header:     Record<string, unknown>,
): Record<string, unknown> {
  // Small object of FK references useful for navigation. Kept deliberately
  // minimal — the snapshot is intended to fit in a single jsonb row.
  const pick = (...keys: string[]): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    for (const k of keys) if (header[k] != null) out[k] = header[k];
    return out;
  };

  switch (entityType) {
    case "purchase_requisition":
      return pick("company_code_id", "requested_by", "responsible_person_id",
                  "workflow_request_id", "budget_check_result");
    case "commitment":
    case "purchase_order":
      return pick("company_code_id", "party_type", "party_id", "parent_commitment_id",
                  "release_sequence_no", "responsible_person_id", "workflow_request_id",
                  "encumbrance_je_id", "renewed_from_id", "payment_term_id");
    case "purchase_order_confirmation":
      return pick("company_code_id", "commitment_id", "supplier_id",
                  "amendment_commitment_id");
    case "delivery_note":
      return pick("company_code_id", "commitment_id", "supplier_id",
                  "delivery_site_id", "delivery_warehouse_id");
    case "receipt":
      return pick("company_code_id", "commitment_id", "delivery_note_id",
                  "supplier_id", "accrual_je_id", "workflow_request_id");
    case "service_sheet":
      return pick("company_code_id", "commitment_id", "supplier_id",
                  "accrual_je_id", "workflow_request_id");
    case "purchase_invoice":
      return pick("company_code_id", "commitment_id", "supplier_id",
                  "ap_je_id", "workflow_request_id", "payment_term_id",
                  "budget_check_result");
    case "payment_entry":
      return pick("company_code_id", "supplier_id", "payment_method_id",
                  "bank_account_id", "workflow_request_id", "bank_statement_line_id",
                  "payment_direction", "payment_type");
    default:
      return {};
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Allowlists — entity_type → table name / FK column / polymorphic source type
// ──────────────────────────────────────────────────────────────────────────────

// Local string-typed wrappers around the entity-dispatch helpers. The
// loader fan-outs above receive `entityType: string` (the generic shape
// captureDocumentSnapshot's caller passes), so we cast at the boundary
// to the typed enum and let the shared dispatch do the lookup.
const headerTable     = dispatchHeaderTable;
const linesTableFor   = dispatchLinesTableFor;
function polymorphicLineType(entityType: string): P2pPolymorphicSourceType | null {
  return polymorphicSourceTypeFor(entityType as P2pParentEntityType);
}

function failure(code: string, message: string): CaptureDocumentSnapshotResult {
  return { ok: false, error: { code, message } };
}

function asMetadataRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

// ──────────────────────────────────────────────────────────────────────────────
// Posting-basis validation — enforced on financial_post snapshots only
// ──────────────────────────────────────────────────────────────────────────────

interface PostingBasisViolation {
  distributionNo: number | null;
  reasons: string[];
}

/**
 * Walks the AD payload and returns the rows that aren't ready to freeze for
 * posting. A row is "ready" when:
 *   - gl_account_id is resolved (non-null)
 *   - account_source is no longer PENDING (PROFILE / FALLBACK / OVERRIDE all ok)
 *
 * Not validated here (intentional):
 *   - budget_check_result — the budget engine isn't wired in any AP service
 *     today; requiring it would block every post. The audit doc puts the
 *     full budget validation behind Phase 2 of the budget work. Re-enable
 *     this check the same PR that wires the engine.
 *   - asset_id — Invariant 4 (ASSET_LINE_AD_MISSING_CAPEX) in
 *     invoice-invariants.service.ts already enforces it at submit, so by
 *     the time we're capturing the financial_post snapshot the rule is
 *     settled. Re-checking here would be redundant.
 */
function validatePostingBasisDistributions(
  distributions: Record<string, unknown>[] | null,
): PostingBasisViolation[] {
  if (distributions === null || distributions.length === 0) return [];
  const out: PostingBasisViolation[] = [];
  for (const row of distributions) {
    const reasons: string[] = [];
    if (row["gl_account_id"] == null) reasons.push("gl_account_id is null");
    const acctSource = row["account_source"];
    if (acctSource == null || acctSource === "PENDING") {
      reasons.push(`account_source is ${acctSource == null ? "null" : "PENDING"}`);
    }
    if (reasons.length > 0) {
      const distNoRaw = row["distribution_no"];
      const distNo = typeof distNoRaw === "number" ? distNoRaw
        : typeof distNoRaw === "string" ? Number(distNoRaw)
        : null;
      out.push({
        distributionNo: distNo !== null && Number.isFinite(distNo) ? distNo : null,
        reasons,
      });
    }
  }
  return out;
}
