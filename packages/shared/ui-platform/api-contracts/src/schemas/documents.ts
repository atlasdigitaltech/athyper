/**
 * @athyper/api-contracts — Document Schemas
 *
 * Shapes for document.* entities (document/ runtime).
 * Documents have a header + line items pattern.
 */
import { z } from "zod";
import { UuidSchema, AuditSchema, MoneySchema, SemanticIntentSchema } from "./common";

/** Document header — common fields across all document types. */
export const DocumentHeaderSchema = z.object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  document_type: z.string(),
  document_number: z.string(),
  status: z.string(),

  // Key dates
  document_date: z.string().datetime(),
  posting_date: z.string().datetime().nullable(),
  due_date: z.string().datetime().nullable(),

  // Party reference
  party_id: UuidSchema.nullable(),
  party_name: z.string().nullable(),

  // Amounts
  currency_code: z.string().length(3),
  total_amount: MoneySchema.nullable(),
  tax_amount: MoneySchema.nullable(),

  // Dynamic fields from descriptor
  data: z.record(z.string(), z.unknown()),
}).merge(AuditSchema);

export type DocumentHeader = z.infer<typeof DocumentHeaderSchema>;

/** Document line item. */
export const DocumentLineSchema = z.object({
  id: UuidSchema,
  document_id: UuidSchema,
  line_number: z.number().int().positive(),
  item_code: z.string().nullable(),
  description: z.string().nullable(),
  quantity: z.number().nullable(),
  unit_code: z.string().nullable(),
  unit_price: z.number().nullable(),
  /** gross_amount — quantity × unit_price + tax − discount (application-maintained). Maps to line_amount. */
  line_amount: z.number().nullable(),
  /** net_amount — quantity × unit_price / price_unit (DB-generated, pre-discount/tax). */
  net_amount: z.number().nullable().optional(),
  gross_amount: z.number().nullable().optional(),
  tax_code: z.string().nullable(),
  tax_amount: z.number().nullable(),
  withholding_tax_amount: z.number().nullable().optional(),
  /** Line-level trade discount as a percentage (0-100). */
  discount_pct: z.number().min(0).max(100).nullable().optional(),
  /** Computed discount deduction amount. */
  discount_amount: z.number().min(0).nullable().optional(),
  /** Retention withheld on this line as a percentage (0-100). */
  retention_pct: z.number().min(0).max(100).nullable().optional(),
  /** Computed retention hold-back amount for this line. */
  retention_amount: z.number().min(0).nullable().optional(),
  data: z.record(z.string(), z.unknown()),
}).merge(AuditSchema);

export type DocumentLine = z.infer<typeof DocumentLineSchema>;

/** Accounting distribution split row for a document line. */
export const AccountingDistributionSchema = z.object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  source_doc_type: z.string(),
  source_doc_id: UuidSchema,
  source_line_id: UuidSchema,
  distribution_no: z.number().int(),
  distribution_basis: z.enum(["PERCENT", "AMOUNT", "QUANTITY"]),
  split_pct: z.number().nullable(),
  split_amount: z.number().nullable(),
  split_quantity: z.number().nullable(),
  distributed_amount: z.number(),
  currency_code: z.string(),
  account_source: z.enum(["PENDING", "OVERRIDE", "PROFILE", "FALLBACK"]),
  gl_account_id: UuidSchema.nullable(),
  // business_intent_id, commodity_category_id, site_id intentionally omitted —
  // sourced from the P2P line (purchase_invoice_line, commitment_line, etc.).
  cost_center_id: UuidSchema.nullable(),
  profit_center_id: UuidSchema.nullable(),
  project_id: UuidSchema.nullable(),
  /** Derived hash of the scalar dimensions; maintained by trigger. */
  dimension_set_id: UuidSchema.nullable().optional(),
  /** Budget allocation moved here from line tables — AD owns budget capture. */
  budget_allocation_id: UuidSchema.nullable().optional(),
  asset_id: UuidSchema.nullable(),
  budget_check_result: z.string().nullable(),
  description: z.string().nullable(),
}).partial({ budget_check_result: true });

