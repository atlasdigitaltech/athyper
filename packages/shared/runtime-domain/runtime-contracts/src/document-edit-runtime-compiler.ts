import {
  DOCUMENT_EDIT_CONTEXT_HASH_ALGORITHM,
  DOCUMENT_EDIT_RUNTIME_V6_CONTRACT_VERSION,
  DocumentEditRuntimeContractV6Schema,
  type DocumentEditRuntimeContractV6,
  type DocumentEditSection,
} from "./document-edit-runtime";
import type {
  MetaEntityField,
  MetaEntityRelation,
  MetaEntityRuntimeDescriptor,
} from "./schemas";

export interface CompiledDocumentRuntimePlanInput {
  source: "compiled_v6";
  schemaVersion: typeof DOCUMENT_EDIT_RUNTIME_V6_CONTRACT_VERSION;
  planVersion: string;
  planHash: string;
  archetype: "header_only" | "document_with_items" | "document_with_item_tree" | "journal_with_lines";
  nodes: Array<{
    key: string;
    kind: "core" | "collection";
    versionSource: "document" | "node";
  }>;
  invalidationActions: DocumentEditRuntimeContractV6["invalidationActions"];
}

type RuntimeCompileInput = Pick<
  MetaEntityRuntimeDescriptor,
  "entityCode" | "renderer" | "fields" | "relations"
> & {
  plan: CompiledDocumentRuntimePlanInput;
  saveAndTransitionEnabled: boolean;
};

const SECTION_TIMEOUT = {
  serverTimeoutMs: 2_000,
  clientTimeoutMs: 3_000,
  e2eTargetMs: 1_500,
};
const SECTION_TELEMETRY = {
  serverBudgetMs: 500,
  e2eBudgetTargetMs: 800,
  maxBytes: 100_000,
};
const SECTION_DEFINITIONS: Array<Pick<
  DocumentEditSection,
  "key" | "label" | "resolver" | "loadPolicy" | "cacheTtlMs" | "versionRef"
>> = [
  { key: "header", label: "Header", resolver: "document_header_section", loadPolicy: "core", cacheTtlMs: 30_000, versionRef: "row_version" },
  { key: "items", label: "Items", resolver: "document_items_section", loadPolicy: "eager_parallel", cacheTtlMs: 30_000, versionRef: "row_version" },
  { key: "components", label: "Components", resolver: "document_components_section", loadPolicy: "eager_parallel", cacheTtlMs: 30_000, versionRef: "row_version" },
  { key: "accounting", label: "Accounting", resolver: "document_accounting_section", loadPolicy: "on_visible", cacheTtlMs: 30_000, versionRef: "row_version" },
  { key: "tax", label: "Tax", resolver: "document_tax_section", loadPolicy: "on_visible", cacheTtlMs: 300_000, versionRef: "row_version" },
  { key: "fx", label: "FX", resolver: "document_fx_section", loadPolicy: "on_visible", cacheTtlMs: 300_000, versionRef: "row_version" },
  { key: "budget", label: "Budget", resolver: "document_budget_section", loadPolicy: "on_visible", cacheTtlMs: 300_000, versionRef: "row_version" },
];

