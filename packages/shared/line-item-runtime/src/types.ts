"use client";

import type { ReactNode } from "react";
import type React from "react";
import type { AccountingDistribution, DocumentLine } from "@athyper/api-contracts/documents";
import type { CompiledEntity, EntityField } from "@athyper/api-contracts/metadata";
import type { MetaEntityLineItemsSurface } from "@athyper/runtime-contracts";

// ─────────────────────────────────────────────────────────────────────────────
// LINE VARIANT KEY
// ─────────────────────────────────────────────────────────────────────────────

/** Discriminant stored in display_config.line_ui_variant */
export type LineItemVariantKey = "procure" | "sales" | "generic" | (string & {});

// ─────────────────────────────────────────────────────────────────────────────
// GENERIC RECORD SHAPE
// ─────────────────────────────────────────────────────────────────────────────

export type LineRecord = DocumentLine & {
  id?: string;
  [key: string]: unknown;
};

// ─────────────────────────────────────────────────────────────────────────────
// COLUMN DESCRIPTOR
// ─────────────────────────────────────────────────────────────────────────────

export type MetaLineAlign = "left" | "right" | "center";

export interface MetaLineColumn {
  key:          string;
  label:        string;
  field?:       EntityField;
  align?:       MetaLineAlign;
  width?:       number | string;
  minWidth?:    number;
  sortable?:    boolean;
  numeric?:     boolean;
  renderCell?:  (line: LineRecord, currencyCode?: string) => ReactNode;
}

// ─────────────────────────────────────────────────────────────────────────────
// PROCURE SECTION / TAB (shared across composer + editor)
// ─────────────────────────────────────────────────────────────────────────────

export type LineItemSectionType = "item" | "financial" | "dimensions" | "classification" | "other";

export interface LineItemSection {
  key:         string;
  label:       string;
  type:        LineItemSectionType;
  groups:      string[];
  fields:      string[];
  defaultOpen: boolean;
}

export type LineItemTabType =
  | "fields"
  | "classification"
  | "accounting"
  | "tax"
  | "discount"
  | "charges"
  | "retention"
  | "reference_links"
  | "fulfillment_links"
  | "other";

