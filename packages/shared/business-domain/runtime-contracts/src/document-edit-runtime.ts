/**
 * @athyper/runtime-contracts - Document Edit Runtime Contract
 *
 * Declarative v5 contract for document edit pages. The contract is intentionally
 * schema-first: entity metadata declares lifecycle behavior, while the runtime
 * coordinator interprets it. Components must consume coordinator hooks instead
 * of owning raw edit-mode fetches.
 */
import { z } from "zod";

export const DOCUMENT_EDIT_RUNTIME_CONTRACT_VERSION = "document-edit-runtime/v5.0" as const;
export const DOCUMENT_EDIT_RUNTIME_V6_CONTRACT_VERSION = "document-edit-runtime/v6.0" as const;
export const DOCUMENT_EDIT_CONTEXT_HASH_ALGORITHM = "athyper-context-v1" as const;

const JsonObjectSchema = z.record(z.string(), z.unknown());
const IdentifierSchema = z.string().min(1);
const MillisecondsSchema = z.number().int().nonnegative();
const PositiveMillisecondsSchema = z.number().int().positive();

export const DocumentEditLoadPolicySchema = z.enum([
  "core",
  "core_plus_candidates",
  "eager_parallel",
  "on_visible",
  "on_open",
  "on_action",
]);
export type DocumentEditLoadPolicy = z.infer<typeof DocumentEditLoadPolicySchema>;

export const DocumentEditFallbackModeSchema = z.enum(["block", "degrade", "silent"]);
export type DocumentEditFallbackMode = z.infer<typeof DocumentEditFallbackModeSchema>;

export const DocumentEditConflictPolicySchema = z.enum([
  "prompt",
  "block",
  "auto_merge",
  "stale_marker",
]);
export type DocumentEditConflictPolicy = z.infer<typeof DocumentEditConflictPolicySchema>;

export const DocumentEditConflictScopeSchema = z.enum(["record", "section", "row", "external"]);
export type DocumentEditConflictScope = z.infer<typeof DocumentEditConflictScopeSchema>;

export const DocumentEditDirtyTrackingSchema = z.enum(["field", "section", "record"]);
export type DocumentEditDirtyTracking = z.infer<typeof DocumentEditDirtyTrackingSchema>;

export const DocumentEditFallbackContentSchema = z.object({
  title: IdentifierSchema,
  body: z.string().min(1),
  retryable: z.boolean().default(true),
}).strict();
export type DocumentEditFallbackContent = z.infer<typeof DocumentEditFallbackContentSchema>;

export const DocumentEditTimeoutPolicySchema = z.object({
  serverTimeoutMs: PositiveMillisecondsSchema,
  clientTimeoutMs: PositiveMillisecondsSchema,
  e2eTargetMs: PositiveMillisecondsSchema,
}).strict().superRefine((timeout, ctx) => {
  if (timeout.clientTimeoutMs < timeout.serverTimeoutMs) {
    ctx.addIssue({
      code: "custom",
      path: ["clientTimeoutMs"],
      message: "clientTimeoutMs must be greater than or equal to serverTimeoutMs",
    });
  }
});
export type DocumentEditTimeoutPolicy = z.infer<typeof DocumentEditTimeoutPolicySchema>;

export const DocumentEditTelemetryBudgetSchema = z.object({
  serverBudgetMs: PositiveMillisecondsSchema,
  e2eBudgetTargetMs: PositiveMillisecondsSchema,
  maxBytes: z.number().int().positive().optional(),
}).strict();
export type DocumentEditTelemetryBudget = z.infer<typeof DocumentEditTelemetryBudgetSchema>;

export const CrossPlaneSourceRefSchema = z.object({
  source: IdentifierSchema,
  reason: z.string().min(1),
  fields: z.array(IdentifierSchema).default([]),
  cacheTtlMs: MillisecondsSchema.default(0),
}).strict();
export type CrossPlaneSourceRef = z.infer<typeof CrossPlaneSourceRefSchema>;

export const DocumentEditCoreContractSchema = z.object({
  resolver: IdentifierSchema.default("edit_core"),
  loadPolicy: z.enum(["ssr_hydrated", "client_fetch", "ssr_then_revalidate"]).default("ssr_then_revalidate"),
  ttlMs: PositiveMillisecondsSchema.default(30_000),
  maxBytes: z.number().int().positive().default(100_000),
  ssrHydration: z.boolean().default(true),
  include: z.array(z.enum([
    "record_summary",
    "status",
    "etag",
    "field_mask",
    "section_manifest",
    "selected_option_labels",
    "selected_address_summaries",
    "draft_policy",
    "invalidation_channels",
  ])).default([
    "record_summary",
    "status",
    "etag",
    "field_mask",
    "section_manifest",
    "selected_option_labels",
    "selected_address_summaries",
    "draft_policy",
    "invalidation_channels",
  ]),
}).strict();
export type DocumentEditCoreContract = z.infer<typeof DocumentEditCoreContractSchema>;

