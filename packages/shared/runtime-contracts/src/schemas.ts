/**
 * @athyper/runtime-contracts — Meta-Entity Runtime Descriptor Schemas
 *
 * Defines the complete Zod-validated runtime descriptor contract for all
 * entity types. The descriptor is produced by compileMetaEntityRuntimeDescriptor()
 * and consumed by the rendering runtimes (master / document / ledger) on the
 * frontend.
 *
 * CONTRACT VERSION: "meta-entity-runtime/v1.1"
 *   v1.1 (additive): interactionSurfaceKind + interactionOptions on
 *   MetaEntityOperation; descriptor-level FK validator for
 *   addContract.targetRelation. Existing v1 descriptors keep validating
 *   because every new field is optional.
 *   Bump META_ENTITY_RUNTIME_CONTRACT_VERSION and the z.literal() in
 *   MetaEntityRuntimeDescriptorSchema on any breaking shape change.
 */
import { z } from "zod";

import {
  InteractionOptionsSchema,
  InteractionSurfaceKindSchema,
  validateInteractionSurfaceShape,
} from "./interaction-surface";

export const META_ENTITY_RUNTIME_CONTRACT_VERSION = "meta-entity-runtime/v1.1" as const;

export const MetaEntityRendererSchema = z.enum(["master", "document", "ledger", "simple"]);
export type MetaEntityRenderer = z.infer<typeof MetaEntityRendererSchema>;

export const MetaEntitySurfaceKindSchema = z.enum([
  "fields",
  "summary_cards",
  "line_items",
  "distributions",
  "child_records",
  "contacts_channel",
  "addresses",
  "banking_summary",
  "tax_profile_summary",
  "supplier_company_code",
  "operational_presentation",
  "attachments",
  "comments",
  "workflow",
  "lifecycle",
  "versions",
  "compare",
  "activity_log",
  "audit_summary",
  "audit_trail",
  "flow",
  // Cleanup-plan v5 P5a — descriptor-driven document runtime surfaces.
  // 4 kinds (NOT 5: payment_terms is a sidecar slot under document_header,
  // not a separate surface kind — per amendment 4).
  "document_header",
  "polymorphic_pc_lines",
  "header_scope_pc_strip",
  "postings_preview",
]);
export type MetaEntitySurfaceKind = z.infer<typeof MetaEntitySurfaceKindSchema>;

export const MetaEntitySurfacePlacementSchema = z.enum([
  "main",
  "context_panel",
  "subroute",
  "header",
  "inline",
]);
export type MetaEntitySurfacePlacement = z.infer<typeof MetaEntitySurfacePlacementSchema>;

const JsonObjectSchema = z.record(z.string(), z.unknown());

export const MetaEntityOptionSchema = z.object({
  value: z.string(),
  label: z.string(),
  code: z.string().optional(),
  description: z.string().optional(),
  disabled: z.boolean().optional(),
  metadata: JsonObjectSchema.optional(),
}).catchall(z.unknown());
export type MetaEntityOption = z.infer<typeof MetaEntityOptionSchema>;

export const MetaEntityOptionDependencySchema = z.object({
  field: z.string().min(1),
  targetField: z.string().min(1),
  required: z.boolean().optional(),
}).catchall(z.unknown());
export type MetaEntityOptionDependency = z.infer<typeof MetaEntityOptionDependencySchema>;

export const MetaEntityOptionSourceSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("none"),
  }).catchall(z.unknown()),
  z.object({
    kind: z.literal("static"),
    options: z.array(MetaEntityOptionSchema).default([]),
  }).catchall(z.unknown()),
  z.object({
    kind: z.literal("lookup"),
    domainCode: z.string().min(1),
    valueField: z.enum(["code", "id"]).optional(),
    includeInactive: z.boolean().optional(),
    ownershipMode: z.enum(["global", "tenant_overlay", "tenant_owned", "legal_entity_overlay"]).optional(),
  }).catchall(z.unknown()),
  z.object({
    kind: z.literal("reference"),
    entity: z.string().min(1),
    valueField: z.string().min(1),
    labelField: z.string().min(1),
    codeField: z.string().optional(),
    descriptionField: z.string().optional(),
    filters: JsonObjectSchema.optional(),
    dependsOn: MetaEntityOptionDependencySchema.optional(),
    scopeMode: z.enum(["tenant", "legal_entity", "company_code", "unscoped"]).optional(),
    includeInactive: z.boolean().optional(),
  }).catchall(z.unknown()),
]);
export type MetaEntityOptionSource = z.infer<typeof MetaEntityOptionSourceSchema>;

