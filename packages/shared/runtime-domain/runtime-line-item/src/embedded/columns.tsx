/**
 * @athyper/runtime-line-item — embedded column builder
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
import type { ReactElement, ReactNode } from "react";
import type { ColumnDef } from "@athyper/ui/data";
import type { CompiledEntity, EntityField } from "@athyper/api-contracts/metadata";
import { resolveListConfig } from "@athyper/metadata-client/compiled-reader";
import { formatFieldValue, isQuantityLikeFieldName } from "../meta";
import { QuantityUomValue } from "../components/quantity-uom-value";
import {
  ClipboardList,
  FileText,
  Package,
  ShoppingCart,
  Tags,
  Wrench,
  type LucideIcon,
} from "lucide-react";

export interface BuildEmbeddedColumnsOptions {
  currencyCode?: string;
  rowExpansionToggle?: (row: Record<string, unknown>) => ReactNode;
  quantityDisplay?: "pill" | "inline";
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
  const {
    currencyCode,
    visibleKeys,
    disableSort,
    rowExpansionToggle,
    quantityDisplay = "pill",
  } = options;

  if (visibleKeys && visibleKeys.length > 0) {
    const byName = new Map(entity.fields.map((f) => [f.name, f]));
    return visibleKeys
      .map((name) => byName.get(name))
      .filter((f): f is EntityField => f !== undefined && !isFieldHidden(f))
      .map((field) => buildColumn(field, currencyCode, disableSort, rowExpansionToggle, quantityDisplay));
  }

  return omitPairedUomColumns(resolveListConfig(entity).columns)
    .map((field) => buildColumn(field, currencyCode, disableSort, rowExpansionToggle, quantityDisplay));
}

function isFieldHidden(field: EntityField): boolean {
  return Boolean((field.visibility as Record<string, unknown> | null | undefined)?.["hidden"]);
}

const PROCUREMENT_TYPE_ICON_BY_VALUE: Record<string, LucideIcon> = {
  goods: Package,
  services: Wrench,
};
const LINE_TYPE_ICON_BY_VALUE: Record<string, LucideIcon> = {
  contract: FileText,
  catalog: Tags,
  marketplace: ShoppingCart,
  noncatalog: ClipboardList,
};

function valueToIcon(
  fieldName: string,
  rawValue: unknown,
  iconClassName = "size-4",
  strokeWidth = 2,
): ReactElement | null {
  if (rawValue == null) return null;
  const key = String(rawValue).toLowerCase();
  const Icon = fieldName === "procurement_type"
    ? PROCUREMENT_TYPE_ICON_BY_VALUE[key]
    : fieldName === "line_type"
      ? LINE_TYPE_ICON_BY_VALUE[key]
      : null;
  if (!Icon) return null;
  return <Icon aria-hidden className={cn("leading-none", iconClassName)} strokeWidth={strokeWidth} />;
}

const CLASSIFICATION_FIELD_NAMES = new Set(["procurement_type", "line_type"]);
const LINE_NUMBER_FIELD_NAMES = new Set(["line_no", "line_number", "line_num"]);
const PRIMARY_QUANTITY_FIELD_NAMES = new Set(["quantity", "qty"]);
const LONG_TEXT_FIELD_HINTS = ["description", "notes", "remarks", "comment"];
const LONG_TEXT_TOOLTIP_LIMIT = 500;
const UOM_FIELD_NAMES = [
  "unit_code",
  "uom_code",
  "uom",
  "unit_of_measure",
  "unitCode",
  "uomCode",
  "unitOfMeasure",
];
const UOM_FIELD_NAME_SET = new Set(UOM_FIELD_NAMES.map((name) => name.toLowerCase()));

function omitPairedUomColumns(fields: EntityField[]): EntityField[] {
  if (!fields.some((field) => isQuantityLikeFieldName(field.name))) return fields;
  return fields.filter((field) => !UOM_FIELD_NAME_SET.has(field.name.toLowerCase()));
}

function classificationTitle(fieldName: string, rawValue: unknown): string {
  const label = fieldName === "line_type" ? "Line type" : "Procurement type";
  return `${label}: ${String(rawValue)}`;
}

function lineClassificationIcons(rowData: Record<string, unknown>) {
  const chips = [
    { fieldName: "line_type", value: rowData["line_type"] },
    { fieldName: "procurement_type", value: rowData["procurement_type"] },
  ].map(({ fieldName, value }) => {
    const icon = valueToIcon(fieldName, value, "size-2.5", 1.5);
    if (!icon || value == null || value === "") return null;
    const title = classificationTitle(fieldName, value);
    return (
      <span
        key={fieldName}
        aria-label={title}
        title={title}
        className="inline-flex h-4 w-4 items-center justify-center rounded border border-border/40 bg-background leading-none shadow-sm"
      >
        <span aria-hidden>{icon}</span>
      </span>
    );
  }).filter(Boolean);

  if (chips.length === 0) return null;
  return <span className="ml-1 inline-flex items-center gap-px">{chips}</span>;
}

function hasValue(value: unknown): boolean {
  return value !== null && value !== undefined && value !== "";
}

function valueLabel(value: unknown): string {
  if (!hasValue(value)) return "";
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const label = obj["label"] ?? obj["name"] ?? obj["code"] ?? obj["value"];
    return hasValue(label) ? String(label) : "";
  }
  return String(value);
}

function isReferenceField(field: EntityField): boolean {
  return field.ui_type === "reference" && Boolean(field.reference_config);
}

/** Companion values are supplied by the server-side reference resolver. */
function referenceDisplayValue(
  rowData: Record<string, unknown>,
  field: EntityField,
): string | null {
  if (!isReferenceField(field)) return null;

  // Both aliases are part of the resolver response contract. The base alias
  // preserves existing snapshotted labels while the full alias is freshly
  // resolved from the target declared by reference_config.
  const label = valueLabel(rowData[`${field.name}_label`]);
  if (!label) return "-"; // Never leak an unresolved technical key to the UI.

  const code = valueLabel(rowData[`${field.name}_code`]);
  const config = field.reference_config as Record<string, unknown>;
  const picker = config["picker"] as Record<string, unknown> | undefined;
  const showCode = picker?.["show_code"] === true;
  return showCode && code && code !== label ? `${label} (${code})` : label;
}