export type AccountingDistribution = z.infer<typeof AccountingDistributionSchema>;

/** Document with lines — the full detail response. */
export const DocumentDetailSchema = z.object({
  header: DocumentHeaderSchema,
  lines: z.array(DocumentLineSchema),
  line_count: z.number().int(),
});

export type DocumentDetail = z.infer<typeof DocumentDetailSchema>;

/** Document status transition request. */
export const StatusTransitionRequestSchema = z.object({
  to_status: z.string(),
  remarks: z.string().optional(),
});

export type StatusTransitionRequest = z.infer<typeof StatusTransitionRequestSchema>;

// ═══════════════════════════════════════════════════════════════
// PROCESS CHAIN — linked document navigation (Rec 1)
// Source: FK chain across PR → PO → GR/SES → INV → PAY
// ═══════════════════════════════════════════════════════════════

export const ChainNodeTypeSchema = z.enum([
  "PR", "RFX", "CONTRACT", "PO", "GR", "SES", "INV", "CN", "DN", "PAY", "ADVANCE", "RETENTION",
]);
export type ChainNodeType = z.infer<typeof ChainNodeTypeSchema>;

export const ProcessChainNodeSchema = z.object({
  node_type: ChainNodeTypeSchema,
  document_id: UuidSchema.nullable(),
  document_number: z.string().nullable(),
  status: z.string().nullable(),
  amount: MoneySchema.nullable(),
  /** For 1-to-many: count of related documents */
  count: z.number().int().default(1),
  /** Fulfillment percentage against parent node */
  fulfilled_pct: z.number().min(0).max(100).nullable(),
  /** Whether this node has exceptions */
  has_exceptions: z.boolean().default(false),
});
export type ProcessChainNode = z.infer<typeof ProcessChainNodeSchema>;

export const ProcessChainSchema = z.object({
  nodes: z.array(ProcessChainNodeSchema),
  /** Which node is the current document */
  current_node_type: ChainNodeTypeSchema,
});
export type ProcessChain = z.infer<typeof ProcessChainSchema>;

// ═══════════════════════════════════════════════════════════════
// STATUS LANES — 5 parallel lifecycle tracks (Rec 4)
// ═══════════════════════════════════════════════════════════════

export const StatusLaneSchema = z.object({
  lane: z.enum(["document", "workflow", "fulfilment", "accounting", "settlement"]),
  label: z.string(),
  status_code: z.string(),
  status_label: z.string(),
  intent: SemanticIntentSchema,
  /** Summary value (e.g. "Stage 2/3", "24%", "$38,680") */
  summary: z.string().nullable(),
});
export type StatusLane = z.infer<typeof StatusLaneSchema>;

// ═══════════════════════════════════════════════════════════════
// EXCEPTION STACK — unified adapter (Rec 5)
// Sources: invoice_match_exception, budget_check_result, policy_evaluation
// ═══════════════════════════════════════════════════════════════

export const DocumentExceptionSchema = z.object({
  code: z.string(),
  severity: z.enum(["error", "warning", "info"]),
  scope: z.enum(["header", "line", "payment", "workflow"]),
  source_doc_type: z.string(),
  is_blocking: z.boolean(),
  description: z.string(),
  resolution_path: z.string().nullable(),
  detected_at: z.string().datetime().nullable(),
  detected_by: UuidSchema.nullable(),
  /** Line number if scope=line */
  line_number: z.number().int().nullable(),
});
export type DocumentException = z.infer<typeof DocumentExceptionSchema>;

// ═══════════════════════════════════════════════════════════════
// VERSION BADGES — three independent version concepts (Rec 2)
// ═══════════════════════════════════════════════════════════════

