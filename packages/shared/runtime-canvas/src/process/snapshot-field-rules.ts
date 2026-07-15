/**
 * Snapshot field-rule resolver â€” translates raw snapshot column names into
 * descriptor-aware (label, formatted value) pairs across all five sections:
 *
 *   Section       Source descriptor
 *   â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 *   header        Parent entity descriptor                       (Phase 15)
 *   lines         Child entity descriptor for the lines slot     (Phase 15b)
 *   components    Child entity descriptor for the components     (Phase 15b)
 *   distributions Child entity descriptor for the distributions  (Phase 15b)
 *   schedules     Child entity descriptor for the schedules slot (Phase 15b)
 *
 * Consumed by:
 *   - snapshot-detail-drawer.tsx  (KeyValueTable / CollectionTable per tab)
 *   - snapshot-compare-drawer.tsx (every section's ChangedRow/AddRemoveRow)
 *
 * Resolution policy:
 *   - Match by descriptor.fields[].columnName (the on-disk DB column).
 *     `key`/`name` exist too but they're the camelCase identifiers used by
 *     the form runtime â€” snapshots store raw row JSON, so columnName is the
 *     authoritative match.
 *   - On match: prefer field.label for display; format the value using the
 *     formatter resolved from dataType + format hints.
 *   - On miss: fall back to the raw key and the generic JSON scalar
 *     formatter. This keeps unknown columns visible instead of swallowing
 *     them. Also handles the no-descriptor case (e.g. mesh/admin shells
 *     that mount the drawers without prefetching child contracts).
 */

import type {
  MetaEntityField,
  MetaEntityRuntimeDescriptor,
} from "@athyper/runtime-contracts";

export interface ResolvedFieldRule {
  /** Human-friendly label, or the original key when no descriptor match. */
  label:        string;
  /** True when the descriptor matched; used by callers to style the label. */
  resolved:     boolean;
  /** The matching descriptor field, when one was found. */
  field?:       MetaEntityField;
}

/**
 * Build a Map<columnName, field> once per descriptor so successive lookups
 * inside a render pass are O(1).
 */
export function buildFieldIndex(
  contract: MetaEntityRuntimeDescriptor | null | undefined,
): Map<string, MetaEntityField> {
  const map = new Map<string, MetaEntityField>();
  if (!contract) return map;
  for (const field of contract.fields) {
    if (field.columnName) map.set(field.columnName, field);
  }
  return map;
}

export function resolveFieldRule(
  index:      Map<string, MetaEntityField>,
  columnName: string,
): ResolvedFieldRule {
  const field = index.get(columnName);
  if (!field) {
    return { label: columnName, resolved: false };
  }
  return { label: field.label, resolved: true, field };
}

/**
 * Format a JSONB scalar against the resolved field rule.
 *
 * Coverage (in order of precedence):
 *   1. null / undefined         â†’ em-dash
 *   2. dataType=boolean         â†’ Yes / No
 *   3. dataType=date            â†’ locale date (no time)
 *   4. dataType=timestamp|datetime â†’ locale date-time
 *   5. uiType=money / unit=currency â†’ number with grouping + 2 decimals
 *   6. dataType=number|integer|decimal â†’ number with grouping
 *   7. referenceEntity present  â†’ "â†’ {value}" so FK ids are visually flagged
 *                                 (no live lookup; this is a frozen snapshot)
 *   8. fallback                 â†’ generic JSON scalar (matches existing
 *                                 formatJsonScalar behaviour)
 *
 * Reads no other row context; if currency-pair rendering is wanted later it
 * can be added without changing the call sites.
 */
