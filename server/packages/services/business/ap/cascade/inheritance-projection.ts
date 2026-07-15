/**
 * BFF Inheritance Projection (P4 v1.2)
 *
 * Server-side bridge between the database and the cascade primitives. Loads
 * `control.entity_field.defaults` rows for an entity, fetches the parent
 * record per cascade rule, and computes the virtual `_inheritance` block
 * to attach to API responses.
 *
 * NEVER persisted. Recomputed per request. Cached at the application layer
 * if needed (cascade rules change rarely).
 *
 * The cascade primitives are duplicated here from @athyper/cascade so the
 * server workspace doesn't take a cross-workspace dependency. The two
 * implementations MUST stay in sync â€” single test fixture per behavior in
 * packages/shared/business-domain/cascade/src/__tests__/ + duplicate fixture here.
 *
 * Spec: docs/specs/purchase_invoice_field_design.md Â§4
 */

import type { Kysely } from "kysely";
import { sql } from "kysely";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

// =============================================================================
// Types â€” mirror of @athyper/cascade/types
// =============================================================================

export type InheritanceLabel =
  | "unset"
  | "inherited_null"
  | "inherited_match"
  | "overridden";

export type InheritanceMap = Record<string, InheritanceLabel>;

interface DefaultValueSource {
  kind:           "parent_field" | "tenant_config" | "supplier_config" | "static";
  parent_entity?: string;
  parent_field?:  string;
  static_value?:  unknown;
  config_key?:    string;
  apply_on?:      Array<"create" | "reset">;
}

interface OverrideDetection {
  compare_to:                  string;
  label_when_inherited?:       string;
  label_when_overridden?:      string;
  label_when_inherited_null?:  string;
}

export interface EntityFieldDefaults {
  default_value_source?: DefaultValueSource;
  override_detection?:   OverrideDetection | null;
  on_parent_change?:     "preserve" | "prompt" | "inherit" | "recompute";
  ui_affordance?:        {
    show_reset_to_default?: boolean;
    show_inheritance_chip?: boolean;
    chip_position?:         "field_label" | "field_value" | "none";
  };
}

export type DefaultsMap = Record<string, EntityFieldDefaults>;

// =============================================================================
// Inline cascade primitives (mirror of @athyper/cascade)
// =============================================================================

export function computeInheritance<T>(
  child:  T | null | undefined,
  parent: T | null | undefined,
): InheritanceLabel {
  if (child == null && parent == null) return "unset";
  if (child == null)                   return "inherited_null";
  if (child === parent)                return "inherited_match";
  return "overridden";
}

export function projectInheritance(
  row:         Record<string, unknown>,
  parent:      Record<string, unknown>,
  defaultsMap: DefaultsMap,
): InheritanceMap {
  const result: InheritanceMap = {};
  for (const [field, defaults] of Object.entries(defaultsMap)) {
    const detect = defaults.override_detection;
    if (!detect) continue;
    const compareTo  = detect.compare_to;
    const parentKey  = compareTo.startsWith("parent.") ? compareTo.slice("parent.".length) : compareTo;
    const childVal   = row[field] ?? null;
    const parentVal  = parent[parentKey] ?? null;
    result[field] = computeInheritance(childVal, parentVal);
  }
  return result;
}

// =============================================================================
// loadEntityDefaultsMap
// =============================================================================

interface DefaultsRow {
  name:     string;
  defaults: EntityFieldDefaults | null;
}

/**
 * Reads `control.entity_field.defaults` for every active field of the named
 * entity (latest entity_version). Returns a nameâ†’defaults map ready to feed
 * into `projectInheritance`.
 *
 * Tenant-aware: returns canonical (tenant_id IS NULL) rules. Tenant-custom
 * cascade rules are a future extension.
 */
export async function loadEntityDefaultsMap(
  db:        AnyDb,
  entityCode: string,
): Promise<DefaultsMap> {
  const result = await sql<DefaultsRow>`
    SELECT ef.name,
           ef.defaults
      FROM control.entity_field ef
      JOIN control.entity_version ev ON ev.id = ef.entity_version_id
      JOIN control.entity e          ON e.id  = ev.entity_id
     WHERE e.table_name   = ${entityCode}
       AND e.tenant_id    IS NULL
       AND ef.defaults    IS NOT NULL
       AND ef.is_active   = true
     ORDER BY ev.version_no DESC, ef.name
  `.execute(db);

  const map: DefaultsMap = {};
  for (const row of result.rows) {
    if (row.defaults && !map[row.name]) {
      map[row.name] = row.defaults;
    }
  }
  return map;
}

// =============================================================================
// Projection helpers
// =============================================================================

export function projectChildRowsAgainstParent<C extends Record<string, unknown>>(
  childRows:    readonly C[],
  parentRow:    Record<string, unknown>,
  defaultsMap:  DefaultsMap,
): Array<C & { _inheritance: InheritanceMap }> {
  return childRows.map((child) => ({
    ...child,
    _inheritance: projectInheritance(child, parentRow, defaultsMap),
  }));
}

/**
 * Higher-level convenience: given a tenant + parent purchase_invoice + its
 * lines, returns the lines with `_inheritance` attached.
 */
export async function computeInvoiceLineInheritance<
  L extends Record<string, unknown>,
>(
  db:            AnyDb,
  _tenantId:     string,
  parentInvoice: Record<string, unknown>,
  lines:         readonly L[],
): Promise<Array<L & { _inheritance: InheritanceMap }>> {
  const defaultsMap = await loadEntityDefaultsMap(db, "purchase_invoice_line");
  return projectChildRowsAgainstParent(lines, parentInvoice, defaultsMap);
}

/**
 * Pricing Component cascade projection. PC inherits from its source PIL
 * (when source_line_id is set). For header-scope PC rows, _inheritance is empty.
 */
export async function computePcInheritance<
  P extends Record<string, unknown>,
>(
  db:        AnyDb,
  _tenantId: string,
  parentPil: Record<string, unknown> | null,
  pcRows:    readonly P[],
): Promise<Array<P & { _inheritance: InheritanceMap }>> {
  const defaultsMap = await loadEntityDefaultsMap(db, "pricing_component");
  if (!parentPil) {
    return pcRows.map((pc) => ({ ...pc, _inheritance: {} }));
  }
  return projectChildRowsAgainstParent(pcRows, parentPil, defaultsMap);
}