export const DocumentVersionsSchema = z.object({
  /** Document amendment count (business revisions) */
  doc_rev: z.number().int().default(0),
  /** Workflow template snapshot version pinned at workflow creation */
  wf_snapshot_version: z.number().int().nullable(),
  /** Lifecycle route compiled version */
  lifecycle_version: z.number().int().nullable(),
});
export type DocumentVersions = z.infer<typeof DocumentVersionsSchema>;

// ═══════════════════════════════════════════════════════════════
// DOCUMENT ORCHESTRATOR — document detail page payload
// Spec v1.2 section 3.2: runtime document detail composition
// ═══════════════════════════════════════════════════════════════

/** Multi-dimensional status badge (lifecycle, accounting, settlement, matching). */
export const StatusDimensionSchema = z.object({
  dimension: z.string(),
  label: z.string(),
  status_code: z.string(),
  status_label: z.string(),
  intent: SemanticIntentSchema,
});
export type StatusDimension = z.infer<typeof StatusDimensionSchema>;

/** One tile in the ProcessHealthStrip. */
export const ProcessHealthTileSchema = z.object({
  dimension: z.string(),
  label: z.string(),
  severity: SemanticIntentSchema,
  summary: z.string().nullable(),
  /** Click-through navigation intent (local satellite intent, NOT a documentActionCode). */
  satellite_intent: z.string().nullable(),
});
export type ProcessHealthTile = z.infer<typeof ProcessHealthTileSchema>;

/** Single summary line in a satellite card. */
export const SatelliteSummaryLineSchema = z.object({
  label: z.string(),
  value: z.string(),
  intent: SemanticIntentSchema.optional(),
});
export type SatelliteSummaryLine = z.infer<typeof SatelliteSummaryLineSchema>;

/** One satellite card in the overview tab. */
export const SatelliteCardSchema = z.object({
  id: z.string(),
  group: z.string(),
  title: z.string(),
  subtitle: z.string().nullable(),
  intent: SemanticIntentSchema,
  icon_key: z.string().nullable(),
  summary_lines: z.array(SatelliteSummaryLineSchema),
  /** Whether the card can be expanded to show detail_data. */
  has_detail: z.boolean().default(false),
  /** Satellite-specific structured data for the detail sheet. */
  detail_data: z.record(z.string(), z.unknown()).nullable(),
  /** Document reference ID for navigation. */
  document_ref: z.string().nullable().optional(),
  /** Primary action label for the card footer. */
  primary_action_label: z.string().nullable().optional(),
  /** Satellite intent emitted when the primary action is clicked. */
  primary_action_intent: z.string().nullable().optional(),
});
export type SatelliteCard = z.infer<typeof SatelliteCardSchema>;

/** Group of satellite cards. */
export const SatelliteGroupSchema = z.object({
  group_key: z.string(),
  label: z.string(),
  cards: z.array(SatelliteCardSchema),
});
export type SatelliteGroup = z.infer<typeof SatelliteGroupSchema>;

/** One row in the amount breakdown summary. */
export const AmountBreakdownLineSchema = z.object({
  label: z.string(),
  amount: z.number(),
  currency_code: z.string().length(3),
  intent: SemanticIntentSchema.optional(),
  is_total: z.boolean().default(false),
  /** Indentation level 0-2 (0 = flush left). */
  indent: z.number().int().min(0).max(2).default(0),
});
export type AmountBreakdownLine = z.infer<typeof AmountBreakdownLineSchema>;

/** Warning or blocker notice for validation banners. */
export const ValidationNoticeSchema = z.object({
  code: z.string(),
  level: z.enum(["warning", "blocked"]),
  message: z.string(),
  /** Hint for a resolution action (e.g. "resolve-budget-exception"). */
  action_hint: z.string().nullable(),
});
export type ValidationNotice = z.infer<typeof ValidationNoticeSchema>;

/** State-adaptive action bundle groups. */
export const ActionBundleGroupSchema = z.enum([
  "primary", "working", "output", "overflow",
]);
export type ActionBundleGroup = z.infer<typeof ActionBundleGroupSchema>;

