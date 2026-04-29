/**
 * @athyper/api-contracts — Metadata Schemas
 *
 * Types for the compiled entity runtime read path.
 * Mirrors structures from:
 *   snapshot.entity_compiled       (compiled_json)
 *   control.entity_field           (field definitions)
 *   control.entity_operation       (UI action registrations)
 *   control.entity_lifecycle       (lifecycle bindings)
 *   snapshot.status_route          (compiled status transitions)
 *   control.field_group            (UI field groupings)
 *   control.lookup_domain/value    (dropdown options)
 *
 * CI RULE: Shape changes in server/framework/core/meta/types or
 * entity engine DDL must revalidate these schemas. See docs/api/contract-sync.md.
 */
import { z } from "zod";
import { UuidSchema } from "./common";
import type { EntityClass } from "../enums";

// ═══════════════════════════════════════════════════════════════
// ENTITY CLASS — determines rendering runtime
// ═══════════════════════════════════════════════════════════════

export const EntityClassSchema = z.enum([
  "REFERENCE", "MASTER", "CONTROL",
  "DOCUMENT", "DOCUMENT_RELATION",
  "LEDGER", "LOG", "AGGREGATE",
  "DIMENSION", "RELATION",
]);
export type { EntityClass };

/** Entity class → route prefix mapping for navigation/runtime-router. */
export const ENTITY_CLASS_TO_RUNTIME: Record<EntityClass, "/master/" | "/document/" | "/ledger/"> = {
  REFERENCE: "/master/", MASTER: "/master/", CONTROL: "/master/",
  DOCUMENT: "/document/", DOCUMENT_RELATION: "/document/",
  LEDGER: "/ledger/", LOG: "/ledger/", AGGREGATE: "/ledger/",
  DIMENSION: "/master/", RELATION: "/master/",
};

// ═══════════════════════════════════════════════════════════════
// FIELD DATA TYPES — drives field renderer registry
// Source: control.lookup_value WHERE domain_code = 'entity_field.data_type'
// ═══════════════════════════════════════════════════════════════

export const FieldDataTypeSchema = z.enum([
  "string", "text", "integer", "bigint", "decimal", "numeric",
  "boolean", "uuid", "date", "datetime", "timestamptz",
  "json", "jsonb", "enum", "reference", "money", "tsvector",
  "text_array", "uuid_array", "int_array", "jsonb_array",
  "lifecycle_state",
]);
export type FieldDataType = z.infer<typeof FieldDataTypeSchema>;

export const FieldCardinalitySchema = z.enum(["one", "many", "zero_or_one"]);
export const FieldOriginSchema = z.enum(["system", "standard", "business"]);

// ═══════════════════════════════════════════════════════════════
// ENTITY FIELD — from control.entity_field DDL
// ═══════════════════════════════════════════════════════════════

export const EntityFieldSchema = z.object({
  id: UuidSchema,
  name: z.string(),
  column_name: z.string(),
  label: z.string().nullable(),
  description: z.string().nullable(),

  data_type: FieldDataTypeSchema,
  ui_type: z.string().nullable(),
  format: z.string().nullable(),
  unit: z.string().nullable(),

  cardinality: FieldCardinalitySchema,
  origin: FieldOriginSchema,

  is_required: z.boolean(),
  is_readonly: z.boolean(),
  is_unique: z.boolean(),
  is_searchable: z.boolean(),
  is_filterable: z.boolean(),
  is_sortable: z.boolean(),
  is_groupable: z.boolean(),
  is_aggregatable: z.boolean(),
  is_pii: z.boolean(),
  is_computed: z.boolean().optional(),

  default_value: z.unknown().nullable(),
  validation_rules: z.record(z.string(), z.unknown()).nullable(),
  enum_domain_code: z.string().nullable(),

  reference_config: z.object({
    target_entity: z.string(),
    target_field: z.string().optional(),
    display_field: z.string().optional(),
  }).nullable(),

  sort_order: z.number().int(),
  group_key: z.string().nullable(),
  i18n_key: z.string().nullable(),
});
export type EntityField = z.infer<typeof EntityFieldSchema>;

// ═══════════════════════════════════════════════════════════════
// FIELD GROUP — from control.field_group DDL
// ═══════════════════════════════════════════════════════════════

export const FieldGroupSchema = z.object({
  group_key: z.string(),
  label: z.string(),
  description: z.string().nullable(),
  sort_order: z.number().int(),
  fields: z.array(z.string()),
});
export type FieldGroup = z.infer<typeof FieldGroupSchema>;