export function compileDocumentEditRuntimeContract(
  input: RuntimeCompileInput,
): DocumentEditRuntimeContractV6 {
  if (input.renderer !== "document") {
    throw new Error("Document edit runtime can be compiled only for document renderers.");
  }
  if (input.plan.source !== "compiled_v6"
    || input.plan.schemaVersion !== DOCUMENT_EDIT_RUNTIME_V6_CONTRACT_VERSION) {
    throw new Error("Document renderer requires a compiler-owned v6 document_runtime_plan.");
  }

  const childCollections = buildChildCollections(input);
  const nodeKeys = new Set(input.plan.nodes.map((node) => node.key));
  const primaryNode = nodeKeys.has("items") ? "items" : "header";
  const bootstrapNodes = input.plan.nodes.map((node) => node.key);

  return DocumentEditRuntimeContractV6Schema.parse({
    schemaVersion: DOCUMENT_EDIT_RUNTIME_V6_CONTRACT_VERSION,
    kind: "document",
    featureFlag: `editRuntime.${input.entityCode}.enabled`,
    core: {
      resolver: "edit_core",
      loadPolicy: "ssr_then_revalidate",
      ttlMs: 30_000,
      maxBytes: 250_000,
      ssrHydration: true,
      include: [
        "record_summary", "status", "etag", "field_mask", "section_manifest",
        "selected_option_labels", "selected_address_summaries", "draft_policy",
        "invalidation_channels",
      ],
    },
    sections: SECTION_DEFINITIONS.map((section) => ({
      ...section,
      conflictScope: section.key === "header" ? "record" : section.key,
      conflictPolicy: section.key === "header" ? "prompt" : "stale_marker",
      accessible: true,
      fallbackMode: section.key === "header" ? "block" : "degrade",
      fallbackContent: {
        title: `${section.key}_unavailable`,
        body: `${section.label} section is temporarily unavailable.`,
        retryable: true,
      },
      dataSources: [],
      discardable: section.key === "header" ? false : "conditional",
      timeout: SECTION_TIMEOUT,
      telemetry: SECTION_TELEMETRY,
    })),
    childCollections,
    companionSections: [],
    fieldDependencies: buildFieldDependencies(input.fields),
    addressRoles: buildAddressRoles(input.fields),
    optionFields: buildOptionFields(input.fields),
    dataSources: [],
    validation: {
      sectionSchemas: Object.fromEntries(SECTION_DEFINITIONS.map((section) => [
        section.key,
        `${input.entityCode}_${section.key}_schema`,
      ])),
      crossSectionValidators: [],
      preflightResolver: `${input.entityCode}_edit_preflight`,
    },
    crossSectionValidators: [],
    resolverRegistry: [
      { name: "edit_core", inputSchemaRef: "edit_core_input", outputSchemaRef: "edit_core_output", ownerPackage: "apps_neon" },
      ...SECTION_DEFINITIONS.map((section) => ({
        name: section.resolver,
        inputSchemaRef: `${section.resolver}_input`,
        outputSchemaRef: `${section.resolver}_output`,
        ownerPackage: "apps_neon",
      })),
    ],
    numberingPolicy: { allocation: "on_submit", rollbackBehavior: "consume" },
    submitPolicy: {
      transactionality: "atomic",
      preflightRequired: true,
      numberingPolicy: "on_submit",
      workflowImpact: "status_only",
      saveAndTransitionEnabled: input.saveAndTransitionEnabled,
    },
    dirtyTracking: "field",
    cachePolicy: {
      contextHashAlgorithm: DOCUMENT_EDIT_CONTEXT_HASH_ALGORITHM,
      browser: {
        lruRecordLimit: 25,
        sectionsPerRecordLimit: 8,
        defaultGcMs: 30 * 60_000,
        financeDraftStorage: "server_draft_only",
      },
      keyDimensions: [
        "tenantId", "planeKey", "realmKey", "effectivePrincipal", "permissionStamp",
        "entityCode", "recordId", "sectionKey", "contextHash", "sectionVersion",
      ],
    },
    redisPolicy: {
      enabled: true,
      keyPrefix: "edit",
      includePermissionStampByDefault: true,
      idempotencyTtlMs: 60 * 60_000,
      coalescingLockTtlMs: 5_000,
      presenceTtlMs: 60_000,
      maxmemoryPolicy: "allkeys-lru",
      persistenceRequirement: "aof_everysec",
      prefixBudgets: { core: 25_000, section: 100_000, address: 25_000, option: 25_000 },
    },
    sessionPolicy: {
      idleTimeoutMs: 30 * 60_000,
      refreshStrategy: "silent",
      onRevoke: "abort_clear_redirect",
      broadcastChannelName: "document_edit_runtime",
      allowedGraceMs: 5_000,
    },
    presencePolicy: {
      heartbeatIntervalMs: 20_000,
      lockTtlMs: 60_000,
      visibilityRevalidateAfterMs: 60_000,
      takeoverBehavior: "warn",
      displayGranularity: "section",
    },
    draftPolicy: {
      persistence: "server_draft",
      recoveryPolicy: "prompt",
      autosave: { enabled: false, onSectionBlur: true },
      expiryMs: 24 * 60 * 60_000,
    },
    idempotencyPolicy: {
      identityFields: ["entityCode", "recordId", "effectivePrincipal", "clientSeq"],
      ttlMs: 60 * 60_000,
    },
    sseReactions: {
      record_updated: { action: "invalidate", target: "core", preserveUi: true },
      section_updated: { action: "invalidate", target: "section", preserveUi: true },
      session_revoked: { action: "abort_clear_redirect", target: "all_principal_cache", preserveUi: false },
    },
    telemetry: {
      mode: "v5",
      requestBudget: 20,
      duplicateRequestBudget: 0,
      scrollFetchBudget: 0,
      serverBudgetMs: { core: 500, section: 800, address: 300, option: 300 },
      e2eBudgetTargetMs: { open: 1_500, scroll: 100, fieldChange: 500 },
      sampleRateProd: 0.1,
    },
    archetype: input.plan.archetype,
    planVersion: input.plan.planVersion,
    planHash: input.plan.planHash,
    profiles: (["create", "edit", "view", "approve"] as const).map((code) => ({
      code,
      primaryNode,
      bootstrapNodes,
      deferredNodes: [],
      readinessPolicy: primaryNode === "items" ? "bounded_primary" : "core_first",
      primaryBudgetMs: 1_500,
      maximumBootstrapBytes: 500_000,
    })),
    nodes: input.plan.nodes.map((node) => ({
      key: node.key,
      kind: node.kind,
      sourceEntity: node.kind === "collection"
        ? childCollections.find((child) => child.sectionKey === node.key)?.entityCode
        : undefined,
      activation: "bootstrap",
      versionSource: node.versionSource,
      ...(node.kind === "collection" ? {
        paging: { mode: "cursor", defaultLimit: 50, maximumLimit: 100, maximumBytes: 250_000 },
        batchPolicy: { mode: "single_parent", maximumParents: 1, batchingWindowMs: 0 },
      } : {}),
    })),
    eligibilityRules: [],
    invalidationActions: input.plan.invalidationActions,
    metadataUpgradePolicy: "next_workspace_open",
  });
}

