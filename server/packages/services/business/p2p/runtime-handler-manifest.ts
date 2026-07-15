/**
 * Typed runtime vocabulary used by the seed-contract verifier.
 *
 * Keep this manifest aligned with the concrete switch branches in
 * lifecycle/hook-runner.service.ts and transaction-flow-dispatcher.service.ts.
 * The live verifier checks both the database metadata and those source-level
 * branches so a manifest-only entry cannot make CI pass.
 */
export const LIFECYCLE_HOOK_HANDLER_MANIFEST = {
  "activity_log.write":        { handlerType: "built_in", handler: "invokeActivityLogWrite" },
  "snapshot.capture":          { handlerType: "built_in", handler: "captureDocumentSnapshot" },
  "transaction_flow.dispatch": { handlerType: "built_in", handler: "dispatchTransactionFlow" },
  "emit_event":                { handlerType: "emit_event", handler: "emitOutboxEvent" },
  "notification.publish":      { handlerType: "built_in", handler: "dispatchLifecycleNotification" },
  "workflow.start":            { handlerType: "built_in", handler: "invokeWorkflowStart" },
} as const satisfies Record<string, {
  handlerType: "built_in" | "emit_event";
  handler: string;
}>;

export type ImplementedLifecycleHookAction = keyof typeof LIFECYCLE_HOOK_HANDLER_MANIFEST;

export const TRANSACTION_FLOW_HANDLER_MANIFEST = {
  ORDER_CREATION: {
    handlers: ["budget-reserve"],
    sourceDocTypes: ["purchase_requisition"],
  },
  ORDER_APPROVAL: {
    handlers: ["commitment-approve", "budget-commit"],
    sourceDocTypes: ["commitment", "purchase_order"],
  },
  FULFILLMENT: {
    handlers: ["receipt-posting", "service-sheet-posting"],
    sourceDocTypes: ["receipt", "service_sheet"],
  },
  INVOICE_MATCHED: {
    handlers: ["invoice-posting", "budget-consume"],
    sourceDocTypes: ["purchase_invoice"],
  },
  INVOICE_RECEIVED: {
    handlers: ["invoice-posting"],
    sourceDocTypes: ["purchase_invoice"],
  },
  SETTLEMENT: {
    handlers: ["payment-posting"],
    sourceDocTypes: ["payment_entry"],
  },
  REVERSAL: {
    handlers: ["invoice-reversal", "payment-void", "receipt-reversal", "service-sheet-reversal"],
    sourceDocTypes: ["purchase_invoice", "payment_entry", "receipt", "service_sheet"],
  },
  RELEASE: {
    handlers: ["budget-release"],
    sourceDocTypes: ["commitment", "purchase_order"],
  },
} as const satisfies Record<string, {
  handlers: readonly string[];
  sourceDocTypes: readonly string[];
}>;

export type ImplementedTransactionEvent = keyof typeof TRANSACTION_FLOW_HANDLER_MANIFEST;
