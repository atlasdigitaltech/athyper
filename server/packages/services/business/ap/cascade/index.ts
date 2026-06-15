/**
 * @athyper/runtime/cascade — server-side cascade utilities.
 *
 * Bridges DB-fetched `control.entity_field.defaults` rules into the
 * framework-agnostic @athyper/cascade primitives. Use from BFF routes,
 * runtime-records, and any service that wants to attach `_inheritance`
 * to API responses.
 *
 * Spec: docs/specs/purchase_invoice_field_design.md §4
 */

export {
  loadEntityDefaultsMap,
  projectChildRowsAgainstParent,
  computeInvoiceLineInheritance,
  computePcInheritance,
} from "./inheritance-projection.js";