/** One action button in the state-adaptive action bar. */
export const ActionBundleItemSchema = z.object({
  /** Must match entity_operation.permission_code. */
  action_code: z.string(),
  label: z.string(),
  group: ActionBundleGroupSchema,
  icon_key: z.string().nullable(),
  is_destructive: z.boolean().default(false),
  is_disabled: z.boolean().default(false),
  disabled_reason: z.string().nullable(),
  sort_order: z.number().int(),
  requires_confirmation: z.boolean().default(false),
});
export type ActionBundleItem = z.infer<typeof ActionBundleItemSchema>;

// ═══════════════════════════════════════════════════════════════
// FLOW ENGINE — metadata-driven intake wizard contracts
// Mirrors control.entity_flow / entity_flow_step / entity_flow_field
// ═══════════════════════════════════════════════════════════════

export const FlowFieldModeSchema = z.enum([
  "required", "editable", "readonly", "hidden", "summary_only", "chip",
]);
export type FlowFieldMode = z.infer<typeof FlowFieldModeSchema>;

export const FlowDerivationModeSchema = z.enum([
  "derived_locked", "derived_overrideable", "manual",
]);
export type FlowDerivationMode = z.infer<typeof FlowDerivationModeSchema>;

export const FlowSummaryRoleSchema = z.enum([
  "total", "subtotal", "addition", "deduction", "line_badge", "warning", "meta",
]);
export type FlowSummaryRole = z.infer<typeof FlowSummaryRoleSchema>;

/** Resolved field binding — combines entity_flow_field + entity_field.name/label/data_type. */
export const FlowFieldBindingSchema = z.object({
  id: z.string(),
  entity_field_id: z.string(),
  field_name: z.string(),
  field_label: z.string(),
  data_type: z.string(),
  enum_domain_code: z.string().nullable().optional(),
  reference_config: z.record(z.string(), z.unknown()).nullable().optional(),
  money_config: z.record(z.string(), z.unknown()).nullable().optional(),
  lookup_config: z.record(z.string(), z.unknown()).nullable().optional(),
  validation_rules: z.record(z.string(), z.unknown()).nullable().optional(),
  mode: FlowFieldModeSchema,
  derivation_mode: FlowDerivationModeSchema.nullable().optional(),
  visible_when: z.unknown().nullable().optional(),
  required_when: z.unknown().nullable().optional(),
  default_source: z.string().nullable().optional(),
  derive_expression: z.string().nullable().optional(),
  override_permission: z.string().nullable().optional(),
  summary_role: FlowSummaryRoleSchema.nullable().optional(),
  ui_variant: z.string().nullable().optional(),
  format: z.string().nullable().optional(),
  span: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(1),
  display_size: z.enum(["prominent", "standard", "compact"]).nullable().optional(),
  help_text: z.string().nullable().optional(),
  placeholder: z.string().nullable().optional(),
  sort_order: z.number().int(),
  section_key: z.string().nullable().optional(),
  /** Current derived value (populated by derive endpoint response). */
  derived_value: z.unknown().optional(),
  /** Whether the user has manually overridden this derived field. */
  is_overridden: z.boolean().default(false),
  /** Free-form binding metadata. Reserved key: `target` selects a non-column
   *  destination (e.g. master.comment) for the field value at submit time. */
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});
export type FlowFieldBinding = z.infer<typeof FlowFieldBindingSchema>;

/** One step in the wizard — entity_flow_step + its field bindings. */
export const FlowChildFieldSchema = z.object({
  entity_field_id: z.string().optional(),
  field_name: z.string(),
  field_label: z.string().optional(),
  data_type: z.string().nullable().optional(),
  enum_domain_code: z.string().nullable().optional(),
  cardinality: z.string().nullable().optional(),
  ui_variant: z.string().nullable().optional(),
  reference_config: z.record(z.string(), z.unknown()).nullable().optional(),
  money_config: z.record(z.string(), z.unknown()).nullable().optional(),
  validation_rules: z.record(z.string(), z.unknown()).nullable().optional(),
  lookup_config: z.record(z.string(), z.unknown()).nullable().optional(),
  visible_when: z.unknown().nullable().optional(),
  sort_order: z.number().nullable().optional(),
  is_required: z.boolean().nullable().optional(),
}).catchall(z.unknown());