function buildChildCollections(input: RuntimeCompileInput): DocumentEditRuntimeContractV6["childCollections"] {
  const definitions = [
    { names: ["lines", "line_items", "items"], key: "lines", sectionKey: "items", scope: "header", loadPolicy: "eager_parallel" },
    { names: ["pricing_components", "components"], key: "pricing_components", sectionKey: "components", scope: "mixed", loadPolicy: "eager_parallel" },
    { names: ["accounting_distributions", "distributions"], key: "accounting_distributions", sectionKey: "accounting", scope: "mixed", loadPolicy: "on_visible" },
  ] as const;
  return definitions.flatMap((definition) => {
    const relation = findWorkspaceRelation(input.relations, definition.names);
    if (!relation) return [];
    return [{
      key: definition.key,
      sectionKey: definition.sectionKey,
      entityCode: relation.targetEntity,
      relationName: relation.name,
      rowIdField: "id",
      rowVersionField: "row_version",
      scope: definition.scope,
      mutationScopeTemplate: `${input.entityCode}.${definition.key}.<recordId>`,
      mutationScopeTokens: { recordId: { source: "recordId", required: true } },
      derivedFrom: [],
      loadPolicy: definition.loadPolicy,
      mutationPolicy: {
        create: relation.mutationPermissions.canCreate,
        update: relation.mutationPermissions.canEdit,
        delete: relation.mutationPermissions.canDelete,
        reorder: definition.key === "lines" && relation.mutationPermissions.canEdit,
      },
    }];
  });
}

function findWorkspaceRelation(relations: MetaEntityRelation[], names: readonly string[]): MetaEntityRelation | undefined {
  return relations.find((relation) => relation.mutationOwner === "workspace" && (
    names.includes(relation.name)
    || names.includes(relation.key)
    || (relation.runtimeRole ? names.includes(relation.runtimeRole) : false)
  ));
}

type DependencyEntry = {
  clears: Set<string>;
  marksStale: Set<string>;
  invalidates: Set<string>;
  resolvers: Set<string>;
};