export const MetaEntityFieldEditorSchema = z.object({
  control: z.enum([
    "text",
    "textarea",
    "number",
    "checkbox",
    "date",
    "datetime",
    "select",
    "combobox",
    "reference_picker",
    "json",
  ]),
  optionSource: MetaEntityOptionSourceSchema.optional(),
  allowClear: z.boolean().optional(),
  placeholder: z.string().optional(),
  search: z.boolean().optional(),
}).catchall(z.unknown());
export type MetaEntityFieldEditor = z.infer<typeof MetaEntityFieldEditorSchema>;

export const MetaEntityFieldDisplaySchema = z.object({
  renderer: z.enum([
    "text",
    "boolean",
    "date",
    "datetime",
    "number",
    "money",
    "json",
    "lookup_label",
    "reference_label",
  ]),
  fallback: z.enum(["blank", "dash", "raw_value"]).optional(),
  format: z.enum(["label", "code_label", "label_code", "code"]).optional(),
  valueField: z.string().optional(),
  labelField: z.string().optional(),
}).catchall(z.unknown());
export type MetaEntityFieldDisplay = z.infer<typeof MetaEntityFieldDisplaySchema>;

const MetaEntitySurfaceBaseSchema = z.object({
  kind: MetaEntitySurfaceKindSchema,
  key: z.string().min(1),
  label: z.string().min(1),
  order: z.number().int(),
  placement: MetaEntitySurfacePlacementSchema,
  enabled: z.boolean(),
  permissionCode: z.string().min(1).optional(),
});

export const MetaEntityFieldsSurfaceSchema = MetaEntitySurfaceBaseSchema.extend({
  kind: z.literal("fields"),
  groupKeys: z.array(z.string()).default([]),
}).catchall(z.unknown());

export const MetaEntityLineItemsSurfaceSchema = MetaEntitySurfaceBaseSchema.extend({
  kind: z.literal("line_items"),
  entityCode: z.string().min(1),
  parentField: z.string().min(1).optional(),
  parentIdField: z.string().min(1).optional(),
  relationName: z.string().min(1).optional(),
  displayMode: z.enum(["grid", "cards", "split_accounting"]).default("grid"),
  canCreate: z.boolean(),
  canEdit: z.boolean(),
  canDelete: z.boolean(),
  affectsTotals: z.boolean().default(false),
  requiredForSubmit: z.boolean().default(false),
  /**
   * Phase 11 #8 — priority column names shown when the grid renders below
   * the `md` breakpoint (768px). Columns outside this list render with
   * `hidden md:table-cell` so they only appear at desktop widths.
   *
   * Sourced from the line entity's `display_config.mobile_columns` at
   * compile time. Absent / empty array = show all columns at all sizes.
   */
  mobileColumns: z.array(z.string()).optional(),
}).catchall(z.unknown());
export type MetaEntityLineItemsSurface = z.infer<typeof MetaEntityLineItemsSurfaceSchema>;

export const MetaEntityChildRecordsSurfaceSchema = MetaEntitySurfaceBaseSchema.extend({
  kind: z.literal("child_records"),
  entityCode: z.string().min(1),
  parentField: z.string().min(1).optional(),
  parentIdField: z.string().min(1).optional(),
  throughEntity: z.string().min(1).optional(),
  relationName: z.string().min(1).optional(),
  displayMode: z.enum(["table", "cards", "drawer", "accordion"]).default("table"),
  canCreate: z.boolean(),
  canEdit: z.boolean(),
  canDelete: z.boolean(),
}).catchall(z.unknown());

export const MetaEntityGenericSurfaceSchema = MetaEntitySurfaceBaseSchema.extend({
  kind: z.enum([
    "distributions",
    "summary_cards",
    "contacts_channel",
    "addresses",
    "banking_summary",
    "tax_profile_summary",
    "supplier_company_code",
    "operational_presentation",
    "attachments",
    "comments",
    "workflow",
    "lifecycle",
    "versions",
    "compare",
    "activity_log",
    "audit_summary",
    "audit_trail",
    "flow",
  ]),
  config: JsonObjectSchema.optional(),
}).catchall(z.unknown());

// ─────────────────────────────────────────────────────────────────────
// Cleanup-plan v5 P5a — document-runtime surface kinds + Zod configs.
// Each kind has its own typed config schema so seed authors get
// compile-time validation. Optional fields default sensibly so a
// minimal seed row is valid.
// ─────────────────────────────────────────────────────────────────────

/**
 * Per-surface toolbar action descriptor. Aggregated at provider mount
 * into the central action registry (amendment 3 — declarative
 * registration, no side-effects between surfaces).
 */
