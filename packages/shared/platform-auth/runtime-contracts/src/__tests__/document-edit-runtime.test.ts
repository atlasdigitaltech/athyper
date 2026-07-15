import { describe, expect, it } from "vitest";

import {
  DOCUMENT_EDIT_CONTEXT_HASH_ALGORITHM,
  DOCUMENT_EDIT_RUNTIME_CONTRACT_VERSION,
  DOCUMENT_EDIT_RUNTIME_V6_CONTRACT_VERSION,
  DocumentEditRuntimeContractSchema,
  DocumentEditRuntimeContractV6Schema,
  ResolveChangeResponseSchema,
  hashContext,
  isProductionEligibleDocumentRuntimeContract,
  mutationScopeTemplateTokens,
  stableStringify,
} from "../document-edit-runtime";

const sectionTimeout = {
  serverTimeoutMs: 8_000,
  clientTimeoutMs: 10_000,
  e2eTargetMs: 1_500,
};

const sectionTelemetry = {
  serverBudgetMs: 500,
  e2eBudgetTargetMs: 1_500,
};

function validContract() {
  return {
    schemaVersion: DOCUMENT_EDIT_RUNTIME_CONTRACT_VERSION,
    kind: "document" as const,
    featureFlag: "editRuntime.purchase_invoice.enabled",
    core: {},
    sections: [
      {
        key: "items",
        label: "Items",
        resolver: "pi_items_section",
        loadPolicy: "eager_parallel" as const,
        cacheTtlMs: 30_000,
        versionRef: "lines_version",
        conflictScope: "items.<lineId>",
        conflictPolicy: "prompt" as const,
        fallbackMode: "degrade" as const,
        validationSchemaRef: "pi_items_section_schema",
        timeout: sectionTimeout,
        telemetry: sectionTelemetry,
      },
      {
        key: "shipping",
        label: "Shipping",
        resolver: "pi_shipping_section",
        loadPolicy: "core_plus_candidates" as const,
        cacheTtlMs: 300_000,
        versionRef: "shipping_version",
        conflictScope: "section" as const,
        conflictPolicy: "stale_marker" as const,
        fallbackMode: "degrade" as const,
        timeout: sectionTimeout,
        telemetry: sectionTelemetry,
      },
    ],
    childCollections: [
      {
        key: "items",
        sectionKey: "items",
        entityCode: "purchase_invoice_line",
        bindingCode: "purchase_invoice__purchase_invoice_line",
        scope: "line" as const,
        mutationScopeTemplate: "items.<lineId>",
        mutationScopeTokens: {
          lineId: { source: "row.id", required: true },
        },
        loadPolicy: "eager_parallel" as const,
      },
    ],
    companionSections: [
      {
        key: "workflow",
        label: "Workflow",
        ownerService: "workflow",
        loadPolicy: "eager_parallel" as const,
        conflictScope: "external" as const,
        cacheTtlMs: 30_000,
        fallbackMode: "degrade" as const,
        events: { changed: "workflow.changed" },
        telemetryBudgetMs: 1_000,
      },
    ],
    fieldDependencies: [
      {
        sourceField: "supplier_id",
        clears: ["ship_from_address_id", "payment_term_id"],
        invalidates: ["shipping.ship_from", "tax.supplier_context"],
        resolvers: ["supplier_address_defaults", "supplier_tax_defaults"],
      },
    ],
    addressRoles: [
      {
        role: "ship_from",
        field: "ship_from_address_id",
        jurisdictionField: "ship_from_jurisdiction_id",
        ownerResolver: "supplier_address_owner",
        ownerInputs: ["supplier_id", "company_code_id"],
        purposes: ["ship_from", "bill_from", "default"],
        loadPolicy: "core_plus_candidates" as const,
        defaultResolver: "supplier_address_default",
        invalidateOn: ["supplier_id", "company_code_id"],
      },
    ],
    optionFields: [
      {
        field: "supplier_id",
        optionSource: "suppliers",
        displayLabelPolicy: "core" as const,
        searchPolicy: "on_open" as const,
        dependsOn: ["company_code_id"],
        ttlMs: 300_000,
        debounceMs: 250,
      },
    ],
    dataSources: [
      {
        source: "master.address",
        reason: "Resolve supplier shipping candidates",
        fields: ["supplier_id", "company_code_id"],
        cacheTtlMs: 300_000,
      },
    ],
    validation: {
      sectionSchemas: {
        items: "pi_items_section_schema",
      },
      crossSectionValidators: ["pi_totals_consistency"],
      preflightResolver: "pi_preflight",
    },
    crossSectionValidators: ["pi_accounting_balanced"],
    resolverRegistry: [
      {
        name: "pi_items_section",
        inputSchemaRef: "pi_items_section_input",
        outputSchemaRef: "pi_items_section_output",
        ownerPackage: "@athyper/p2p",
      },
    ],
    numberingPolicy: {
      allocation: "on_submit" as const,
      rollbackBehavior: "consume" as const,
    },
    workflowPolicy: {
      ownerService: "workflow",
      versionImpact: "status_only" as const,
      companionSectionKey: "workflow",
      submitAction: "submit_for_approval",
    },
    submitPolicy: {
      transactionality: "atomic" as const,
      preflightRequired: true,
      numberingPolicy: "on_submit" as const,
      workflowImpact: "status_only" as const,
    },
    dirtyTracking: "field" as const,
    cachePolicy: {},
    redisPolicy: {},
    sessionPolicy: {
      idleTimeoutMs: 30 * 60_000,
      refreshStrategy: "silent" as const,
      onRevoke: "abort_clear_redirect" as const,
      broadcastChannelName: "athyper-edit-session",
    },
    presencePolicy: {},
    draftPolicy: {
      persistence: "server_draft" as const,
      recoveryPolicy: "prompt" as const,
      autosave: { enabled: true, intervalMs: 30_000, onSectionBlur: true },
      expiryMs: 7 * 24 * 60 * 60_000,
    },
    idempotencyPolicy: {
      identityFields: ["recordId", "sourceField", "newValue", "draftVersion", "clientSeq"],
    },
    sseReactions: {
      "record.changed": {
        action: "invalidate" as const,
        target: "core" as const,
        preserveUi: true,
      },
      "session.revoked": {
        action: "abort_clear_redirect" as const,
        target: "all_principal_cache" as const,
        preserveUi: false,
      },
    },
    telemetry: {
      mode: "v5" as const,
      requestBudget: 40,
      duplicateRequestBudget: 0,
      scrollFetchBudget: 0,
    },
  };
}

