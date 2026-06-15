"use client";

/**
 * apps/neon — Document runtime bootstrap.
 *
 * Cleanup Plan v5 §5.4 + amendment 8 (idempotent registries).
 *
 * Wires PI's composer + sidecar + posting strategy into the
 * runtime-canvas document-runtime registries. Imported at module top
 * level from `app/providers.tsx` so it runs once on first client
 * render and is HMR-safe (idempotent registrations).
 *
 * Adding a second document family (SI, GR, …) is mechanical:
 *   - Build a composer + register under its entity code
 *   - Build any new sidecars + register
 *   - Build a posting strategy + register
 *
 * No descriptor or contract changes are required for new documents
 * once the framework is in place.
 */

import { createElement } from "react";
import {
  registerHeaderComposer,
  registerSidecar,
  registerPostingStrategy,
} from "@athyper/runtime-canvas/document-runtime";
import {
  buildPurchaseInvoiceHeaderProps,
  PaymentTermsCard,
  apInvoicePostingStrategy,
} from "@athyper/content-ui";

// ─── Composer registrations ──────────────────────────────────────────

registerHeaderComposer("purchase_invoice", buildPurchaseInvoiceHeaderProps);

// ─── Sidecar registrations ───────────────────────────────────────────

// PI's payment_terms sidecar — referenced from
// document_header.config.side_car_slots = ["payment_terms"]
// per the (not-yet-seeded) PI descriptor surface row.
registerSidecar("payment_terms", (record) => {
  // First-cut: render PaymentTermsCard with read-only mode + empty
  // PTA/PTDR collections. The fully wired version (real PTA + PTDR
  // arrays from useDocumentChildren) lands when the PI descriptor seed
  // adds payment_term_application + payment_term_discount_result to the
  // polymorphic_child_binding registry.
  return createElement(PaymentTermsCard, {
    termLabel:        typeof record["term_snapshot"] === "object"
      && record["term_snapshot"] !== null
      && "label" in (record["term_snapshot"] as Record<string, unknown>)
        ? (record["term_snapshot"] as { label?: unknown }).label as string ?? null
        : null,
    baselineDate:     typeof record["baseline_date"] === "string" ? record["baseline_date"] : null,
    applications:    [],
    discountResults: [],
    currencyCode:     typeof record["currency_code"] === "string" ? record["currency_code"] : "INR",
    baseCurrencyCode: typeof record["base_currency_code"] === "string" ? record["base_currency_code"] : "INR",
    exchangeRate:     typeof record["exchange_rate"] === "number" ? record["exchange_rate"] : 1,
    affordance:       "read_only",
  });
});

// ─── Posting strategy registrations ──────────────────────────────────

registerPostingStrategy(apInvoicePostingStrategy);

// ─── Boot guard ──────────────────────────────────────────────────────

// Re-imports of this module from HMR / tests are idempotent: each
// register* call is a no-op when the same reference is already in the
// registry. The flag below is a soft signal for diagnostics — if dev
// tools want to verify boot happened, they can read this.
export const DOCUMENT_RUNTIME_BOOT_COMPLETE = true;
