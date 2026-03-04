/**
 * Section Grouping Engine
 *
 * Pure functions for grouping entity fields into UI sections
 * and determining read-only behavior with reason codes.
 *
 * Resolution order for section assignment:
 *   1. Explicit field override — validation.ui.section
 *   2. Entity-level override — feature_flags.ui.sectionOverrides
 *   3. Convention default — by column name/type patterns
 */

import type { SectionDescriptor, ViewMode } from "@/lib/entity-page/types";
import type { FieldEditBehavior } from "@/lib/entity-projection";
import type { FieldMeta } from "@/lib/use-entity-fields";

// ============================================================================
// Section Override Types
// ============================================================================

export interface SectionGroupingOverrides {
  /** feature_flags.ui.sectionOverrides: columnName → sectionCode */
  sectionOverrides?: Record<string, string>;
  /** feature_flags.ui.sectionLabels: sectionCode → display label */
  sectionLabels?: Record<string, string>;
}

// ============================================================================
// Convention-Based Section Rules
// ============================================================================

interface SectionRule {
  code: string;
  label: string;
  columns: number;
  match: (columnName: string) => boolean;
}

const GENERAL_FIELDS = new Set([
  "code",
  "name",
  "title",
  "description",
  "label",
  "display_name",
]);
const HIERARCHY_FIELDS = new Set([
  "parent_id",
  "org_unit_id",
  "level",
  "inherit_from_parent",
]);
const STATUS_FIELDS = new Set([
  "status",
  "is_active",
  "activated_at",
  "sunset_at",
]);

const SECTION_RULES: SectionRule[] = [
  {
    code: "general",
    label: "General",
    columns: 2,
    match: (col) => GENERAL_FIELDS.has(col),
  },
  {
    code: "hierarchy",
    label: "Hierarchy",
    columns: 2,
    match: (col) => HIERARCHY_FIELDS.has(col),
  },
  {
    code: "status",
    label: "Status & Lifecycle",
    columns: 2,
    match: (col) => STATUS_FIELDS.has(col),
  },
  {
    code: "defaults",
    label: "Defaults",
    columns: 2,
    match: (col) => col.startsWith("default_"),
  },
];

// System fields excluded from all sections
const SYSTEM_FIELDS = new Set([
  "id",
  "tenant_id",
  "realm_id",
  "created_at",
  "created_by",
  "updated_at",
  "updated_by",
  "deleted_at",
  "deleted_by",
  "version",
  "entity_type_code",
  "source_system",
]);

// ============================================================================
// Section Grouping
// ============================================================================

/**
 * Groups fields into UI sections using convention + override rules.
 *
 * @param fields - Field metadata array
 * @param overrides - Optional entity-level overrides from feature_flags.ui
 * @returns Array of SectionDescriptors with fields assigned
 */
export function groupFieldsIntoSections(
  fields: FieldMeta[],
  overrides?: SectionGroupingOverrides,
): SectionDescriptor[] {
  const { sectionOverrides = {}, sectionLabels = {} } = overrides ?? {};

  // Accumulate fields per section
  const sectionFieldsMap = new Map<string, string[]>();
  const sectionMetaMap = new Map<string, { label: string; columns: number }>();

  // Pre-populate known sections (to preserve ordering)
  for (const rule of SECTION_RULES) {
    sectionFieldsMap.set(rule.code, []);
    sectionMetaMap.set(rule.code, { label: rule.label, columns: rule.columns });
  }
  sectionFieldsMap.set("extended", []);
  sectionMetaMap.set("extended", { label: "Extended", columns: 1 });

  for (const field of fields) {
    if (SYSTEM_FIELDS.has(field.columnName)) continue;

    const col = field.columnName;

    // 1. Explicit field override (validation.ui.section)
    const validationUi = (field.validation as any)?.ui as
      | Record<string, unknown>
      | undefined;
    const fieldSection = validationUi?.section as string | undefined;
    if (fieldSection) {
      appendToSection(
        sectionFieldsMap,
        sectionMetaMap,
        fieldSection,
        col,
        sectionLabels,
      );
      continue;
    }

    // 2. Entity-level override (feature_flags.ui.sectionOverrides)
    const entityOverride = sectionOverrides[col];
    if (entityOverride) {
      appendToSection(
        sectionFieldsMap,
        sectionMetaMap,
        entityOverride,
        col,
        sectionLabels,
      );
      continue;
    }

    // 3. Convention default
    let matched = false;
    for (const rule of SECTION_RULES) {
      if (rule.match(col)) {
        sectionFieldsMap.get(rule.code)!.push(col);
        matched = true;
        break;
      }
    }

    if (!matched) {
      sectionFieldsMap.get("extended")!.push(col);
    }
  }

  // Build result, only include sections that have fields
  const result: SectionDescriptor[] = [];
  for (const [code, fieldNames] of sectionFieldsMap) {
    if (fieldNames.length === 0) continue;
    const meta = sectionMetaMap.get(code)!;
    result.push({
      code,
      label: sectionLabels[code] ?? meta.label,
      columns: meta.columns,
      fields: fieldNames,
    });
  }

  return result;
}