export const SurfaceToolbarActionSchema = z.object({
  code:        z.string().min(1),
  label:       z.string().min(1),
  icon:        z.string().min(1).optional(),
  placement:   z.enum(["primary", "secondary", "overflow"]).default("secondary"),
  permissionCode: z.string().min(1).optional(),
}).catchall(z.unknown());
export type SurfaceToolbarAction = z.infer<typeof SurfaceToolbarActionSchema>;

/** One amount-summary chip entry on the document header. */
export const AmountSummaryFieldSchema = z.object({
  label:      z.string().min(1),
  field:      z.string().min(1),
  intent:     z.string().min(1).optional(),
  emphasized: z.boolean().default(false),
}).catchall(z.unknown());
export type AmountSummaryField = z.infer<typeof AmountSummaryFieldSchema>;

/**
 * document_header — composer-registry-driven header.
 *
 * `header_composer_code` resolves to a registered composer via
 * `runtime-canvas/document-runtime/composer-registry`. Per amendment 4
 * the renderer NEVER selects the composer by shape-matching; the seed
 * is explicit.
 *
 * `side_car_slots` lists slot keys resolved via the sidecar registry
 * (PI registers "payment_terms" → PaymentTermsCard at app boot).
 *
 * `toolbar_actions` declares actions that THIS surface contributes to
 * the header toolbar. The provider aggregates across all surfaces
 * (amendment 3); the header itself just renders the aggregated set.
 */
export const MetaEntityDocumentHeaderSurfaceSchema = MetaEntitySurfaceBaseSchema.extend({
  kind: z.literal("document_header"),
  config: z.object({
    header_composer_code:  z.string().min(1),
    amount_summary_fields: z.array(AmountSummaryFieldSchema).default([]),
    side_car_slots:        z.array(z.string().min(1)).default([]),
    toolbar_actions:       z.array(SurfaceToolbarActionSchema).default([]),
  }).catchall(z.unknown()),
}).catchall(z.unknown());
export type MetaEntityDocumentHeaderSurface = z.infer<typeof MetaEntityDocumentHeaderSurfaceSchema>;

/**
 * polymorphic_pc_lines — line grid + per-row PC/AD expansion.
 *
 * Bindings reference `control.polymorphic_child_binding.binding_code`
 * (Sprint 3 P3a). The provider's useDocumentChildren consumes them
 * and produces a single canonical line collection (amendment 2).
 *
 * tax_profile / condition_type_capabilities feed the drawer config
 * props from Sprint 2 P2c.2.
 */
export const MetaEntityPolymorphicPcLinesSurfaceSchema = MetaEntitySurfaceBaseSchema.extend({
  kind: z.literal("polymorphic_pc_lines"),
  config: z.object({
    line_binding_code:               z.string().min(1),
    pricing_component_binding_code:  z.string().min(1).optional(),
    distribution_binding_code:       z.string().min(1).optional(),
    condition_type_lookup_code:      z.string().min(1).optional(),
    tax_group_lookup_code:           z.string().min(1).optional(),
    tax_profile_code:                z.string().min(1).optional(),
    condition_type_capabilities:     JsonObjectSchema.optional(),
  }).catchall(z.unknown()),
}).catchall(z.unknown());
export type MetaEntityPolymorphicPcLinesSurface = z.infer<typeof MetaEntityPolymorphicPcLinesSurfaceSchema>;

/**
 * header_scope_pc_strip — projection strip below the lines grid.
 * Sibling-aware: reads the same PC binding as polymorphic_pc_lines
 * via the provider context (no separate fetch).
 */
export const MetaEntityHeaderScopePcStripSurfaceSchema = MetaEntitySurfaceBaseSchema.extend({
  kind: z.literal("header_scope_pc_strip"),
  config: z.object({
    label_override: z.string().min(1).optional(),
  }).catchall(z.unknown()).optional(),
}).catchall(z.unknown());
export type MetaEntityHeaderScopePcStripSurface = z.infer<typeof MetaEntityHeaderScopePcStripSurfaceSchema>;

/**
 * postings_preview — read-only GL aggregation sheet.
 *
 * `posting_strategy_code` references the in-process strategy registry
 * (e.g. "ap_invoice", "ar_invoice", "je_passthrough"). Strategies are
 * code-resident TS modules (v5 §3.9 / §4.9 decision); the descriptor
 * just references them by code.
 *
 * `toolbar_action` is what the document_header surface picks up via
 * the aggregated toolbar action registry (amendment 3).
 */
export const MetaEntityPostingsPreviewSurfaceSchema = MetaEntitySurfaceBaseSchema.extend({
  kind: z.literal("postings_preview"),
  config: z.object({
    posting_strategy_code: z.string().min(1),
    toolbar_action:        SurfaceToolbarActionSchema.optional(),
  }).catchall(z.unknown()),
}).catchall(z.unknown());
export type MetaEntityPostingsPreviewSurface = z.infer<typeof MetaEntityPostingsPreviewSurfaceSchema>;