export const DocumentEditSectionSchema = z.object({
  key: IdentifierSchema,
  label: IdentifierSchema,
  resolver: IdentifierSchema,
  loadPolicy: DocumentEditLoadPolicySchema,
  cacheTtlMs: MillisecondsSchema,
  versionRef: IdentifierSchema,
  conflictScope: z.union([DocumentEditConflictScopeSchema, IdentifierSchema]),
  conflictPolicy: DocumentEditConflictPolicySchema,
  accessible: z.boolean().default(true),
  deniedReason: z.string().optional(),
  fallbackMode: DocumentEditFallbackModeSchema,
  fallbackContent: DocumentEditFallbackContentSchema.optional(),
  validationSchemaRef: IdentifierSchema.optional(),
  dataSources: z.array(CrossPlaneSourceRefSchema).default([]),
  discardable: z.union([z.boolean(), z.literal("conditional")]).default(true),
  timeout: DocumentEditTimeoutPolicySchema,
  telemetry: DocumentEditTelemetryBudgetSchema,
}).strict();
export type DocumentEditSection = z.infer<typeof DocumentEditSectionSchema>;

export const CompanionSectionEventsSchema = z.object({
  changed: IdentifierSchema,
  deleted: IdentifierSchema.optional(),
  permissionChanged: IdentifierSchema.optional(),
}).strict();
export type CompanionSectionEvents = z.infer<typeof CompanionSectionEventsSchema>;

export const DocumentEditCompanionSectionSchema = z.object({
  key: IdentifierSchema,
  label: IdentifierSchema,
  ownerService: IdentifierSchema,
  loadPolicy: z.enum(["eager_parallel", "on_visible", "on_open", "on_action"]),
  versionRef: IdentifierSchema.optional(),
  conflictScope: z.literal("external").default("external"),
  cacheTtlMs: MillisecondsSchema,
  accessible: z.boolean().default(true),
  deniedReason: z.string().optional(),
  fallbackMode: DocumentEditFallbackModeSchema,
  fallbackContent: DocumentEditFallbackContentSchema.optional(),
  events: CompanionSectionEventsSchema,
  telemetryBudgetMs: PositiveMillisecondsSchema,
}).strict();
export type DocumentEditCompanionSection = z.infer<typeof DocumentEditCompanionSectionSchema>;

export const DerivedFromRuleSchema = z.object({
  source: IdentifierSchema,
  behavior: z.enum(["invalidate", "regenerate", "readonly_projection"]),
  resolver: IdentifierSchema.optional(),
}).strict();
export type DerivedFromRule = z.infer<typeof DerivedFromRuleSchema>;

export const MutationScopeTokenSchema = z.object({
  source: IdentifierSchema,
  required: z.boolean().default(true),
}).strict();
export type MutationScopeToken = z.infer<typeof MutationScopeTokenSchema>;

export const ChildCollectionContractSchema = z.object({
  key: IdentifierSchema,
  sectionKey: IdentifierSchema,
  entityCode: IdentifierSchema,
  relationName: IdentifierSchema.optional(),
  bindingCode: IdentifierSchema.optional(),
  parentLinkField: IdentifierSchema.optional(),
  rowIdField: IdentifierSchema.default("id"),
  rowVersionField: IdentifierSchema.default("row_version"),
  scope: z.enum(["header", "line", "mixed"]),
  mutationScopeTemplate: IdentifierSchema,
  mutationScopeTokens: z.record(z.string(), MutationScopeTokenSchema).default({}),
  derivedFrom: z.array(DerivedFromRuleSchema).default([]),
  loadPolicy: z.enum(["eager_parallel", "on_visible", "on_open"]),
  mutationPolicy: z.object({
    create: z.boolean().default(true),
    update: z.boolean().default(true),
    delete: z.boolean().default(true),
    reorder: z.boolean().default(false),
  }).strict().default({ create: true, update: true, delete: true, reorder: false }),
}).strict();
export type ChildCollectionContract = z.infer<typeof ChildCollectionContractSchema>;