export const FlowSectionSchema = z.object({
  section_key: z.string(),
  label: z.string(),
  section_type: z.string().default("fields"),
  entity_code: z.string().nullable().optional(),
  payload_key: z.string().nullable().optional(),
  sort_order: z.number().int().default(0),
  collapse_default: z.boolean().default(false),
  visible_when: z.unknown().nullable().optional(),
  permission_code: z.string().nullable().optional(),
  restricted_view_only: z.boolean().default(false),
  min_rows: z.number().nullable().optional(),
  max_rows: z.number().nullable().optional(),
  default_row: z.unknown().nullable().optional(),
  icon_key: z.string().nullable().optional(),
  help_text: z.string().nullable().optional(),
  fields: z.array(FlowFieldBindingSchema).default([]),
  child_fields: z.array(FlowChildFieldSchema).default([]),
  intake_fields: z.array(z.string()).nullable().optional(),
}).catchall(z.unknown());
export type FlowSection = z.infer<typeof FlowSectionSchema>;

export const FlowStepSchema = z.object({
  id: z.string(),
  step_key: z.string(),
  label: z.string(),
  icon_key: z.string().nullable().optional(),
  sort_order: z.number().int(),
  skip_when: z.unknown().nullable().optional(),
  advance_rule: z.object({
    required_fields: z.array(z.string()).default([]),
    predicate: z.unknown().nullable().optional(),
  }).catchall(z.unknown()),
  layout_hint: z.string(),
  fields: z.array(FlowFieldBindingSchema),
  sections: z.array(FlowSectionSchema).optional(),
});
export type FlowStep = z.infer<typeof FlowStepSchema>;

/** Resolved flow bundle — returned by GET /meta/flow?entity=&trigger= */
export const FlowBundleSchema = z.object({
  flow_id: z.string(),
  flow_code: z.string(),
  label: z.string(),
  description: z.string().nullable().optional(),
  config: z.object({
    summary: z.object({
      fields: z.array(z.string()),
      running_totals: z.array(z.string()),
    }).optional(),
    input_modes: z.array(z.string()).optional(),
    layout: z.string().optional(),
  }).catchall(z.unknown()),
  steps: z.array(FlowStepSchema),
  /** Active permissions for the current user — used to gate overrides. */
  user_permissions: z.array(z.string()),
});
export type FlowBundle = z.infer<typeof FlowBundleSchema>;

/** Full document orchestrator payload — extends the base document detail. */
export const DocumentOrchestratorSchema = z.object({
  status_dimensions: z.array(StatusDimensionSchema),
  health_tiles: z.array(ProcessHealthTileSchema),
  satellite_groups: z.array(SatelliteGroupSchema),
  amount_breakdown: z.array(AmountBreakdownLineSchema),
  validation_notices: z.array(ValidationNoticeSchema),
  action_bundle: z.array(ActionBundleItemSchema),
  /** Blocked reason strings (disable primary CTA). */
  blocked_reasons: z.array(z.string()),
});
export type DocumentOrchestrator = z.infer<typeof DocumentOrchestratorSchema>;

// ═══════════════════════════════════════════════════════════════
// SNAPSHOT INDEX — graph checkpoint feed for the Versions tab
// Source: snapshot.document_snapshot (hash-chained, append-only)
// ═══════════════════════════════════════════════════════════════

/** Sealed taxonomy mirroring snapshot.document_snapshot.ds_kind_chk. */
export const SnapshotGateEventKindSchema = z.enum([
  "authoring_lock",
  "commitment",
  "fulfillment",
  "financial_post",
  "match_decision",
  "amendment_baseline",
  "reversal",
]);
export type SnapshotGateEventKind = z.infer<typeof SnapshotGateEventKindSchema>;