/** Helper to add a field to a section, creating the section if needed */
function appendToSection(
  fieldsMap: Map<string, string[]>,
  metaMap: Map<string, { label: string; columns: number }>,
  sectionCode: string,
  columnName: string,
  sectionLabels: Record<string, string>,
): void {
  if (!fieldsMap.has(sectionCode)) {
    fieldsMap.set(sectionCode, []);
    // Auto-create custom section with default 2-column layout
    const label =
      sectionLabels[sectionCode] ??
      sectionCode.charAt(0).toUpperCase() + sectionCode.slice(1);
    metaMap.set(sectionCode, { label, columns: 2 });
  }
  fieldsMap.get(sectionCode)!.push(columnName);
}

// ============================================================================
// Read-Only with Reasons
// ============================================================================

// Convention-based read-only columns
const DERIVED_HIERARCHY_COLUMNS = new Set(["level"]);
const LIFECYCLE_MANAGED_COLUMNS = new Set(["activated_at", "sunset_at"]);
const SYSTEM_MANAGED_COLUMNS = new Set(["created_at", "updated_at", "version"]);

/**
 * Determines whether a field should be read-only and why.
 *
 * Rules checked in priority order:
 *   1. validation.ui.readOnly === true → EXPLICIT_META
 *   2. validation.ui.lockOnEdit === true && viewMode=edit → LOCK_ON_EDIT
 *   3. columnName === "level" → DERIVED_HIERARCHY
 *   4. columnName in [activated_at, sunset_at] → LIFECYCLE_MANAGED
 *   5. columnName in [created_at, updated_at, version] → SYSTEM_MANAGED
 *
 * @returns { readOnly: false } by default
 */
export function getFieldEditBehavior(
  field: FieldMeta,
  viewMode: ViewMode,
): FieldEditBehavior {
  const validationUi = (field.validation as any)?.ui as
    | Record<string, unknown>
    | undefined;

  // Rule 1: Explicit read-only from meta
  if (validationUi?.readOnly === true) {
    return { readOnly: true, reason: "EXPLICIT_META" };
  }

  // Rule 2: Lock on edit (editable on create, locked on edit)
  if (validationUi?.lockOnEdit === true && viewMode === "edit") {
    return { readOnly: true, reason: "LOCK_ON_EDIT" };
  }

  // Rule 3: Derived hierarchy
  if (DERIVED_HIERARCHY_COLUMNS.has(field.columnName)) {
    return { readOnly: true, reason: "DERIVED_HIERARCHY" };
  }

  // Rule 4: Lifecycle-managed
  if (LIFECYCLE_MANAGED_COLUMNS.has(field.columnName)) {
    return { readOnly: true, reason: "LIFECYCLE_MANAGED" };
  }

  // Rule 5: System-managed
  if (SYSTEM_MANAGED_COLUMNS.has(field.columnName)) {
    return { readOnly: true, reason: "SYSTEM_MANAGED" };
  }

  return { readOnly: false };
}