export const FieldDependencyContractSchema = z.object({
  sourceField: IdentifierSchema,
  scope: z.enum(["record", "section", "row"]).default("record"),
  clears: z.array(IdentifierSchema).default([]),
  marksStale: z.array(IdentifierSchema).default([]),
  invalidates: z.array(IdentifierSchema).default([]),
  resolvers: z.array(IdentifierSchema).default([]),
  debounceMs: MillisecondsSchema.default(250),
  conflictScope: z.union([DocumentEditConflictScopeSchema, IdentifierSchema]).default("record"),
}).strict();
export type FieldDependencyContract = z.infer<typeof FieldDependencyContractSchema>;

export const AddressRoleContractSchema = z.object({
  role: IdentifierSchema,
  field: IdentifierSchema,
  jurisdictionField: IdentifierSchema.optional(),
  manualOverrideField: IdentifierSchema.optional(),
  ownerResolver: IdentifierSchema,
  ownerInputs: z.array(IdentifierSchema).default([]),
  purposes: z.array(IdentifierSchema).min(1),
  loadPolicy: z.enum(["core_plus_candidates", "on_open", "on_visible"]),
  defaultResolver: IdentifierSchema.optional(),
  invalidateOn: z.array(IdentifierSchema).default([]),
  ttlMs: PositiveMillisecondsSchema.default(300_000),
}).strict();
export type AddressRoleContract = z.infer<typeof AddressRoleContractSchema>;

export const OptionFieldContractSchema = z.object({
  field: IdentifierSchema,
  optionSource: IdentifierSchema,
  displayLabelPolicy: z.enum(["core", "section"]),
  searchPolicy: z.enum(["on_open", "on_type"]),
  dependsOn: z.array(IdentifierSchema).default([]),
  ttlMs: PositiveMillisecondsSchema.default(300_000),
  debounceMs: MillisecondsSchema.default(250),
  minSearchLength: z.number().int().nonnegative().optional(),
}).strict();
export type OptionFieldContract = z.infer<typeof OptionFieldContractSchema>;

export const ResolverRegistryRefSchema = z.object({
  name: IdentifierSchema,
  inputSchemaRef: IdentifierSchema,
  outputSchemaRef: IdentifierSchema,
  ownerPackage: IdentifierSchema,
}).strict();
export type ResolverRegistryRef = z.infer<typeof ResolverRegistryRefSchema>;

export const ValidationContractSchema = z.object({
  sectionSchemas: z.record(z.string(), IdentifierSchema).default({}),
  crossSectionValidators: z.array(IdentifierSchema).default([]),
  preflightResolver: IdentifierSchema,
}).strict();
export type ValidationContract = z.infer<typeof ValidationContractSchema>;

export const NumberingPolicySchema = z.object({
  allocation: z.enum(["pre_allocate", "on_submit"]),
  sequenceCode: IdentifierSchema.optional(),
  rollbackBehavior: z.enum(["release", "consume", "reuse_pending"]),
}).strict();
export type NumberingPolicy = z.infer<typeof NumberingPolicySchema>;

export const WorkflowPolicySchema = z.object({
  ownerService: IdentifierSchema,
  versionImpact: z.enum(["none", "status_only", "record"]),
  companionSectionKey: IdentifierSchema,
  submitAction: IdentifierSchema.optional(),
}).strict();
export type WorkflowPolicy = z.infer<typeof WorkflowPolicySchema>;

export const SubmitPolicySchema = z.object({
  transactionality: z.enum(["atomic", "staged_with_compensate", "external_workflow"]),
  preflightRequired: z.boolean().default(true),
  numberingPolicy: z.enum(["pre_allocate", "on_submit"]),
  workflowImpact: z.enum(["none", "status_only", "record"]),
  saveAndTransitionEnabled: z.boolean().optional(),
}).strict();
export type SubmitPolicy = z.infer<typeof SubmitPolicySchema>;

export const CachePolicySchema = z.object({
  contextHashAlgorithm: z.literal(DOCUMENT_EDIT_CONTEXT_HASH_ALGORITHM).default(DOCUMENT_EDIT_CONTEXT_HASH_ALGORITHM),
  browser: z.object({
    lruRecordLimit: z.number().int().positive().default(25),
    sectionsPerRecordLimit: z.number().int().positive().default(8),
    defaultGcMs: PositiveMillisecondsSchema.default(30 * 60_000),
    financeDraftStorage: z.literal("server_draft_only").default("server_draft_only"),
  }).strict().default({
    lruRecordLimit: 25,
    sectionsPerRecordLimit: 8,
    defaultGcMs: 30 * 60_000,
    financeDraftStorage: "server_draft_only",
  }),
  keyDimensions: z.array(z.enum([
    "tenantId",
    "planeKey",
    "realmKey",
    "effectivePrincipal",
    "permissionStamp",
    "entityCode",
    "recordId",
    "sectionKey",
    "contextHash",
    "sectionVersion",
  ])).default([
    "tenantId",
    "planeKey",
    "realmKey",
    "effectivePrincipal",
    "permissionStamp",
    "entityCode",
    "recordId",
    "sectionKey",
    "contextHash",
    "sectionVersion",
  ]),
}).strict();
export type CachePolicy = z.infer<typeof CachePolicySchema>;