/** Sealed taxonomy mirroring snapshot.document_snapshot.ds_capture_source_chk. */
export const SnapshotCaptureSourceSchema = z.enum([
  "transition_hook",
  "manual",
  "reconcile",
  "migration",
]);
export type SnapshotCaptureSource = z.infer<typeof SnapshotCaptureSourceSchema>;

/**
 * One row in the snapshot index for a document. Payload-free by design —
 * the Versions tab renders a timeline of metadata; the heavy graph JSON
 * lands behind a separate per-id detail endpoint when the diff view loads.
 */
export const SnapshotIndexEntrySchema = z.object({
  id: UuidSchema,
  document_code: z.string().nullable(),
  version_number: z.number().int().min(1),
  gate_event: z.string(),
  gate_event_kind: SnapshotGateEventKindSchema,
  payload_hash: z.string().min(64),
  chain_seq: z.number().int().min(1),
  previous_snapshot_id: UuidSchema.nullable(),
  captured_at: z.string(),
  capture_source: SnapshotCaptureSourceSchema,
  captured_by_name: z.string().nullable(),
});
export type SnapshotIndexEntry = z.infer<typeof SnapshotIndexEntrySchema>;

/** Response shape for GET /entities/:entity/:id/snapshots. */
export const SnapshotIndexResponseSchema = z.object({
  data: z.array(SnapshotIndexEntrySchema),
  total: z.number().int().min(0),
});
export type SnapshotIndexResponse = z.infer<typeof SnapshotIndexResponseSchema>;

/**
 * Full graph payload for one snapshot. Extends the index entry with the
 * jsonb fan-out (header + lines + components + distributions + schedules
 * + related) frozen at the gate event.
 *
 * Per-child arrays are nullable because some entity types legitimately
 * have no rows in a given child carrier (e.g. POC has no PC/AD).
 */
export const SnapshotDetailSchema = SnapshotIndexEntrySchema.extend({
  header_json: z.record(z.string(), z.unknown()),
  lines_json: z.array(z.record(z.string(), z.unknown())).nullable(),
  components_json: z.array(z.record(z.string(), z.unknown())).nullable(),
  distributions_json: z.array(z.record(z.string(), z.unknown())).nullable(),
  schedules_json: z.array(z.record(z.string(), z.unknown())).nullable(),
  related_json: z.record(z.string(), z.unknown()).nullable(),
});
export type SnapshotDetail = z.infer<typeof SnapshotDetailSchema>;

// ═══════════════════════════════════════════════════════════════
// SNAPSHOT DIFF — Compare CTA contract
// ═══════════════════════════════════════════════════════════════

export const SnapshotDiffSectionNameSchema = z.enum([
  "header",
  "lines",
  "components",
  "distributions",
  "schedules",
]);
export type SnapshotDiffSectionName = z.infer<typeof SnapshotDiffSectionNameSchema>;

export const FieldDeltaSchema = z.object({
  field: z.string(),
  left:  z.unknown(),
  right: z.unknown(),
});
export type FieldDelta = z.infer<typeof FieldDeltaSchema>;

export const RowAddRemoveSchema = z.object({
  identifier: z.string(),
  row_id: z.string().nullable(),
  row: z.record(z.string(), z.unknown()),
});
export type RowAddRemove = z.infer<typeof RowAddRemoveSchema>;

export const RowChangeSchema = z.object({
  identifier: z.string(),
  row_id: z.string().nullable(),
  fields: z.array(FieldDeltaSchema),
});
export type RowChange = z.infer<typeof RowChangeSchema>;

export const SectionDiffSchema = z.object({
  section: SnapshotDiffSectionNameSchema,
  added:   z.array(RowAddRemoveSchema),
  removed: z.array(RowAddRemoveSchema),
  changed: z.array(RowChangeSchema),
  identical: z.boolean(),
});
export type SectionDiff = z.infer<typeof SectionDiffSchema>;

/** Snapshot reference returned by the compare endpoint — index-shape
 *  metadata without the heavy json payload. */