export const MetaEntitySurfaceSchema = z.discriminatedUnion("kind", [
  MetaEntityFieldsSurfaceSchema,
  MetaEntityLineItemsSurfaceSchema,
  MetaEntityChildRecordsSurfaceSchema,
  MetaEntityGenericSurfaceSchema,
  // P5a document-runtime additions
  MetaEntityDocumentHeaderSurfaceSchema,
  MetaEntityPolymorphicPcLinesSurfaceSchema,
  MetaEntityHeaderScopePcStripSurfaceSchema,
  MetaEntityPostingsPreviewSurfaceSchema,
]);
export type MetaEntitySurface = z.infer<typeof MetaEntitySurfaceSchema>;

// Canonical disabled-reason codes carried in the descriptor. UI consumers
// render these as tooltips; downstream rule engines key off them.
export const DisabledReasonSchema = z.enum([
  "missing_permission",
  "denied_by_grant",
  "plan_locked",
  "module_disabled",
  "feature_disabled",
  "plane_excluded",
  "entity_readonly",
  "record_status_blocked",
  "lifecycle_locked",
  "binding_expired",
  "handler_invalid",
  "deprecated_alias",
  "hard_delete_disabled",
  "records_api_disabled",
  "default_deny_policy",
  "entity_hidden",
]);
export type DisabledReason = z.infer<typeof DisabledReasonSchema>;

export const MetaEntityCapabilitiesSchema = z.object({
  canRead: z.boolean(),
  canCreate: z.boolean(),
  canEdit: z.boolean(),
  canDelete: z.boolean(),
  // Reason codes; null when the corresponding flag is true.
  canCreateReason: DisabledReasonSchema.nullable().default(null),
  canEditReason: DisabledReasonSchema.nullable().default(null),
  canDeleteReason: DisabledReasonSchema.nullable().default(null),
  hasLineItems: z.boolean(),
  hasChildRecords: z.boolean(),
  hasDistributions: z.boolean(),
  hasAttachments: z.boolean(),
  hasComments: z.boolean(),
  hasWorkflow: z.boolean(),
  hasLifecycle: z.boolean(),
  hasVersions: z.boolean(),
  hasCompare: z.boolean(),
  hasActivityLog: z.boolean(),
  hasAuditTrail: z.boolean(),
  hasAuditSummary: z.boolean(),
  hasImport: z.boolean(),
  hasBulk: z.boolean(),
  isReadOnly: z.boolean(),
});
export type MetaEntityCapabilities = z.infer<typeof MetaEntityCapabilitiesSchema>;

// Lifecycle state mask carried per (entity, record_status). Populated from
// control.entity_lifecycle_state_mask. UI uses this to disable edit/delete
// actions when the current record's status is gated.
//
// `disabledReason` here is intentionally an open string (not the enum) because
// the mask table stores domain-specific reasons (posted_locked, period_closed,
// matched_lock, ...) that the UI renders as-is and the schema cannot fully
// enumerate ahead of time.
export const MetaEntityLifecycleStateMaskSchema = z.object({
  recordStatus: z.string().min(1),
  canEdit: z.boolean(),
  canDelete: z.boolean(),
  canTransitionTo: z.array(z.string()).optional(),
  disabledReason: z.string().nullable().default(null),
});
export type MetaEntityLifecycleStateMask = z.infer<typeof MetaEntityLifecycleStateMaskSchema>;

export const MetaEntityFieldSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  columnName: z.string(),
  label: z.string().min(1),
  dataType: z.string().min(1),
  uiType: z.string().optional(),
  format: z.string().optional(),
  unit: z.string().optional(),
  cardinality: z.string().optional(),
  origin: z.string().optional(),
  groupKey: z.string().optional(),
  order: z.number().int(),
  isRequired: z.boolean(),
  isUnique: z.boolean(),
  isSearchable: z.boolean(),
  isFilterable: z.boolean(),
  isSortable: z.boolean(),
  isGroupable: z.boolean(),
  isAggregatable: z.boolean(),
  isPii: z.boolean().optional(),
  isReadOnly: z.boolean(),
  isComputed: z.boolean(),
  isWriteOnce: z.boolean(),
  enumDomainCode: z.string().optional(),
  referenceEntity: z.string().optional(),
  childEntityName: z.string().optional(),
  childFkField: z.string().optional(),
  lookupConfig: JsonObjectSchema.optional(),
  lookupProfile: JsonObjectSchema.optional(),
  referenceConfig: JsonObjectSchema.optional(),
  filterConfig: JsonObjectSchema.optional(),
  optionSource: MetaEntityOptionSourceSchema.optional(),
  editor: MetaEntityFieldEditorSchema.optional(),
  display: MetaEntityFieldDisplaySchema.optional(),
  visibility: JsonObjectSchema.optional(),
  editability: JsonObjectSchema.optional(),
  validation: JsonObjectSchema.optional(),
  constraints: JsonObjectSchema.optional(),
  defaultValue: z.unknown().optional(),
});
export type MetaEntityField = z.infer<typeof MetaEntityFieldSchema>;

