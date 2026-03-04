/**
 * Finance Payments Module
 *
 * Payment Entry with gross settlement semantics.
 * Atomic posting with concurrent overpay prevention.
 */

// Domain types
export type {
  PaymentEntry,
  PaymentAllocation,
  PaymentStatus,
  PaymentMethod,
  CreatePaymentEntryInput,
  UpdatePaymentEntryInput,
  CreateAllocationInput,
} from "./domain/types.js";
export { PAYMENT_TRANSITIONS } from "./domain/types.js";

// Services
export type { PaymentEntryService } from "./services/payment-entry-service.js";
export { DefaultPaymentEntryService } from "./services/payment-entry-service.js";

// Persistence
export type { PaymentEntryRepo } from "./persistence/payment-entry-repo.js";
export { DefaultPaymentEntryRepo } from "./persistence/payment-entry-repo.js";
export type { PaymentAllocationRepo } from "./persistence/payment-allocation-repo.js";
export { DefaultPaymentAllocationRepo } from "./persistence/payment-allocation-repo.js";