// ═══════════════════════════════════════════════════════════════
// COMPILED ENTITY — from snapshot.entity_compiled.compiled_json
// Primary source for all three rendering runtimes.
// ═══════════════════════════════════════════════════════════════

export const CompiledEntitySchema = z.object({
  entity_id: UuidSchema,
  entity_code: z.string(),
  entity_name: z.string(),
  entity_class: EntityClassSchema,

  table_schema: z.string(),
  table_name: z.string(),

  version_no: z.number().int(),
  version_hash: z.string(),

  fields: z.array(EntityFieldSchema),
  field_groups: z.array(FieldGroupSchema),

  display_config: z.object({
    title_field: z.string().optional(),
    subtitle_field: z.string().optional(),
    icon: z.string().optional(),
    color: z.string().optional(),
    default_sort_field: z.string().optional(),
    default_sort_order: z.enum(["asc", "desc"]).optional(),
    list_columns: z.array(z.string()).optional(),
    search_fields: z.array(z.string()).optional(),
    /**
     * Selects the detail-page rendering strategy.
     *   "standard"    — generic field-grid + tabs (MASTER / CONTROL / REFERENCE)
     *   "master"      — same as standard, legacy alias
     *   "approvable"  — ApprovableDocumentShell with rich financial header
     *   "ledger"      — read-only ledger / log viewer
     *   "generic"     — deprecated alias for "standard"; kept for DB compat
     *   "rich_master" — RichMasterDetailPage: EntityHeader + config-driven tabs
     *                   driven entirely by display_config.rich_master_config.
     *                   One component for all master entities — no per-entity TSX.
     */
    detail_renderer: z.enum(["standard", "master", "approvable", "ledger", "generic", "rich_master"]).optional(),
    /**
     * Selects the list-view rendering strategy. Default: "table".
     */
    list_renderer: z.enum(["table", "kanban", "dashboard", "spreadsheet"]).optional(),
    /**
     * Which view modes the user may switch to. Subset of the four canonical modes.
     * Default: ["table"].
     */
    view_modes: z.array(z.enum(["table", "kanban", "dashboard", "spreadsheet"])).optional(),
    /**
     * Key of the lines renderer registered via registerLinesRenderer().
     * null  = entity has no line items (master records).
     * "generic" = standard invoice lines (LinesGrid).
     * "journal" = GL journal line view (JournalLinesGrid).
     * "payment" = payment allocation view (PaymentAllocationLinesGrid).
     */
    lines_renderer: z.string().nullable().optional(),
    /**
     * Field names carrying the entity's primary lifecycle status.
     * Drives statusToIntent() calls in orchestrator/header builders.
     * Default: ["status"].
     */
    status_field_names: z.array(z.string()).optional(),
    /**
     * Alternate intake flow codes available for this entity.
     * Each code maps to a flow definition in entity_flow.
     * Default: [] (single default flow only).
     */
    alternate_flows: z.array(z.string()).optional(),
    /**
     * Field-name hints consumed by buildApprovableHeaderFromRecord().
     * Populated for every entity with detail_renderer = "approvable".
     * All values are entity field *names* (not column_names).
     */
    document_header: z.object({
      /** Primary document number field, e.g. "document_no" */
      number_field: z.string(),
      /** Status field, e.g. "status" */
      status_field: z.string().optional(),
      /** Human-readable type chip, e.g. "INVOICE" */
      type_label: z.string().optional(),
      /** Header money label, e.g. "INVOICE TOTAL" */
      total_label: z.string().optional(),
      /** Header date label, e.g. "INVOICE DATE" */
      date_label: z.string().optional(),
      /** Field holding the party display name, e.g. "supplier_name" */
      party_name_field: z.string().optional(),
      /** Field holding the party FK / id, e.g. "supplier_id" */
      party_id_field: z.string().optional(),
      /** Gross / total amount field, e.g. "gross_amount" */
      amount_field: z.string().optional(),
      /** Net / subtotal amount field, e.g. "net_amount" */
      subtotal_field: z.string().optional(),
      /** Tax amount field, e.g. "tax_amount" */
      tax_field: z.string().optional(),
      /** ISO currency code field, e.g. "currency_code" */
      currency_field: z.string().optional(),
      /** Document date field, e.g. "invoice_date" */
      date_field: z.string().optional(),
      /** Due / expiry date field, e.g. "due_date" */
      due_date_field: z.string().optional(),
      /** Short document title / description field shown below the doc number */
      title_field: z.string().optional(),
      /** Audit: created_at timestamp field */
      created_at_field: z.string().optional(),
      /** Audit: created_by user field */
      created_by_field: z.string().optional(),
      /** Audit: updated_at timestamp field */
      updated_at_field: z.string().optional(),
      /** Audit: updated_by user field */
      updated_by_field: z.string().optional(),
      /** Lifecycle: status_changed_at timestamp field */
      status_changed_at_field: z.string().optional(),
      /** Lifecycle: status_changed_by user field */
      status_changed_by_field: z.string().optional(),
    }).optional(),
    /**
     * Semantic resolver key for status-field badge coloring in list/detail views.
     * When set, overrides the heuristic detection in resolvePresentationConfig.
     * Known values: "apArStatusIntent" | "closeTaskStatusIntent" | "closeRunStatusIntent" | "kanbanStatusIntent"
     * Set this in entity engine display_config seeds.
     */
    status_resolver: z.string().optional(),

    /**
     * Status-driven action grouping consumed by buildOrchestratorFromRecord().
     * Maps status value → { primary, working, output } operation-code lists.
     * Operations not listed for the current status are demoted to "overflow".
     * Example:
     *   "draft":     { primary: ["update","submit"], working: ["cancel"] }
     *   "submitted": { primary: ["approve","deny"],  working: ["cancel"] }
     */
    action_groups: z.record(
      z.string(),
      z.object({
        primary: z.array(z.string()).optional(),
        working: z.array(z.string()).optional(),
        output:  z.array(z.string()).optional(),
      }),
    ).optional(),

    /**
     * Configuration for detail_renderer = "rich_master".
     * Drives RichMasterDetailPage — one generic component for all master entities.
     * All entity-specific layout decisions live here in SQL, never in TSX.
     *
     * Tab renderers:
     *   "overview"     — KPI cards from header_facts + child-tab shortcut cards
     *   "fields"       — entity field grid (view) / EntityForm (edit)
     *   "child"        — child entity list panel (requires entity_code)
     *   "comments"     — CommentsPanel
     *   "attachments"  — AttachmentsPanel
     *   "activity"     — EventsPanel
     *   "blank"        — placeholder with blank_message
     */
    rich_master_config: z.object({
      /** Chip label in P1 identity row, e.g. "SUPPLIER". Defaults to entity_name uppercased. */
      type_label: z.string().optional(),
      /** Field names to display as KPI fact cells in the P2 header rail. */
      header_facts: z.array(z.string()).optional(),
      /** Ordered tab definitions. Falls back to [{fields},{comments},{attachments},{activity}] when absent. */
      tabs: z.array(z.object({
        id:               z.string(),
        label:            z.string(),
        renderer:         z.enum(["overview", "fields", "child", "comments", "attachments", "activity", "blank"]),
        /** Required for renderer="child". */
        entity_code:      z.string().optional(),
        /** Field names to show in child record rows (primary = first). */
        display_fields:   z.array(z.string()).optional(),
        /** URL template for "Add" button. "{uuid}" is replaced with the parent record's UUID. */
        add_href_template: z.string().optional(),
        add_label:        z.string().optional(),
        empty_title:      z.string().optional(),
        empty_description: z.string().optional(),
        /** For renderer="blank": message shown in the placeholder. */
        blank_message:    z.string().optional(),
      })).optional(),
    }).optional(),
  }),

  feature_flags: z.object({
    // ── Core capabilities ────────────────────────────────────────
    has_attachments: z.boolean().optional(),
    has_workflow: z.boolean().optional(),
    has_lifecycle: z.boolean().optional(),
    is_importable: z.boolean().optional(),
    is_exportable: z.boolean().optional(),
    is_bulk_editable: z.boolean().optional(),
    /** Entity participates in an approval workflow (drives detail_renderer default). */
    is_approvable: z.boolean().optional(),
    /** Entity has a payment schedule / settlement tracking. */
    has_payment_schedule: z.boolean().optional(),
    /** Entity has budget impact / availability check. */
    has_budget_impact: z.boolean().optional(),
    /** Entity has related upstream/downstream documents. */
    has_related_documents: z.boolean().optional(),
    /** Payables | receivables | treasury | etc. — used for context-sensitive UI. */
    document_category: z.string().optional(),

    // ── Spec-canonical tab-driving flags (RUNTIME_ROUTING_SPEC §4) ────────────
    /** Threaded comments panel. */
    comments_enabled: z.boolean().optional(),

    /** Domain event log / audit trail panel. */
    event_history: z.boolean().optional(),

    /** Version chain + compare subroutes. */
    version_control: z.boolean().optional(),

    /** Child line-item grid tab. */
    has_lines: z.boolean().optional(),

    /** Accounting distribution grid tab. */
    has_accounting_distribution: z.boolean().optional(),

    // ── New tab-driving flags (no legacy aliases) ─────────────────────────────
    /** Work items assigned to this record. */
    has_tasks: z.boolean().optional(),
    /** Notification subscribers. */
    has_watchers: z.boolean().optional(),
    /** Policy bindings / business rules. */
    has_rules: z.boolean().optional(),
    /** Webhook events / external sync panel. */
    has_integrations: z.boolean().optional(),
    /** Per-record validation results. */
    quality_checks: z.boolean().optional(),
    /** Record-scoped report links. */
    record_reports: z.boolean().optional(),
    /** SLA target in hours for stage-level SLA tracking (default: 24). */
    sla_target_hours: z.number().optional(),
    /**
     * Entity supports AI-driven line classification (spend category, GL account suggestion).
     * Drives ClassificationDecisionPanel + classify endpoint calls in LinesGrid/LineEditorSheet.
     * Set true for AP invoice entities in entity engine seeds.
     */
    has_ai_classification: z.boolean().optional(),
    /**
     * Uses LineComposerSheet for AI-assisted line intake (vs. inline row add).
     * Set true for AP invoice entities in entity engine seeds.
     */
    has_line_composer: z.boolean().optional(),
    /**
     * Entity records are scoped to a company_code — reference searches must filter by it.
     * Applies to dimension entities: cost_center, profit_center, project, site.
     * Set true in entity engine seeds for DIMENSION-class entities with company scope.
     */
    is_company_scoped: z.boolean().optional(),
  }),

  governance_level: z.string(),
  security_tier: z.string(),
  compiled_at: z.string().datetime(),
  compiled_hash: z.string(),
});
export type CompiledEntity = z.infer<typeof CompiledEntitySchema>;

