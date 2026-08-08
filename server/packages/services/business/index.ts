/**
 * Business services barrel.
 *
 * Two related folders carry "purchase_invoice" — by design:
 *   p2p/purchase_invoice/  — PI document lifecycle (CRUD, submit, hold, invariants, intake, promotion)
 *   ap/purchase_invoice/   — PI posting to the AP subledger (JE generation, tax calc, profile derivation)
 *
 * Rule of thumb:
 *   "How does this PI get written or transitioned?"  → p2p/
 *   "How does this PI become GL entries?"            → ap/
 *
 * Sibling cross-cutting packages: ledger/, procurement-intake/, pricing_component/, lifecycle/.
 */

// ── AP subledger / GL machinery ──────────────────────────────────────────────
export * from "./ap/purchase_invoice/acct-profile-derivation.service.js";
export * from "./ap/purchase_invoice/advance-balance.service.js";
export * from "./ap/purchase_invoice/invoice-posting.service.js";
export * from "./ap/purchase_invoice/journal-from-profile.service.js";
export * from "./ap/purchase_invoice/tax-calculation.service.js";
export * from "./ap/payment_entry/payment-posting.service.js";
export * from "./ap/payment_entry/payment-from-invoice.service.js";

// ── Pricing Component framework (cross-cutting) ──────────────────────────────
export * from "./pricing_component/pc-affordance.js";
export * from "./pricing_component/pricing-component.service.js";
export * from "./pricing_component/component-accounting-resolver.service.js";
export * from "./pricing_component/component-accounting-loader.service.js";
export * from "./p2p/procurement-line-accounting-inheritance.service.js";

// ── P2P: Purchase Invoice (document lifecycle) ───────────────────────────────
export * from "./p2p/purchase_invoice/invoice-create.handler.js";
export * from "./p2p/purchase_invoice/invoice-extraction.service.js";
export * from "./p2p/purchase_invoice/invoice-hold.service.js";
export * from "./p2p/purchase_invoice/invoice-intake.service.js";
export * from "./p2p/purchase_invoice/invoice-invariants.service.js";
export * from "./p2p/purchase_invoice/invoice-lines.handler.js";
export * from "./p2p/purchase_invoice/invoice-match.service.js";
export * from "./p2p/purchase_invoice/invoice-payment-term.service.js";
export * from "./p2p/purchase_invoice/invoice-submit.handler.js";
export * from "./p2p/purchase_invoice/invoice-submit-preflight.service.js";
export * from "./p2p/purchase_invoice/pi-line-defaults.service.js";
export * from "./p2p/purchase_invoice/promote-proforma.handler.js";
export * from "./p2p/purchase_invoice/invoice-from-receipt.service.js";
export * from "./p2p/purchase_invoice/invoice-from-service-sheet.service.js";

// ── P2P: Purchase Order ──────────────────────────────────────────────────────
export * from "./p2p/purchase_order/commitment-approve.service.js";
export * from "./p2p/purchase_order/purchase-order-facade.service.js";
export * from "./p2p/purchase_order/commitment-from-requisition.service.js";
export * from "./p2p/purchase_order/commitment-line-defaults.service.js";
export * from "./p2p/purchase_order/commitment-line-delete.service.js";
export * from "./p2p/purchase_order/commitment-line-copy.service.js";
export * from "./p2p/purchase_order/commitment-line-pc-copy.service.js";
export * from "./p2p/purchase_order/purchase-order-lifecycle.contract.js";
export * from "./p2p/purchase_order/purchase-order-submit-preflight.service.js";
export * from "./p2p/purchase_order/purchase-order-transition-policy.js";
export * from "./p2p/purchase_order/purchase-order-reconciliation.service.js";

// ── P2P: Receipt ─────────────────────────────────────────────────────────────
export * from "./p2p/receipt/receipt-from-commitment.service.js";
export * from "./p2p/receipt/receipt-posting.service.js";

// ── P2P: Service Sheet ───────────────────────────────────────────────────────
export * from "./p2p/service_sheet/service-sheet-from-commitment.service.js";
export * from "./p2p/service_sheet/service-sheet-posting.service.js";

// ── P2P shared kernel (polymorphic across all P2P documents) ─────────────────
export * from "./p2p/transaction-flow-dispatcher.service.js";
export * from "./p2p/resolve-document-defaults.js";
export * from "./p2p/entity-dispatch.js";
export * from "./p2p/field-profile.js";
export * from "./p2p/transition-profile.js";
export * from "./p2p/child-lifecycle-policy.js";
export * from "./p2p/schedule-line.service.js";
export * from "./p2p/snapshot-restore.service.js";
export * from "./lifecycle/snapshot-diff.service.js";

// ── Procurement intake ───────────────────────────────────────────────────────
export * from "./procurement-intake/ClassificationDecision.zod.js";
export * from "./procurement-intake/DecisionStatusService.js";
export * from "./procurement-intake/IntentResolutionService.js";
export * from "./procurement-intake/ResolutionLogWriter.js";
export * from "./procurement-intake/SpendCategorySuggestService.js";

// ── Ledger ───────────────────────────────────────────────────────────────────
export * from "./ledger/idempotency.service.js";
export * from "./ledger/post-journal-gl.service.js";

// ── Lifecycle ────────────────────────────────────────────────────────────────
export * from "./lifecycle/hook-runner.service.js";
export * from "./lifecycle/lifecycle-sync-hook.js";
export * from "./procurement/sourcing/sourcing-authorization.service.js";
export * from "./procurement/sourcing/sourcing-document.service.js";
export * from "./sales/sales-authorization.service.js";
export * from "./sales/sales-document.service.js";
export * from "./p2p/runtime-handler-manifest.js";
