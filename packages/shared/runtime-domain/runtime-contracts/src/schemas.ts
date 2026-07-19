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
import { AnyDocumentEditRuntimeContractSchema } from "./document-edit-runtime";

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
  // payment_terms is a sidecar slot under document_header, not a separate kind.
  "polymorphic_pc_lines",       // DEPRECATED — superseded by `document_lines` (compat alias retained during migration)
  "header_scope_pc_strip",      // DEPRECATED — superseded by `document_components`
  "postings_preview",
  // Phase D.3 — Identity strip (party + address + bank + contact)
  // Phase 4 — Streamlined Identity panel (resolve early, freeze at submit)
  "document_identity_summary",
  "document_identity_panel_v2",
  // Phase 2 — generic document surface model (entity.md §"Document Surface Model").
  // `document_lines` and `document_components` are aliased to PolymorphicPcLines /
  // HeaderScopePcStrip renderers during the compatibility window; PI emits both names.
  "document_lines",
  "document_components",
  "document_schedules",
  "document_accounting",
  "document_rows",
  "document_matching_panel",
]);
export type MetaEntitySurfaceKind = z.infer<typeof MetaEntitySurfaceKindSchema>;

export const MetaEntitySurfacePlacementSchema = z.enum([
  "main",
  "context_panel",
  "subroute",
  "header",
  "inline",
  // Phase 2 — action-only surfaces register toolbar actions without rendering a section.
  // postings_preview is the canonical consumer (button on header → sheet on dispatch).
  "action_only",
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
    kind: z.literal("lifecycle"),
    entityLifecycle: z.literal("current"),
    // Resolved at descriptor compilation from the tenant-preferred lifecycle
    // binding. fallbackOptions are legacy static values only and never win
    // over an authoritative lifecycle-state label.
    options: z.array(MetaEntityOptionSchema).default([]),
    fallbackOptions: z.array(MetaEntityOptionSchema).default([]),
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

/**
 * Temporal semantics for a date/time field. Locks how the value is stored AND displayed.
 *
 *   "businessDate"  — calendar date in the company-code locale, no timezone.
 *                     Ideal storage: DATE. Wire: "YYYY-MM-DD".
 *   "instant"       — absolute moment on the global timeline.
 *                     Storage: TIMESTAMPTZ. Wire: ISO with explicit "Z".
 *                     Displayed in the user's timezone.
 *   "zonedDateTime" — wall-clock in a fixed IANA zone (e.g. job runs at
 *                     18:00 Riyadh always). Storage: TIMESTAMP + tz TEXT.
 *
 * Resolution at runtime: explicit field.temporalKind wins; otherwise inferred
 * from data_type ("date" → businessDate; "timestamptz" → instant; "timestamp"
 * without TZ → error). See @athyper/temporal::resolveTemporalKind.
 */
export const TemporalKindSchema = z.enum(["businessDate", "instant", "zonedDateTime"]);
export type TemporalKind = z.infer<typeof TemporalKindSchema>;

/**
 * UI-only render mode for temporal fields. Permits a TIMESTAMPTZ column whose
 * business meaning is date-only to render without a time component (Field A
 * fallback path — prefer storage=DATE whenever feasible).
 *
 *   "date"     — render no time component.
 *   "dateTime" — render date and time.
 *
 * Cross-rule: displayMode="date" requires temporalKind="businessDate".
 */
export const TemporalDisplayModeSchema = z.enum(["date", "dateTime"]);
export type TemporalDisplayMode = z.infer<typeof TemporalDisplayModeSchema>;

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

export const MetaEntityCollectionTitleConfigSchema = z.object({
  showCount: z.boolean().optional(),
}).catchall(z.unknown());
export type MetaEntityCollectionTitleConfig = z.infer<typeof MetaEntityCollectionTitleConfigSchema>;

export const MetaEntityCollectionSearchConfigSchema = z.object({
  placeholder: z.string().min(1).optional(),
  keys: z.array(z.string().min(1)).optional(),
}).catchall(z.unknown());
export type MetaEntityCollectionSearchConfig = z.infer<typeof MetaEntityCollectionSearchConfigSchema>;

export const MetaEntityCollectionToolbarConfigSchema = z.object({
  search: z.union([z.boolean(), MetaEntityCollectionSearchConfigSchema]).optional(),
  columns: z.boolean().optional(),
  primaryAction: z.enum(["create", "add_item", "none"]).optional(),
}).catchall(z.unknown());
export type MetaEntityCollectionToolbarConfig = z.infer<typeof MetaEntityCollectionToolbarConfigSchema>;

export const MetaEntityCollectionTableConfigSchema = z.object({
  visibleColumns: z.array(z.string().min(1)).optional(),
  pinnedColumns: z.array(z.string().min(1)).optional(),
  mobileColumns: z.array(z.string().min(1)).optional(),
  virtualized: z.boolean().optional(),
  disableHeaderSort: z.boolean().optional(),
  pagination: z.enum(["none", "server"]).optional(),
  pageSize: z.number().int().positive().optional(),
}).catchall(z.unknown());
export type MetaEntityCollectionTableConfig = z.infer<typeof MetaEntityCollectionTableConfigSchema>;

export const MetaEntityCollectionRowConfigSchema = z.object({
  selection: z.boolean().optional(),
  clickAction: z.enum(["edit", "expand", "none"]).optional(),
  expansionKey: z.string().min(1).optional(),
}).catchall(z.unknown());
export type MetaEntityCollectionRowConfig = z.infer<typeof MetaEntityCollectionRowConfigSchema>;

export const MetaEntitySelectionBarGroupSchema = z.object({
  key: z.enum(["item", "components", "accounting", "clipboard", "danger"]),
  label: z.string().min(1).optional(),
  singleLabel: z.string().min(1).optional(),
  multipleLabel: z.string().min(1).optional(),
  presentation: z.enum(["direct", "menu", "responsive"]).default("direct"),
  order: z.number().int(),
}).catchall(z.unknown());

export const MetaEntitySelectionBarConfigSchema = z.object({
  groups: z.array(MetaEntitySelectionBarGroupSchema).default([]),
}).catchall(z.unknown());

export const MetaEntityCollectionConfigSchema = z.object({
  title: MetaEntityCollectionTitleConfigSchema.optional(),
  toolbar: MetaEntityCollectionToolbarConfigSchema.optional(),
  table: MetaEntityCollectionTableConfigSchema.optional(),
  row: MetaEntityCollectionRowConfigSchema.optional(),
  selectionBar: MetaEntitySelectionBarConfigSchema.optional(),
}).catchall(z.unknown());
export type MetaEntityCollectionConfig = z.infer<typeof MetaEntityCollectionConfigSchema>;

export const MetaEntityLineItemsExtrasSchema = z.object({
  variant: z.string().min(1).optional(),
  sourceAdapters: z.array(z.string().min(1)).optional(),
  summaryProvider: z.string().min(1).optional(),
  totals: z.object({
    enabled: z.boolean().optional(),
    mode: z.enum(["visible_numeric_columns", "configured_fields"]).optional(),
    fields: z.array(z.string().min(1)).optional(),
  }).catchall(z.unknown()).optional(),
  composerKey: z.string().min(1).optional(),
  editorKey: z.string().min(1).optional(),
  mobileRowRendererKey: z.string().min(1).optional(),
}).catchall(z.unknown());
export type MetaEntityLineItemsExtras = z.infer<typeof MetaEntityLineItemsExtrasSchema>;

export const MetaEntityLineItemsSurfaceSchema = MetaEntitySurfaceBaseSchema.extend({
  kind: z.literal("line_items"),
  entityCode: z.string().min(1),
  parentField: z.string().min(1).optional(),
  parentIdField: z.string().min(1).optional(),
  relationName: z.string().min(1).optional(),
  mutationOwner: z.enum(["direct_crud", "workspace"]).default("direct_crud"),
  displayMode: z.enum(["grid", "cards", "split_accounting"]).default("grid"),
  collection: MetaEntityCollectionConfigSchema.optional(),
  line: MetaEntityLineItemsExtrasSchema.optional(),
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
  mutationOwner: z.literal("direct_crud").default("direct_crud"),
  displayMode: z.enum(["table", "cards", "drawer", "accordion"]).default("table"),
  collection: MetaEntityCollectionConfigSchema.optional(),
  canCreate: z.boolean(),
  canEdit: z.boolean(),
  canDelete: z.boolean(),
}).catchall(z.unknown());
export type MetaEntityChildRecordsSurface = z.infer<typeof MetaEntityChildRecordsSurfaceSchema>;

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
/**
 * polymorphic_pc_lines — line grid + per-row PC/AD expansion.
 *
 * Child collections reference descriptor relation names. The provider's
 * useDocumentChildren consumes them and produces a single canonical line
 * collection (amendment 2).
 *
 * tax_profile / condition_type_capabilities feed the drawer config
 * props from Sprint 2 P2c.2.
 */
export const MetaEntityPolymorphicPcLinesSurfaceSchema = MetaEntitySurfaceBaseSchema.extend({
  kind: z.literal("polymorphic_pc_lines"),
  config: z.object({
    relations: z.object({
      lines: z.string().min(1),
      pricingComponents: z.string().min(1).optional(),
      distributions: z.string().min(1).optional(),
      schedules: z.string().min(1).optional(),
    }).optional(),
    line_binding_code:               z.string().min(1).optional(),
    pricing_component_binding_code:  z.string().min(1).optional(),
    distribution_binding_code:       z.string().min(1).optional(),
    condition_type_lookup_code:      z.string().min(1).optional(),
    charge_condition_type_lookup_code: z.string().min(1).optional(),
    tax_condition_type_lookup_code:  z.string().min(1).optional(),
    tax_group_lookup_code:           z.string().min(1).optional(),
    tax_profile_code:                z.string().min(1).optional(),
    condition_type_capabilities:     JsonObjectSchema.optional(),
  }).catchall(z.unknown()),
}).catchall(z.unknown());
export type MetaEntityPolymorphicPcLinesSurface = z.infer<typeof MetaEntityPolymorphicPcLinesSurfaceSchema>;

/**
 * header_scope_pc_strip — projection strip below the lines grid.
 * Sibling-aware: reads the same PC relation as polymorphic_pc_lines
 * via the provider context (no separate fetch).
 */
export const MetaEntityHeaderScopePcStripSurfaceSchema = MetaEntitySurfaceBaseSchema.extend({
  kind: z.literal("header_scope_pc_strip"),
  config: z.object({
    label_override: z.string().min(1).optional(),
    condition_type_lookup_code: z.string().min(1).optional(),
    charge_condition_type_lookup_code: z.string().min(1).optional(),
    tax_condition_type_lookup_code: z.string().min(1).optional(),
    tax_group_lookup_code: z.string().min(1).optional(),
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

/**
 * document_identity_panel_v2 — streamlined Identity panel backed by direct
 * document header fields and live master joins.
 */
export const MetaEntityDocumentIdentitySummarySurfaceSchema = MetaEntitySurfaceBaseSchema.extend({
  kind: z.union([z.literal("document_identity_summary"), z.literal("document_identity_panel_v2")]),
  config: z.object({
    buyer_owner_type:  z.enum(["company_code", "customer"]).optional(),
    seller_owner_type: z.enum(["supplier", "company_code"]).optional(),
    doc_entity_code:   z.string().min(1).optional(),
    docType:           z.string().min(1).optional(),
    site_id_field:     z.string().min(1).optional(),
  }).catchall(z.unknown()),
}).catchall(z.unknown());
export type MetaEntityDocumentIdentitySummarySurface = z.infer<typeof MetaEntityDocumentIdentitySummarySurfaceSchema>;
export const MetaEntityDocumentIdentityPanelV2SurfaceSchema = MetaEntityDocumentIdentitySummarySurfaceSchema;
export type MetaEntityDocumentIdentityPanelV2Surface = MetaEntityDocumentIdentitySummarySurface;

// Phase 2 — generic document surface model.
// Same config shape as the legacy PolymorphicPcLines schema; the registry
// routes both kinds to the same renderer during the compatibility window.
export const MetaEntityDocumentLinesSurfaceSchema = MetaEntitySurfaceBaseSchema.extend({
  kind: z.literal("document_lines"),
  config: z.object({
    relations: z.object({
      lines: z.string().min(1),
      pricingComponents: z.string().min(1).optional(),
      distributions: z.string().min(1).optional(),
      schedules: z.string().min(1).optional(),
    }).catchall(z.unknown()).optional(),
    line_binding_code: z.string().min(1).optional(),
    condition_type_lookup_code: z.string().min(1).optional(),
    charge_condition_type_lookup_code: z.string().min(1).optional(),
    tax_condition_type_lookup_code: z.string().min(1).optional(),
    tax_group_lookup_code: z.string().min(1).optional(),
    wht_condition_type_lookup_code: z.string().min(1).optional(),
    wht_group_lookup_code: z.string().min(1).optional(),
    /** Phase 2b — source_doc_type for pricing_component mutations (e.g. "PURCHASE_ORDER_LINE"). */
    source_doc_type: z.string().min(1).optional(),
  }).catchall(z.unknown()),
}).catchall(z.unknown());
export type MetaEntityDocumentLinesSurface = z.infer<typeof MetaEntityDocumentLinesSurfaceSchema>;

// Same config shape as legacy HeaderScopePcStrip.
export const MetaEntityDocumentComponentsSurfaceSchema = MetaEntitySurfaceBaseSchema.extend({
  kind: z.literal("document_components"),
  config: z.object({
    label_override: z.string().min(1).optional(),
    condition_type_lookup_code: z.string().min(1).optional(),
    charge_condition_type_lookup_code: z.string().min(1).optional(),
    tax_condition_type_lookup_code: z.string().min(1).optional(),
    tax_group_lookup_code: z.string().min(1).optional(),
    wht_condition_type_lookup_code: z.string().min(1).optional(),
    wht_group_lookup_code: z.string().min(1).optional(),
    /** Phase 2b — source_doc_type for pricing_component mutations. */
    source_doc_type: z.string().min(1).optional(),
  }).catchall(z.unknown()).optional(),
}).catchall(z.unknown());
export type MetaEntityDocumentComponentsSurface = z.infer<typeof MetaEntityDocumentComponentsSurfaceSchema>;

export const MetaEntityDocumentSchedulesSurfaceSchema = MetaEntitySurfaceBaseSchema.extend({
  kind: z.literal("document_schedules"),
  config: z.object({
    relation: z.string().min(1).default("schedules"),
    source_doc_type: z.string().min(1).optional(),
  }).catchall(z.unknown()).optional(),
}).catchall(z.unknown());
export type MetaEntityDocumentSchedulesSurface = z.infer<typeof MetaEntityDocumentSchedulesSurfaceSchema>;

// Accounting tab with per-document mode. Renderer not registered yet
// (lands when first non-PI consumer ships); schema is in so descriptors validate.
export const MetaEntityDocumentAccountingSurfaceSchema = MetaEntitySurfaceBaseSchema.extend({
  kind: z.literal("document_accounting"),
  config: z.object({
    mode: z.enum(["ap_posting_preview", "commitment_preview", "accrual_preview", "cash_application_preview"]),
    posting_strategy_code: z.string().min(1).optional(),
    toolbar_action: SurfaceToolbarActionSchema.optional(),
  }).catchall(z.unknown()),
}).catchall(z.unknown());
export type MetaEntityDocumentAccountingSurface = z.infer<typeof MetaEntityDocumentAccountingSurfaceSchema>;

// Settlement-style rows (Supplier Payment applications). Renderer not yet registered.
export const MetaEntityDocumentRowsSurfaceSchema = MetaEntitySurfaceBaseSchema.extend({
  kind: z.literal("document_rows"),
  config: z.object({
    relation: z.string().min(1),
    row_kind: z.enum(["application", "schedule", "matching_entry"]),
  }).catchall(z.unknown()),
}).catchall(z.unknown());
export type MetaEntityDocumentRowsSurface = z.infer<typeof MetaEntityDocumentRowsSurfaceSchema>;

// Three-way match status (PO ↔ Receipt ↔ PI). Renderer not yet registered.
export const MetaEntityDocumentMatchingPanelSurfaceSchema = MetaEntitySurfaceBaseSchema.extend({
  kind: z.literal("document_matching_panel"),
  config: z.object({
    match_scope: z.enum(["two_way", "three_way"]),
  }).catchall(z.unknown()),
}).catchall(z.unknown());
export type MetaEntityDocumentMatchingPanelSurface = z.infer<typeof MetaEntityDocumentMatchingPanelSurfaceSchema>;

export const MetaEntitySurfaceSchema = z.discriminatedUnion("kind", [
  MetaEntityFieldsSurfaceSchema,
  MetaEntityLineItemsSurfaceSchema,
  MetaEntityChildRecordsSurfaceSchema,
  MetaEntityGenericSurfaceSchema,
  // P5a document-runtime additions
  MetaEntityPolymorphicPcLinesSurfaceSchema,
  MetaEntityHeaderScopePcStripSurfaceSchema,
  MetaEntityPostingsPreviewSurfaceSchema,
  // Phase D.3 identity strip / Phase 4 streamlined identity panel
  MetaEntityDocumentIdentityPanelV2SurfaceSchema,
  // Phase 2 generic document surface model
  MetaEntityDocumentLinesSurfaceSchema,
  MetaEntityDocumentComponentsSurfaceSchema,
  MetaEntityDocumentSchedulesSurfaceSchema,
  MetaEntityDocumentAccountingSurfaceSchema,
  MetaEntityDocumentRowsSurfaceSchema,
  MetaEntityDocumentMatchingPanelSurfaceSchema,
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

export const RECORD_WORKSPACE_DEFINITION_VERSION = "record-workspace/v1" as const;

export const RecordWorkspaceSurfaceReferenceSchema = z.object({
  key: z.string().min(1),
  kind: MetaEntitySurfaceKindSchema,
  placement: MetaEntitySurfacePlacementSchema,
  order: z.number().int(),
  enabled: z.boolean(),
}).strict();
export type RecordWorkspaceSurfaceReference = z.infer<typeof RecordWorkspaceSurfaceReferenceSchema>;

export const RecordWorkspaceResourceBindingSchema = z.object({
  enabled: z.boolean(),
  source: z.enum([
    "none",
    "capability",
    "surface",
    "capability_and_surface",
    "compatibility_fallback",
  ]),
  surfaceKey: z.string().min(1).optional(),
  fallbackReason: z.string().min(1).optional(),
}).strict().superRefine((binding, ctx) => {
  if (!binding.enabled && binding.source !== "none") {
    ctx.addIssue({
      code: "custom",
      path: ["source"],
      message: "disabled workspace resources must use source=none",
    });
  }
  if (binding.enabled && binding.source === "none") {
    ctx.addIssue({
      code: "custom",
      path: ["source"],
      message: "enabled workspace resources require an authoritative source",
    });
  }
  if (
    (binding.source === "surface" || binding.source === "capability_and_surface")
    && !binding.surfaceKey
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["surfaceKey"],
      message: `${binding.source} workspace resources require a surfaceKey`,
    });
  }
  if (binding.source === "compatibility_fallback" && !binding.fallbackReason) {
    ctx.addIssue({
      code: "custom",
      path: ["fallbackReason"],
      message: "compatibility workspace resources require a fallbackReason",
    });
  }
});
export type RecordWorkspaceResourceBinding = z.infer<typeof RecordWorkspaceResourceBindingSchema>;

export const RecordWorkspaceSnapshotsBindingSchema = RecordWorkspaceResourceBindingSchema.safeExtend({
  compareSurfaceKey: z.string().min(1).optional(),
});
export type RecordWorkspaceSnapshotsBinding = z.infer<typeof RecordWorkspaceSnapshotsBindingSchema>;

export const RecordWorkspaceResourcesSchema = z.object({
  approvals: RecordWorkspaceResourceBindingSchema,
  lifecycleTimeline: RecordWorkspaceResourceBindingSchema,
  snapshots: RecordWorkspaceSnapshotsBindingSchema,
  comments: RecordWorkspaceResourceBindingSchema,
  attachments: RecordWorkspaceResourceBindingSchema,
  activity: RecordWorkspaceResourceBindingSchema,
}).strict();
export type RecordWorkspaceResources = z.infer<typeof RecordWorkspaceResourcesSchema>;

export const RecordWorkspaceDefinitionSchema = z.object({
  schemaVersion: z.literal(RECORD_WORKSPACE_DEFINITION_VERSION),
  renderer: MetaEntityRendererSchema,
  initialSurfaceKey: z.string().min(1).nullable(),
  surfaces: z.array(RecordWorkspaceSurfaceReferenceSchema),
  resources: RecordWorkspaceResourcesSchema,
}).strict().superRefine((definition, ctx) => {
  const surfaceByKey = new Map<string, RecordWorkspaceSurfaceReference>();
  definition.surfaces.forEach((surface, index) => {
    if (surfaceByKey.has(surface.key)) {
      ctx.addIssue({
        code: "custom",
        path: ["surfaces", index, "key"],
        message: `workspace surface key "${surface.key}" is duplicated`,
      });
    }
    surfaceByKey.set(surface.key, surface);
  });

  if (definition.initialSurfaceKey) {
    const initial = surfaceByKey.get(definition.initialSurfaceKey);
    if (!initial || !initial.enabled) {
      ctx.addIssue({
        code: "custom",
        path: ["initialSurfaceKey"],
        message: "initialSurfaceKey must reference an enabled workspace surface",
      });
    }
  }

  const expectedKinds: Record<keyof RecordWorkspaceResources, MetaEntitySurfaceKind[]> = {
    approvals: ["workflow"],
    lifecycleTimeline: ["lifecycle"],
    snapshots: ["versions"],
    comments: ["comments"],
    attachments: ["attachments"],
    activity: ["activity_log"],
  };
  for (const [resource, binding] of Object.entries(definition.resources) as Array<
    [keyof RecordWorkspaceResources, RecordWorkspaceResourceBinding]
  >) {
    if (!binding.surfaceKey) continue;
    const surface = surfaceByKey.get(binding.surfaceKey);
    if (!surface || !surface.enabled || !expectedKinds[resource].includes(surface.kind)) {
      ctx.addIssue({
        code: "custom",
        path: ["resources", resource, "surfaceKey"],
        message: `${resource} must reference an enabled ${expectedKinds[resource].join(" or ")} surface`,
      });
    }
  }

  const compareSurfaceKey = definition.resources.snapshots.compareSurfaceKey;
  if (compareSurfaceKey) {
    if (!definition.resources.snapshots.enabled) {
      ctx.addIssue({
        code: "custom",
        path: ["resources", "snapshots", "compareSurfaceKey"],
        message: "compareSurfaceKey requires snapshots to be enabled",
      });
    }
    const compareSurface = surfaceByKey.get(compareSurfaceKey);
    if (!compareSurface || !compareSurface.enabled || compareSurface.kind !== "compare") {
      ctx.addIssue({
        code: "custom",
        path: ["resources", "snapshots", "compareSurfaceKey"],
        message: "compareSurfaceKey must reference an enabled compare surface",
      });
    }
  }
});
export type RecordWorkspaceDefinition = z.infer<typeof RecordWorkspaceDefinitionSchema>;

export const RECORD_WORKSPACE_MANIFEST_VERSION = "record-workspace-manifest/v1" as const;

export const RecordWorkspaceResourceKeySchema = z.enum([
  "approvals",
  "lifecycleTimeline",
  "snapshots",
  "comments",
  "attachments",
  "activity",
]);
export type RecordWorkspaceResourceKey = z.infer<typeof RecordWorkspaceResourceKeySchema>;

export const RecordWorkspaceCacheScopeSchema = z.object({
  kind: z.literal("principal_record"),
  key: z.string().min(1),
  variesBy: z.array(z.enum([
    "tenant",
    "principal",
    "permission_stamp",
    "descriptor",
    "entity",
    "record",
    "record_state",
  ])).min(1),
}).strict();
export type RecordWorkspaceCacheScope = z.infer<typeof RecordWorkspaceCacheScopeSchema>;

export const EffectiveRecordWorkspaceSurfaceSchema = RecordWorkspaceSurfaceReferenceSchema.safeExtend({
  permissionCode: z.string().min(1).optional(),
});
export type EffectiveRecordWorkspaceSurface = z.infer<typeof EffectiveRecordWorkspaceSurfaceSchema>;

export const EffectiveRecordWorkspaceResourceSchema = z.object({
  key: RecordWorkspaceResourceKeySchema,
  surfaceKey: z.string().min(1).optional(),
  compareSurfaceKey: z.string().min(1).optional(),
}).strict();
export type EffectiveRecordWorkspaceResource = z.infer<typeof EffectiveRecordWorkspaceResourceSchema>;

export const EffectiveRecordWorkspaceOperationSchema = z.object({
  key: z.string().min(1),
  permissionCode: z.string().min(1),
  source: z.enum(["entity_operation", "lifecycle_transition", "workflow_task"]).optional(),
}).strict();
export type EffectiveRecordWorkspaceOperation = z.infer<typeof EffectiveRecordWorkspaceOperationSchema>;

export const EffectiveRecordWorkspaceStateSchema = z.object({
  lifecycleState: z.string().nullable(),
  terminal: z.boolean(),
  allowedTransitions: z.array(z.string()),
  workflowStatus: z.string().nullable(),
  pendingWorkflowTasks: z.number().int().nonnegative(),
}).strict();
export type EffectiveRecordWorkspaceState = z.infer<typeof EffectiveRecordWorkspaceStateSchema>;

export const EffectiveRecordWorkspaceManifestSchema = z.object({
  schemaVersion: z.literal(RECORD_WORKSPACE_MANIFEST_VERSION),
  definitionVersion: z.literal(RECORD_WORKSPACE_DEFINITION_VERSION),
  entityCode: z.string().min(1),
  recordId: z.string().min(1),
  renderer: MetaEntityRendererSchema,
  initialSurfaceKey: z.string().min(1).nullable(),
  cacheScope: RecordWorkspaceCacheScopeSchema,
  recordState: EffectiveRecordWorkspaceStateSchema,
  surfaces: z.array(EffectiveRecordWorkspaceSurfaceSchema),
  resources: z.array(EffectiveRecordWorkspaceResourceSchema),
  operations: z.array(EffectiveRecordWorkspaceOperationSchema),
}).strict().superRefine((manifest, ctx) => {
  const surfaceKeys = new Set(manifest.surfaces.map((surface) => surface.key));
  if (manifest.initialSurfaceKey && !surfaceKeys.has(manifest.initialSurfaceKey)) {
    ctx.addIssue({
      code: "custom",
      path: ["initialSurfaceKey"],
      message: "initialSurfaceKey must reference an effective surface",
    });
  }
  manifest.resources.forEach((resource, index) => {
    if (resource.surfaceKey && !surfaceKeys.has(resource.surfaceKey)) {
      ctx.addIssue({
        code: "custom",
        path: ["resources", index, "surfaceKey"],
        message: `${resource.key} must reference an effective surface`,
      });
    }
    if (resource.compareSurfaceKey && !surfaceKeys.has(resource.compareSurfaceKey)) {
      ctx.addIssue({
        code: "custom",
        path: ["resources", index, "compareSurfaceKey"],
        message: `${resource.key} compare surface must be effective`,
      });
    }
  });
});
export type EffectiveRecordWorkspaceManifest = z.infer<typeof EffectiveRecordWorkspaceManifestSchema>;

export const RecordWorkspaceSurfaceDecisionReasonSchema = z.enum([
  "included",
  "unsupported",
  "permission_denied",
  "permission_unresolved",
]);
export type RecordWorkspaceSurfaceDecisionReason = z.infer<typeof RecordWorkspaceSurfaceDecisionReasonSchema>;

export const RecordWorkspaceResourceDecisionReasonSchema = z.enum([
  "included",
  "unsupported",
  "surface_unavailable",
]);
export type RecordWorkspaceResourceDecisionReason = z.infer<typeof RecordWorkspaceResourceDecisionReasonSchema>;

export const RecordWorkspaceManifestDiagnosticsSchema = z.object({
  permissionSource: z.enum(["authoritative", "descriptor_operations"]),
  surfaceDecisions: z.array(z.object({
    surfaceKey: z.string().min(1),
    permissionCode: z.string().min(1).optional(),
    included: z.boolean(),
    reason: RecordWorkspaceSurfaceDecisionReasonSchema,
  }).strict()),
  resourceDecisions: z.array(z.object({
    resource: RecordWorkspaceResourceKeySchema,
    surfaceKey: z.string().min(1).optional(),
    included: z.boolean(),
    reason: RecordWorkspaceResourceDecisionReasonSchema,
  }).strict()),
  invalidPermissionCodes: z.array(z.object({
    surfaceKey: z.string().min(1),
    permissionCode: z.string().min(1),
    message: z.string().min(1),
  }).strict()),
}).strict();
export type RecordWorkspaceManifestDiagnostics = z.infer<typeof RecordWorkspaceManifestDiagnosticsSchema>;

// Lifecycle state mask carried per (entity, record_status). Populated from
// control.entity_lifecycle_state_mask. UI uses this to disable edit/delete
// actions when the current record's status is gated.
//
// `disabledReason` here is intentionally an open string (not the enum) because
// the mask table stores domain-specific reasons (posted_locked, period_closed,
// matched_lock, ...) that the UI renders as-is and the schema cannot fully
// enumerate ahead of time.
// Per-state presentation pulled from control.lifecycle_state.config. All
// fields nullable individually — the seed may carry only ui_color, only
// badge_variant, etc. badgeVariant uses the lifecycle vocabulary
// ("success"|"info"|"warning"|"danger"|"secondary"|"neutral") and is
// translated to the theme's SemanticIntent at the consumer (see
// runtime-header-model.tsx#resolveStatus). `presentation` is omitted from
// the descriptor entirely when no values are seeded.
export const MetaEntityLifecycleStatePresentationSchema = z.object({
  label: z.string().nullable().default(null),
  badgeVariant: z.string().nullable().default(null),
  color: z.string().nullable().default(null),
  icon: z.string().nullable().default(null),
});
export type MetaEntityLifecycleStatePresentation = z.infer<typeof MetaEntityLifecycleStatePresentationSchema>;

export const MetaEntityLifecycleStateMaskSchema = z.object({
  recordStatus: z.string().min(1),
  canEdit: z.boolean(),
  canDelete: z.boolean(),
  canTransitionTo: z.array(z.string()).optional(),
  disabledReason: z.string().nullable().default(null),
  presentation: MetaEntityLifecycleStatePresentationSchema.optional(),
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
  colSpan: z.enum(["full"]).optional(),
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
  /**
   * Raw `control.entity_field.defaults` JSONB — parent-row cascade,
   * same-row source-change rules, override-detection labels, UI affordance.
   * Consumed by @athyper/cascade in the form runtime and BFF projection.
   * Spec: docs/specs/entity_field_defaults.md
   */
  defaults: JsonObjectSchema.optional(),
  /**
   * Temporal kind — locks storage + display semantics for date/time fields.
   * Source: control.entity_field.temporal_kind. Required at runtime for any
   * field whose data_type is date/timestamp-like; inference may fill it for
   * data_type='date' or 'timestamptz' only. See @athyper/temporal.
   */
  temporalKind: TemporalKindSchema.optional(),
  /**
   * UI-only render mode override. Lets a TIMESTAMPTZ column render as date-only
   * (Field A fallback). Cross-rule: displayMode='date' requires temporalKind='businessDate'.
   * Source: control.entity_field.display_mode.
   */
  displayMode: TemporalDisplayModeSchema.optional(),
  /**
   * If true, runtime-canvas wires this field to the period-gate predicate
   * (@athyper/finance-rules::isPostingDateOpen) — closed-period dates are
   * disabled in the picker, mirroring the server-side posting trigger.
   * Implies temporalKind='businessDate'. Source: control.entity_field.affects_posting_period.
   */
  affectsPostingPeriod: z.boolean().optional(),
});
export type MetaEntityField = z.infer<typeof MetaEntityFieldSchema>;

export const MetaEntityOperationSchema = z.object({
  key: z.string().min(1),
  permissionCode: z.string().min(1),
  surface: z.enum(["LIST", "DETAIL", "BOTH", "PALETTE_ONLY", "HIDDEN"]),
  placement: z.enum(["PRIMARY", "TOOLBAR", "OVERFLOW", "CONTEXT", "COMMAND"]),
  handlerType: z.enum(["NAVIGATE", "API", "MODAL", "INLINE"]),
  handlerTarget: z.string().nullable().optional(),
  executionTarget: z.string()
    .regex(/^[a-z][a-z0-9_]*:[a-z][a-z0-9_]*$/)
    .nullable()
    .optional(),
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
  selectionConfig: z.object({
    enabled: z.boolean().default(false),
    cardinality: z.enum(["single", "multiple", "both"]),
    group: z.enum(["item", "components", "accounting", "clipboard", "danger"]),
    presentation: z.enum(["action", "menu_item"]).default("action"),
    bulkStrategy: z.enum(["none", "bulk_patch", "per_record_atomic", "management_matrix"]).default("none"),
    preserveSelectionOnSuccess: z.boolean().default(false),
  }).optional(),
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
  resolutionKind: z.enum(["fk", "polymorphic", "join", "array_fk"]).default("fk"),
  fkField: z.string().optional(),
  targetKey: z.string().default("id"),
  sourceTypeField: z.string().optional(),
  sourceTypeValue: z.string().optional(),
  sourceIdField: z.string().optional(),
  sourceLineField: z.string().optional(),
  runtimeRole: z.string().optional(),
  onDelete: z.string().optional(),
  recordFilter: JsonObjectSchema.default({}),
  uiBehavior: JsonObjectSchema.default({}),
  surfaceKind: z.enum(["line_items", "child_records", "reference"]).optional(),
  mutationOwner: z.enum(["direct_crud", "workspace"]).default("direct_crud"),
  mutationPermissions: z.object({
    canCreate: z.boolean(),
    canEdit: z.boolean(),
    canDelete: z.boolean(),
  }).default({ canCreate: false, canEdit: false, canDelete: false }),
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

export const MetaEntityRuntimeHeaderIdentitySlotSchema = z.object({
  field: z.string().min(1),
}).passthrough();
export type MetaEntityRuntimeHeaderIdentitySlot = z.infer<typeof MetaEntityRuntimeHeaderIdentitySlotSchema>;

export const MetaEntityRuntimeHeaderStatusSchema = z.object({
  field: z.string().min(1).optional(),
  process_state_first: z.boolean().optional(),
  processStateFirst: z.boolean().optional(),
  preferProcessState: z.boolean().optional(),
  prefer_process_state: z.boolean().optional(),
}).passthrough();
export type MetaEntityRuntimeHeaderStatus = z.infer<typeof MetaEntityRuntimeHeaderStatusSchema>;

export const MetaEntityRuntimeHeaderIdentitySchema = z.object({
  primary: MetaEntityRuntimeHeaderIdentitySlotSchema.optional(),
  secondary: MetaEntityRuntimeHeaderIdentitySlotSchema.optional(),
  classification: MetaEntityRuntimeHeaderIdentitySlotSchema.optional(),
  status: MetaEntityRuntimeHeaderStatusSchema.optional(),
}).passthrough();
export type MetaEntityRuntimeHeaderIdentity = z.infer<typeof MetaEntityRuntimeHeaderIdentitySchema>;

export const MetaEntityHeaderVisibilityRuleSchema = z.object({
  status_in: z.array(z.string().min(1)).optional(),
  statusIn: z.array(z.string().min(1)).optional(),
  field_gt: z.number().optional(),
  fieldGt: z.number().optional(),
  field_equals: z.tuple([z.string().min(1), z.unknown()]).optional(),
  fieldEquals: z.tuple([z.string().min(1), z.unknown()]).optional(),
}).catchall(z.unknown());
export type MetaEntityHeaderVisibilityRule = z.infer<typeof MetaEntityHeaderVisibilityRuleSchema>;

export const MetaEntityHeaderAmountBaseSchema = z.object({
  field: z.string().min(1).optional(),
  currency_field: z.string().min(1).optional(),
  currencyField: z.string().min(1).optional(),
  label: z.string().min(1).optional(),
  base_amount: z.object({
    field: z.string().min(1).optional(),
    currency_field: z.string().min(1).optional(),
    currencyField: z.string().min(1).optional(),
    exchange_rate_field: z.string().min(1).optional(),
    exchangeRateField: z.string().min(1).optional(),
  }).catchall(z.unknown()).optional(),
  baseAmount: z.object({
    field: z.string().min(1).optional(),
    currency_field: z.string().min(1).optional(),
    currencyField: z.string().min(1).optional(),
    exchange_rate_field: z.string().min(1).optional(),
    exchangeRateField: z.string().min(1).optional(),
  }).catchall(z.unknown()).optional(),
  visible_when: MetaEntityHeaderVisibilityRuleSchema.optional(),
  visibleWhen: MetaEntityHeaderVisibilityRuleSchema.optional(),
}).catchall(z.unknown());
export type MetaEntityHeaderAmountBase = z.infer<typeof MetaEntityHeaderAmountBaseSchema>;

export const MetaEntityHeaderAmountPresentationSchema = z.object({
  headline: MetaEntityHeaderAmountBaseSchema.optional(),
  secondary: MetaEntityHeaderAmountBaseSchema.optional(),
}).catchall(z.unknown());
export type MetaEntityHeaderAmountPresentation = z.infer<typeof MetaEntityHeaderAmountPresentationSchema>;

export const MetaEntityHeaderSubtitleRowSchema = z.object({
  kind: z.string().min(1).optional(),
  fields: z.array(z.string().min(1)).default([]),
}).catchall(z.unknown());
export type MetaEntityHeaderSubtitleRow = z.infer<typeof MetaEntityHeaderSubtitleRowSchema>;

export const MetaEntityHeaderFactSchema = z.object({
  field: z.string().min(1),
  label: z.string().min(1).optional(),
  value_type: z.enum(["text", "code", "date", "amount", "enum"]).optional(),
  valueType: z.enum(["text", "code", "date", "amount", "enum"]).optional(),
}).catchall(z.unknown());
export type MetaEntityHeaderFact = z.infer<typeof MetaEntityHeaderFactSchema>;

export const MetaEntityHeaderStatusBadgeSchema = z.object({
  kind: z.string().min(1),
  label: z.string().min(1).optional(),
  field: z.string().min(1).optional(),
  type_field: z.string().min(1).optional(),
  typeField: z.string().min(1).optional(),
  status_field: z.string().min(1).optional(),
  statusField: z.string().min(1).optional(),
  format: z.string().min(1).optional(),
}).catchall(z.unknown());
export type MetaEntityHeaderStatusBadge = z.infer<typeof MetaEntityHeaderStatusBadgeSchema>;

export const MetaEntityHeaderTabsSchema = z.object({
  order: z.array(z.string().min(1)).default([]),
  visibility_rules: z.record(z.string(), MetaEntityHeaderVisibilityRuleSchema).optional(),
  visibilityRules: z.record(z.string(), MetaEntityHeaderVisibilityRuleSchema).optional(),
}).catchall(z.unknown());
export type MetaEntityHeaderTabs = z.infer<typeof MetaEntityHeaderTabsSchema>;

export const MetaEntityHeaderPresentationSchema = z.object({
  layout: z.string().min(1).optional(),
  amount: MetaEntityHeaderAmountPresentationSchema.optional(),
  subtitle_rows: z.array(MetaEntityHeaderSubtitleRowSchema).default([]),
  subtitleRows: z.array(MetaEntityHeaderSubtitleRowSchema).optional(),
  facts: z.array(MetaEntityHeaderFactSchema).default([]),
  status_badges: z.array(MetaEntityHeaderStatusBadgeSchema).default([]),
  statusBadges: z.array(MetaEntityHeaderStatusBadgeSchema).optional(),
  tabs: MetaEntityHeaderTabsSchema.optional(),
}).catchall(z.unknown());
export type MetaEntityHeaderPresentation = z.infer<typeof MetaEntityHeaderPresentationSchema>;

export const MetaEntityContractAuditSchema = z.object({
  compiledAt: z.string().optional(),
  compiledHash: z.string().optional(),
  descriptorHash: z.string().optional(),
});
export type MetaEntityContractAudit = z.infer<typeof MetaEntityContractAuditSchema>;

export const MetaEntityListCachePolicySchema = z.object({
  mode: z.enum(["disabled", "memory", "stale_while_revalidate"]),
  freshForSeconds: z.number().int().min(0).max(3_600),
  retainForSeconds: z.number().int().min(0).max(86_400),
  prefetch: z.enum(["none", "intent", "viewport", "eager"]),
  restoreScroll: z.boolean(),
  invalidateOnMutation: z.boolean(),
  maxQueriesPerEntity: z.number().int().min(1).max(20),
  maxRowsPerQuery: z.number().int().min(1).max(500),
  storage: z.enum(["memory", "session", "persistent"]),
  source: z.enum(["platform", "entity_class", "entity", "tenant"]),
}).strict().superRefine((policy, ctx) => {
  if (policy.retainForSeconds < policy.freshForSeconds) {
    ctx.addIssue({
      code: "custom",
      path: ["retainForSeconds"],
      message: "retainForSeconds must be greater than or equal to freshForSeconds",
    });
  }
});
export type MetaEntityListCachePolicy = z.infer<typeof MetaEntityListCachePolicySchema>;

export const DEFAULT_META_ENTITY_LIST_CACHE_POLICY: MetaEntityListCachePolicy = Object.freeze({
  mode: "stale_while_revalidate",
  freshForSeconds: 20,
  retainForSeconds: 300,
  prefetch: "intent",
  restoreScroll: true,
  invalidateOnMutation: true,
  maxQueriesPerEntity: 5,
  maxRowsPerQuery: 200,
  storage: "memory",
  source: "platform",
});

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
  storage: z.object({
    primaryKey: z.string().min(1).nullable(),
    tenantColumn: z.string().min(1).nullable(),
  }).optional(),
  createMode: z.enum(["FORM_ONLY", "EARLY_DRAFT", "DIRECT_CREATE", "SOURCE_DOCUMENT_CREATE"]).default("FORM_ONLY"),
  draftTtlHours: z.number().int().positive().optional(),
  numberingStrategy: z.enum(["none", "manual", "auto", "auto_or_manual", "AUTO_ON_CREATE", "AUTO_ON_PROMOTE", "AUTO_ON_SUBMIT"]).default("none"),
  renderer: MetaEntityRendererSchema,
  capabilities: MetaEntityCapabilitiesSchema,
  surfaces: z.array(MetaEntitySurfaceSchema),
  recordWorkspace: RecordWorkspaceDefinitionSchema.optional(),
  fields: z.array(MetaEntityFieldSchema),
  fieldGroups: z.array(MetaEntityFieldGroupSchema).default([]),
  operations: z.array(MetaEntityOperationSchema),
  relations: z.array(MetaEntityRelationSchema),
  source: MetaEntitySourceSchema,
  policy: MetaEntityPolicySummarySchema,
  cachePolicy: MetaEntityListCachePolicySchema.default(DEFAULT_META_ENTITY_LIST_CACHE_POLICY),
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
  identity: MetaEntityRuntimeHeaderIdentitySchema.optional(),
  headerPresentation: MetaEntityHeaderPresentationSchema.optional(),
  concurrency: MetaEntityConcurrencySummarySchema.optional(),
  editRuntime: AnyDocumentEditRuntimeContractSchema.optional(),
  extensions: MetaEntityExtensionsSchema.optional(),
  audit: MetaEntityContractAuditSchema,
}).superRefine((desc, ctx) => {
  if (desc.recordWorkspace) {
    if (desc.recordWorkspace.renderer !== desc.renderer) {
      ctx.addIssue({
        code: "custom",
        path: ["recordWorkspace", "renderer"],
        message: "record workspace renderer must match the descriptor renderer",
      });
    }

    const descriptorSurfaceByKey = new Map(desc.surfaces.map((surface) => [surface.key, surface] as const));
    if (desc.recordWorkspace.surfaces.length !== desc.surfaces.length) {
      ctx.addIssue({
        code: "custom",
        path: ["recordWorkspace", "surfaces"],
        message: "record workspace must reference every descriptor surface exactly once",
      });
    }
    desc.recordWorkspace.surfaces.forEach((reference, index) => {
      const surface = descriptorSurfaceByKey.get(reference.key);
      if (
        !surface
        || surface.kind !== reference.kind
        || surface.placement !== reference.placement
        || surface.order !== reference.order
        || surface.enabled !== reference.enabled
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["recordWorkspace", "surfaces", index],
          message: `workspace surface reference "${reference.key}" does not match descriptor surfaces`,
        });
      }
    });

    const capabilityBindings: Array<[
      keyof RecordWorkspaceResources,
      boolean,
    ]> = [
      ["approvals", desc.capabilities.hasWorkflow],
      ["lifecycleTimeline", desc.capabilities.hasLifecycle],
      ["snapshots", desc.capabilities.hasVersions],
      ["comments", desc.capabilities.hasComments],
      ["attachments", desc.capabilities.hasAttachments],
      ["activity", desc.capabilities.hasActivityLog],
    ];
    for (const [resource, capabilityEnabled] of capabilityBindings) {
      const binding = desc.recordWorkspace.resources[resource];
      if (capabilityEnabled && !binding.enabled) {
        ctx.addIssue({
          code: "custom",
          path: ["recordWorkspace", "resources", resource, "enabled"],
          message: `${resource} must be enabled when its descriptor capability is enabled`,
        });
      }
      if (
        !capabilityEnabled
        && (binding.source === "capability" || binding.source === "capability_and_surface")
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["recordWorkspace", "resources", resource, "source"],
          message: `${resource} cannot cite a disabled descriptor capability`,
        });
      }
    }
  }

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
    if (op.enabled && addContract.commitMode === "stage_then_parent_save") {
      if (desc.renderer !== "document") {
        ctx.addIssue({
          code: "custom",
          path: ["operations", opIdx, "interactionOptions", "addContract", "commitMode"],
          message: "stage_then_parent_save is available only to document renderers",
        });
      } else if (rel.mutationOwner !== "workspace") {
        ctx.addIssue({
          code: "custom",
          path: ["operations", opIdx, "interactionOptions", "addContract", "targetRelation"],
          message: `staged operation must target workspace-owned relation "${rel.name}"`,
        });
      }
    }
  });

  // Renderer invariants are transport boundaries, not presentation hints.
  // A non-document descriptor must never carry a workspace mutation plan,
  // and ledger descriptors must remain mutation-free even when stale metadata
  // still declares write operations.
  if (desc.renderer !== "document" && desc.editRuntime) {
    ctx.addIssue({
      code: "custom",
      path: ["editRuntime"],
      message: `renderer "${desc.renderer}" cannot expose a document edit runtime`,
    });
  }
  if (desc.createMode === "EARLY_DRAFT" && desc.renderer !== "document") {
    ctx.addIssue({
      code: "custom",
      path: ["createMode"],
      message: "EARLY_DRAFT requires the document renderer and its workspace create profile",
    });
  }
  if (desc.createMode === "SOURCE_DOCUMENT_CREATE" && !desc.operations.some((operation) =>
    operation.handlerType === "API"
      && (operation.key.includes("_from_") || operation.handlerTarget?.includes("_from_")))) {
    ctx.addIssue({
      code: "custom",
      path: ["createMode"],
      message: "SOURCE_DOCUMENT_CREATE requires a declared source conversion entity operation",
    });
  }
  if (desc.renderer === "ledger") {
    const ledgerCapabilityIssues: Array<["isReadOnly" | "canCreate" | "canEdit" | "canDelete", boolean]> = [
      ["isReadOnly", true],
      ["canCreate", false],
      ["canEdit", false],
      ["canDelete", false],
    ];
    for (const [capability, expected] of ledgerCapabilityIssues) {
      if (desc.capabilities[capability] === expected) continue;
      ctx.addIssue({
        code: "custom",
        path: ["capabilities", capability],
        message: `ledger renderer requires capabilities.${capability}=${String(expected)}`,
      });
    }
  }
  if (desc.capabilities.canEdit && (!desc.concurrency || desc.concurrency.strategy === "none")) {
    ctx.addIssue({
      code: "custom",
      path: ["concurrency", "strategy"],
      message: "editable runtime descriptors require version_only or lease_plus_version concurrency",
    });
  }
  const relationByName = new Map(desc.relations.flatMap((relation) => [
    [relation.name, relation] as const,
    [relation.key, relation] as const,
  ]));
  desc.relations.forEach((relation, index) => {
    if (relation.mutationOwner === "workspace" && desc.renderer !== "document") {
      ctx.addIssue({
        code: "custom",
        path: ["relations", index, "mutationOwner"],
        message: "workspace mutation ownership is valid only for document renderers",
      });
    }
  });
  desc.surfaces.forEach((surface, index) => {
    if (surface.kind !== "line_items" && surface.kind !== "child_records") return;
    const relation = surface.relationName
      ? relationByName.get(surface.relationName)
      : desc.relations.find((candidate) => candidate.targetEntity === surface.entityCode);
    if (relation && surface.mutationOwner !== relation.mutationOwner) {
      ctx.addIssue({
        code: "custom",
        path: ["surfaces", index, "mutationOwner"],
        message: `surface and relation "${relation.name}" must have one mutation owner`,
      });
    }
  });
  if (desc.editRuntime) {
    const declaredWorkspaceRelations = new Set<string>();
    desc.editRuntime.childCollections.forEach((child, index) => {
      const relation = child.relationName ? relationByName.get(child.relationName) : undefined;
      if (child.relationName) {
        if (declaredWorkspaceRelations.has(child.relationName)) {
          ctx.addIssue({
            code: "custom",
            path: ["editRuntime", "childCollections", index, "relationName"],
            message: `workspace relation "${child.relationName}" must appear exactly once in childCollections`,
          });
        }
        declaredWorkspaceRelations.add(child.relationName);
      }
      if (!relation) {
        ctx.addIssue({
          code: "custom",
          path: ["editRuntime", "childCollections", index, "relationName"],
          message: `workspace child collection "${child.key}" must reference a declared relation`,
        });
      }
      if (relation && relation.mutationOwner !== "workspace") {
        ctx.addIssue({
          code: "custom",
          path: ["editRuntime", "childCollections", index, "relationName"],
          message: `workspace child collection "${child.key}" cannot target direct-CRUD relation "${relation.name}"`,
        });
      }
      if (relation?.targetEntity && relation.targetEntity !== child.entityCode) {
        ctx.addIssue({
          code: "custom",
          path: ["editRuntime", "childCollections", index, "entityCode"],
          message: `workspace child collection "${child.key}" entity must match relation "${relation.name}" target entity`,
        });
      }
    });
    desc.relations.forEach((relation, index) => {
      if (relation.mutationOwner === "workspace" && !declaredWorkspaceRelations.has(relation.name)) {
        ctx.addIssue({
          code: "custom",
          path: ["relations", index, "mutationOwner"],
          message: `workspace-owned relation "${relation.name}" is not declared in editRuntime.childCollections`,
        });
      }
    });
  }
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