export const MetaEntityOperationSchema = z.object({
  key: z.string().min(1),
  permissionCode: z.string().min(1),
  surface: z.enum(["LIST", "DETAIL", "BOTH", "PALETTE_ONLY", "HIDDEN"]),
  placement: z.enum(["PRIMARY", "TOOLBAR", "OVERFLOW", "CONTEXT", "COMMAND"]),
  handlerType: z.enum(["NAVIGATE", "API", "MODAL", "INLINE"]),
  handlerTarget: z.string().nullable().optional(),
  isRecordRequired: z.boolean(),
  order: z.number().int(),
  label: z.string().nullable().optional(),
  icon: z.string().nullable().optional(),
  enabled: z.boolean(),
  disabledReason: z.string().optional(),
  actionGroup: z.enum(["lifecycle", "record", "general", "workflow_task"]).optional(),
  intent: z.enum(["neutral", "success", "warning", "danger"]).optional(),
  requiresConfirmation: z.boolean().optional(),
  requiresReason: z.boolean().optional(),
  source: z.enum(["entity_operation", "lifecycle_transition", "workflow_task"]).optional(),
  permissionDecision: z.enum(["allow", "deny", "not_found", "not_in_plan", "addon_required", "not_granted"]).optional(),
  lifecycleTransitions: z.array(z.object({
    transitionId: z.string().optional(),
    lifecycleId: z.string().optional(),
    fromState: z.string().min(1),
    toState: z.string().min(1),
    requiresReason: z.boolean().optional(),
    requiresConfirmation: z.boolean().optional(),
  }).catchall(z.unknown())).optional(),
  // Interaction surface contract (Phase 1, contract v1.1).
  // Both optional and additive — existing v1 descriptors keep validating
  // because the runtime treats absence as "no interaction surface declared".
  interactionSurfaceKind: InteractionSurfaceKindSchema.optional(),
  interactionOptions: InteractionOptionsSchema.optional(),
}).superRefine((op, ctx) => {
  const kind = op.interactionSurfaceKind;
  const opts = op.interactionOptions;

  // Rule 1 — interactionSurfaceKind requires handlerType=MODAL (one-way).
  // The reverse is intentionally not enforced: legacy ops may declare
  // handlerType=MODAL without an explicit interactionSurfaceKind. Those
  // render with the runtime's default modal chrome until migrated.
  if (kind && op.handlerType !== "MODAL") {
    ctx.addIssue({
      code: "custom",
      path: ["interactionSurfaceKind"],
      message: `interactionSurfaceKind requires handlerType=MODAL (got ${op.handlerType})`,
    });
  }

  // Rule 2 — interactionOptions requires interactionSurfaceKind.
  if (opts && !kind) {
    ctx.addIssue({
      code: "custom",
      path: ["interactionOptions"],
      message: "interactionOptions requires interactionSurfaceKind",
    });
  }

  // Rules 3-9 (and source-adapter shape check) live in the shared shape
  // validator so override merge + op schema cannot drift.
  if (kind) {
    const issues = validateInteractionSurfaceShape({ kind, options: opts });
    for (const issue of issues) {
      ctx.addIssue({
        code: "custom",
        path: [...issue.path],
        message: issue.message,
      });
    }
  }
});
export type MetaEntityOperation = z.infer<typeof MetaEntityOperationSchema>;

export const MetaEntityRelationSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  kind: z.enum(["belongs_to", "has_many", "m2m"]),
  targetEntity: z.string().min(1),
  fkField: z.string().optional(),
  targetKey: z.string().default("id"),
  onDelete: z.string().optional(),
  uiBehavior: JsonObjectSchema.default({}),
  surfaceKind: z.enum(["line_items", "child_records", "reference"]).optional(),
});
export type MetaEntityRelation = z.infer<typeof MetaEntityRelationSchema>;

