"use client";

import { useMemo } from "react";
import { cn } from "@athyper/theme/utils";
import { fieldsForGroups } from "../../variants/procure";
import { fieldLabel, isEditableLineField, isUomLikeField } from "../../meta";
import { MetaFieldInput } from "../../components/meta-field-input";
import type { LineItemPanelProps } from "../../types";
import type { EntityField } from "@athyper/api-contracts/metadata";

// ─────────────────────────────────────────────────────────────────────────────
// SalesItemPanel
//
// Sales-specific item panel. Renders:
//  1. Product/service description fields from "item", "product", "service" groups
//  2. Qty × Price row (quantity, unit_code, unit_price)
//  3. Pricing/financial fields from "financial", "pricing" groups
// ─────────────────────────────────────────────────────────────────────────────

const LABEL_CLASS = "text-sm font-medium leading-normal text-muted-foreground";

const QTY_NAMES   = new Set(["quantity", "qty"]);
const UOM_NAMES   = new Set(["unit_code", "uom_code", "uom", "unit_of_measure"]);
const PRICE_NAMES = new Set(["unit_price", "price", "rate", "sales_price", "list_price"]);

function isQtyPriceField(f: EntityField): boolean {
  return QTY_NAMES.has(f.name) || UOM_NAMES.has(f.name) || PRICE_NAMES.has(f.name) || isUomLikeField(f);
}

export function SalesItemPanel({
  entity,
  draft,
  onDraftChange,
  readOnly,
  saving,
  record,
  companyCodeId,
}: LineItemPanelProps) {
  const disabled = readOnly || saving;

  const formData: Record<string, unknown> = useMemo(
    () => ({ ...(record ?? {}), ...draft, ...(companyCodeId ? { company_code_id: companyCodeId } : {}) }),
    [record, draft, companyCodeId],
  );

  const { itemFields, qtyPriceFields, pricingFields } = useMemo(() => {
    if (!entity) return { itemFields: [], qtyPriceFields: [], pricingFields: [] };

    const rawItem = fieldsForGroups(entity, ["item", "product", "service"]).filter((field) => isEditableLineField(field));
    const rawPricing = fieldsForGroups(entity, ["financial", "pricing"]).filter((field) => isEditableLineField(field));

    const qtyPrice: EntityField[] = [];
    const pricing: EntityField[] = [];

    for (const f of rawPricing) {
      if (isQtyPriceField(f)) qtyPrice.push(f);
      else pricing.push(f);
    }

    // Pull qty/price/uom from item fields if not found in pricing
    if (qtyPrice.length === 0) {
      for (const f of rawItem) {
        if (isQtyPriceField(f)) qtyPrice.push(f);
      }
    }

    const itemOnly = rawItem.filter((f) => !isQtyPriceField(f));

    return { itemFields: itemOnly, qtyPriceFields: qtyPrice.slice(0, 4), pricingFields: pricing };
  }, [entity]);

  if (!entity) {
    return (
      <div className="px-5 py-10 text-center text-sm text-muted-foreground">
        Loading field metadata…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0 divide-y divide-border/40">
      {/* 1. Item/product/service description fields */}
      {itemFields.length > 0 && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-5 px-5 py-5">
          {itemFields.map((field) => (
            <label
              key={field.name}
              className={cn(
                "flex min-w-0 flex-col gap-1.5",
                (field.data_type === "text" || field.name.includes("description") || field.name.includes("notes"))
                  ? "col-span-2"
                  : "col-span-1",
              )}
            >
              <span className={LABEL_CLASS}>
                {fieldLabel(field)}
                {field.is_required && !readOnly && <span className="ml-0.5 text-destructive">*</span>}
              </span>
              <MetaFieldInput
                field={field}
                value={draft[field.name]}
                onChange={(v) => onDraftChange({ [field.name]: v })}
                disabled={disabled}
                formData={formData}
              />
            </label>
          ))}
        </div>
      )}

      {/* 2. Qty × Price compact row */}
      {qtyPriceFields.length > 0 && (
        <div className="px-5 py-4">
          <div className={cn(
            "grid gap-x-3 gap-y-4",
            qtyPriceFields.length === 1 ? "grid-cols-1"
            : qtyPriceFields.length === 2 ? "grid-cols-2"
            : qtyPriceFields.length === 3 ? "grid-cols-3"
            : "grid-cols-4",
          )}>
            {qtyPriceFields.map((field) => (
              <label key={field.name} className="flex min-w-0 flex-col gap-1.5">
                <span className={LABEL_CLASS}>
                  {fieldLabel(field)}
                  {field.is_required && !readOnly && <span className="ml-0.5 text-destructive">*</span>}
                </span>
                <MetaFieldInput
                  field={field}
                  value={draft[field.name]}
                  onChange={(v) => onDraftChange({ [field.name]: v })}
                  disabled={disabled}
                  formData={formData}
                />
              </label>
            ))}
          </div>
        </div>
      )}

      {/* 3. Pricing/financial fields */}
      {pricingFields.length > 0 && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-5 px-5 py-5">
          {pricingFields.map((field) => (
            <label key={field.name} className="flex min-w-0 flex-col gap-1.5">
              <span className={LABEL_CLASS}>{fieldLabel(field)}</span>
              <MetaFieldInput
                field={field}
                value={draft[field.name]}
                onChange={(v) => onDraftChange({ [field.name]: v })}
                disabled={disabled}
                formData={formData}
              />
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