export const RedisPolicySchema = z.object({
  enabled: z.boolean().default(true),
  keyPrefix: IdentifierSchema.default("edit"),
  includePermissionStampByDefault: z.boolean().default(true),
  idempotencyTtlMs: PositiveMillisecondsSchema.default(60 * 60_000),
  coalescingLockTtlMs: PositiveMillisecondsSchema.default(5_000),
  presenceTtlMs: PositiveMillisecondsSchema.default(60_000),
  maxmemoryPolicy: z.enum(["allkeys-lru", "volatile-lru"]).default("allkeys-lru"),
  persistenceRequirement: z.enum(["aof_everysec", "best_effort"]).default("aof_everysec"),
  prefixBudgets: z.record(z.string(), z.number().int().positive()).default({}),
}).strict();
export type RedisPolicy = z.infer<typeof RedisPolicySchema>;

export const SessionPolicySchema = z.object({
  idleTimeoutMs: PositiveMillisecondsSchema,
  refreshStrategy: z.enum(["silent", "prompt", "none"]),
  onRevoke: z.literal("abort_clear_redirect"),
  broadcastChannelName: IdentifierSchema,
  allowedGraceMs: MillisecondsSchema.default(0),
}).strict();
export type SessionPolicy = z.infer<typeof SessionPolicySchema>;

export const PresencePolicySchema = z.object({
  heartbeatIntervalMs: PositiveMillisecondsSchema.default(20_000),
  lockTtlMs: PositiveMillisecondsSchema.default(60_000),
  visibilityRevalidateAfterMs: PositiveMillisecondsSchema.default(60_000),
  takeoverBehavior: z.enum(["allow", "warn", "block"]).default("warn"),
  displayGranularity: z.enum(["record", "section"]).default("section"),
}).strict();
export type PresencePolicy = z.infer<typeof PresencePolicySchema>;

export const DraftPolicySchema = z.object({
  persistence: z.enum(["none", "server_draft"]),
  recoveryPolicy: z.enum(["prompt", "auto_recover", "auto_discard_after_ms"]),
  autoDiscardAfterMs: PositiveMillisecondsSchema.optional(),
  autosave: z.object({
    enabled: z.boolean(),
    intervalMs: PositiveMillisecondsSchema.optional(),
    onSectionBlur: z.boolean().default(true),
  }).strict(),
  expiryMs: PositiveMillisecondsSchema,
}).strict().superRefine((policy, ctx) => {
  if (policy.recoveryPolicy === "auto_discard_after_ms" && !policy.autoDiscardAfterMs) {
    ctx.addIssue({
      code: "custom",
      path: ["autoDiscardAfterMs"],
      message: "autoDiscardAfterMs is required for auto_discard_after_ms recovery",
    });
  }
});
export type DraftPolicy = z.infer<typeof DraftPolicySchema>;

export const IdempotencyPolicySchema = z.object({
  identityFields: z.array(IdentifierSchema).min(1),
  ttlMs: PositiveMillisecondsSchema.default(60 * 60_000),
}).strict();
export type IdempotencyPolicy = z.infer<typeof IdempotencyPolicySchema>;

export const ReactionPolicySchema = z.object({
  action: z.enum([
    "invalidate",
    "remove",
    "refetch_core",
    "abort_clear_redirect",
    "mark_stale",
    "readonly",
  ]),
  target: z.enum([
    "core",
    "section",
    "all_principal_cache",
    "matching_keys",
  ]),
  preserveUi: z.boolean().default(true),
}).strict();
export type ReactionPolicy = z.infer<typeof ReactionPolicySchema>;