export const MetaEntitySourceSchema = z.object({
  entityId: z.string().optional(),
  entityVersionId: z.string().optional(),
  versionNo: z.number().int().optional(),
  versionHash: z.string().optional(),
  tableSchema: z.string().min(1),
  tableName: z.string().min(1),
  backingType: z.enum(["table", "view", "external"]).default("table"),
  entityClass: z.string().min(1),
  ownershipModel: z.string().min(1).default("system"),
});
export type MetaEntitySource = z.infer<typeof MetaEntitySourceSchema>;

export const MetaEntityPolicySummarySchema = z.object({
  accessMode: z.string().optional(),
  companyScopeMode: z.string().optional(),
  auditMode: z.enum(["enabled", "disabled", "sampling"]).optional(),
  fieldScopeEvalOrder: z.string().optional(),
  hasFieldSecurity: z.boolean().default(false),
  securityTier: z.string().optional(),
  governanceLevel: z.string().optional(),
  mutability: z.string().optional(),
});
export type MetaEntityPolicySummary = z.infer<typeof MetaEntityPolicySummarySchema>;

export const MetaEntityLifecycleSummarySchema = z.object({
  enabled: z.boolean(),
  lifecycleId: z.string().optional(),
  lifecycleCode: z.string().optional(),
  initialState: z.string().optional(),
  states: z.array(z.string()).default([]),
  terminalStates: z.array(z.string()).default([]),
  transitions: z.array(z.string()).default([]),
});
export type MetaEntityLifecycleSummary = z.infer<typeof MetaEntityLifecycleSummarySchema>;

export const MetaEntityWorkflowSummarySchema = z.object({
  enabled: z.boolean(),
  workflowCode: z.string().optional(),
  templateCode: z.string().optional(),
  stages: z.array(z.string()).default([]),
  slaTargetHours: z.number().optional(),
});
export type MetaEntityWorkflowSummary = z.infer<typeof MetaEntityWorkflowSummarySchema>;

export const ProcessRuntimeLifecycleSourceSchema = z.enum([
  "lifecycle_instance",
  "record_status",
  "none",
]);
export type ProcessRuntimeLifecycleSource = z.infer<typeof ProcessRuntimeLifecycleSourceSchema>;

export const LifecycleTransitionSchema = z.object({
  fromStatus: z.string().nullable(),
  toStatus: z.string(),
  transitionedAt: z.string(),
  actorName: z.string().nullable().optional(),
  actorCode: z.string().nullable().optional(),
  remarks: z.string().nullable().optional(),
  operationCode: z.string().nullable().optional(),
});
export type LifecycleTransition = z.infer<typeof LifecycleTransitionSchema>;

export const LifecycleStepStatusSchema = z.enum(["completed", "current", "future"]);
export type LifecycleStepStatus = z.infer<typeof LifecycleStepStatusSchema>;

export const LifecycleStepSchema = z.object({
  state: z.string(),
  label: z.string().optional(),
  status: LifecycleStepStatusSchema,
  enteredAt: z.string().nullable().optional(),
  exitedAt: z.string().nullable().optional(),
  actorName: z.string().nullable().optional(),
});
export type LifecycleStep = z.infer<typeof LifecycleStepSchema>;

export const ProcessRuntimeLifecycleStateSchema = z.object({
  currentState: z.string().nullable(),
  currentStateEnteredAt: z.string().nullable().optional(),
  source: ProcessRuntimeLifecycleSourceSchema,
  allowedTransitions: z.array(z.string()).default([]),
  terminal: z.boolean(),
  drift: z.object({
    lifecycleInstanceState: z.string().nullable().optional(),
    recordStatus: z.string().nullable().optional(),
  }).optional(),
  transitions: z.array(LifecycleTransitionSchema).optional(),
  steps: z.array(LifecycleStepSchema).optional(),
}).catchall(z.unknown());
export type ProcessRuntimeLifecycleState = z.infer<typeof ProcessRuntimeLifecycleStateSchema>;

export const ProcessRuntimeWorkflowStateSchema = z.object({
  requestId: z.string().optional(),
  status: z.string().optional(),
  currentStage: z.string().optional(),
  pendingTasks: z.number().int().nonnegative().default(0),
  userTaskActions: z.array(z.string()).default([]),
}).catchall(z.unknown());
export type ProcessRuntimeWorkflowState = z.infer<typeof ProcessRuntimeWorkflowStateSchema>;

export const DisabledOperationReasonCodeSchema = z.enum([
  "wrong_state",
  "terminal_state",
  "missing_permission",
  "workflow_task_not_assigned",
  "handler_disabled",
  "record_required",
  "unsupported_mode",
]);
export type DisabledOperationReasonCode = z.infer<typeof DisabledOperationReasonCodeSchema>;