function pickUomValue(rowData: Record<string, unknown>): string {
  for (const name of UOM_FIELD_NAMES) {
    const label = valueLabel(rowData[name]);
    if (label) return label;
  }
  return "";
}

function columnHeader(field: EntityField): string {
  return columnHeaderWithCurrency(field);
}

function isMoneyLikeField(field: EntityField): boolean {
  return field.data_type === "money" || field.ui_type === "money" || Boolean(field.money_config);
}

function fieldHidesCurrency(field: EntityField): boolean {
  const cfg = field.money_config as Record<string, unknown> | null | undefined;
  const position = cfg?.["currency_code_position"] ?? cfg?.["currency_position"] ?? cfg?.["code_position"];
  const display = cfg?.["currency_display"] ?? cfg?.["currencyDisplay"];
  return position === "hidden" || position === "none" || display === "none";
}

function columnHeaderWithCurrency(field: EntityField, currencyCode?: string): string {
  if (field.name === "line_type") return "Source";
  if (field.name === "procurement_type") return "Type";
  if (PRIMARY_QUANTITY_FIELD_NAMES.has(field.name.toLowerCase())) return "Qty";
  if (isQuantityLikeFieldName(field.name)) {
    const label = field.label ?? field.name;
    return label.replace(/\bQuantity\b/g, "Qty").replace(/\bquantity\b/g, "qty");
  }
  const label = field.label ?? field.name;
  return currencyCode && isMoneyLikeField(field) && fieldHidesCurrency(field)
    ? `${label} (${currencyCode})`
    : label;
}

function isLongTextField(field: EntityField): boolean {
  const name = field.name.toLowerCase();
  return field.data_type === "text" || LONG_TEXT_FIELD_HINTS.some((hint) => name.includes(hint));
}

function compactTooltipText(value: string): string | undefined {
  if (!value || value === "-") return undefined;
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return undefined;
  return normalized.length > LONG_TEXT_TOOLTIP_LIMIT
    ? `${normalized.slice(0, LONG_TEXT_TOOLTIP_LIMIT - 1)}...`
    : normalized;
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
    .filter((f) => {
      if (isFieldHidden(f)) return false;
      const isProjection = Boolean((f.ui_hint as Record<string, unknown> | null | undefined)?.["projection_source"]);
      return !f.is_pii && (f.origin !== "system" || isProjection) && (!f.is_computed || isProjection);
    })
    .sort((a, b) => a.sort_order - b.sort_order);
}

