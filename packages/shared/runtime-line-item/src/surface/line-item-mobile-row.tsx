"use client";

/**
 * Mobile row card for line items — single-glance, row-like (not box-like).
 */

import type { ReactNode } from "react";
import { ChevronRight, ClipboardList, FileText, Package, ShoppingCart, Tags, Wrench, type LucideIcon } from "lucide-react";
import { cn } from "@athyper/platform-theme/utils";
import { Checkbox } from "@athyper/platform-ui/primitives";
import type { CompiledEntity, EntityField } from "@athyper/api-contracts/metadata";
import { formatFieldValue } from "../meta";
import { QuantityUomValue } from "../components/quantity-uom-value";

export interface LineItemMobileRowProps {
  row:           Record<string, unknown>;
  selected:      boolean;
  setSelected:   (checked: boolean) => void;
  openRow:       () => void;
  entity:        CompiledEntity | null;
  currencyCode?: string;
  /**
   * When false, the line-type chips are suppressed even if the row carries them.
   */
  showLineType?: boolean;
  /**
   * Status badges rendered next to line labels (match exception, GR pending,
   * unallocated, etc.). Parent owns badge derivation so the card stays dumb.
   */
  badges?: ReactNode;
}

const TITLE_FIELDS = ["description", "item_description", "line_description", "item_name"];
const ITEM_FIELDS = ["item_code", "item_id", "item"];
const LINE_NO_FIELDS = ["line_number", "line_no"];
const LINE_TYPE_FIELDS = ["line_type", "type"];
const PROCUREMENT_TYPE_FIELDS = ["procurement_type", "procurementType"];

const QTY_FIELDS = ["quantity", "qty", "ordered_qty", "invoiced_qty"];
const UOM_FIELDS = ["unit_code", "uom_code", "uom", "unit_of_measure"];
const UNIT_PRICE_FIELDS = ["unit_price", "rate", "price"];

const GROSS_FIELDS = ["gross_amount", "total_amount", "line_total", "net_amount", "amount"];
const TAX_FIELDS = ["tax_amount", "total_tax"];
const DISCOUNT_FIELDS = ["discount_amount", "total_discount"];

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

function findField(entity: CompiledEntity | null, names: string[]): EntityField | null {
  if (!entity) return null;
  for (const name of names) {
    const field = entity.fields.find((f) => f.name === name);
    if (field) return field;
  }
  return null;
}

function pickValue(row: Record<string, unknown>, names: string[]): unknown {
  for (const name of names) {
    const value = row[name];
    if (value != null && value !== "") return value;
  }
  return undefined;
}

function valueLabel(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const label = obj["label"] ?? obj["name"] ?? obj["code"];
    return label ? String(label) : "";
  }
  return String(value);
}

function nonZero(value: unknown): boolean {
  if (value == null || value === "") return false;
  const n = Number(value);
  return Number.isFinite(n) && Math.abs(n) > 0.001;
}

function formatField(
  row: Record<string, unknown>,
  field: EntityField | null,
  fallbackNames: string[],
  currencyCode: string | undefined,
): string {
  if (field) {
    return formatFieldValue(row[field.name], field, currencyCode);
  }
  const raw = pickValue(row, fallbackNames);
  return valueLabel(raw) || "-";
}

function typeChipValue(
  typeField: "procurement_type" | "line_type",
  value: unknown,
): ReactNode {
  if (value == null || value === "") return null;
  const key = String(value).toLowerCase();
  const Icon = typeField === "procurement_type"
    ? PROCUREMENT_TYPE_ICON_BY_VALUE[key]
    : LINE_TYPE_ICON_BY_VALUE[key];
  return (
    <span className="inline-flex items-center gap-1">
      {Icon ? <Icon aria-hidden className="leading-none size-3.5" /> : null}
      <span>{valueLabel(value)}</span>
    </span>
  );
}