export const TelemetryPolicySchema = z.object({
  mode: z.enum(["legacy", "v5"]).default("v5"),
  requestBudget: z.number().int().positive(),
  duplicateRequestBudget: z.number().int().nonnegative().default(0),
  scrollFetchBudget: z.number().int().nonnegative().default(0),
  serverBudgetMs: z.record(z.string(), PositiveMillisecondsSchema).default({}),
  e2eBudgetTargetMs: z.record(z.string(), PositiveMillisecondsSchema).default({}),
  sampleRateProd: z.number().min(0).max(1).default(0.1),
}).strict();
export type TelemetryPolicy = z.infer<typeof TelemetryPolicySchema>;

const DocumentEditRuntimeContractV5BaseSchema = z.object({
  schemaVersion: z.literal(DOCUMENT_EDIT_RUNTIME_CONTRACT_VERSION),
  kind: z.literal("document"),
  featureFlag: IdentifierSchema,
  core: DocumentEditCoreContractSchema,
  sections: z.array(DocumentEditSectionSchema).default([]),
  childCollections: z.array(ChildCollectionContractSchema).default([]),
  companionSections: z.array(DocumentEditCompanionSectionSchema).default([]),
  fieldDependencies: z.array(FieldDependencyContractSchema).default([]),
  addressRoles: z.array(AddressRoleContractSchema).default([]),
  optionFields: z.array(OptionFieldContractSchema).default([]),
  dataSources: z.array(CrossPlaneSourceRefSchema).default([]),
  validation: ValidationContractSchema,
  crossSectionValidators: z.array(IdentifierSchema).default([]),
  resolverRegistry: z.array(ResolverRegistryRefSchema).default([]),
  numberingPolicy: NumberingPolicySchema,
  workflowPolicy: WorkflowPolicySchema.optional(),
  submitPolicy: SubmitPolicySchema,
  dirtyTracking: DocumentEditDirtyTrackingSchema,
  cachePolicy: CachePolicySchema,
  redisPolicy: RedisPolicySchema,
  sessionPolicy: SessionPolicySchema,
  presencePolicy: PresencePolicySchema,
  draftPolicy: DraftPolicySchema,
  idempotencyPolicy: IdempotencyPolicySchema,
  sseReactions: z.record(z.string(), ReactionPolicySchema).default({}),
  telemetry: TelemetryPolicySchema,
}).strict();

type SharedDocumentEditRuntimeContract = Omit<
  z.infer<typeof DocumentEditRuntimeContractV5BaseSchema>,
  "schemaVersion"
> & { schemaVersion: string };

function validateSharedDocumentEditRuntimeContract(
  contract: SharedDocumentEditRuntimeContract,
  ctx: z.RefinementCtx,
): void {
  const sectionKeys = new Set<string>();
  contract.sections.forEach((section, index) => {
    if (sectionKeys.has(section.key)) {
      ctx.addIssue({
        code: "custom",
        path: ["sections", index, "key"],
        message: `duplicate section key "${section.key}"`,
      });
    }
    sectionKeys.add(section.key);
  });

  const companionKeys = new Set<string>();
  contract.companionSections.forEach((section, index) => {
    if (companionKeys.has(section.key) || sectionKeys.has(section.key)) {
      ctx.addIssue({
        code: "custom",
        path: ["companionSections", index, "key"],
        message: `duplicate section/companion key "${section.key}"`,
      });
    }
    companionKeys.add(section.key);
  });

  contract.childCollections.forEach((child, index) => {
    if (!sectionKeys.has(child.sectionKey)) {
      ctx.addIssue({
        code: "custom",
        path: ["childCollections", index, "sectionKey"],
        message: `child collection "${child.key}" references unknown section "${child.sectionKey}"`,
      });
    }
    if (!child.relationName && !child.bindingCode) {
      ctx.addIssue({
        code: "custom",
        path: ["childCollections", index],
        message: "child collection requires relationName or bindingCode",
      });
    }

    const declaredTokens = new Set(Object.keys(child.mutationScopeTokens));
    const referencedTokens = mutationScopeTemplateTokens(child.mutationScopeTemplate);
    for (const token of referencedTokens) {
      if (!declaredTokens.has(token)) {
        ctx.addIssue({
          code: "custom",
          path: ["childCollections", index, "mutationScopeTemplate"],
          message: `mutation scope token "${token}" is not declared in mutationScopeTokens`,
        });
      }
    }
  });

  const workflowKey = contract.workflowPolicy?.companionSectionKey;
  if (workflowKey && !companionKeys.has(workflowKey)) {
    ctx.addIssue({
      code: "custom",
      path: ["workflowPolicy", "companionSectionKey"],
      message: `workflow companion section "${workflowKey}" is not declared`,
    });
  }
}

