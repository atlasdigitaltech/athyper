/**
 * @athyper/content-ui/purchase-invoice — record → display projections.
 *
 * Cleanup Plan v5 §4.4 / §5.4 / §6.1.
 *
 * Per the package-boundary rules (§3): these helpers are pure
 * presentation-layer projections. They take a flat (already-hydrated)
 * record from the runtime descriptor and produce the typed display
 * shapes that the PI surface renderers + composers expect.
 *
 * Extracted from `apps/neon/.../PurchaseInvoiceObjectPageClient.tsx`
 * so the bootstrap composer (PurchaseInvoiceConfig.ts) can reuse the
 * exact same projection the legacy PI page uses.
 */

import type {
  AccountingDistribution,
  AdAccountSource,
  AdBudgetCheckResult,
  AdDistributionBasis,
  HeaderPcProjection,
  PcAccountSource,
  PcApportionBasis,
  PcBasis,
  PcEntryLevel,
  PcOrigin,
  PcTermType,
  PiAmountSummary,
  PiMatchStatus,
  PiMatchType,
  PiStatus,
  PricingComponent,
  PurchaseInvoiceHeader,
  PurchaseInvoiceLine,
} from "./types";

// ─── Type narrowing helpers ──────────────────────────────────────────

function readNumber(record: Record<string, unknown>, field: string, fallback = 0): number {
  const value = record[field];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function readString(record: Record<string, unknown>, field: string, fallback = ""): string {
  const value = record[field];
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  return fallback;
}

function readOptionalString(record: Record<string, unknown>, field: string): string | null {
  const value = record[field];
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  return null;
}

function readOptionalNumber(record: Record<string, unknown>, field: string): number | null {
  const value = record[field];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function readBoolean(record: Record<string, unknown>, field: string, fallback = false): boolean {
  const value = record[field];
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

function readOptionalBoolean(record: Record<string, unknown>, field: string): boolean | null {
  const value = record[field];
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

// ─── Enum narrowing ──────────────────────────────────────────────────

export function readPiStatus(value: unknown): PiStatus {
  if (typeof value === "string") {
    switch (value) {
      case "draft": case "pending_approval": case "approved": case "rejected":
      case "posted": case "partially_paid": case "fully_paid":
      case "on_hold": case "reversed": case "cancelled":
        return value;
    }
  }
  return "draft";
}

export function readMatchStatus(value: unknown): PiMatchStatus {
  if (value === "unmatched" || value === "partially_matched"
   || value === "fully_matched" || value === "match_exception") return value;
  return "unmatched";
}

export function readMatchType(value: unknown): PiMatchType {
  if (value === "three_way" || value === "two_way" || value === "no_match" || value === "evaluated_receipt") return value;
  return "three_way";
}

// ─── Projection: flat record → PurchaseInvoiceHeader ─────────────────

/**
 * Projects a flat runtime record (post hydration) into the
 * `PurchaseInvoiceHeader` display shape. The record is expected to
 * carry both top-level columns and `*_label` fields injected by the
 * server-side reference hydration (e.g. `supplier_id_label`).
 *
 * Falls back gracefully when individual fields are absent so partial
 * records still render something meaningful.
 */
export function projectHeader(
  record: Record<string, unknown>,
  recordId: string,
): PurchaseInvoiceHeader {
  const currencyCode      = readString(record, "currency_code", "INR");
  const baseCurrencyCode  = readString(record, "base_currency_code", currencyCode);
  const exchangeRate      = readNumber(record, "exchange_rate", 1);
  const supplierLabel     =
    readString(record, "supplier_id_label")
    || readString(record, "supplier_name")
    || readString(record, "supplier_id", "Supplier");

  const amounts: PiAmountSummary = {
    subtotal_amount:          readNumber(record, "subtotal_amount"),
    charges_amount:
      readNumber(record, "freight_amount")
      + readNumber(record, "misc_charges_amount"),
    tax_amount:               readNumber(record, "tax_amount"),
    withholding_tax_amount:   readNumber(record, "withholding_tax_amount"),
    retention_amount:         readNumber(record, "retention_amount"),
    advance_deduction_amount: readNumber(record, "advance_deduction_amount"),
    payable_amount:           readNumber(record, "payable_amount"),
    outstanding_amount:       readNumber(record, "outstanding_amount"),
  };

  return {
    id:                       readString(record, "id", recordId),
    code:                     readString(record, "code") || readString(record, "invoice_number", recordId),
    invoice_number:           readString(record, "invoice_number"),
    supplier_invoice_number:  readString(record, "supplier_invoice_number"),
    supplier_invoice_date:    readString(record, "supplier_invoice_date"),
    supplier_label:           supplierLabel,
    status:                   readPiStatus(record["status"]),
    currency_code:            currencyCode,
    base_currency_code:       baseCurrencyCode,
    exchange_rate:            exchangeRate,
    amounts,
    match_type:               readMatchType(record["match_type"]),
    match_status:             readMatchStatus(record["match_status"]),
    match_exception_count:    0,
  };
}

// ─── Projection: flat record → PurchaseInvoiceLine ────────────────────

/**
 * Projects a flat purchase_invoice_line runtime record into the display
 * shape consumed by `PiLineDrawer`. Defensive on every field — missing
 * values fall back to numeric zero or empty string so the drawer renders
 * SOMETHING even when the backend hydration is incomplete.
 */
export function projectLine(record: Record<string, unknown>): PurchaseInvoiceLine {
  const currencyCode      = readString(record, "currency_code", "INR");
  const baseCurrencyCode  = readString(record, "base_currency_code", currencyCode);
  const exchangeRate      = readNumber(record, "exchange_rate", 1);

  return {
    id:               readString(record, "id"),
    line_no:          readNumber(record, "line_no") || readNumber(record, "line_number"),
    item_description: readString(record, "item_description") || readString(record, "description"),
    uom_code:         readString(record, "uom_code") || readString(record, "uom"),
    quantity:         readNumber(record, "quantity"),
    unit_price:       readNumber(record, "unit_price") || readNumber(record, "rate"),
    net_amount:       readNumber(record, "net_amount"),
    gross_amount:     readNumber(record, "gross_amount") || readNumber(record, "net_amount"),
    match_status:     readMatchStatus(record["match_status"]),
    matched_quantity: readOptionalNumber(record, "matched_quantity") ?? undefined,
    currency_code:        currencyCode,
    base_currency_code:   baseCurrencyCode,
    exchange_rate:        exchangeRate,
    status:               readString(record, "status", "draft"),
  };
}

// ─── Enum narrowers — PC + AD ─────────────────────────────────────────

function readPcTermType(value: unknown): PcTermType {
  if (value === "charge" || value === "discount" || value === "tax"
   || value === "withholding" || value === "retention"
   || value === "principal_marker") return value;
  return "charge";
}

function readPcBasis(value: unknown): PcBasis {
  if (value === "percent" || value === "amount"
   || value === "per_unit" || value === "flat") return value;
  return "amount";
}

function readPcEntryLevel(value: unknown): PcEntryLevel {
  if (value === "header" || value === "line") return value;
  return "line";
}

function readPcOrigin(value: unknown): PcOrigin {
  if (value === "manual" || value === "inherited"
   || value === "vendor_default" || value === "system_resolved") return value;
  return "manual";
}

function readPcApportionBasis(value: unknown): PcApportionBasis | null {
  if (value === "value" || value === "quantity"
   || value === "weight" || value === "equal") return value;
  return null;
}

function readPcAccountSource(value: unknown): PcAccountSource | undefined {
  if (value === "POSTING_ROLE" || value === "FIXED"
   || value === "FROM_INTENT" || value === "FROM_CATEGORY") return value;
  return undefined;
}
void readPcAccountSource; // reserved for future PC.account_source surfacing

function readAdDistributionBasis(value: unknown): AdDistributionBasis {
  if (value === "PERCENT" || value === "AMOUNT" || value === "QUANTITY") return value;
  return "AMOUNT";
}

function readAdAccountSource(value: unknown): AdAccountSource {
  if (value === "POSTING_ROLE" || value === "FIXED"
   || value === "FROM_INTENT" || value === "FROM_CATEGORY") return value;
  return "POSTING_ROLE";
}

function readAdBudgetCheckResult(value: unknown): AdBudgetCheckResult | null {
  if (value === "passed" || value === "warned" || value === "override"
   || value === "blocked" || value === "exempt") return value;
  return null;
}

// ─── Projection: flat records → PricingComponent[] ────────────────────

/**
 * Projects an array of flat pricing_component runtime records into the
 * display shape consumed by `PricingComponentWaterfall`. Sorts by
 * `sequence` so the waterfall renders top-down predictably.
 *
 * Supersession chains are NOT followed transitively here — the array
 * passed in is rendered as-is. The runtime fetch already filters by
 * `superseded_by_id IS NULL`, so prior versions only appear when an
 * upstream caller has explicitly hydrated `chain`.
 */
export function projectPricingComponents(
  rows: ReadonlyArray<Record<string, unknown>>,
): PricingComponent[] {
  return [...rows]
    .map(projectPricingComponent)
    .sort((a, b) => a.sequence - b.sequence);
}

function projectPricingComponent(record: Record<string, unknown>): PricingComponent {
  const currencyCode     = readString(record, "currency_code", "INR");
  const baseCurrencyCode = readString(record, "base_currency_code", currencyCode);
  const exchangeRate     = readNumber(record, "exchange_rate", 1);

  return {
    id:                       readString(record, "id"),
    sequence:                 readNumber(record, "sequence"),
    term_type:                readPcTermType(record["term_type"]),
    condition_type_label:     readString(record, "condition_type_label")
                              || readString(record, "condition_type_code"),
    condition_type_code:      readString(record, "condition_type_code"),
    basis:                    readPcBasis(record["basis"]),
    rate_value:               readOptionalNumber(record, "rate_value"),
    amount_value:             readOptionalNumber(record, "amount_value"),
    base_for_calculation:     readOptionalNumber(record, "base_for_calculation"),
    computed_amount:          readNumber(record, "computed_amount"),
    computed_base_amount:     readNumber(record, "computed_base_amount")
                              || readNumber(record, "computed_amount"),
    entry_level:              readPcEntryLevel(record["entry_level"]),
    origin:                   readPcOrigin(record["origin"]),
    source_line_id:           readOptionalString(record, "source_line_id"),
    apportion_basis:          readPcApportionBasis(record["apportion_basis"]),
    is_apportioned:           readBoolean(record, "is_apportioned"),
    is_apportioned_from_id:   readOptionalString(record, "is_apportioned_from_id"),
    tax_group_label:          readOptionalString(record, "tax_group_label"),
    is_inclusive:             readOptionalBoolean(record, "is_inclusive"),
    recoverable_pct:          readOptionalNumber(record, "recoverable_pct"),
    tax_section_code:         readOptionalString(record, "tax_section_code"),
    currency_code:            currencyCode,
    base_currency_code:       baseCurrencyCode,
    exchange_rate:            exchangeRate,
    superseded_by_id:         readOptionalString(record, "superseded_by_id"),
    superseded_at:            readOptionalString(record, "superseded_at"),
    superseded_by_user_label: readOptionalString(record, "superseded_by_user_label"),
  };
}

// ─── Projection: flat records → AccountingDistribution[] ──────────────

/**
 * Projects an array of flat accounting_distribution runtime records into
 * the display shape consumed by `AccountingDistributionPanel`. Sorts by
 * `distribution_no` so the table reads top-down predictably.
 */
export function projectAccountingDistributions(
  rows: ReadonlyArray<Record<string, unknown>>,
): AccountingDistribution[] {
  return [...rows]
    .map(projectAccountingDistribution)
    .sort((a, b) => a.distribution_no - b.distribution_no);
}

function projectAccountingDistribution(record: Record<string, unknown>): AccountingDistribution {
  return {
    id:                     readString(record, "id"),
    distribution_no:        readNumber(record, "distribution_no") || readNumber(record, "line_no"),
    source_line_id:         readOptionalString(record, "source_line_id"),
    distribution_basis:     readAdDistributionBasis(record["distribution_basis"]),
    split_pct:              readOptionalNumber(record, "split_pct"),
    split_amount:           readOptionalNumber(record, "split_amount"),
    split_quantity:         readOptionalNumber(record, "split_quantity"),
    distributed_amount:     readNumber(record, "distributed_amount"),
    currency_code:          readString(record, "currency_code", "INR"),
    account_source:         readAdAccountSource(record["account_source"]),
    gl_account_label:       readOptionalString(record, "gl_account_label"),
    cost_center_label:      readOptionalString(record, "cost_center_label"),
    profit_center_label:    readOptionalString(record, "profit_center_label"),
    project_label:          readOptionalString(record, "project_label"),
    is_capex:               readBoolean(record, "is_capex"),
    budget_check_result:    readAdBudgetCheckResult(record["budget_check_result"]),
    resolution_audit_count: readNumber(record, "resolution_audit_count"),
  };
}

// ─── Projection: header-scope PC + lines → HeaderPcProjection[] ───────

/**
 * Builds the per-row apportionment projection for `HeaderScopePcStrip`.
 *
 * Inputs are the already-projected line and PC collections (use
 * `projectPricingComponents(rows)` on the header-scope slice from
 * DocumentRuntimeContext, and `projectPricingComponents(rows)` on the
 * line-scope slice to detect overrides).
 *
 * Apportionment rule per pc.apportion_basis:
 *   - value     → share by line.net_amount
 *   - quantity  → share by line.quantity
 *   - weight    → share by line.weight (not on PurchaseInvoiceLine today;
 *                 falls back to equal share)
 *   - equal     → share by 1 (equal distribution across lines)
 *   - null      → defaults to value (per spec §4.4)
 *
 * Override detection: when a line-scope PC exists for the same line +
 * condition_type_code, that PC's `computed_amount` is the
 * `override_amount`. Otherwise `overridden` is false.
 */
export function projectHeaderScopeProjections(
  headerScopeComponents: ReadonlyArray<PricingComponent>,
  lines: ReadonlyArray<PurchaseInvoiceLine>,
  lineScopeComponents: ReadonlyArray<PricingComponent>,
): HeaderPcProjection[] {
  if (headerScopeComponents.length === 0 || lines.length === 0) return [];

  return headerScopeComponents.map((component) => {
    const basisValues = lines.map((line) =>
      computeLineBasisValue(line, component.apportion_basis),
    );
    const basisTotal = basisValues.reduce((sum, value) => sum + value, 0);

    // Find line-scope overrides by matching condition_type_code on the same line.
    const overridesByLineId = new Map<string, PricingComponent>();
    for (const lineScope of lineScopeComponents) {
      if (!lineScope.source_line_id) continue;
      if (lineScope.condition_type_code !== component.condition_type_code) continue;
      overridesByLineId.set(lineScope.source_line_id, lineScope);
    }

    const allocations = lines.map((line, index) => {
      const basisValue = basisValues[index] ?? 0;
      const share = basisTotal > 0 ? basisValue / basisTotal : 0;
      const allocatedAmount = component.computed_amount * share;
      const override = overridesByLineId.get(line.id);
      return {
        line_id:          line.id,
        line_no:          line.line_no,
        item_description: line.item_description,
        basis_value:      basisValue,
        share,
        allocated_amount: allocatedAmount,
        overridden:       Boolean(override),
        override_amount:  override ? override.computed_amount : null,
      };
    });

    // Rounding absorber: the highest-basis line absorbs the residual so
    // sum-of-allocations equals component.computed_amount (mirrors the
    // Sprint 1 P0 fix in the line waterfall). When all bases are zero
    // there's nothing to absorb against and we leave the allocations
    // untouched.
    const allocSum = allocations.reduce((sum, a) => sum + a.allocated_amount, 0);
    const roundingAdjustment = component.computed_amount - allocSum;
    let roundingAbsorbedByLineNo: number | null = null;
    if (Math.abs(roundingAdjustment) > 0.0001 && allocations.length > 0) {
      let absorberIndex = 0;
      let highestBasis = -Infinity;
      for (let i = 0; i < allocations.length; i += 1) {
        const candidateBasis = allocations[i]!.basis_value;
        if (candidateBasis > highestBasis) {
          highestBasis = candidateBasis;
          absorberIndex = i;
        }
      }
      const absorber = allocations[absorberIndex]!;
      allocations[absorberIndex] = {
        ...absorber,
        allocated_amount: absorber.allocated_amount + roundingAdjustment,
      };
      roundingAbsorbedByLineNo = absorber.line_no;
    }

    return {
      component,
      allocations,
      last_computed_at:             null,
      rounding_adjustment:          roundingAdjustment,
      rounding_absorbed_by_line_no: roundingAbsorbedByLineNo,
    };
  });
}

function computeLineBasisValue(
  line: PurchaseInvoiceLine,
  apportionBasis: PcApportionBasis | null,
): number {
  switch (apportionBasis) {
    case "quantity": return line.quantity;
    case "equal":    return 1;
    case "weight":   // PurchaseInvoiceLine has no weight today; fall through to equal.
      return 1;
    case "value":
    case null:
    default:
      return line.net_amount;
  }
}
