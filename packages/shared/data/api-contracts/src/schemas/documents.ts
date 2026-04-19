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
  line_amount: z.number().nullable(),
  tax_code: z.string().nullable(),
  tax_amount: z.number().nullable(),
  data: z.record(z.string(), z.unknown()),
}).merge(AuditSchema);

export type DocumentLine = z.infer<typeof DocumentLineSchema>;

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
// DOCUMENT ORCHESTRATOR — Approvable document detail page payload
// Spec v1.2 §3.2: ApprovableDocumentShell composition
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
