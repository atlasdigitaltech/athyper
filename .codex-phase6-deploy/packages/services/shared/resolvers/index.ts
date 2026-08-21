/**
 * Resolver registry + built-in resolvers + BFF route.
 *
 * Bootstrap call: `registerAllResolvers()` (idempotent) should run once at
 * server boot, before the resolver route accepts requests.
 */

export {
  registerResolver,
  lookupResolver,
  lookupResolverContract,
  listResolverContracts,
  resetRegistryForTests,
  type ResolverContext,
  type ServerResolver,
} from "./registry.js";
export type { ResolverCode, ResolverContract, ResolverOutputType } from "@athyper/cascade";

export {
  runResolver,
  type ResolverResult,
  type ResolverSuccess,
  type ResolverFailure,
  type ResolverFailureCode,
} from "./runner.js";

export { registerAllResolvers } from "./register-all.js";

export { createResolverRoute, type ResolverRoutesDeps } from "./resolver-route.js";

export {
  registerSupplierDefaultPaymentTerm,
  supplierDefaultPaymentTermContract,
} from "./supplier-default-payment-term.js";

export {
  registerSupplierDefaultCurrency,
  supplierDefaultCurrencyContract,
} from "./supplier-default-currency.js";

export {
  registerPickerFirstOption,
  pickerFirstOptionContract,
} from "./picker-first-option.js";

export {
  registerItemProcurementLineDefaults,
  itemProcurementLineDefaultsContract,
} from "./item-procurement-line-defaults.js";

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
} from "./purchase-invoice-header-defaults.js";

export {
  registerCommonResolvers,
} from "./common/index.js";

export {
  registerSupplierResolvers,
} from "./supplier/index.js";

export {
  registerPurchaseInvoiceResolvers,
} from "./purchase-invoice/index.js";

export {
  registerFxResolveRate,
  fxResolveRateContract,
} from "./fx/index.js";