describe("DOCUMENT_EDIT_RUNTIME_CONTRACT_VERSION", () => {
  it("is pinned at document-edit-runtime/v5.0", () => {
    expect(DOCUMENT_EDIT_RUNTIME_CONTRACT_VERSION).toBe("document-edit-runtime/v5.0");
  });
});

describe("DocumentEditRuntimeContractV6Schema", () => {
  function validV6Contract() {
    return {
      ...validContract(),
      schemaVersion: DOCUMENT_EDIT_RUNTIME_V6_CONTRACT_VERSION,
      archetype: "document_with_items" as const,
      planVersion: "plan_1",
      planHash: "sha256_plan_1",
      profiles: [{
        code: "create" as const,
        primaryNode: "items",
        bootstrapNodes: ["core", "rules", "items"],
        deferredNodes: ["accounting"],
        readinessPolicy: "together" as const,
        maximumBootstrapBytes: 500_000,
      }],
      nodes: [
        {
          key: "items",
          kind: "collection" as const,
          sourceEntity: "purchase_invoice_line",
          activation: "bootstrap" as const,
          versionSource: "node" as const,
          paging: { mode: "cursor" as const, defaultLimit: 50, maximumLimit: 100, maximumBytes: 250_000 },
          batchPolicy: { mode: "single_parent" as const, maximumParents: 1, batchingWindowMs: 0 },
        },
        {
          key: "accounting",
          kind: "collection" as const,
          activation: "on_dependency" as const,
          versionSource: "node" as const,
          batchPolicy: { mode: "multiple_parents" as const, maximumParents: 50, batchingWindowMs: 20 },
        },
      ],
      eligibilityRules: [{
        code: "PI_ACCOUNTING_REQUIRES_LINE",
        targetNode: "accounting",
        eligibility: { source: "node_record_count" as const, node: "items", operator: "gt" as const, value: 0 },
        effect: "derived_empty" as const,
        authority: "database" as const,
      }],
      invalidationActions: [{
        source: { type: "node_mutation" as const, key: "items" },
        targets: [{ node: "accounting", action: "mark_stale" as const }],
      }],
      metadataUpgradePolicy: "next_workspace_open" as const,
    };
  }

  it("accepts a compiler-owned v6 document plan", () => {
    expect(DocumentEditRuntimeContractV6Schema.safeParse(validV6Contract()).success).toBe(true);
  });

  it("rejects profiles and invariants that reference undeclared nodes", () => {
    const contract = validV6Contract();
    contract.profiles[0]!.primaryNode = "missing";
    contract.eligibilityRules[0]!.targetNode = "also_missing";
    const result = DocumentEditRuntimeContractV6Schema.safeParse(contract);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.message.includes("not declared"))).toBe(true);
    }
  });

  it("allows v6 transport only for compiled metadata", () => {
    const contract = DocumentEditRuntimeContractV6Schema.parse(validV6Contract());
    expect(isProductionEligibleDocumentRuntimeContract({ source: "compiled_v6", contract })).toBe(true);
    expect(isProductionEligibleDocumentRuntimeContract({ source: "adapted_v5", contract })).toBe(false);
  });
});