export const SnapshotCompareSideSchema = z.object({
  id: UuidSchema,
  document_code: z.string().nullable(),
  version_number: z.number().int().min(1),
  gate_event: z.string(),
  gate_event_kind: SnapshotGateEventKindSchema,
  payload_hash: z.string().min(64),
  chain_seq: z.number().int().min(1),
  captured_at: z.string(),
  capture_source: SnapshotCaptureSourceSchema,
  captured_by_name: z.string().nullable(),
});
export type SnapshotCompareSide = z.infer<typeof SnapshotCompareSideSchema>;

/** Request body for POST /entities/:e/:id/snapshots/compare. */
export const SnapshotCompareRequestSchema = z.object({
  leftSnapshotId: UuidSchema,
  rightSnapshotId: UuidSchema,
});
export type SnapshotCompareRequest = z.infer<typeof SnapshotCompareRequestSchema>;

/** Response shape. Always emits older → newer regardless of caller order
 *  (server sorts by chain_seq); `swapped` is true if the server flipped. */
export const SnapshotCompareResponseSchema = z.object({
  left:  SnapshotCompareSideSchema,
  right: SnapshotCompareSideSchema,
  swapped: z.boolean(),
  sections: z.array(SectionDiffSchema),
  total_differences: z.number().int().min(0),
});
export type SnapshotCompareResponse = z.infer<typeof SnapshotCompareResponseSchema>;

// ═══════════════════════════════════════════════════════════════
// SNAPSHOT RESTORE — Phase 9b destructive replay
// ═══════════════════════════════════════════════════════════════

export const RestoreCountsSchema = z.object({
  header_fields_updated: z.number().int().min(0),
  lines:         z.object({ deleted: z.number().int().min(0), inserted: z.number().int().min(0) }),
  components:    z.object({ deleted: z.number().int().min(0), inserted: z.number().int().min(0) }),
  distributions: z.object({ deleted: z.number().int().min(0), inserted: z.number().int().min(0) }),
  schedules:     z.object({ deleted: z.number().int().min(0), inserted: z.number().int().min(0) }),
});
export type RestoreCounts = z.infer<typeof RestoreCountsSchema>;

/** Response from POST /entities/:e/:id/snapshots/:snapshotId/restore. */
export const SnapshotRestoreResponseSchema = z.object({
  ok: z.literal(true),
  snapshot_id: UuidSchema,
  snapshot_chain_seq: z.number().int().min(1),
  audit_log_id: UuidSchema.nullable(),
  counts: RestoreCountsSchema,
});
export type SnapshotRestoreResponse = z.infer<typeof SnapshotRestoreResponseSchema>;

// ═══════════════════════════════════════════════════════════════
// LIFECYCLE TIMELINE — state-transition feed for the Lifecycle tab
// Source: log.entity_lifecycle_log via the versions route
// ═══════════════════════════════════════════════════════════════

/** Sealed taxonomy mirroring versions.route.deriveChangeType output. */
export const LifecycleChangeTypeSchema = z.enum([
  "original",
  "amendment",
  "reversal",
  "correction",
]);
export type LifecycleChangeType = z.infer<typeof LifecycleChangeTypeSchema>;

/**
 * One row in the lifecycle timeline — a state-machine transition recorded in
 * log.entity_lifecycle_log. Distinct from SnapshotIndexEntry: this is the
 * STATE history (status changed from X to Y); snapshots are the GRAPH history
 * (what did the document look like at each gate event).
 */
export const LifecycleEntrySchema = z.object({
  version_no: z.number().int().min(1),
  revision_no: z.number().int().min(0),
  revision_label: z.string(),
  record_status: z.string(),
  change_type: LifecycleChangeTypeSchema,
  change_reason: z.string().nullable(),
  change_summary: z.string().nullable(),
  created_at: z.string(),
  created_by_name: z.string().nullable(),
  is_current: z.boolean(),
});
export type LifecycleEntry = z.infer<typeof LifecycleEntrySchema>;

