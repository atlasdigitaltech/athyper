import type { EntityCapabilityManifest } from "@athyper/api-contracts/metadata";
import type { Kysely } from "kysely";

import type { CreateEntityCommand, PatchEntityCommand } from "./entity-mutation.types.js";
import { entityHandlerRegistryFamily } from "./handler-registry-family.js";

type AnyDb = Kysely<Record<string, any>>;
export type HandlerMutationCommand = CreateEntityCommand | PatchEntityCommand;

export interface ValidationIssue {
  code: string;
  message: string;
  field?: string;
}

export interface MutationHookContext {
  db: AnyDb;
  command: HandlerMutationCommand;
  manifest: EntityCapabilityManifest;
  table: `${string}.${string}`;
  values: Record<string, unknown>;
  currentRecord: Readonly<Record<string, unknown>> | null;
}

export interface TransactionalMutationContext extends MutationHookContext {
  trx: AnyDb;
  persistedRow: Record<string, unknown> | null;
}

export interface EntityMutationHandler {
  applyDefaults?(context: TransactionalMutationContext): Promise<void> | void;
  validate?(context: TransactionalMutationContext): Promise<ValidationIssue[]> | ValidationIssue[];
  beforePersist?(context: TransactionalMutationContext): Promise<void> | void;
  persistOverride?(context: TransactionalMutationContext): Promise<Record<string, unknown>>;
  afterPersist?(context: TransactionalMutationContext): Promise<void> | void;
}

export function registerEntityMutationHandler(name: string, handler: EntityMutationHandler): void {
  entityHandlerRegistryFamily.register("mutation", name, Object.freeze(handler));
}

export function getEntityMutationHandler(name: string): EntityMutationHandler | undefined {
  return entityHandlerRegistryFamily.resolve<EntityMutationHandler>("mutation", name);
}

export function listEntityMutationHandlers(): string[] {
  return entityHandlerRegistryFamily.list("mutation");
}

export async function runEntityMutationHandlerBeforePersist(
  handler: EntityMutationHandler | undefined,
  context: TransactionalMutationContext,
): Promise<ValidationIssue[]> {
  if (!handler) return [];
  await handler.applyDefaults?.(context);
  const issues = await handler.validate?.(context) ?? [];
  if (issues.length > 0) return issues;
  await handler.beforePersist?.(context);
  return [];
}

export const BUILTIN_ENTITY_MUTATION_HANDLER_NAMES = Object.freeze({
  purchaseInvoice: "PurchaseInvoiceMutationHandler",
  journalEntry: "JournalEntryMutationHandler",
  paymentEntry: "PaymentEntryMutationHandler",
  receipt: "ReceiptMutationHandler",
  serviceSheet: "ServiceSheetMutationHandler",
  purchaseRequisition: "PurchaseRequisitionMutationHandler",
} as const);

registerEntityMutationHandler(BUILTIN_ENTITY_MUTATION_HANDLER_NAMES.purchaseInvoice, {
  applyDefaults: ({ values }) => {
    if (!values["currency_code"] && values["base_currency_code"]) {
      values["currency_code"] = values["base_currency_code"];
    }
    if (!values["tax_mode"] && values["status"] !== "proforma") {
      values["tax_mode"] = "exclusive";
      values["tax_mode_source"] = "cannot_infer";
    }
    values["supplier_invoice_number"] ??= "";
  },
});

registerEntityMutationHandler(BUILTIN_ENTITY_MUTATION_HANDLER_NAMES.journalEntry, {
  applyDefaults: ({ values }) => {
    delete values["base_currency_code"];
    values["source_doc_type"] ??= "manual";
    values["document_date"] ??= values["posting_date"];
  },
});

registerEntityMutationHandler(BUILTIN_ENTITY_MUTATION_HANDLER_NAMES.paymentEntry, {
  applyDefaults: ({ values }) => {
    values["payment_type"] ??= "standard";
    values["supplier_name"] ??= "Unknown Supplier";
    values["value_date"] ??= values["posting_date"];
  },
});

registerEntityMutationHandler(BUILTIN_ENTITY_MUTATION_HANDLER_NAMES.receipt, {
  applyDefaults: ({ values }) => {
    values["received_date"] ??= values["document_date"] ?? values["posting_date"];
    delete values["document_date"];
  },
});

registerEntityMutationHandler(BUILTIN_ENTITY_MUTATION_HANDLER_NAMES.serviceSheet, {
  applyDefaults: ({ values }) => {
    values["service_date"] ??= values["document_date"] ?? values["posting_date"];
    delete values["document_date"];
  },
});

registerEntityMutationHandler(BUILTIN_ENTITY_MUTATION_HANDLER_NAMES.purchaseRequisition, {
  applyDefaults: ({ values, command }) => {
    if (!values["document_date"] && values["posting_date"]) values["document_date"] = values["posting_date"];
    values["requested_by"] ??= command.context.principalId;
  },
});
