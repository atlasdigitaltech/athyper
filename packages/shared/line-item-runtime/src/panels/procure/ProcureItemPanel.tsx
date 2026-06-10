"use client";

import { useMemo } from "react";
import { cn } from "@athyper/theme/utils";
import { fieldsForGroups } from "../../variants/procure";
import { fieldLabel, fieldOptions, isEditableLineField, isUomLikeField } from "../../meta";
import { MetaFieldInput } from "../../components/MetaFieldInput";
import type { LineItemPanelProps } from "../../types";
import type { EntityField } from "@athyper/api-contracts/metadata";

// ─────────────────────────────────────────────────────────────────────────────
// TYPE PILLS — enum/lifecycle fields rendered as a segmented selector
// ─────────────────────────────────────────────────────────────────────────────

function TypePills({
  field,
  value,
  onChange,
  disabled,
}: {
  field:     EntityField;
  value:     unknown;
  onChange:  (v: unknown) => void;
  disabled?: boolean;
}) {
  const opts = fieldOptions(field);
  if (opts.length === 0) return null;
  return (
    <div className="flex w-full overflow-hidden rounded-lg border border-input bg-background p-0.5">
      {opts.map((opt) => {
        const active = String(value ?? "") === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(active ? null : opt.value)}
            className={cn(
              "min-w-0 flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50",
              active ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// QUANTITY × PRICE ROW
// ─────────────────────────────────────────────────────────────────────────────

const QTY_NAMES    = new Set(["quantity", "qty"]);
const UOM_NAMES    = new Set(["unit_code", "uom_code", "uom", "unit_of_measure"]);
const PRICE_NAMES  = new Set(["unit_price", "price", "rate", "cost", "price_unit"]);

function isQtyPriceField(f: EntityField): boolean {
  return QTY_NAMES.has(f.name) || UOM_NAMES.has(f.name) || PRICE_NAMES.has(f.name) || isUomLikeField(f);
}

// ─────────────────────────────────────────────────────────────────────────────
// FIELD LABEL
// ─────────────────────────────────────────────────────────────────────────────

const LABEL_CLASS = "text-sm font-medium leading-normal text-muted-foreground";

// ─────────────────────────────────────────────────────────────────────────────
// ProcureItemPanel
//
// Procurement-specific item panel. Renders:
//  1. Procurement type selector (enum pill group) when entity has "procurement_type"
//  2. Item/service description fields from "item" + "profile" groups
//  3. Qty × Price row (special compact layout for quantity/uom/price fields)
//  4. Financial fields from "financial" + "pricing" groups (excluding qty/price)
// ─────────────────────────────────────────────────────────────────────────────

export function ProcureItemPanel({
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

  const { typeField, itemFields, qtyPriceFields, otherFinancialFields } = useMemo(() => {
    if (!entity) return { typeField: null, itemFields: [], qtyPriceFields: [], otherFinancialFields: [] };

    const typeFieldFound = entity.fields.find(
      (f) => (f.name === "procurement_type" || f.label?.trim().toLowerCase() === "type") && !f.is_readonly,
    ) ?? null;

    const rawItemFields = fieldsForGroups(entity, ["item", "profile"]).filter(isEditableLineField);
    const financialFields = fieldsForGroups(entity, ["financial", "pricing"]).filter(isEditableLineField);

    const qtyPrice: EntityField[] = [];
    const otherFin: EntityField[] = [];

    for (const f of financialFields) {
      if (isQtyPriceField(f)) qtyPrice.push(f);
      else otherFin.push(f);
    }

    // If no explicit financial group, try to pull qty/price/uom from all entity fields
    if (qtyPrice.length === 0) {
      for (const f of entity.fields) {
        if (!isEditableLineField(f)) continue;
        if (isQtyPriceField(f) && !rawItemFields.some((i) => i.name === f.name)) {
          qtyPrice.push(f);
        }
      }
    }

    const itemNoType = typeFieldFound
      ? rawItemFields.filter((f) => f.name !== typeFieldFound.name)
      : rawItemFields;

    return {
      typeField: typeFieldFound,
      itemFields: itemNoType,
      qtyPriceFields: qtyPrice.slice(0, 4),
      otherFinancialFields: otherFin,
    };
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
      {/* 1. Procurement type selector */}
      {typeField && (
        <div className="px-5 py-4">
          <label className="flex flex-col gap-1.5">
            <span className={LABEL_CLASS}>{fieldLabel(typeField)}</span>
            <TypePills
              field={typeField}
              value={draft[typeField.name]}
              onChange={(v) => onDraftChange({ [typeField.name]: v })}
              disabled={disabled}
            />
          </label>
        </div>
      )}

      {/* 2. Item / service description fields */}
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

      {/* 3. Qty × Price row */}
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

      {/* 4. Other financial fields (discount, charges, etc. in financial group) */}
      {otherFinancialFields.length > 0 && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-5 px-5 py-5">
          {otherFinancialFields.map((field) => (
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
