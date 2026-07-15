/**
 * @athyper/content-ui — Purchase Invoice adapter folder.
 *
 * Cleanup Plan v5 §P7 — slim PI adapter.
 *
 * After Sprint 1 P1a, all reusable presentational primitives moved into
 * `../document-components/` and were re-exported here as `@deprecated`
 * shims. Sprint 7 drops those shims now that the static PI route is
 * gone — top-level `@athyper/content-ui` consumers now import the
 * components directly from their canonical document-components path.
 *
 * What stays here:
 *   - PI domain types (PiStatus, PricingComponent, ...) — PI-shape data
 *     contracts the runtime-canvas composer + adapters depend on
 *   - PaymentTermsCard — PI-only sidecar slot (registered as
 *     "payment_terms" in bootstrap-document-runtime.ts)
 *   - projection helpers (projectHeader, ...) used by the composer
 *   - buildPurchaseInvoiceHeaderProps — header composer (registered
 *     under entity_code "purchase_invoice")
 *   - apInvoicePostingStrategy — strategy handle (registered under
 *     strategy_code "ap_invoice")
 *
 * New documents (SI, GR, ...) get their own adapter folder mirroring
 * this layout; the framework otherwise stays unchanged.
 */

// ─── PI domain types ──────────────────────────────────────────────

export type {
  // Status / lifecycle
  PiStatus,
  PiMatchStatus,
  PiMatchType,

  // PC
  PcTermType,
  PcBasis,
  PcEntryLevel,
  PcOrigin,
  PcApportionBasis,
  PricingComponent,

  // AD
  AdDistributionBasis,
  AdAccountSource,
  AdBudgetCheckResult,
  AccountingDistribution,

  // Payment terms
  PtaClauseType,
  PtaApplicationStatus,
  PtaSystemReasonCode,
  PaymentTermApplication,
  PtdrApplicationStatus,
  PaymentTermDiscountResult,

  // PI projections
  PiAmountSummary,
  PurchaseInvoiceHeader,
  PurchaseInvoiceLine,

  // UI affordance
  EditAffordance,
  HeaderPcProjection,
} from "./types";

// ─── PI-only sidecar ──────────────────────────────────────────────

export {
  PaymentTermsCard,
  type PaymentTermsCardProps,
} from "./payment-terms-card";

// ─── Composer + projections (runtime-canvas registration targets) ──

export {
  projectHeader,
  projectLine,
  projectPricingComponents,
  projectAccountingDistributions,
  projectHeaderScopeProjections,
  enrichComponentsWithConditionType,
  readPiStatus,
  readMatchStatus,
  readMatchType,
  type ConditionTypeLookupEntry,
} from "./projections";

// ─── AP posting strategy handle ───────────────────────────────────

export { apInvoicePostingStrategy } from "../document-components/postings-preview/strategies/ap-invoice-posting-strategy";
export type { PostingStrategy } from "../document-components/postings-preview/strategies/types";