function buildFieldDependencies(fields: MetaEntityField[]): DocumentEditRuntimeContractV6["fieldDependencies"] {
  const entries = new Map<string, DependencyEntry>();
  const ensure = (field: string) => {
    const current = entries.get(field);
    if (current) return current;
    const created = { clears: new Set<string>(), marksStale: new Set<string>(), invalidates: new Set<string>(), resolvers: new Set<string>() };
    entries.set(field, created);
    return created;
  };
  for (const field of fields) {
    if (field.optionSource?.kind !== "reference" || !field.optionSource.dependsOn?.field) continue;
    const entry = ensure(field.optionSource.dependsOn.field);
    entry.invalidates.add(field.name);
    entry.resolvers.add(`${field.name}_options`);
  }
  for (const role of buildAddressRoles(fields)) {
    for (const source of [...role.ownerInputs, ...role.invalidateOn]) {
      const entry = ensure(source);
      entry.marksStale.add(role.field);
      entry.invalidates.add(role.role);
      if (role.defaultResolver) entry.resolvers.add(role.defaultResolver);
    }
  }
  for (const group of LINE_DEPENDENCIES) {
    for (const field of group.fields) {
      const entry = ensure(field);
      group.invalidates.forEach((node) => entry.invalidates.add(node));
      entry.resolvers.add(`${group.resolver}_${field}`);
    }
  }
  return [...entries.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([sourceField, entry]) => ({
    sourceField,
    scope: "record",
    clears: [...entry.clears].sort(),
    marksStale: [...entry.marksStale].sort(),
    invalidates: [...entry.invalidates].sort(),
    resolvers: [...entry.resolvers].sort(),
    debounceMs: 250,
    conflictScope: "record",
  }));
}

const LINE_DEPENDENCIES = [
  { fields: ["item_id", "item_code", "item_description", "product_id", "service_id", "material_id", "quantity", "qty", "uom_id", "uom_code", "unit_price", "price", "rate", "price_unit", "currency_code", "exchange_rate"], invalidates: ["items", "components", "accounting", "tax", "budget"], resolver: "line_item" },
  { fields: ["site_id", "shipto_address_id", "shipfrom_address_id", "to_tax_jurisdiction_id", "from_tax_jurisdiction_id"], invalidates: ["tax", "accounting", "budget"], resolver: "line_address_context" },
  { fields: ["gl_account_id", "account_id", "cost_center_id", "project_id", "profit_center_id", "department_id", "asset_id", "asset_class_id", "accounting_distribution_id", "allocation_rule_id"], invalidates: ["accounting", "budget"], resolver: "line_accounting" },
  { fields: ["tax_group_id", "tax_rule_id", "tax_code", "tax_section_code", "place_of_supply", "tax_jurisdiction_id", "recoverable_pct", "is_inclusive", "condition_type_id", "rate_value", "computes_on", "price_treatment"], invalidates: ["components", "tax", "accounting", "budget"], resolver: "line_tax" },
  { fields: ["budget_allocation_id", "budget_id", "budget_code", "fund_id", "grant_id"], invalidates: ["budget", "accounting"], resolver: "line_budget" },
] as const;

function buildAddressRoles(fields: MetaEntityField[]): DocumentEditRuntimeContractV6["addressRoles"] {
  const names = new Set(fields.map((field) => field.name));
  if (!names.has("supplier_id")) return [];
  return [
    names.has("ship_from_address_id") ? {
      role: "ship_from", field: "ship_from_address_id", ownerResolver: "supplier_address_owner",
      ownerInputs: ["supplier_id"], purposes: ["ship_from", "bill_from", "default"],
      loadPolicy: "core_plus_candidates", defaultResolver: "supplier_address_default",
      invalidateOn: ["supplier_id"], ttlMs: 300_000,
    } : null,
    names.has("bill_from_address_id") ? {
      role: "bill_from", field: "bill_from_address_id", ownerResolver: "supplier_address_owner",
      ownerInputs: ["supplier_id"], purposes: ["bill_from", "ship_from", "default"],
      loadPolicy: "core_plus_candidates", defaultResolver: "supplier_address_default",
      invalidateOn: ["supplier_id"], ttlMs: 300_000,
    } : null,
  ].filter((role): role is NonNullable<typeof role> => role !== null) as DocumentEditRuntimeContractV6["addressRoles"];
}

function buildOptionFields(fields: MetaEntityField[]): DocumentEditRuntimeContractV6["optionFields"] {
  return fields.filter((field) => field.optionSource?.kind === "lookup" || field.optionSource?.kind === "reference")
    .map((field) => {
      const optionSource = field.optionSource;
      return {
        field: field.name,
        optionSource: optionSource?.kind === "lookup"
          ? optionSource.domainCode
          : optionSource?.kind === "reference"
            ? optionSource.entity
            : field.name,
        displayLabelPolicy: "core" as const,
        searchPolicy: "on_open" as const,
        dependsOn: optionSource?.kind === "reference" && optionSource.dependsOn?.field
          ? [optionSource.dependsOn.field]
          : [],
        ttlMs: 300_000,
        debounceMs: 250,
      };
    });
}
