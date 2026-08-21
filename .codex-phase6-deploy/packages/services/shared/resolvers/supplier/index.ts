import { registerSupplierDefaultCurrency } from "../supplier-default-currency.js";
import { registerSupplierDefaultPaymentTerm } from "../supplier-default-payment-term.js";

export {
  registerSupplierDefaultCurrency,
  supplierDefaultCurrencyContract,
} from "../supplier-default-currency.js";
export {
  registerSupplierDefaultPaymentTerm,
  supplierDefaultPaymentTermContract,
} from "../supplier-default-payment-term.js";

export function registerSupplierResolvers(): void {
  registerSupplierDefaultPaymentTerm();
  registerSupplierDefaultCurrency();
}