export const DocumentEditRuntimeContractSchema = DocumentEditRuntimeContractV5BaseSchema.superRefine(
  validateSharedDocumentEditRuntimeContract,
);
export type DocumentEditRuntimeContractV5 = z.infer<typeof DocumentEditRuntimeContractSchema>;

/**
 * v6 is the compiled document-workspace plan. It deliberately remains a
 * document-only contract: master-data workspaces are not part of this rollout.
 *
 * A v5 contract may be adapted for selectors and parity tests, but only a v6
 * contract emitted by the metadata compiler is eligible for the v6 transport.
 */
export const DocumentRuntimeContractSourceSchema = z.enum([
  "compiled_v6",
  "adapted_v5",
  "bff_legacy",
]);
export type DocumentRuntimeContractSource = z.infer<typeof DocumentRuntimeContractSourceSchema>;

export const DocumentArchetypeSchema = z.enum([
  "header_only",
  "document_with_items",
  "document_with_item_tree",
  "journal_with_lines",
]);
export type DocumentArchetype = z.infer<typeof DocumentArchetypeSchema>;

export const DocumentWorkspaceProfileSchema = z.object({
  code: z.enum(["create", "edit", "view", "approve", "mobile"]),
  primaryNode: IdentifierSchema.optional(),
  bootstrapNodes: z.array(IdentifierSchema).default([]),
  deferredNodes: z.array(IdentifierSchema).default([]),
  readinessPolicy: z.enum(["together", "core_first", "bounded_primary"]),
  primaryBudgetMs: PositiveMillisecondsSchema.optional(),
  maximumBootstrapBytes: z.number().int().positive(),
}).strict();
export type DocumentWorkspaceProfile = z.infer<typeof DocumentWorkspaceProfileSchema>;

export const DocumentRuntimeNodeStateSchema = z.enum([
  "unknown",
  "ineligible",
  "eligible_unloaded",
  "loading",
  "ready",
  "ready_stale",
  "degraded",
  "forbidden",
  "error",
]);
export type DocumentRuntimeNodeState = z.infer<typeof DocumentRuntimeNodeStateSchema>;

export const DocumentRuntimeNodeSchema = z.object({
  key: IdentifierSchema,
  kind: z.enum(["core", "collection", "derived", "relation", "summary", "rules", "actions"]),
  sourceEntity: IdentifierSchema.optional(),
  activation: z.enum(["bootstrap", "on_visible", "on_open", "on_expand", "on_edit", "on_dependency"]),
  versionSource: z.enum(["document", "node", "row"]),
  paging: z.object({
    mode: z.enum(["none", "cursor"]),
    defaultLimit: z.number().int().positive().optional(),
    maximumLimit: z.number().int().positive().optional(),
    maximumBytes: z.number().int().positive().optional(),
  }).strict().optional(),
  batchPolicy: z.object({
    mode: z.enum(["single_parent", "multiple_parents"]),
    maximumParents: z.number().int().positive(),
    batchingWindowMs: MillisecondsSchema,
  }).strict().optional(),
}).strict();
export type DocumentRuntimeNode = z.infer<typeof DocumentRuntimeNodeSchema>;

export const DocumentRuntimeEligibilitySchema = z.discriminatedUnion("source", [
  z.object({
    source: z.literal("node_record_count"),
    node: IdentifierSchema,
    operator: z.enum(["gt", "gte", "eq"]),
    value: z.number().int().nonnegative(),
  }).strict(),
  z.object({
    source: z.literal("field_value"),
    field: IdentifierSchema,
    operator: z.enum(["eq", "in", "not_null"]),
    value: z.unknown().optional(),
  }).strict(),
  z.object({
    source: z.literal("document_state"),
    operator: z.enum(["eq", "in"]),
    value: z.union([IdentifierSchema, z.array(IdentifierSchema).min(1)]),
  }).strict(),
]);
export type DocumentRuntimeEligibility = z.infer<typeof DocumentRuntimeEligibilitySchema>;

export const DocumentRuntimeInvariantSchema = z.object({
  code: IdentifierSchema,
  targetNode: IdentifierSchema,
  eligibility: DocumentRuntimeEligibilitySchema,
  effect: z.enum(["derived_empty", "forbidden", "defer"]),
  authority: z.enum(["database", "application", "new_document"]),
}).strict();
export type DocumentRuntimeInvariant = z.infer<typeof DocumentRuntimeInvariantSchema>;

