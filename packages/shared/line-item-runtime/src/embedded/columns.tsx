/**
 * @athyper/line-item-runtime — embedded column builder
 *
 * Descriptor-driven `ColumnDef[]` builder for the embedded entity list.
 * Used when consumers don't supply `columnsOverride`.
 *
 * Cell rendering uses `formatFieldValue` — a string-level formatter that
 * handles money/decimal/integer/date/etc. consistently. It's intentionally
 * NOT the rich `resolveFieldRenderer` from `@athyper/entity-runtime`:
 * that package is on the legacy ban list, and shared-tier packages can't
 * import it. Consumers that need richer rendering should pass a
 * `columnsOverride` (the line-items grid does exactly this via the
 * variant catalogs + `metaLineColumnsToColumnDefs`).
 */
import { cn } from "@athyper/theme/utils";
import type { ColumnDef } from "@athyper/ui/data";
import type { CompiledEntity, EntityField } from "@athyper/api-contracts/metadata";
import { resolveListConfig } from "@athyper/metadata-client/compiled-reader";
import { formatFieldValue } from "../meta";

export interface BuildEmbeddedColumnsOptions {
  currencyCode?: string;
  /**
   * Explicit list of field names to project, in order. Used by consumers
   * that let users add/remove columns beyond `display_config.list_columns`
   * (e.g., the line items grid's column-visibility popover). When absent,
   * falls back to the descriptor's list_columns via `resolveListConfig`.
   *
   * Unknown names are silently dropped — matches the P0 resolver semantics
   * locked in `resolveListConfig` for `display_config.list_columns`.
   */
  visibleKeys?: string[];
  /**
   * When true, emits every column with `enableSorting: false` regardless
   * of the descriptor's `is_sortable`. Used by embedded grids that have
   * opted into the two-level toolbar pattern (status + affordances on
   * top; clean column headers below) where per-column sort arrows would
   * compete with the toolbar's sort affordance.
   */
  disableSort?: boolean;
}

export function buildEmbeddedColumns(
  entity: CompiledEntity,
  options: BuildEmbeddedColumnsOptions = {},
): ColumnDef<Record<string, unknown>>[] {
  const { currencyCode, visibleKeys, disableSort } = options;

  if (visibleKeys && visibleKeys.length > 0) {
    const byName = new Map(entity.fields.map((f) => [f.name, f]));
    return visibleKeys
      .map((name) => byName.get(name))
      .filter((f): f is EntityField => f !== undefined)
      .map((field) => buildColumn(field, currencyCode, disableSort));
  }

  return resolveListConfig(entity).columns.map((field) => buildColumn(field, currencyCode, disableSort));
}

/**
 * The full pool of fields eligible to appear as columns in the embedded
 * grid:
 *   - exclude system-origin fields (audit columns, tenant_id, etc.)
 *   - exclude computed fields (no stored value to render)
 *   - exclude PII fields (matches runtime-list's `isRuntimeListFieldAllowed`
 *     safety; prevents a user from accidentally surfacing sensitive
 *     descriptor fields into a shared grid view)
 *
 * Sorted by `sort_order` so the picker UI matches the descriptor's
 * intended ordering.
 */
export function selectableColumnFields(entity: CompiledEntity): EntityField[] {
  return [...entity.fields]
    .filter((f) => f.origin !== "system" && !f.is_computed && !f.is_pii)
    .sort((a, b) => a.sort_order - b.sort_order);
}

function buildColumn(
  field: EntityField,
  currencyCode: string | undefined,
  disableSort: boolean | undefined,
): ColumnDef<Record<string, unknown>> {
  const isNumeric = ["money", "decimal", "integer", "numeric", "bigint"].includes(field.data_type);
  return {
    accessorKey: field.name,
    header: field.label ?? field.name,
    enableSorting: disableSort ? false : field.is_sortable,
    cell: ({ getValue }) => {
      const formatted = formatFieldValue(getValue(), field, currencyCode);
      return (
        <span
          className={cn(
            isNumeric && "text-right tabular-nums",
            formatted === "-" && "text-muted-foreground/40",
          )}
        >
          {formatted}
        </span>
      );
    },
  };
}