// ═══════════════════════════════════════════════════════════════
// ENTITY OPERATION — from control.entity_operation DDL
// ═══════════════════════════════════════════════════════════════

export const OperationSurfaceSchema = z.enum(["LIST", "DETAIL", "BOTH", "PALETTE_ONLY", "HIDDEN"]);
export const OperationPlacementSchema = z.enum(["PRIMARY", "TOOLBAR", "OVERFLOW", "CONTEXT", "COMMAND"]);
export const OperationHandlerTypeSchema = z.enum(["NAVIGATE", "API", "MODAL", "INLINE"]);

export const EntityOperationSchema = z.object({
  id: UuidSchema,
  entity_name: z.string(),
  permission_code: z.string(),
  surface: OperationSurfaceSchema,
  placement: OperationPlacementSchema,
  handler_type: OperationHandlerTypeSchema,
  handler_target: z.string().nullable(),
  is_record_required: z.boolean(),
  sort_order: z.number().int(),
  label_override: z.string().nullable(),
  icon_override: z.string().nullable(),
  is_enabled: z.boolean(),
});
export type EntityOperation = z.infer<typeof EntityOperationSchema>;

// ═══════════════════════════════════════════════════════════════
// STATUS ROUTE — from snapshot.status_route.compiled_json
// ═══════════════════════════════════════════════════════════════

