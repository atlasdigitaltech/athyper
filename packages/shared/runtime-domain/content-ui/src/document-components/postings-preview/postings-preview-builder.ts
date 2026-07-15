/**
 * @athyper/content-ui — Postings Preview builder
 *
 * ════════════════════════════════════════════════════════════════════
 * PREVIEW ONLY — NOT AUTHORITATIVE ACCOUNTING LOGIC
 * ════════════════════════════════════════════════════════════════════
 *
 * Per cleanup-plan v5 amendment 11: the server-side posting engine is
 * the authority for journal entries. This builder constructs a UI-only
 * preview so users can sanity-check a document before submission.
 *
 * Drift between this preview and the actual posted JE is a BUG to be
 * tracked via fixture tests against captured backend output. See:
 *   - __tests__/postingsPreviewBuilder.test.ts
 *   - (planned) __tests__/strategies/*.fixture.test.ts
 *
 * The strategy registry (`./strategies/`) is the extension point: each
 * document family (AP invoice, AR invoice, payment entry, GR, SES, JE)
 * registers a strategy. Today the builder still has AP-specific shape
 * hardcoded; v5 P2c.2 extracts that into `apInvoicePostingStrategy`.
 *
 * ────────────────────────────────────────────────────────────────────
 *
 * Spec v1.1 §4.5 + §A7 (retention single source) + §B6 (row annotations).
 *
 * Aggregates AD by GL account, attaches header-level CR lines (AP
 * payable / retention / withholding), separates tax PC rows into
 * recoverable / cost-of-goods routes, and detects drift against the
 * cached AmountSummary.
 *
 * No React imports — easy to unit-test.
 */

import type {
  PurchaseInvoiceHeader,
  PurchaseInvoiceLine,
  PricingComponent,
  AccountingDistribution,
} from "../../purchase-invoice/types";

// ── Public types ──────────────────────────────────────────────────

export type PostingsPreviewStatus = "live" | "simulated" | "frozen";

export type PostingsPreviewSource =
  | { kind: "ad_aggregation";          pil_count: number;  ad_ids: string[]; pil_ids: string[] }
  | { kind: "ad_unresolved";           pil_count: number;  pil_ids: string[]  }
  | { kind: "pc_tax_recoverable";      pc_ids: string[]                       }
  | { kind: "pc_tax_cost";             pc_ids: string[]                       }
  | { kind: "ap_payable_header";       header_field: "payable_amount"         }
  | { kind: "ap_retention_payable_header"; header_field: "retention_amount"   }
  | { kind: "withholding_payable_header"; header_field: "withholding_tax_amount" };

export interface PostingsPreviewRow {
  side: "DR" | "CR";
  account_label: string;
  amount: number;
  status: PostingsPreviewStatus;
  source: PostingsPreviewSource;
}

export interface PostingsPreviewModel {
  rows: PostingsPreviewRow[];
  total_dr: number;
  total_cr: number;
  /** Accounting identity check — DR must equal CR. */
  balanced: boolean;
  /** Sum-of-AD vs cached payable_amount; non-zero = drift. */
  drift: PostingsPreviewDrift | null;
  /** True when PI has been posted (changes status to 'frozen' across the board). */
  is_posted: boolean;
  /** When posted, the JE code + date for footer link. */
  journal_entry_code: string | null;
  journal_entry_date: string | null;
}

export interface PostingsPreviewDrift {
  cached_payable: number;
  computed_payable: number;
  delta: number;
  /** Brief description for UI surfacing. */
  message: string;
}

// ── Defaults for GL labels (consumer can pass overrides) ──────────

export interface PostingsAccountLabels {
  ap_supplier?: string;
  ap_retention_payable?: string;
  withholding_payable?: string;
  tax_recoverable?: string;
  tax_cost?: string;
}

const DEFAULT_LABELS: Required<PostingsAccountLabels> = {
  ap_supplier:          "AP – Supplier",
  ap_retention_payable: "AP Retention Payable",
  withholding_payable:  "Withholding Payable",
  tax_recoverable:      "Input Tax (recoverable)",
  tax_cost:             "Tax (non-recoverable cost)",
};