export interface LineItemTab {
  key:         string;
  label:       string;
  type:        LineItemTabType;
  groups:      string[];
  fields:      string[];
  badge?:      string | number;
  hidden?:     boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// AMOUNT CONFIG
// ─────────────────────────────────────────────────────────────────────────────

export interface LineAmountSummaryField {
  name:    string;
  label:   string;
  sign?:   1 | -1;
  bold?:   boolean;
  divider?: boolean;
}

export interface LineFinancialBarField {
  name:    string;
  label:   string;
  sign?:   1 | -1;
}

export interface LineItemAmountConfig {
  amountField:   string;
  currencyField?: string;
  summaryFields:  LineAmountSummaryField[];
  financialBar:   LineFinancialBarField[];
}

// ─────────────────────────────────────────────────────────────────────────────
// REFERENCE / FULFILLMENT CHAIN
// ─────────────────────────────────────────────────────────────────────────────

export interface DocumentChainLink {
  entityCode:    string;
  entityLabel:   string;
  idField:       string;
  numberField?:  string;
  statusField?:  string;
  lineCodeField?: string;
}

export interface ReferenceTabConfig {
  links:         DocumentChainLink[];
  quantityField: string | null;
  amountField:   string | null;
  showMatchStatus: boolean;
}

export interface FulfillmentTabConfig {
  links:         DocumentChainLink[];
  quantityField: string | null;
  showDeliveryStatus: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// QUANTITY PROGRESS
// ─────────────────────────────────────────────────────────────────────────────

export interface LineQuantityProgress {
  ordered:   number | null;
  received:  number | null;
  invoiced:  number | null;
  unitCode:  string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// MATCH EXCEPTION
// ─────────────────────────────────────────────────────────────────────────────

export interface MatchException {
  id:                   string;
  exception_type:       string;
  exception_subtype?:   string;
  expected_value?:      number;
  actual_value?:        number;
  variance_amount:      number;
  variance_pct?:        number;
  is_within_tolerance:  boolean;
  resolution_type?:     string;
  status:               string;
  [key: string]: unknown;
}

// ─────────────────────────────────────────────────────────────────────────────
// ORGANIZER STATE (grid density, sort, filter, group)
// ─────────────────────────────────────────────────────────────────────────────

export type LineOrganizerDensity = "compact" | "default" | "comfortable";

export interface LineOrganizerFilter {
  field:    string;
  operator: "eq" | "neq" | "contains" | "gt" | "lt" | "is_null" | "is_not_null";
  value?:   unknown;
}

export interface LineOrganizerSort {
  field:     string;
  direction: "asc" | "desc";
}

export interface LineOrganizerGroup {
  field: string;
  label: string;
}

export interface LineOrganizerConfig {
  density:      LineOrganizerDensity;
  sortBy?:      LineOrganizerSort;
  groupBy?:     LineOrganizerGroup;
  filterBy:     LineOrganizerFilter[];
  hiddenColumns: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// SHEET CONTEXT — passed to variant sheet components
// ─────────────────────────────────────────────────────────────────────────────

export interface LineItemSheetContext {
  /** Parent document entity code (e.g. "purchase_invoice") */
  entityCode:      string;
  /** Parent document record ID */
  recordId:        string;
  /** Line entity code (e.g. "purchase_invoice_line") */
  lineEntityCode?: string | null;
  /** Pre-fetched line entity if already loaded */
  lineEntity?:     CompiledEntity | null;
  /** Parent document header record (for company_code context etc.) */
  record?:         Record<string, unknown>;
  currencyCode?:   string;
  companyCodeId?:  string;
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPOSER PROPS (shared between all variant composers)
// ─────────────────────────────────────────────────────────────────────────────

export interface LineItemComposerProps extends LineItemSheetContext {
  open:            boolean;
  onOpenChange:    (open: boolean) => void;
  /** Edit an existing line (create mode when null/undefined) */
  line?:           DocumentLine | null;
  composerMode?:   "manual" | "catalog";
  onMutated?:      () => void;
  /** Draft mode — skip server write, hand payload to grid instead */
  onDraftSubmit?:  (payload: Record<string, unknown>) => void | Promise<void>;
}

// ─────────────────────────────────────────────────────────────────────────────
// EDITOR PROPS (shared between all variant editors)
// ─────────────────────────────────────────────────────────────────────────────

export interface LineItemEditorProps extends LineItemSheetContext {
  open:               boolean;
  onOpenChange:       (open: boolean) => void;
  line:               DocumentLine;
  distributions?:     AccountingDistribution[];
  readOnly?:          boolean;
  canEdit?:           boolean;
  onPromoteToEdit?:   () => void;
  createMode?:        boolean;
  lineIntakeMode?:    "manual" | "catalog";
  initialTab?:        string;
  hasAiClassification?: boolean;
  onLineSaved?:       (patch: Partial<DocumentLine>) => void;
  onMutated?:         () => void;
  onDraftSubmit?:     (payload: Record<string, unknown>) => void | Promise<void>;
  onDraftClassify?:   (line: DocumentLine, mode?: string) => Promise<Record<string, unknown> | void>;
  onLineCopied?:      () => void;
  onLineDeleted?:     () => void;
  hasPreviousLine?:   boolean;
  hasNextLine?:       boolean;
  onPreviousLine?:    () => void;
  onNextLine?:        () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// PANEL ARCHITECTURE — meta-entity driven panel contracts
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Read-only context passed to panel visibility/label callbacks.
 */
export interface LineItemPanelContext {
  /** Compiled line entity metadata (null while loading) */
  entity:           CompiledEntity | null;
  /** "compose" = new line, "edit" = existing line */
  mode:             "compose" | "edit";
  /** Parent document entity code, e.g. "purchase_invoice" */
  parentEntityCode: string;
  /** Line entity code, e.g. "purchase_invoice_line" */
  lineEntityCode:   string;
  /** Parent document header record (for company_code context, header refs, etc.) */
  record?:          Record<string, unknown>;
  currencyCode?:    string;
  companyCodeId?:   string;
}

/**
 * Full props injected into every panel Component.
 * Extends context with mutable draft state.
 */
export interface LineItemPanelProps extends LineItemPanelContext {
  /** Existing line being edited; null when mode="compose" (new line) */
  line:          DocumentLine | null;
  /** Flat draft record — current in-flight edit state */
  draft:         Record<string, unknown>;
  /**
   * Patch the draft. Panels must spread onto existing state — the shell merges:
   *   onDraftChange({ fieldName: newValue })
   */
  onDraftChange: (patch: Record<string, unknown>) => void;
  /** Parent document record ID */
  recordId:      string;
  saving?:       boolean;
  readOnly?:     boolean;
}

/**
 * A single tab panel in the UnifiedLineItemSheet.
 * groupKeys is the meta-entity contract: it declares which entity field groups
 * this panel owns, enabling badge counts and field scoping without hard-coding names.
 */
export interface LineItemPanel {
  /** Unique key within a variant's panel list */
  key:       string;
  /** Tab label — static string or dynamic renderer */
  label:     string | ((ctx: LineItemPanelContext, draft: Record<string, unknown>) => ReactNode);
  /**
   * entity field.group_key values this panel is responsible for.
   * Badge counts, field visibility, and tab ordering are derived from these.
   */
  groupKeys: string[];
  /** The panel component rendered when this tab is active */
  Component: React.ComponentType<LineItemPanelProps>;
  /** Return false to hide this tab (context + current draft are available for decision) */
  isVisible?: (ctx: LineItemPanelContext, draft: Record<string, unknown>) => boolean;
  /** Ascending order; lower = further left in the tab bar */
  order:     number;
}

// ─────────────────────────────────────────────────────────────────────────────
// VARIANT DEFINITION — the contract each registered variant must satisfy
// ─────────────────────────────────────────────────────────────────────────────

export interface LineItemVariantDefinition {
  key: LineItemVariantKey;