export const StatusRouteSchema = z.object({
  entity_name: z.string(),
  initial_state: z.string(),
  all_states: z.array(z.string()),
  terminal_states: z.array(z.string()),
  deletable_states: z.array(z.string()),
  allowed_transitions: z.record(z.string(), z.array(z.string())),
});
export type StatusRoute = z.infer<typeof StatusRouteSchema>;

// ═══════════════════════════════════════════════════════════════
// LIFECYCLE BINDING — from control.entity_lifecycle
// ═══════════════════════════════════════════════════════════════

export const EntityLifecycleBindingSchema = z.object({
  id: UuidSchema,
  entity_name: z.string(),
  lifecycle_id: UuidSchema,
  conditions: z.record(z.string(), z.unknown()).nullable(),
  priority: z.number().int(),
});
export type EntityLifecycleBinding = z.infer<typeof EntityLifecycleBindingSchema>;

// ═══════════════════════════════════════════════════════════════
// COMPILED OVERLAY — from snapshot.entity_compiled_overlay
// ═══════════════════════════════════════════════════════════════

export const CompiledOverlaySchema = z.object({
  entity_version_id: UuidSchema,
  overlay_set: z.array(UuidSchema),
  compiled_json: z.record(z.string(), z.unknown()),
  compiled_hash: z.string(),
});
export type CompiledOverlay = z.infer<typeof CompiledOverlaySchema>;