export const DocumentRuntimeInvalidationActionSchema = z.object({
  source: z.object({
    type: z.enum(["field", "node_mutation", "operation"]),
    key: IdentifierSchema,
  }).strict(),
  targets: z.array(z.object({
    node: IdentifierSchema,
    action: z.enum(["patch", "mark_stale", "rehydrate_if_active", "remove"]),
  }).strict()).min(1),
}).strict();
export type DocumentRuntimeInvalidationAction = z.infer<typeof DocumentRuntimeInvalidationActionSchema>;

export const MetadataUpgradePolicySchema = z.enum([
  "live",
  "next_workspace_open",
  "pinned_until_submit",
  "manual_migration",
]);
export type MetadataUpgradePolicy = z.infer<typeof MetadataUpgradePolicySchema>;

export const DocumentEditRuntimeContractV6Schema = DocumentEditRuntimeContractV5BaseSchema.omit({
  schemaVersion: true,
}).extend({
  schemaVersion: z.literal(DOCUMENT_EDIT_RUNTIME_V6_CONTRACT_VERSION),
  archetype: DocumentArchetypeSchema,
  planVersion: IdentifierSchema,
  planHash: IdentifierSchema,
  profiles: z.array(DocumentWorkspaceProfileSchema).min(1),
  nodes: z.array(DocumentRuntimeNodeSchema).min(1),
  eligibilityRules: z.array(DocumentRuntimeInvariantSchema).default([]),
  invalidationActions: z.array(DocumentRuntimeInvalidationActionSchema).default([]),
  metadataUpgradePolicy: MetadataUpgradePolicySchema,
}).superRefine((contract, ctx) => {
  validateSharedDocumentEditRuntimeContract(contract, ctx);
  const nodeKeys = new Set<string>();
  for (const [index, node] of contract.nodes.entries()) {
    if (nodeKeys.has(node.key)) {
      ctx.addIssue({
        code: "custom",
        path: ["nodes", index, "key"],
        message: `duplicate runtime node key "${node.key}"`,
      });
    }
    nodeKeys.add(node.key);
  }
  for (const [index, profile] of contract.profiles.entries()) {
    if (profile.primaryNode && !nodeKeys.has(profile.primaryNode)) {
      ctx.addIssue({
        code: "custom",
        path: ["profiles", index, "primaryNode"],
        message: `profile primary node "${profile.primaryNode}" is not declared`,
      });
    }
  }
  for (const [index, invariant] of contract.eligibilityRules.entries()) {
    if (!nodeKeys.has(invariant.targetNode)) {
      ctx.addIssue({
        code: "custom",
        path: ["eligibilityRules", index, "targetNode"],
        message: `invariant target node "${invariant.targetNode}" is not declared`,
      });
    }
  }
});
export type DocumentEditRuntimeContractV6 = z.infer<typeof DocumentEditRuntimeContractV6Schema>;

export const AnyDocumentEditRuntimeContractSchema = z.union([
  DocumentEditRuntimeContractSchema,
  DocumentEditRuntimeContractV6Schema,
]);
export type AnyDocumentEditRuntimeContract = z.infer<typeof AnyDocumentEditRuntimeContractSchema>;
/** Current runtime-consumer type. Accepts compiler-owned v6 and compatibility v5. */
export type DocumentEditRuntimeContract = AnyDocumentEditRuntimeContract;

export interface DocumentRuntimeContractEnvelope {
  source: DocumentRuntimeContractSource;
  contract: AnyDocumentEditRuntimeContract;
}

export function isProductionEligibleDocumentRuntimeContract(
  envelope: DocumentRuntimeContractEnvelope,
): envelope is DocumentRuntimeContractEnvelope & { source: "compiled_v6"; contract: DocumentEditRuntimeContractV6 } {
  return envelope.source === "compiled_v6"
    && envelope.contract.schemaVersion === DOCUMENT_EDIT_RUNTIME_V6_CONTRACT_VERSION;
}

export const ResolveChangeInvalidationSchema = z.object({
  type: z.enum(["core", "section", "field_options", "address_role", "lookup"]),
  key: IdentifierSchema,
}).strict();
export type ResolveChangeInvalidation = z.infer<typeof ResolveChangeInvalidationSchema>;

export const ResolveChangeRequestSchema = z.object({
  entityCode: IdentifierSchema,
  recordId: IdentifierSchema,
  sourceField: IdentifierSchema,
  newValue: z.unknown(),
  currentDraft: JsonObjectSchema,
  draftVersion: IdentifierSchema,
  sectionVersions: z.record(z.string(), IdentifierSchema).default({}),
  tabId: IdentifierSchema,
  clientSeq: z.number().int().nonnegative(),
  idempotencyKey: IdentifierSchema,
}).strict();
export type ResolveChangeRequest = z.infer<typeof ResolveChangeRequestSchema>;

