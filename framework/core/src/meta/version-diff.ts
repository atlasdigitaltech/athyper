/**
 * Version Diff Engine
 *
 * Pure functions to compute classified diffs between two entity version
 * field sets. Used by publish workflow to assess change impact and block
 * unsafe migrations.
 *
 * Consumes types and constants from types.ts:
 *   - FieldVersionDiff, EntityVersionDiff, ChangeImpact
 *   - FIELD_CHANGE_IMPACT, PUBLISH_BLOCKING_RULES
 */

import type { ChangeImpact, FieldVersionDiff, EntityVersionDiff } from "./types.js";
import { FIELD_CHANGE_IMPACT, PUBLISH_BLOCKING_RULES } from "./types.js";

// ============================================================================
// Field Snapshot (input shape for diff)
// ============================================================================

/**
 * Minimal field snapshot — the properties we compare between versions.
 * Mapped from meta.field DB rows; callers normalize DB rows to this shape.
 */
export type FieldSnapshot = {
  name: string;
  columnName: string;
  dataType: string;
  label?: string | null;
  description?: string | null;
  uiType?: string | null;
  isRequired?: boolean;
  isUnique?: boolean;
  isSearchable?: boolean;
  isFilterable?: boolean;
  isSortable?: boolean;
  isGroupable?: boolean;
  isAggregatable?: boolean;
  isReadOnly?: boolean;
  isComputed?: boolean;
  isDeprecated?: boolean;
  writeOnce?: boolean;
  cardinality?: string | null;
  defaultValue?: unknown;
  constraints?: Record<string, unknown> | null;
  validation?: Record<string, unknown> | null;
  referenceConfig?: Record<string, unknown> | null;
  lookupConfig?: Record<string, unknown> | null;
  lookupProfile?: Record<string, unknown> | null;
  enumConfig?: Record<string, unknown> | null;
  moneyConfig?: Record<string, unknown> | null;
  datetimeConfig?: Record<string, unknown> | null;
  computeMode?: string | null;
  computeExpr?: Record<string, unknown> | null;
  collectionBehavior?: Record<string, unknown> | null;
  childEntityName?: string | null;
  childFkField?: string | null;
  visibility?: Record<string, unknown> | null;
  editability?: Record<string, unknown> | null;
  uiHint?: Record<string, unknown> | null;
  sortOrder?: number;
  origin?: string | null;
};

// ============================================================================
// Impact severity ordering
// ============================================================================

const IMPACT_SEVERITY: Record<ChangeImpact, number> = {
  non_breaking: 0,
  migration_required: 1,
  breaking: 2,
  publish_blocking: 3,
};

function maxImpact(a: ChangeImpact, b: ChangeImpact): ChangeImpact {
  return IMPACT_SEVERITY[a] >= IMPACT_SEVERITY[b] ? a : b;
}

// ============================================================================
// Property comparison
// ============================================================================

/** Properties on FieldSnapshot that are compared for diffs */
const DIFF_PROPERTIES: (keyof FieldSnapshot)[] = [
  "columnName", "dataType", "label", "description", "uiType",
  "isRequired", "isUnique", "isSearchable", "isFilterable",
  "isSortable", "isGroupable", "isAggregatable",
  "isReadOnly", "isComputed", "isDeprecated", "writeOnce",
  "cardinality", "defaultValue",
  "constraints", "validation", "referenceConfig", "lookupConfig",
  "lookupProfile", "enumConfig", "moneyConfig", "datetimeConfig",
  "computeMode", "computeExpr", "collectionBehavior",
  "childEntityName", "childFkField",
  "visibility", "editability", "uiHint", "sortOrder", "origin",
];

/**
 * Deep-equal check for primitives and plain objects/arrays.
 * Handles null/undefined equivalence and JSON-serialized JSONB columns.
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  if (typeof a !== typeof b) return false;

  if (typeof a === "object") {
    const aStr = JSON.stringify(a);
    const bStr = JSON.stringify(b);
    return aStr === bStr;
  }

  return false;
}

/**
 * Classify the impact of changing a property on a field.
 * Falls back to "non_breaking" for unknown properties.
 */
function classifyPropertyChange(property: string): ChangeImpact {
  // Map FieldSnapshot property names to FIELD_CHANGE_IMPACT keys
  const keyMap: Record<string, string> = {
    uiHint: "ui",
    uiType: "ui",
  };
  const impactKey = keyMap[property] ?? property;
  return FIELD_CHANGE_IMPACT[impactKey] ?? "non_breaking";
}

// ============================================================================
// Core Diff Engine
// ============================================================================

/**
 * Compute the diff between two field snapshots.
 * Returns all property-level changes with impact classification.
 */
export function diffField(
  fieldName: string,
  previous: FieldSnapshot,
  current: FieldSnapshot,
): FieldVersionDiff[] {
  const changes: FieldVersionDiff[] = [];

  for (const prop of DIFF_PROPERTIES) {
    const prevVal = previous[prop];
    const currVal = current[prop];

    if (!deepEqual(prevVal, currVal)) {
      const impact = classifyPropertyChange(prop);
      changes.push({
        fieldName,
        property: prop,
        previousValue: prevVal,
        newValue: currVal,
        impact,
        reason: `${prop} changed from ${summarizeValue(prevVal)} to ${summarizeValue(currVal)}`,
      });
    }
  }

  return changes;
}