function buildColumn(
  field: EntityField,
  currencyCode: string | undefined,
  disableSort: boolean | undefined,
  rowExpansionToggle: ((row: Record<string, unknown>) => ReactNode) | undefined,
  quantityDisplay: "pill" | "inline",
): ColumnDef<Record<string, unknown>> {
  const isNumeric = ["money", "decimal", "integer", "numeric", "bigint"].includes(field.data_type);
  const isClassification = CLASSIFICATION_FIELD_NAMES.has(field.name);
  const isLineNumber = LINE_NUMBER_FIELD_NAMES.has(field.name);
  const isQuantity = isQuantityLikeFieldName(field.name);
  const isLongText = isLongTextField(field);
  const lowerName = field.name.toLowerCase();
  const isStatus = field.ui_type === "status";
  const isItemIdentity = lowerName === "item" || lowerName === "item_id" || lowerName === "item_code" || lowerName === "item_name";
  const align = isClassification ? "center" : isNumeric ? "right" : undefined;
  const size = isClassification ? 64
    : isLineNumber ? 96
    : isQuantity ? 116
    : isNumeric ? 112
    : isStatus ? 112
    : isItemIdentity ? 160
    : isLongText ? 520
    : undefined;
  const meta = {
    ...(align ? { align } : {}),
    ...(isLongText ? { width: "auto", minWidth: 360 } : {}),
    ...(!isLongText && size ? { width: size } : {}),
  };
  return {
    accessorKey: field.name,
    header: columnHeaderWithCurrency(field, currencyCode),
    enableSorting: disableSort ? false : field.is_sortable,
    ...(size ? { size } : {}),
    // `meta.align` is read by DataTable to align both `<th>` (label + sort
    // arrow) and `<td>` content. Inline `text-right` on a span doesn't work
    // because the span shrink-wraps inside an inline-level cell.
    meta,
    cell: ({ getValue, row }) => {
      const rawValue = getValue();
      const formatted = referenceDisplayValue(row.original, field)
        ?? formatFieldValue(rawValue, field, currencyCode);
      const icon = valueToIcon(field.name, rawValue);
      if (isQuantity) {
        const uom = hasValue(rawValue) ? pickUomValue(row.original) : "";
        return (
          <QuantityUomValue
            quantity={formatted}
            uom={uom}
            title={uom ? `${formatted} ${uom}` : formatted}
            variant={quantityDisplay}
          />
        );
      }
      if (isClassification && icon) {
        const title = classificationTitle(field.name, rawValue);
        return (
          <span
            aria-label={title}
            title={title}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border/60 bg-background text-[0.95rem] leading-none shadow-sm"
          >
            <span aria-hidden>{icon}</span>
          </span>
        );
      }
      if (isLongText) {
        const title = compactTooltipText(formatted);
        return (
          <span className="block max-w-[min(52rem,55vw)]">
            <span
              title={title}
              className={cn(
                "block overflow-hidden whitespace-normal break-words text-sm leading-5",
                formatted === "-" && "text-muted-foreground/40",
              )}
              style={{
                display: "-webkit-box",
                WebkitBoxOrient: "vertical",
                WebkitLineClamp: 2,
                maxHeight: "2.5rem",
              }}
            >
              {formatted}
            </span>
          </span>
        );
      }
      return (
        <span
          className={cn(
            isNumeric && "tabular-nums",
            formatted === "-" && "text-muted-foreground/40",
          )}
        >
          {isLineNumber ? (
            <span className="inline-flex items-center justify-end">
              {rowExpansionToggle ? (
                <span className="mr-1 inline-flex shrink-0 items-center">
                  {rowExpansionToggle(row.original)}
                </span>
              ) : null}
              <span>{formatted}</span>
              {lineClassificationIcons(row.original)}
            </span>
          ) : icon ? (
            <span className="inline-flex items-center gap-1">
              <span aria-hidden className="text-[0.95rem] leading-none">{icon}</span>
              <span>{formatted}</span>
            </span>
          ) : (
            formatted
          )}
        </span>
      );
    },
  };
}
