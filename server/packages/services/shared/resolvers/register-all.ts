/**
 * Bootstrap: registers all built-in resolvers.
 *
 * Called once from the server boot path (api.ts) so the registry is
 * populated before any request hits the resolver BFF route.
 *
 * Resolvers contributed by individual domain services (finance, iam, …)
 * may add their own register-* exports later; bootstrap calls them here.
 */

import { registerCommonResolvers } from "./common/index.js";
import { registerFxResolveRate } from "./fx/index.js";
import { registerItemProcurementLineDefaults } from "./item-procurement-line-defaults.js";
import { registerPurchaseInvoiceResolvers } from "./purchase-invoice/index.js";
import { registerPurchaseOrderLineResolvers } from "./register-po-line-resolvers.js";
import { registerSupplierResolvers } from "./supplier/index.js";

let registered = false;

export function registerAllResolvers(): void {
  if (registered) return;
  registered = true;

  registerCommonResolvers();
  registerItemProcurementLineDefaults();
  registerSupplierResolvers();
  registerPurchaseInvoiceResolvers();
  registerPurchaseOrderLineResolvers();
  registerFxResolveRate();
}