describe("hashContext", () => {
  it("uses the v1 algorithm prefix", () => {
    expect(hashContext({ a: 1 }).startsWith(`${DOCUMENT_EDIT_CONTEXT_HASH_ALGORITHM}:`)).toBe(true);
  });

  it("is stable for sorted keys and omitted undefined object values", () => {
    expect(hashContext({ b: 2, a: 1, c: undefined })).toBe(hashContext({ a: 1, b: 2 }));
  });

  it("preserves null and normalizes UUID casing", () => {
    expect(stableStringify({ id: "019F16B9-AA8F-7408-ABD4-133CCDF3C85C", x: null })).toBe(
      '{"id":"019f16b9-aa8f-7408-abd4-133ccdf3c85c","x":null}',
    );
  });
});

describe("mutationScopeTemplateTokens", () => {
  it("extracts unique typed placeholders", () => {
    expect(mutationScopeTemplateTokens("items.<lineId>.<lineId>.<componentId>")).toEqual([
      "lineId",
      "componentId",
    ]);
  });
});

describe("DocumentEditRuntimeContractSchema", () => {
  it("accepts a PI-like document edit runtime contract", () => {
    const result = DocumentEditRuntimeContractSchema.safeParse(validContract());
    expect(result.success).toBe(true);
  });

  it("rejects duplicate section keys", () => {
    const contract = validContract();
    contract.sections.push({ ...contract.sections[0]! });
    const result = DocumentEditRuntimeContractSchema.safeParse(contract);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.message.includes("duplicate section key"))).toBe(true);
    }
  });

  it("rejects child collections that reference an unknown section", () => {
    const contract = validContract();
    contract.childCollections[0]!.sectionKey = "missing";
    const result = DocumentEditRuntimeContractSchema.safeParse(contract);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.message.includes("unknown section"))).toBe(true);
    }
  });

  it("rejects mutation scope templates with undeclared tokens", () => {
    const contract = validContract();
    contract.childCollections[0]!.mutationScopeTemplate = "items.<missingToken>";
    const result = DocumentEditRuntimeContractSchema.safeParse(contract);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.message.includes("missingToken"))).toBe(true);
    }
  });

  it("rejects timeout policies where the client timeout is shorter than the server timeout", () => {
    const contract = validContract();
    contract.sections[0]!.timeout = {
      serverTimeoutMs: 8_000,
      clientTimeoutMs: 5_000,
      e2eTargetMs: 1_500,
    };
    const result = DocumentEditRuntimeContractSchema.safeParse(contract);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.message.includes("clientTimeoutMs"))).toBe(true);
    }
  });
});

describe("ResolveChangeResponseSchema", () => {
  it("accepts predicted, resolved, recommended, and stale_by_remote provenance", () => {
    const result = ResolveChangeResponseSchema.safeParse({
      accepted: true,
      defaults: [
        { field: "ship_from_address_id", value: "addr-1", provenance: "predicted" },
        { field: "ship_from_address_id", value: "addr-2", provenance: "resolved" },
        { field: "payment_term_id", value: "net30", provenance: "recommended" },
        { field: "supplier_id", value: "supplier-2", provenance: "stale_by_remote" },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("accepts structured error taxonomy", () => {
    const result = ResolveChangeResponseSchema.safeParse({
      accepted: false,
      code: "STALE_DRAFT_VERSION",
      category: "stale",
      retryable: true,
    });
    expect(result.success).toBe(true);
  });
});