/** Response shape for GET /entities/:entity/:id/versions (lifecycle log). */
export const LifecycleTimelineResponseSchema = z.object({
  data: z.array(LifecycleEntrySchema),
  current_version_no: z.number().int().min(0),
});
export type LifecycleTimelineResponse = z.infer<typeof LifecycleTimelineResponseSchema>;

// ═══════════════════════════════════════════════════════════════
// CHANGE REASON CODES — controlled-vocabulary lookup
// Source: master.change_reason_code (Phase 3 DDL)
// ═══════════════════════════════════════════════════════════════

/** Sealed taxonomy matching master.change_reason_code.category CHECK. */
export const ChangeReasonCategorySchema = z.enum([
  "workflow",
  "accounting",
  "financial",
  "snapshot",
]);
export type ChangeReasonCategory = z.infer<typeof ChangeReasonCategorySchema>;

/** Sealed taxonomy matching master.change_reason_code.severity CHECK. */
export const ChangeReasonSeveritySchema = z.enum([
  "normal",
  "elevated",
  "critical",
]);
export type ChangeReasonSeverity = z.infer<typeof ChangeReasonSeveritySchema>;

/**
 * Minimal projection of master.change_reason_code returned by the dropdown
 * lookup. Description is included so the picker can show secondary hover
 * text without a second fetch.
 */
export const ChangeReasonCodeSummarySchema = z.object({
  id: UuidSchema,
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  category: ChangeReasonCategorySchema,
  severity: ChangeReasonSeveritySchema,
  is_system: z.boolean(),
  sort_order: z.number().int(),
});
export type ChangeReasonCodeSummary = z.infer<typeof ChangeReasonCodeSummarySchema>;

/** Response shape for GET /change-reason-codes[?category=...]. */
export const ChangeReasonCodesResponseSchema = z.object({
  data: z.array(ChangeReasonCodeSummarySchema),
  total: z.number().int().min(0),
});
export type ChangeReasonCodesResponse = z.infer<typeof ChangeReasonCodesResponseSchema>;

// ═══════════════════════════════════════════════════════════════
// AUDIT LOG — column-level mutation history feed for the Audit tab
// Source: log.audit_log joined with master.change_reason_code +
//         master.principal_profile
// ═══════════════════════════════════════════════════════════════

/** Mirrors log.audit_log.audit_log_op_chk. */
export const AuditOperationSchema = z.enum([
  "insert",
  "update",
  "delete",
  "status_change",
  "bulk_insert",
  "bulk_update",
  "bulk_delete",
  "restore",
  "archive",
  "purge",
]);
export type AuditOperation = z.infer<typeof AuditOperationSchema>;

/**
 * One row in the column-level mutation history. Joined display fields
 * (actor_name + reason_code_*) are surfaced server-side so the panel
 * doesn't need follow-up lookups.
 */
export const AuditLogEntrySchema = z.object({
  id: UuidSchema,
  operation: AuditOperationSchema,
  actor_id: UuidSchema.nullable(),
  actor_type: z.string().nullable(),
  actor_name: z.string().nullable(),
  changed_fields: z.array(z.string()),
  old_values: z.record(z.string(), z.unknown()).nullable(),
  new_values: z.record(z.string(), z.unknown()).nullable(),
  reason_code_id: UuidSchema.nullable(),
  reason_code: z.string().nullable(),
  reason_code_name: z.string().nullable(),
  reason_code_category: ChangeReasonCategorySchema.nullable(),
  reason_code_severity: ChangeReasonSeveritySchema.nullable(),
  correlation_id: UuidSchema.nullable(),
  created_at: z.string(),
});
export type AuditLogEntry = z.infer<typeof AuditLogEntrySchema>;

/** Response shape for GET /entities/:entity/:id/audit-log. */
export const AuditLogResponseSchema = z.object({
  data: z.array(AuditLogEntrySchema),
  total: z.number().int().min(0),
});
export type AuditLogResponse = z.infer<typeof AuditLogResponseSchema>;
