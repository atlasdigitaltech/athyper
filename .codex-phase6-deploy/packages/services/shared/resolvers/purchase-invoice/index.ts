import { registerPurchaseInvoiceHeaderDefaults } from "../purchase-invoice-header-defaults.js";

export {
  registerPurchaseInvoiceHeaderDefaults,
  purchaseInvoiceHeaderDefaultsContract,
  purchaseInvoiceCommitmentDefaultsContract,
  purchaseInvoiceReferenceDefaultsContract,
  purchaseInvoiceCommitmentDefaultContract,
  purchaseInvoiceReferenceDefaultContract,
  resolvePurchaseInvoiceHeaderDefaults,
  resolvePurchaseInvoiceCommitmentDefaults,
  resolvePurchaseInvoiceReferenceDefaults,
  type PurchaseInvoiceHeaderDefaults,
  type PurchaseInvoiceHeaderDefaultsInput,
} from "../purchase-invoice-header-defaults.js";

export function registerPurchaseInvoiceResolvers(): void {
  registerPurchaseInvoiceHeaderDefaults();
}