export const DisabledOperationReasonSchema = z.object({
  code: DisabledOperationReasonCodeSchema,
  message: z.string().min(1),
}).catchall(z.unknown());
export type DisabledOperationReason = z.infer<typeof DisabledOperationReasonSchema>;

export const ProcessRuntimeStateSchema = z.object({
  entityCode: z.string().min(1),
  recordId: z.string().min(1),
  lifecycle: ProcessRuntimeLifecycleStateSchema.optional(),
  workflow: ProcessRuntimeWorkflowStateSchema.optional(),
  disabledOperations: z.record(z.string(), DisabledOperationReasonSchema).optional(),
}).catchall(z.unknown());
export type ProcessRuntimeState = z.infer<typeof ProcessRuntimeStateSchema>;

export const RuntimeRecordSchema = z.object({
  id: z.string().optional(),
  data: JsonObjectSchema.optional(),
  status: z.string().nullable().optional(),
  version: z.union([z.string(), z.number()]).nullable().optional(),
}).catchall(z.unknown());
export type RuntimeRecord = z.infer<typeof RuntimeRecordSchema>;

export const RuntimeMutationErrorSchema = z.object({
  field: z.string().optional(),
  code: z.string().optional(),
  message: z.string().min(1),
}).catchall(z.unknown());
export type RuntimeMutationError = z.infer<typeof RuntimeMutationErrorSchema>;

export const RuntimeOperationExecutionInputSchema = z.object({
  entityCode: z.string().min(1),
  recordId: z.string().optional(),
  operationCode: z.string().min(1),
  payload: JsonObjectSchema.optional(),
  remarks: z.string().optional(),
  correlationId: z.string().optional(),
}).catchall(z.unknown());
export type RuntimeOperationExecutionInput = z.infer<typeof RuntimeOperationExecutionInputSchema>;

export const RuntimeOperationExecutionResultSchema = z.object({
  record: RuntimeRecordSchema.optional(),
  processState: ProcessRuntimeStateSchema.optional(),
  nextHref: z.string().optional(),
  flowBundle: z.unknown().optional(),
  lifecycleState: z.string().optional(),
  workflowStage: z.string().optional(),
  errors: z.array(RuntimeMutationErrorSchema).optional(),
}).catchall(z.unknown());
export type RuntimeOperationExecutionResult = z.infer<typeof RuntimeOperationExecutionResultSchema>;

export const MetaEntityNumberingSummarySchema = z.object({
  enabled: z.boolean(),
  numberField: z.string().optional(),
  resetStrategy: z.string().optional(),
  uniquenessScope: z.string().optional(),
  segments: z.array(z.unknown()).default([]),
});
export type MetaEntityNumberingSummary = z.infer<typeof MetaEntityNumberingSummarySchema>;

export const MetaEntityConcurrencySummarySchema = z.object({
  strategy: z.enum(["none", "version_only", "lease_plus_version"]).default("none"),
  rollout: z.enum(["observe", "optional", "enforced"]).default("observe"),
  versionColumn: z.string().optional(),
  lockTtlSeconds: z.number().int().positive().optional(),
  heartbeatSeconds: z.number().int().positive().optional(),
  children: z.array(z.string()).default([]),
  referencesExcluded: z.array(z.string()).default([]),
});
export type MetaEntityConcurrencySummary = z.infer<typeof MetaEntityConcurrencySummarySchema>;

export const MetaEntityExtensionsSchema = z.record(z.string(), z.unknown());
export type MetaEntityExtensions = z.infer<typeof MetaEntityExtensionsSchema>;

export const MetaEntityContractAuditSchema = z.object({
  compiledAt: z.string().optional(),
  compiledHash: z.string().optional(),
  descriptorHash: z.string().optional(),
});
export type MetaEntityContractAudit = z.infer<typeof MetaEntityContractAuditSchema>;

export const MetaEntityFieldGroupSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional(),
  order: z.number().int(),
  columns: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(2),
  pageSpan: z.enum(["narrow", "half", "wide", "full"]).default("full"),
  surface: z.enum(["detail", "edit", "create", "print", "all"]).default("all"),
  role: z.string().optional(),
  initiallyCollapsed: z.boolean().default(false),
}).catchall(z.unknown());
export type MetaEntityFieldGroup = z.infer<typeof MetaEntityFieldGroupSchema>;