/**
 * Compute the full entity version diff.
 *
 * Detects: modified fields, added fields, removed fields.
 * Applies PUBLISH_BLOCKING_RULES for structural changes.
 */
export function computeEntityVersionDiff(
  entityName: string,
  fromVersion: string,
  toVersion: string,
  previousFields: FieldSnapshot[],
  currentFields: FieldSnapshot[],
): EntityVersionDiff {
  const changes: FieldVersionDiff[] = [];

  const prevMap = new Map(previousFields.map(f => [f.name, f]));
  const currMap = new Map(currentFields.map(f => [f.name, f]));

  // 1. Modified fields (present in both versions)
  for (const [name, currField] of currMap) {
    const prevField = prevMap.get(name);
    if (prevField) {
      changes.push(...diffField(name, prevField, currField));
      // Enum stability: detect value removals/additions
      changes.push(...checkEnumStability(name, prevField, currField));
    }
  }

  // 2. Added fields
  for (const [name, currField] of currMap) {
    if (!prevMap.has(name)) {
      const isRequired = currField.isRequired ?? false;
      const hasDefault = currField.defaultValue != null;
      const impact: ChangeImpact = isRequired && !hasDefault
        ? PUBLISH_BLOCKING_RULES.newRequiredFieldWithoutDefault
        : PUBLISH_BLOCKING_RULES.addedOptionalField;

      changes.push({
        fieldName: name,
        property: "_added",
        newValue: true,
        impact,
        reason: isRequired && !hasDefault
          ? `New required field '${name}' without default value blocks publish`
          : `New optional field '${name}' added`,
      });
    }
  }

  // 3. Removed fields
  for (const [name] of prevMap) {
    if (!currMap.has(name)) {
      changes.push({
        fieldName: name,
        property: "_removed",
        previousValue: true,
        impact: PUBLISH_BLOCKING_RULES.removedField,
        reason: `Field '${name}' was removed from the schema`,
      });
    }
  }

  // Compute summary
  const summary: Record<ChangeImpact, number> = {
    non_breaking: 0,
    migration_required: 0,
    breaking: 0,
    publish_blocking: 0,
  };
  let highest: ChangeImpact = "non_breaking";
  for (const change of changes) {
    summary[change.impact]++;
    highest = maxImpact(highest, change.impact);
  }

  return {
    entityName,
    fromVersion,
    toVersion,
    changes,
    maxImpact: highest,
    summary,
  };
}

// ============================================================================
// Helpers
// ============================================================================

// ============================================================================
// Enum Stability Validation
// ============================================================================

/**
 * Check enum stability between two field versions.
 *
 * Rules:
 *   - Removing an enum value is breaking (data may reference it)
 *   - Renaming is detected as remove+add with no matching value
 *   - Adding new values is non_breaking
 *
 * Returns additional FieldVersionDiff entries for enum-specific changes.
 */
export function checkEnumStability(
  fieldName: string,
  previous: FieldSnapshot,
  current: FieldSnapshot,
): FieldVersionDiff[] {
  if (previous.dataType !== "enum" && current.dataType !== "enum") return [];

  const prevValues = extractEnumValues(previous);
  const currValues = extractEnumValues(current);

  if (!prevValues || !currValues) return [];

  const changes: FieldVersionDiff[] = [];

  // Detect removed values
  const currSet = new Set(currValues);
  const removedValues = prevValues.filter(v => !currSet.has(v));

  if (removedValues.length > 0) {
    changes.push({
      fieldName,
      property: "enumConfig.values",
      previousValue: removedValues,
      impact: "breaking",
      reason: `Enum values removed: [${removedValues.join(", ")}]. Existing data rows may reference these values.`,
    });
  }

  // Detect added values (informational, non-breaking)
  const prevSet = new Set(prevValues);
  const addedValues = currValues.filter(v => !prevSet.has(v));

  if (addedValues.length > 0) {
    changes.push({
      fieldName,
      property: "enumConfig.values",
      newValue: addedValues,
      impact: "non_breaking",
      reason: `New enum values added: [${addedValues.join(", ")}]`,
    });
  }

  return changes;
}

/**
 * Extract enum value strings from a field snapshot.
 * Handles both enumConfig.values (structured) and validation.enumValues (legacy).
 */
function extractEnumValues(field: FieldSnapshot): string[] | null {
  // Modern: enumConfig.values array of { value: string, ... }
  const ec = field.enumConfig;
  if (ec && typeof ec === "object" && "values" in ec) {
    const values = (ec as { values?: Array<{ value: string }> }).values;
    if (Array.isArray(values)) {
      return values.map(v => typeof v === "string" ? v : v.value).filter(Boolean);
    }
  }

  // Legacy: validation.enumValues or validation.allowedValues
  const v = field.validation;
  if (v && typeof v === "object") {
    const vals = (v as Record<string, unknown>).enumValues ?? (v as Record<string, unknown>).allowedValues;
    if (Array.isArray(vals)) return vals.map(String);
  }

  return null;
}

function summarizeValue(val: unknown): string {
  if (val === null || val === undefined) return "null";
  if (typeof val === "string") return `"${val.length > 30 ? val.slice(0, 30) + "…" : val}"`;
  if (typeof val === "object") return JSON.stringify(val).slice(0, 50);
  return String(val);
}