  /** Display label used in UI ("Procurement", "Sales", etc.) */
  label: string;

  /**
   * Resolve composer accordion sections from compiled entity metadata.
   * Used by LineItemComposerSheet.
   */
  resolveComposerSections: (entity: CompiledEntity | null) => LineItemSection[];

  /**
   * Resolve editor tabs from compiled entity metadata.
   * Used by LineItemEditorSheet.
   */
  resolveEditorTabs: (entity: CompiledEntity | null) => LineItemTab[];

  /**
   * Resolve the amount config (financial bar + summary fields).
   */
  resolveAmountConfig: (entity: CompiledEntity | null) => LineItemAmountConfig | null;

  /**
   * Build the ordered column catalog for the lines grid.
   * Returns columns in display order.
   */
  resolveColumnCatalog: (
    entity: CompiledEntity | null,
    options?: { displayMode?: string },
  ) => MetaLineColumn[];

  /**
   * Optional: status summary row shown below the grid (e.g. unallocated / unmatched counts).
   * Return null to hide.
   */
  resolveGridSummary?: (
    lines: LineRecord[],
    distributions: AccountingDistribution[],
    entity: CompiledEntity | null,
  ) => { label: string; count: number; intent: "warning" | "info" | "error" }[] | null;

  /**
   * Panel-based sheet (new architecture).
   * When defined, UnifiedLineItemSheet renders these as tabs.
   * Panels are meta-entity driven via groupKeys — no hard-coded field names.
   */
  panels?: LineItemPanel[];

  /**
   * Legacy composer sheet. Used when panels[] is not defined.
   * @deprecated Prefer panels[].
   */
  ComposerSheet?: React.ComponentType<LineItemComposerProps>;

  /**
   * Legacy editor sheet. Used when panels[] is not defined.
   * @deprecated Prefer panels[].
   */
  EditorSheet?: React.ComponentType<LineItemEditorProps>;
}

// ─────────────────────────────────────────────────────────────────────────────
// LINES GRID PROPS (surface-level orchestrator)
// ─────────────────────────────────────────────────────────────────────────────

export interface LinesGridProps {
  /** Resolved meta-entity surface descriptor */
  surface:         MetaEntityLineItemsSurface;
  /** Parent document entity metadata — optional; variant key falls back to entity code heuristics when absent */
  entity?:         CompiledEntity | null;
  /** Parent entity code */
  entityCode:      string;
  /** Parent record ID */
  recordId:        string;
  /** Line entity code */
  lineEntityCode:  string;
  /** Currency for amount formatting */
  currencyCode?:   string;
  /** Company code for dimension picker scoping */
  companyCodeId?:  string;
  /** Parent document header record */
  record?:         Record<string, unknown>;
  /** Lines fetched by parent */
  lines:           LineRecord[];
  /** Distributions fetched by parent */
  distributions:   AccountingDistribution[];
  isLoading?:      boolean;
  onRefresh:       () => void;
  /** Lock the entire grid (all lines read-only) */
  editMode?:       boolean;
  /** Intake-wizard draft mode (no server writes during creation) */
  draftMode?:      boolean;
  onDraftLinesChange?: (lines: LineRecord[]) => void;
  /**
   * Phase 11 #8 — narrow-viewport column visibility.
   *
   * When provided, columns whose `field.name` is NOT in this list render
   * with `hidden md:table-cell` so they only appear at `md` (≥ 768px).
   * When `undefined` (default), every column renders at all viewport sizes.
   *
   * Source: `entity.display_config.mobile_columns` from the runtime
   * descriptor. Optional; absent metadata = show-all degradation.
   */
  mobileColumns?:  string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// LINE ITEMS SURFACE PROPS (outer wrapper injected into runtime-canvas)
// ─────────────────────────────────────────────────────────────────────────────

export interface LineItemsSurfaceProps {
  surface:      MetaEntityLineItemsSurface;
  entity?:      CompiledEntity | null;
  entityCode:   string;
  recordId:     string;
  currencyCode?: string;
  companyCodeId?: string;
  record?:      Record<string, unknown>;
  editMode?:    boolean;
  /** Phase 11 #8 — see LinesGridProps.mobileColumns. Passed through unchanged. */
  mobileColumns?: string[];
}