export const ResolveChangeResponseSchema = z.object({
  accepted: z.boolean(),
  code: IdentifierSchema.optional(),
  category: z.enum([
    "stale",
    "forbidden",
    "invalid",
    "conflict",
    "timeout",
    "missing_resolver",
    "internal",
  ]).optional(),
  retryable: z.boolean().optional(),
  patch: JsonObjectSchema.default({}),
  clearedFields: z.array(IdentifierSchema).default([]),
  invalidations: z.array(ResolveChangeInvalidationSchema).default([]),
  defaults: z.array(z.object({
    field: IdentifierSchema,
    value: z.unknown(),
    provenance: z.enum(["predicted", "resolved", "recommended", "stale_by_remote"]),
  }).strict()).default([]),
  sectionVersionUpdates: z.record(z.string(), IdentifierSchema).default({}),
  telemetry: z.record(z.string(), z.number()).default({}),
}).strict();
export type ResolveChangeResponse = z.infer<typeof ResolveChangeResponseSchema>;

export const SectionBatchResponseSchema = z.object({
  sections: z.array(z.object({
    key: IdentifierSchema,
    status: z.enum(["ok", "forbidden", "timeout", "error", "degraded"]),
    version: IdentifierSchema.optional(),
    data: z.unknown().optional(),
    fallback: z.unknown().optional(),
    error: z.object({
      code: IdentifierSchema,
      category: IdentifierSchema,
      retryable: z.boolean(),
    }).strict().optional(),
    timing: z.object({
      serverMs: z.number().nonnegative(),
      cacheHit: z.enum(["browser", "redis", "db", "none"]),
    }).strict(),
  }).strict()),
}).strict();
export type SectionBatchResponse = z.infer<typeof SectionBatchResponseSchema>;

export const EditEventSchema = z.object({
  eventId: IdentifierSchema,
  tenantId: IdentifierSchema,
  entityCode: IdentifierSchema.optional(),
  recordId: IdentifierSchema.optional(),
  sectionKey: IdentifierSchema.optional(),
  sourceTabId: IdentifierSchema.optional(),
  type: IdentifierSchema,
  scope: z.enum(["tenant", "entity", "record", "section", "principal", "address"]),
  version: IdentifierSchema.optional(),
  payload: z.unknown().optional(),
  emittedAt: IdentifierSchema,
}).strict();
export type EditEvent = z.infer<typeof EditEventSchema>;

export function assertDocumentEditRuntimeContract(value: unknown): DocumentEditRuntimeContract {
  return AnyDocumentEditRuntimeContractSchema.parse(value);
}

export function mutationScopeTemplateTokens(template: string): string[] {
  const tokens = new Set<string>();
  const pattern = /<([A-Za-z][A-Za-z0-9_]*)>/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(template)) != null) {
    const token = match[1];
    if (token) tokens.add(token);
  }
  return [...tokens];
}

/**
 * Canonical cache context hash used by browser and BFF cache keys.
 * Objects are key-sorted, undefined object properties are omitted, null is
 * preserved, UUID strings are normalized to lowercase, and arrays preserve
 * order because option/address contexts often use ordered fallback chains.
 */
export function hashContext(context: unknown): string {
  return `${DOCUMENT_EDIT_CONTEXT_HASH_ALGORITHM}:${fnv1a32(stableStringify(normalizeContextValue(context)))}`;
}

export function stableStringify(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item === undefined ? null : item)).join(",")}]`;
  }
  if (value instanceof Date) {
    return JSON.stringify(value.toISOString());
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const entries = Object.keys(obj)
      .filter((key) => obj[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`);
    return `{${entries.join(",")}}`;
  }
  if (typeof value === "string") {
    return JSON.stringify(normalizeContextString(value));
  }
  if (typeof value === "number") {
    if (Number.isNaN(value)) return JSON.stringify("NaN");
    if (value === Infinity) return JSON.stringify("Infinity");
    if (value === -Infinity) return JSON.stringify("-Infinity");
  }
  return JSON.stringify(value);
}

function normalizeContextValue(value: unknown): unknown {
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map(normalizeContextValue);
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>)) {
      const item = (value as Record<string, unknown>)[key];
      if (item !== undefined) output[key] = normalizeContextValue(item);
    }
    return output;
  }
  return value;
}

function normalizeContextString(value: string): string {
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(value)
    ? value.toLowerCase()
    : value;
}

function fnv1a32(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