// ── Builder input ─────────────────────────────────────────────────

export interface BuildPostingsPreviewInput {
  header: PurchaseInvoiceHeader;
  lines: ReadonlyArray<PurchaseInvoiceLine>;
  components: ReadonlyArray<PricingComponent>;
  distributions: ReadonlyArray<AccountingDistribution>;
  /** Override default GL labels. */
  labels?: PostingsAccountLabels;
  /** Override drift tolerance (document-currency minor units). */
  drift_tolerance?: number;
  /** JE reference when posted. */
  journal_entry_code?: string | null;
  journal_entry_date?: string | null;
}

// ── Main builder ──────────────────────────────────────────────────

export function buildPostingsPreview(input: BuildPostingsPreviewInput): PostingsPreviewModel {
  const labels = { ...DEFAULT_LABELS, ...(input.labels ?? {}) };
  const tolerance = input.drift_tolerance ?? 0.01;

  const { header, lines, components, distributions } = input;
  const isPosted =
    header.status === "posted"
    || header.status === "partially_paid"
    || header.status === "fully_paid"
    || header.status === "reversed";

  // Resolved status per row:
  //   - posted     → frozen
  //   - has AD     → live
  //   - missing AD → simulated
  const liveOrFrozen: PostingsPreviewStatus = isPosted ? "frozen" : "live";

  const rows: PostingsPreviewRow[] = [];

  // ── DR side — AD aggregation by gl_account_label ─────────────────
  // Bucket each distribution by its resolved GL label, tracking both the
  // AD row ids (for drill-back to the row) and the unique source_line_ids
  // (for drill-back to contributing PILs — §7.2 in plan v5).
  // ADs with no resolved GL go in the "ad_unresolved" simulated bucket.
  const adByAccount = new Map<string, { sum: number; ad_ids: string[]; pil_ids: Set<string> }>();
  const unresolvedAdLineIds = new Set<string>();

  for (const ad of distributions) {
    if (ad.gl_account_label == null) {
      // Use source_line_id when present; fall back to the AD's own id as
      // a stable proxy when unset (degraded mode).
      unresolvedAdLineIds.add(ad.source_line_id ?? ad.id);
      continue;
    }
    const bucket = adByAccount.get(ad.gl_account_label)
      ?? { sum: 0, ad_ids: [], pil_ids: new Set<string>() };
    bucket.sum += ad.distributed_amount;
    bucket.ad_ids.push(ad.id);
    if (ad.source_line_id) bucket.pil_ids.add(ad.source_line_id);
    adByAccount.set(ad.gl_account_label, bucket);
  }

  for (const [accountLabel, bucket] of adByAccount.entries()) {
    const pil_ids = Array.from(bucket.pil_ids);
    rows.push({
      side: "DR",
      account_label: accountLabel,
      amount: round2(bucket.sum),
      status: liveOrFrozen,
      source: {
        kind: "ad_aggregation",
        // pil_count reflects unique source lines when known; falls back
        // to AD row count for backward-compat when source_line_id absent.
        pil_count: pil_ids.length > 0 ? pil_ids.length : bucket.ad_ids.length,
        ad_ids: bucket.ad_ids,
        pil_ids,
      },
    });
  }

  // Lines with no AD at all → simulated placeholder rows.
  // We treat lines with `gross_amount > 0` and no AD row as "will resolve".
  const linesWithAd = new Set<string>(
    distributions.filter((d) => d.gl_account_label != null).map((d) => d.id),
  );
  const linesMissingAd = lines.filter((l) => l.gross_amount > 0)
    .filter((l) => !distributions.some((d) => d.gl_account_label != null));
  if (linesMissingAd.length > 0 && distributions.length === 0) {
    // No distributions at all yet — pre-resolution.
    const totalGross = lines.reduce((acc, l) => acc + l.gross_amount, 0);
    if (totalGross > 0) {
      rows.push({
        side: "DR",
        account_label: "Will resolve by policy at posting",
        amount: round2(totalGross),
        status: "simulated",
        source: {
          kind: "ad_unresolved",
          pil_count: lines.length,
          pil_ids: lines.map((l) => l.id),
        },
      });
    }
  }

  // ── DR side — tax recoverable / cost split from PC tax rows ──────
  const taxRows = components.filter((c) =>
    c.term_type === "tax" || c.term_type === "withholding"
  );
  let recoverableTotal = 0;
  let costTotal = 0;
  const recoverablePcIds: string[] = [];
  const costPcIds: string[] = [];

  for (const t of taxRows) {
    if (t.recoverable_pct == null) {
      // Treat as 100% recoverable when unset (parent should normalize).
      recoverableTotal += t.computed_amount;
      recoverablePcIds.push(t.id);
      continue;
    }
    const recoverable = round2((t.computed_amount * t.recoverable_pct) / 100);
    const cost = round2(t.computed_amount - recoverable);
    if (recoverable > 0) {
      recoverableTotal += recoverable;
      recoverablePcIds.push(t.id);
    }
    if (cost > 0) {
      costTotal += cost;
      costPcIds.push(t.id);
    }
  }

  if (recoverableTotal > 0) {
    rows.push({
      side: "DR",
      account_label: labels.tax_recoverable,
      amount: round2(recoverableTotal),
      status: liveOrFrozen,
      source: { kind: "pc_tax_recoverable", pc_ids: recoverablePcIds },
    });
  }
  if (costTotal > 0) {
    rows.push({
      side: "DR",
      account_label: labels.tax_cost,
      amount: round2(costTotal),
      status: liveOrFrozen,
      source: { kind: "pc_tax_cost", pc_ids: costPcIds },
    });
  }

  // ── CR side — from PI header fields (single source of truth §A7) ─
  if (header.amounts.payable_amount > 0) {
    rows.push({
      side: "CR",
      account_label: `${labels.ap_supplier} ${header.supplier_label}`,
      amount: round2(header.amounts.payable_amount),
      status: liveOrFrozen,
      source: { kind: "ap_payable_header", header_field: "payable_amount" },
    });
  }
  if (header.amounts.retention_amount > 0) {
    rows.push({
      side: "CR",
      account_label: labels.ap_retention_payable,
      amount: round2(header.amounts.retention_amount),
      status: liveOrFrozen,
      source: { kind: "ap_retention_payable_header", header_field: "retention_amount" },
    });
  }
  if (header.amounts.withholding_tax_amount > 0) {
    rows.push({
      side: "CR",
      account_label: labels.withholding_payable,
      amount: round2(header.amounts.withholding_tax_amount),
      status: liveOrFrozen,
      source: { kind: "withholding_payable_header", header_field: "withholding_tax_amount" },
    });
  }

  // ── Totals + balance ─────────────────────────────────────────────
  const total_dr = round2(rows.filter((r) => r.side === "DR").reduce((acc, r) => acc + r.amount, 0));
  const total_cr = round2(rows.filter((r) => r.side === "CR").reduce((acc, r) => acc + r.amount, 0));
  const balanced = Math.abs(total_dr - total_cr) <= tolerance;

  // ── Drift detection vs cached payable ────────────────────────────
  // Computed payable = sum(line gross) - withholding - advance - retention
  const computedPayable = round2(
    lines.reduce((acc, l) => acc + l.gross_amount, 0)
      - header.amounts.withholding_tax_amount
      - header.amounts.advance_deduction_amount
      - header.amounts.retention_amount,
  );
  const cachedPayable = round2(header.amounts.payable_amount);
  const payableDelta = round2(cachedPayable - computedPayable);
  const drift: PostingsPreviewDrift | null = Math.abs(payableDelta) > tolerance
    ? {
        cached_payable: cachedPayable,
        computed_payable: computedPayable,
        delta: payableDelta,
        message: `AmountSummary cache disagrees with computed payable by ${payableDelta.toFixed(2)} — pre-P4 the cache is authoritative; verify before posting.`,
      }
    : null;

  return {
    rows,
    total_dr,
    total_cr,
    balanced,
    drift,
    is_posted: isPosted,
    journal_entry_code: input.journal_entry_code ?? null,
    journal_entry_date: input.journal_entry_date ?? null,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