export function LineItemMobileRow({
  row,
  selected,
  setSelected,
  openRow,
  entity,
  currencyCode,
  showLineType = true,
  badges,
}: LineItemMobileRowProps) {
  const qtyField = findField(entity, QTY_FIELDS);
  const unitPriceField = findField(entity, UNIT_PRICE_FIELDS);
  const grossField = findField(entity, GROSS_FIELDS);
  const taxField = findField(entity, TAX_FIELDS);
  const discountField = findField(entity, DISCOUNT_FIELDS);

  const titleValue = pickValue(row, TITLE_FIELDS);
  const itemValue = pickValue(row, ITEM_FIELDS);
  const lineNoValue = pickValue(row, LINE_NO_FIELDS);
  const title =
    valueLabel(titleValue) ||
    valueLabel(itemValue) ||
    (lineNoValue != null ? `Line ${valueLabel(lineNoValue)}` : "Untitled line");

  const lineNoLabel = lineNoValue != null ? `#${valueLabel(lineNoValue)}` : null;
  const procurementTypeValue = showLineType ? pickValue(row, PROCUREMENT_TYPE_FIELDS) : undefined;
  const lineTypeValue = showLineType ? pickValue(row, LINE_TYPE_FIELDS) : undefined;

  const qtyText = formatField(row, qtyField, QTY_FIELDS, currencyCode);
  const uomText = valueLabel(pickValue(row, UOM_FIELDS));
  const unitPriceText = formatField(row, unitPriceField, UNIT_PRICE_FIELDS, currencyCode);

  const hasQty = qtyText && qtyText !== "-";
  const hasPrice = unitPriceText && unitPriceText !== "-";
  const secondaryLine = hasQty || hasPrice;

  const grossText = formatField(row, grossField, GROSS_FIELDS, currencyCode);

  const taxValue = pickValue(row, TAX_FIELDS);
  const discountValue = pickValue(row, DISCOUNT_FIELDS);
  const showTax = nonZero(taxValue) && taxField;
  const showDiscount = nonZero(discountValue) && discountField;

  return (
    <div
      className={cn(
        "flex items-stretch gap-3 px-4 py-3",
        selected && "bg-muted/40",
      )}
    >
      <div
        className="flex shrink-0 items-start pt-0.5"
        onClick={(e) => e.stopPropagation()}
      >
        <Checkbox
          checked={selected}
          onCheckedChange={(value) => setSelected(value === true)}
          aria-label="Select line"
        />
      </div>

      <button
        type="button"
        onClick={openRow}
        className="flex min-w-0 flex-1 items-start gap-3 text-left"
        aria-label={`Open ${title}`}
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
            {lineNoLabel && <span className="font-medium">{lineNoLabel}</span>}
            {procurementTypeValue != null ? (
              <>
                <span aria-hidden>·</span>
                <span>{typeChipValue("procurement_type", procurementTypeValue)}</span>
              </>
            ) : null}
            {lineTypeValue != null ? (
              <>
                <span aria-hidden>·</span>
                <span>{typeChipValue("line_type", lineTypeValue)}</span>
              </>
            ) : null}
            {badges && <span className="flex items-center gap-1">{badges}</span>}
          </div>
          <div className="truncate text-sm font-medium text-foreground">{title}</div>
          {secondaryLine && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              {hasQty ? (
                <QuantityUomValue quantity={qtyText} uom={uomText} variant="inline" />
              ) : null}
              {hasQty && hasPrice ? <span aria-hidden>×</span> : null}
              {hasPrice ? <span>{unitPriceText}</span> : null}
            </div>
          )}
          {(showTax || showDiscount) && (
            <div className="flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
              {showDiscount && discountField && (
                <span>Disc {formatFieldValue(discountValue, discountField, currencyCode)}</span>
              )}
              {showTax && taxField && <span>Tax {formatFieldValue(taxValue, taxField, currencyCode)}</span>}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <span className="text-sm font-semibold tabular-nums text-foreground">{grossText}</span>
          <ChevronRight className="size-4 text-muted-foreground/60" aria-hidden />
        </div>
      </button>
    </div>
  );
}