// ═══════════════════════════════════════════════════════════════
// LOOKUP DOMAIN + VALUE — dropdown resolution
// ═══════════════════════════════════════════════════════════════

export const LookupDomainSchema = z.object({
  id: UuidSchema,
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  source_schema: z.string(),
  is_extensible: z.boolean(),
  status: z.enum(["active", "deprecated"]),
});
export type LookupDomain = z.infer<typeof LookupDomainSchema>;

export const LookupValueSchema = z.object({
  id: UuidSchema,
  code: z.string(),
  name: z.string(),
  domain_code: z.string(),
  description: z.string().nullable(),
  sort_order: z.number().int(),
  is_system: z.boolean(),
  is_default: z.boolean(),
  parent_code: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  status: z.enum(["active", "deprecated"]),
});
export type LookupValue = z.infer<typeof LookupValueSchema>;

export const LookupDomainBundleSchema = z.object({
  domain: LookupDomainSchema,
  values: z.array(LookupValueSchema),
});
export type LookupDomainBundle = z.infer<typeof LookupDomainBundleSchema>;

// ═══════════════════════════════════════════════════════════════
// CAPABILITY — tenant/entity feature flags
// ═══════════════════════════════════════════════════════════════

export const EntityCapabilitySchema = z.object({
  entity_name: z.string(),
  capability_code: z.string(),
  is_enabled: z.boolean(),
  config: z.record(z.string(), z.unknown()).nullable(),
});
export type EntityCapability = z.infer<typeof EntityCapabilitySchema>;

// ═══════════════════════════════════════════════════════════════
// DETAIL TAB — canonical tab identifiers (RUNTIME_ROUTING_SPEC §3)
// ═══════════════════════════════════════════════════════════════

/**
 * All possible tab slots in the detail page tab bar.
 * "overview" is always present.
 * All others are driven by feature_flags or class profile defaults.
 * Source of truth: RUNTIME_ROUTING_SPEC §3.1.
 */
export const DetailTabSchema = z.enum([
  "overview",       // always — primary field grid
  "lines",          // child line-item grid
  "distributions",  // accounting distribution grid
  "workflow",       // inline approval stages
  "attachments",    // file list
  "versions",       // version timeline
  "comments",       // threaded comments
  "approvals",      // approval history
  "tasks",          // work items
  "watchers",       // notification subscribers
  "rules",          // policy / business-rule bindings
  "integrations",   // webhook / external-sync events
  "quality",        // per-record validation results
  "reports",        // record-scoped report links
  "events",         // domain event log / audit trail
]);
export type DetailTab = z.infer<typeof DetailTabSchema>;

/**
 * Canonical display order for detail-page tabs (RUNTIME_ROUTING_SPEC §3.2).
 * resolveTabs() sorts its output against this array so the rendered tab bar
 * is deterministic regardless of which feature flags or overlays are active.
 * Tabs not present in this list sort to the end in insertion order.
 */
export const CANONICAL_TAB_ORDER: readonly DetailTab[] = [
  "overview",
  "lines",
  "distributions",
  "workflow",
  "attachments",
  "versions",
  "comments",
  "approvals",
  "tasks",
  "watchers",
  "rules",
  "integrations",
  "quality",
  "reports",
  "events",
] as const;

// ═══════════════════════════════════════════════════════════════
// ENTITY CLASS PROFILE — per-class tab/layout defaults
// Source: control.entity_class_profile
// ═══════════════════════════════════════════════════════════════

export const EntityClassProfileSchema = z.object({
  entity_class: EntityClassSchema,
  /** Tab slots that are on by default for all entities of this class. */
  default_tabs: z.array(DetailTabSchema).optional(),
  /** Preferred detail page layout hint for this class. */
  default_layout: z.string().optional(),
});
export type EntityClassProfile = z.infer<typeof EntityClassProfileSchema>;

// ═══════════════════════════════════════════════════════════════
// OVERLAY TAB CHANGE — tenant-level tab customisation
// Carried inside snapshot.entity_compiled_overlay compiled_json.
// ═══════════════════════════════════════════════════════════════

export const OverlayTabChangeSchema = z.object({
  tab: DetailTabSchema,
  operation: z.enum(["add", "remove"]),
});
export type OverlayTabChange = z.infer<typeof OverlayTabChangeSchema>;