export const MetaEntityRuntimeDescriptorSchema = z.object({
  contractVersion: z.literal(META_ENTITY_RUNTIME_CONTRACT_VERSION),
  entityCode: z.string().min(1),
  entityName: z.string().min(1),
  routeSlug: z.string().min(1),
  renderer: MetaEntityRendererSchema,
  capabilities: MetaEntityCapabilitiesSchema,
  surfaces: z.array(MetaEntitySurfaceSchema),
  fields: z.array(MetaEntityFieldSchema),
  fieldGroups: z.array(MetaEntityFieldGroupSchema).default([]),
  operations: z.array(MetaEntityOperationSchema),
  relations: z.array(MetaEntityRelationSchema),
  source: MetaEntitySourceSchema,
  policy: MetaEntityPolicySummarySchema,
  lifecycle: MetaEntityLifecycleSummarySchema.optional(),
  /**
   * Per-status capability masks resolved from control.entity_lifecycle_state_mask.
   * UI consumers consult these to disable edit/delete actions when the active
   * record is in a locked status (posted journal, archived supplier, etc).
   * Empty array means no mask is applied for this entity.
   */
  lifecycleStateMasks: z.array(MetaEntityLifecycleStateMaskSchema).default([]),
  workflow: MetaEntityWorkflowSummarySchema.optional(),
  numbering: MetaEntityNumberingSummarySchema.optional(),
  concurrency: MetaEntityConcurrencySummarySchema.optional(),
  extensions: MetaEntityExtensionsSchema.optional(),
  audit: MetaEntityContractAuditSchema,
}).superRefine((desc, ctx) => {
  // Descriptor-level guard: addContract.targetRelation must be a declared
  // has_many or m2m relation. belongs_to is rejected — add ops append into
  // a collection, not into a scalar parent reference.
  const relationByKey = new Map(desc.relations.map((r) => [r.key, r] as const));
  desc.operations.forEach((op, opIdx) => {
    const addContract = op.interactionOptions?.addContract;
    if (!addContract) return;
    const rel = relationByKey.get(addContract.targetRelation);
    if (!rel) {
      ctx.addIssue({
        code: "custom",
        path: ["operations", opIdx, "interactionOptions", "addContract", "targetRelation"],
        message: `targetRelation "${addContract.targetRelation}" is not declared in relations[]`,
      });
      return;
    }
    if (rel.kind === "belongs_to") {
      ctx.addIssue({
        code: "custom",
        path: ["operations", opIdx, "interactionOptions", "addContract", "targetRelation"],
        message: `targetRelation "${addContract.targetRelation}" is belongs_to; add ops require has_many or m2m`,
      });
    }
  });
});
export type MetaEntityRuntimeDescriptor = z.infer<typeof MetaEntityRuntimeDescriptorSchema>;

export function assertMetaEntityRuntimeDescriptor(value: unknown): MetaEntityRuntimeDescriptor {
  return MetaEntityRuntimeDescriptorSchema.parse(value);
}

// ═══════════════════════════════════════════════════════════════
// ENTITY PRINT CONFIG — display_config.print_config
// Defines the metadata-driven print/PDF output contract for
// entity detail pages. Lives here (not in deprecated api-contracts).
// ═══════════════════════════════════════════════════════════════

export const EntityPrintSectionSchema = z.object({
  key:       z.string(),
  label:     z.string(),
  fields:    z.array(z.string()),
  /** Field grid column count for this section (overrides layout.field_columns). */
  columns:   z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  collapsed: z.boolean().optional(),
});
export type EntityPrintSection = z.infer<typeof EntityPrintSectionSchema>;

export const EntityPrintConfigSchema = z.object({
  /** Set false to hide the Print / Save PDF action entirely. */
  enabled:               z.boolean().optional(),
  /** Key of a registered PrintTemplate. Falls back to EntityPrintTemplate when absent. */
  template:              z.string().optional(),
  /** Allowlist of field names to include (in order). Overrides group-based selection. */
  included_fields:       z.array(z.string()).nullable().optional(),
  /** Field names to exclude from print output in addition to hard exclusions. */
  excluded_fields:       z.array(z.string()).optional(),
  /** Explicit section definitions. When present, overrides group-based auto-section. */
  sections:              z.array(EntityPrintSectionSchema).optional(),
  /** Order of field_group keys in the output. Groups not listed go last. */
  group_order:           z.array(z.string()).optional(),
  /** Human-readable label overrides for field groups (keyed by group_key). */
  group_label_overrides: z.record(z.string(), z.string()).optional(),
  /** Human-readable label overrides for individual fields (keyed by field.name). */
  field_label_overrides: z.record(z.string(), z.string()).optional(),
  /** Field names pinned to the identity header as key facts. */
  header_pin_fields:     z.array(z.string()).optional(),
  layout: z.object({
    mode:          z.enum(["standard", "two_column"]).optional(),
    /** Default field grid column count applied to all sections that don't override. Default: 2 for print. */
    field_columns: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  }).optional(),
}).passthrough();
export type EntityPrintConfig = z.infer<typeof EntityPrintConfigSchema>;
