"use client";

import { useMemo } from "react";
import type { AmountBreakdownLine, DocumentLine } from "@athyper/api-contracts/documents";
import type { DocumentPendingDeltaMode } from "@athyper/api-contracts/edit-session";

/**
 * Per-amount-line pending delta. Keyed by the line's `label` (the only
 * stable identifier on `AmountBreakdownLine`).
 *
 * Phase 10 #4 v1 supports `simple` mode only — sums the line-grand-total
 * deltas (creates + updates − deletes against saved gross_amount). The
 * `full` mode (tax / discount / withholding recompute) is forward-declared
 * here in the type but the computation is gated behind a TODO so the UI
 * never shows misleading approximations.
 */
export interface AmountDelta {
  /** Signed value to add to the line's saved amount for the preview total. */
  delta: number;
  /** Where this delta came from. Used in the tooltip. */
  sources: {
    creates: number;
    updates: number;
    deletes: number;
  };
  /**
   * True when the computation involved client-side tax/discount math
   * that may drift from server truth. UI displays an "(approximate)" hint.
   * Always false in `simple` mode.
   */
  approximate: boolean;
}

export interface UseAmountDeltaOptions {
  /** Server-truthed breakdown from the orchestrator. */
  amountBreakdown: AmountBreakdownLine[];
  /** Saved lines (server state). Used as the baseline for update / delete deltas. */
  lines: DocumentLine[];
  /** Pending line creates from the edit session. */
  pendingLineCreates: Record<string, unknown>[];
  /** Pending line updates from the edit session, keyed by line ID. */
  pendingLineUpdates: Record<string, Record<string, unknown>>;
  /** Pending line deletes (line IDs) from the edit session. */
  pendingLineDeletes: string[];
  /**
   * Per-entity mode read from `display_config.pending_delta`. When `"off"`,
   * the hook returns an empty map (no UI deltas rendered).
   */
  mode: DocumentPendingDeltaMode;
}

const EMPTY: Record<string, AmountDelta> = Object.freeze({});