export function formatFieldValue(
  value: unknown,
  rule:  ResolvedFieldRule,
): string {
  if (value === null || value === undefined) return "â€”";

  const field    = rule.field;
  const dataType = field?.dataType?.toLowerCase();
  const uiType   = field?.uiType?.toLowerCase();
  const unit     = field?.unit?.toLowerCase();

  if (dataType === "boolean" || typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (dataType === "date") {
    return formatDate(value);
  }
  if (dataType === "timestamp" || dataType === "datetime" || dataType === "timestamptz") {
    return formatDateTime(value);
  }

  // Currency / money â€” honour grouping + 2 dp.
  if (uiType === "money" || unit === "currency" || dataType === "money") {
    const n = toNumber(value);
    if (n !== null) {
      return n.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    }
  }

  // Plain numeric â€” group separators, no forced decimals.
  if (
    dataType === "number"  ||
    dataType === "integer" ||
    dataType === "decimal" ||
    dataType === "numeric" ||
    typeof value === "number"
  ) {
    const n = toNumber(value);
    if (n !== null) return n.toLocaleString();
  }

  // FK reference â€” surface visually without a lookup. The id stays readable
  // (truncated UUIDs would lose the prefix users use to correlate rows).
  if (field?.referenceEntity && typeof value === "string") {
    return `â†’ ${value}`;
  }

  // Strings render verbatim; arrays/objects collapse to compact JSON.
  if (typeof value === "string") return value;
  const json = JSON.stringify(value);
  return json.length > 200 ? `${json.slice(0, 197)}â€¦` : json;
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Local formatters
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function formatDate(value: unknown): string {
  if (typeof value !== "string") return String(value);
  // YYYY-MM-DD slice keeps SQL date columns from drifting into the user's
  // local tz when toLocaleDateString interprets the bare date as UTC midnight.
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (m) {
    const y  = Number(m[1]);
    const mo = Number(m[2]);
    const d  = Number(m[3]);
    const date = new Date(y, mo - 1, d);
    if (!Number.isNaN(date.getTime())) return date.toLocaleDateString();
  }
  return value;
}

function formatDateTime(value: unknown): string {
  if (typeof value !== "string") return String(value);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Snapshot child-collection taxonomy (Phase 15b)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * The fixed set of snapshot collection slots. Mirrors the JSONB columns on
 * `snapshot.document_snapshot` (lines_json / components_json / etc.) and
 * the SectionDiff.section enum on the compare API.
 */
export type SnapshotChildSlot =
  | "lines"
  | "components"
  | "distributions"
  | "schedules";

/**
 * Per-section descriptor bundle. Keyed by snapshot slot; values are the
 * child entity descriptors that should render that slot. Any slot whose
 * descriptor is unavailable (entity not registered, fetch failed, slot not
 * applicable for this parent) is simply omitted â€” the drawer falls back to
 * raw column names for that section.
 */
export type SnapshotChildContracts = Partial<
  Record<SnapshotChildSlot, MetaEntityRuntimeDescriptor>
>;

/**
 * Walk a descriptor's has_many relations and resolve the child entity_code
 * that owns each snapshot collection slot. Used by server-side prefetchers
 * (page.tsx) to decide which child descriptors to load.
 *
 * Mapping is by `runtimeRole`, which is the canonical taxonomy seeded in
 * control.entity_relation (see 043_control_entity_relation_contract.sql):
 *
 *   runtimeRole='lines'                  â†’ slot.lines
 *   runtimeRole='pricing_components'     â†’ slot.components
 *   runtimeRole='schedules'              â†’ slot.schedules
 *   runtimeRole='accounting_distributions' â†’ slot.distributions
 *
 * Distributions are typically declared on the **line** entity, not the
 * parent. Callers needing the distributions slot pass the resolved line
 * descriptor via `lineContract` so this helper can walk *its* relations
 * for the AD code without the caller having to duplicate this logic.
 */
export function resolveSnapshotChildEntityCodes(
  parent:       MetaEntityRuntimeDescriptor,
  lineContract?: MetaEntityRuntimeDescriptor | null,
): Partial<Record<SnapshotChildSlot, string>> {
  const out: Partial<Record<SnapshotChildSlot, string>> = {};

  for (const rel of parent.relations) {
    if (rel.kind !== "has_many") continue;
    const role = rel.runtimeRole;
    if (role === "lines")                    out.lines         = rel.targetEntity;
    else if (role === "pricing_components")  out.components    = rel.targetEntity;
    else if (role === "schedules")           out.schedules     = rel.targetEntity;
    else if (role === "accounting_distributions") out.distributions = rel.targetEntity;
  }

  // Distributions on the line â€” second hop.
  if (!out.distributions && lineContract) {
    for (const rel of lineContract.relations) {
      if (rel.kind === "has_many" && rel.runtimeRole === "accounting_distributions") {
        out.distributions = rel.targetEntity;
        break;
      }
    }
  }

  return out;
}


