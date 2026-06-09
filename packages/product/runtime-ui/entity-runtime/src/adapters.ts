import type { HeaderAction } from "./header/types";

/**
 * ActionPolicy — maps lifecycle status values to the HeaderAction[] for that state.
 *
 * Belongs in each entity adapter package, not in entity-runtime header components.
 * This type is a utility for building adapters; it does not affect header rendering.
 *
 * Example:
 *
 *   const apInvoicePolicy: ActionPolicy<ApInvoiceStatus> = {
 *     Draft:     [updateAction, submitAction, cancelAction],
 *     Submitted: [approveAction, rejectAction, cancelAction],
 *     Approved:  [postAction, proposePaymentAction, viewJeAction, cancelAction],
 *     Posted:    [proposePaymentAction, viewJeAction],
 *     Paid:      [viewJeAction],
 *   };
 *
 *   // In your adapter:
 *   const actions = apInvoicePolicy[dto.status] ?? [];
 */
export type ActionPolicy<TStatus extends string> =
  Partial<Record<TStatus, HeaderAction[]>>;
