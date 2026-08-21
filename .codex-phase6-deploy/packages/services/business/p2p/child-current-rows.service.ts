/**
 * Current-rows resolver for P2P child carriers (PC / AD / SL).
 *
 * Single read path that every consumer (snapshot service, audit timeline,
 * runtime API, posting service, drift checks) is expected to use when it
 * wants "the live child rows for a parent document line".
 *
 * Companion to child-lifecycle-policy.ts which answers the WRITE-side
 * question ("can I mutate this child given the parent status?"). This
 * module answers the READ-side question ("which child rows count as
 * current?") — different concern, different file.
 *
 * Per child-carrier-lifecycle-recommendation.md §3:
 *   - pricing_component  : current = superseded_by_id IS NULL
 *   - accounting_distribution : current = all rows (no soft-delete today;
 *       future row-versioning will localise here without caller changes)
 *   - schedule_line      : current = is_current_version=true AND terminal_status IS NULL
 *
 * Keep the inline SQL OUT of consumers — when child versioning evolves
 * (e.g. AD becomes snapshot-versioned at post), this is the only file to
 * update. The audit doc explicitly calls out the supersede filter leaking
 * into snapshot-capture.service.ts:171 as the kind of drift this fixes.
 */

import type { Kysely } from "kysely";
import { sql } from "kysely";

// Dispatch + types live in entity-dispatch.ts (Phase 10 consolidation).
// Re-exported here so existing consumers (schedule-line.service, etc.) keep
// their import paths stable without churn.
export {
  polymorphicSourceTypeFor,
  type P2pParentEntityType,
  type P2pPolymorphicSourceType,
} from "./entity-dispatch.js";

import type { P2pPolymorphicSourceType } from "./entity-dispatch.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

// ──────────────────────────────────────────────────────────────────────────────
// Resolver inputs
// ──────────────────────────────────────────────────────────────────────────────

export interface ResolveCurrentRowsArgs {
  tenantId:      string;
  sourceDocType: P2pPolymorphicSourceType;
  /**
   * Parent document id (PI / commitment / receipt / etc.). At least one of
   * `sourceDocId` / `sourceLineId` must be supplied; supplying both narrows
   * the read to a specific line on a specific parent.
   */
  sourceDocId?:  string | null;
  /** Scope to a single source_line_id. */
  sourceLineId?: string | null;
}

function assertHasScope(args: ResolveCurrentRowsArgs, label: string): void {
  if (!args.sourceDocId && !args.sourceLineId) {
    throw new Error(
      `[child-current-rows] ${label}: must supply sourceDocId or sourceLineId (got neither)`,
    );
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Pricing components — current = NOT superseded
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Active pricing components for a parent (and optionally a single line).
 *
 * Current-row rule: `superseded_by_id IS NULL`. The supersede chain is
 * preserved on the table for audit / approval-stream replay but is never
 * the read filter for "what does the document look like right now".
 *
 * Returns SELECT * shape — callers project as needed.
 */
export async function resolveCurrentPricingComponents(
  db:   AnyDb,
  args: ResolveCurrentRowsArgs,
): Promise<Record<string, unknown>[]> {
  assertHasScope(args, "resolveCurrentPricingComponents");
  const docFilterSql  = args.sourceDocId  == null
    ? sql`AND TRUE`
    : sql`AND source_doc_id  = ${args.sourceDocId}::uuid`;
  const lineFilterSql = args.sourceLineId == null
    ? sql`AND TRUE`
    : sql`AND source_line_id = ${args.sourceLineId}::uuid`;

  const rows = await sql<Record<string, unknown>>`
    SELECT *
      FROM document.pricing_component
     WHERE tenant_id        = ${args.tenantId}::uuid
       AND source_doc_type  = ${args.sourceDocType}::text
       AND superseded_by_id IS NULL
       ${docFilterSql}
       ${lineFilterSql}
     ORDER BY source_line_id, sequence, created_at
  `.execute(db);
  return rows.rows;
}

// ──────────────────────────────────────────────────────────────────────────────
// Accounting distributions — current = all rows (no soft-delete today)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Current accounting distributions for a parent (and optionally a single
 * line). AD has no soft-delete column today; this exists so consumers
 * have a stable API name and the future row-versioning at post lands in
 * this file without caller changes.
 *
 * RAW BUSINESS READ — DO NOT ENRICH HERE.
 * Presentation-only `${fk}_label` / `${fk}_code` companion fields must
 * NOT be attached to the result. This function feeds snapshot capture
 * (`snapshot.document_snapshot` JSONB) and GL posting basis checks —
 * promoting display labels into either would corrupt persisted state.
 * If a UI surface needs labelled rows, add a sibling
 * `...ForDisplay` resolver that composes the runtime reference-label
 * enricher on top, or route through records.route. The contract is
 * locked by snapshot-enrichment-isolation.test.ts in svc-business; see
 * rb-21 for the wired enrichment surface map.
 */
export async function resolveCurrentAccountingDistributions(
  db:   AnyDb,
  args: ResolveCurrentRowsArgs,
): Promise<Record<string, unknown>[]> {
  assertHasScope(args, "resolveCurrentAccountingDistributions");
  const docFilterSql  = args.sourceDocId  == null
    ? sql`AND TRUE`
    : sql`AND source_doc_id  = ${args.sourceDocId}::uuid`;
  const lineFilterSql = args.sourceLineId == null
    ? sql`AND TRUE`
    : sql`AND source_line_id = ${args.sourceLineId}::uuid`;

  const rows = await sql<Record<string, unknown>>`
    SELECT *
      FROM document.accounting_distribution
     WHERE tenant_id       = ${args.tenantId}::uuid
       AND source_doc_type = ${args.sourceDocType}::text
       ${docFilterSql}
       ${lineFilterSql}
     ORDER BY source_line_id, distribution_no
  `.execute(db);
  return rows.rows;
}

// ──────────────────────────────────────────────────────────────────────────────
// Schedule lines — current = is_current_version AND not terminal
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Current schedule lines for a parent (and optionally a single line).
 *
 * Current-row rule: `is_current_version = true AND terminal_status IS NULL`.
 * Older versions stay on the table (downstream receipts/invoices may
 * reference the exact version they consumed) but are never the read
 * answer to "the current schedule".
 */
export async function resolveCurrentScheduleLines(
  db:   AnyDb,
  args: ResolveCurrentRowsArgs,
): Promise<Record<string, unknown>[]> {
  assertHasScope(args, "resolveCurrentScheduleLines");
  const docFilterSql  = args.sourceDocId  == null
    ? sql`AND TRUE`
    : sql`AND source_doc_id  = ${args.sourceDocId}::uuid`;
  const lineFilterSql = args.sourceLineId == null
    ? sql`AND TRUE`
    : sql`AND source_line_id = ${args.sourceLineId}::uuid`;

  const rows = await sql<Record<string, unknown>>`
    SELECT *
      FROM document.schedule_line
     WHERE tenant_id          = ${args.tenantId}::uuid
       AND source_doc_type    = ${args.sourceDocType}::text
       AND is_current_version = true
       AND terminal_status    IS NULL
       ${docFilterSql}
       ${lineFilterSql}
     ORDER BY source_line_id, schedule_no
  `.execute(db);
  return rows.rows;
}
