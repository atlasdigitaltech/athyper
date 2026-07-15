import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import type { VerifiedRequestContext } from "@athyper/svc-iam";

import {
  BUILTIN_ENTITY_MUTATION_HANDLER_NAMES,
  getEntityMutationHandler,
  listEntityMutationHandlers,
  runEntityMutationHandlerBeforePersist,
  type TransactionalMutationContext,
} from "../mutation/entity-mutation-handler.registry.js";
import { ValidatedEntityHandlerRegistryFamily } from "../mutation/handler-registry-family.js";

function context(values: Record<string, unknown>): TransactionalMutationContext {
  const verified = {
    tenantId: "tenant-1",
    principalId: "principal-1",
  } as VerifiedRequestContext;
  return {
    db: {} as never,
    trx: {} as never,
    command: {
      context: verified,
      entityCode: "fixture",
      input: {},
      origin: "job",
      validationMode: "strict",
    },
    manifest: {} as never,
    table: "document.fixture",
    values,
    currentRecord: null,
    persistedRow: null,
  };
}

describe("Phase 5 entity mutation handler registry", () => {
  it("registers the first priority document and finance handlers by metadata key", () => {
    expect(listEntityMutationHandlers()).toEqual([
      BUILTIN_ENTITY_MUTATION_HANDLER_NAMES.journalEntry,
      BUILTIN_ENTITY_MUTATION_HANDLER_NAMES.paymentEntry,
      BUILTIN_ENTITY_MUTATION_HANDLER_NAMES.purchaseInvoice,
      BUILTIN_ENTITY_MUTATION_HANDLER_NAMES.purchaseRequisition,
      BUILTIN_ENTITY_MUTATION_HANDLER_NAMES.receipt,
      BUILTIN_ENTITY_MUTATION_HANDLER_NAMES.serviceSheet,
    ].sort());
  });

  it.each([
    [BUILTIN_ENTITY_MUTATION_HANDLER_NAMES.purchaseInvoice, {}, {
      supplier_invoice_number: "", tax_mode: "exclusive", tax_mode_source: "cannot_infer",
    }],
    [BUILTIN_ENTITY_MUTATION_HANDLER_NAMES.journalEntry, { posting_date: "2026-07-14" }, {
      posting_date: "2026-07-14", document_date: "2026-07-14", source_doc_type: "manual",
    }],
    [BUILTIN_ENTITY_MUTATION_HANDLER_NAMES.paymentEntry, { posting_date: "2026-07-14" }, {
      posting_date: "2026-07-14", payment_type: "standard", supplier_name: "Unknown Supplier", value_date: "2026-07-14",
    }],
    [BUILTIN_ENTITY_MUTATION_HANDLER_NAMES.receipt, { document_date: "2026-07-14" }, {
      received_date: "2026-07-14",
    }],
    [BUILTIN_ENTITY_MUTATION_HANDLER_NAMES.serviceSheet, { document_date: "2026-07-14" }, {
      service_date: "2026-07-14",
    }],
    [BUILTIN_ENTITY_MUTATION_HANDLER_NAMES.purchaseRequisition, {}, {
      requested_by: "principal-1",
    }],
  ])("isolates defaults for %s", async (name, initial, expected) => {
    const values = { ...initial };
    await runEntityMutationHandlerBeforePersist(getEntityMutationHandler(name), context(values));
    expect(values).toEqual(expected);
  });

  it("runs durable hooks in order and stops before beforePersist on validation failure", async () => {
    const events: string[] = [];
    const issues = await runEntityMutationHandlerBeforePersist({
      applyDefaults: () => { events.push("defaults"); },
      validate: () => {
        events.push("validate");
        return [{ code: "INVALID", message: "invalid" }];
      },
      beforePersist: () => { events.push("beforePersist"); },
    }, context({}));
    expect(events).toEqual(["defaults", "validate"]);
    expect(issues).toEqual([{ code: "INVALID", message: "invalid" }]);
  });

  it("fails duplicate registrations and exposes registry health", () => {
    const family = new ValidatedEntityHandlerRegistryFamily();
    family.register("mutation", "ExampleHandler", {});
    expect(() => family.register("mutation", "ExampleHandler", {})).toThrow(/Duplicate mutation/);
    expect(family.health().mutation).toEqual(["ExampleHandler"]);
  });

  it("keeps EntityMutationService free of priority entity-code comparisons", () => {
    const service = readFileSync(new URL("../mutation/entity-mutation.service.ts", import.meta.url), "utf8");
    for (const entity of [
      "purchase_order", "purchase_invoice", "journal_entry", "payment_entry",
      "receipt", "service_sheet", "purchase_requisition",
    ]) {
      expect(service).not.toContain(entity);
    }
    expect(service).toContain("target.manifest.handlers.mutationHandler");
    const transaction = service.indexOf("this.deps.db.transaction().execute(async (trx)");
    const durableHooks = service.indexOf("runBeforePersistHooks(", transaction);
    const afterPersist = service.indexOf("afterPersist?.(", durableHooks);
    expect(durableHooks).toBeGreaterThan(transaction);
    expect(afterPersist).toBeGreaterThan(durableHooks);
    expect(service).toContain("persistOverride(hookContext)");
  });
});
