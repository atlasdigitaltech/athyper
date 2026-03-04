/**
 * Finance Accounting Module
 *
 * Purchase Non-PO Invoice, Manual Journal Entry, GL Inquiry.
 * Central integration hub connecting all 12 finance engines.
 */

// Domain types
export type {
    PurchaseInvoice,
    PurchaseInvoiceLine,
    InvoiceStatus,
    CreatePurchaseInvoiceInput,
    UpdatePurchaseInvoiceInput,
    CreateInvoiceLineInput,
    ReversalHandlingMode,
    GLSummaryRow,
    GLDetailRow,
    TrialBalanceRow,
} from "./domain/types.js";
export { INVOICE_TRANSITIONS } from "./domain/types.js";

// Services
export type { PurchaseInvoiceService } from "./services/purchase-invoice-service.js";
export { DefaultPurchaseInvoiceService } from "./services/purchase-invoice-service.js";
export type { ManualJEService } from "./services/manual-je-service.js";
export { DefaultManualJEService } from "./services/manual-je-service.js";
export type { GLInquiryService } from "./services/gl-inquiry-service.js";
export { DefaultGLInquiryService } from "./services/gl-inquiry-service.js";

// Persistence
export type { PurchaseInvoiceRepo, PurchaseInvoiceLineRepo } from "./persistence/purchase-invoice-repo.js";
export { DefaultPurchaseInvoiceRepo, DefaultPurchaseInvoiceLineRepo } from "./persistence/purchase-invoice-repo.js";