/** Best-effort numeric coercion. Treats null/undefined/NaN-like as 0. */
function toNumber(value: unknown, fallback = 0): number {
  if (value == null) return fallback;
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Compute the gross amount contribution from a draft line (pending create).
 * Mirrors the server's `applyDerivedCreateLineAmounts` simple branch:
 *   - Explicit `gross_amount` / `line_amount` wins.
 *   - Otherwise gross = quantity × unit_price / price_unit.
 */
function inferGrossAmount(record: Record<string, unknown>): number {
  const explicit = record["gross_amount"] ?? record["line_amount"];
  if (explicit != null) return toNumber(explicit);
  const qty   = toNumber(record["quantity"], 1);
  const price = toNumber(record["unit_price"], 0);
  const unit  = toNumber(record["price_unit"], 1) || 1;
  return (qty * price) / unit;
}

/**
 * Project the new gross amount for a line that has a pending update.
 *
 * Subtle: we cannot simply merge `{ ...saved, ...delta }` and call
 * inferGrossAmount, because the saved record carries a `gross_amount` field
 * that would short-circuit the qty × price recompute even when the user
 * changed the price. Instead, we recompute from qty / price / price_unit
 * using delta overrides where present and saved values otherwise.
 *
 * If the delta explicitly sets `gross_amount` or `line_amount`, that wins
 * (user is forcing a specific value — matches server behavior).
 */
function projectGrossFromUpdate(
  saved: DocumentLine,
  delta: Record<string, unknown>,
): number {
  if (delta["gross_amount"] != null) return toNumber(delta["gross_amount"]);
  if (delta["line_amount"] != null) return toNumber(delta["line_amount"]);
  const savedRecord = saved as unknown as Record<string, unknown>;
  const qty   = toNumber(delta["quantity"]   ?? savedRecord["quantity"],   1);
  const price = toNumber(delta["unit_price"] ?? savedRecord["unit_price"], 0);
  const unit  = toNumber(delta["price_unit"] ?? savedRecord["price_unit"], 1) || 1;
  return (qty * price) / unit;
}

/**
 * Read the saved line's current gross_amount via the DocumentLine contract
 * (which normalises line_amount / gross_amount / net_amount).
 */
function savedGrossAmount(line: DocumentLine): number {
  const lineRecord = line as unknown as Record<string, unknown>;
  return toNumber(
    lineRecord["gross_amount"] ?? lineRecord["line_amount"] ?? lineRecord["net_amount"],
  );
}

/**
 * Compute pending deltas to display under each amount summary line.
 *
 * Mode semantics:
 *   - `"off"`       — returns `{}`; UI shows nothing extra.
 *   - `"simple"`    — sums line-grand-total deltas. Routed onto every
 *                     line in `amountBreakdown` whose label matches one of
 *                     the SIMPLE_DELTA_KEYS heuristics. Tax / discount /
 *                     net lines are skipped (server-truthed totals stay).
 *   - `"full"`      — not implemented yet. Returns `{}` to avoid
 *                     misleading approximations. UI may show a "preview
 *                     unavailable" hint later.
 *
 * Reusable: no React Context dependency, pure function of inputs.
 */
export function useAmountDelta(options: UseAmountDeltaOptions): Record<string, AmountDelta> {
  const {
    amountBreakdown,
    lines,
    pendingLineCreates,
    pendingLineUpdates,
    pendingLineDeletes,
    mode,
  } = options;

  return useMemo(() => {
    if (mode === "off") return EMPTY;
    if (mode === "full") {
      // TODO Phase 10 #4 follow-up: extract client-side tax/discount
      // calculator into a shared helper so server and client can stay in
      // sync. Until then, "full" silently downgrades to "off" to avoid
      // showing misleading approximations.
      return EMPTY;
    }

    // mode === "simple": sum gross_amount deltas
    let createsTotal = 0;
    for (const draft of pendingLineCreates) {
      createsTotal += inferGrossAmount(draft);
    }

    const linesById = new Map<string, DocumentLine>();
    for (const line of lines) {
      const id = (line as unknown as Record<string, unknown>)["id"];
      if (typeof id === "string") linesById.set(id, line);
    }

    let updatesTotal = 0;
    for (const [lineId, fieldDeltas] of Object.entries(pendingLineUpdates)) {
      const saved = linesById.get(lineId);
      if (!saved) continue;
      const projected = projectGrossFromUpdate(saved, fieldDeltas);
      updatesTotal += projected - savedGrossAmount(saved);
    }

    let deletesTotal = 0;
    for (const lineId of pendingLineDeletes) {
      const saved = linesById.get(lineId);
      if (!saved) continue;
      deletesTotal += savedGrossAmount(saved);
    }

    const netDelta = createsTotal + updatesTotal - deletesTotal;
    if (netDelta === 0) return EMPTY;

    // Phase 10 #4 v1: route the net gross delta onto any line whose label
    // matches a known total-style heuristic. Conservative — tax/discount/
    // withholding lines are left untouched because computing their pending
    // contribution requires tax-rate context the client doesn't have.
    const result: Record<string, AmountDelta> = {};
    const delta: AmountDelta = {
      delta: netDelta,
      sources: {
        creates: pendingLineCreates.length,
        updates: Object.keys(pendingLineUpdates).length,
        deletes: pendingLineDeletes.length,
      },
      approximate: false,
    };
    for (const line of amountBreakdown) {
      if (matchesSimpleDeltaTarget(line)) {
        result[line.label] = delta;
      }
    }
    return result;
  }, [
    mode,
    amountBreakdown,
    lines,
    pendingLineCreates,
    pendingLineUpdates,
    pendingLineDeletes,
  ]);
}

/**
 * Label-matching heuristic for "this is a total-style row that gets the
 * simple-mode delta." Conservative: only routes onto explicitly-totalled
 * rows or rows whose label contains "subtotal"/"gross"/"total" tokens.
 *
 * Tax-only and discount-only rows are deliberately excluded because their
 * pending contribution depends on tax-rate context that this hook doesn't
 * resolve.
 */
function matchesSimpleDeltaTarget(line: AmountBreakdownLine): boolean {
  if (line.is_total) return true;
  const label = line.label.toLowerCase();
  if (label.includes("subtotal")) return true;
  if (label.includes("gross")) return true;
  // Skip "total tax", "withholding", "discount", "net" — these need real
  // recompute, not a passthrough of the gross delta.
  return false;
}
