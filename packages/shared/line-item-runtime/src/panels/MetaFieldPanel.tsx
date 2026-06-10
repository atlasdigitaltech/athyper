"use client";

import { useMemo } from "react";
import { cn } from "@athyper/theme/utils";
import { fieldsForGroups } from "../variants/procure";
import { fieldLabel, isEditableLineField } from "../meta";
import { MetaFieldInput } from "../components/MetaFieldInput";
import type { LineItemPanelProps } from "../types";

// ─────────────────────────────────────────────────────────────────────────────
// MetaFieldPanel
//
// The base panel for rendering a set of entity fields determined by groupKeys.
// All "simple" shared panels (Tax, Discount, Charges, Retention) are thin wrappers
// over this component — no hard-coded field names, fully meta-entity driven.
// ─────────────────────────────────────────────────────────────────────────────

export interface MetaFieldPanelProps extends LineItemPanelProps {
  /** Override the groupKeys resolved from the panel definition */
  groupKeys?: string[];
  /** Optional header rendered above the field grid */
  header?: React.ReactNode;
  /** Optional footer rendered below the field grid */
  footer?: React.ReactNode;
}

function getColSpan(dataType: string, fieldName: string): string {
  if (dataType === "text" || dataType === "textarea" || dataType === "json") return "col-span-2";
  if (fieldName.includes("description") || fieldName.includes("notes") || fieldName.includes("remarks")) return "col-span-2";
  return "col-span-1";
}

export function MetaFieldPanel({
  entity,
  groupKeys = [],
  draft,
  onDraftChange,
  readOnly,
  saving,
  record,
  companyCodeId,
  header,
  footer,
}: MetaFieldPanelProps) {
  const fields = useMemo(
    () => (entity ? fieldsForGroups(entity, groupKeys).filter(isEditableLineField) : []),
    [entity, groupKeys],
  );

  if (!entity) {
    return (
      <div className="px-5 py-10 text-center text-sm text-muted-foreground">
        Loading field metadata…
      </div>
    );
  }

  if (fields.length === 0) {
    return (
      <div className="px-5 py-10 text-center text-sm text-muted-foreground">
        No fields configured for this section.
      </div>
    );
  }

  const formData: Record<string, unknown> = { ...(record ?? {}), ...draft, ...(companyCodeId ? { company_code_id: companyCodeId } : {}) };
  const disabled = readOnly || saving;

  return (
    <div className="flex flex-col gap-0">
      {header}
      <div className="grid grid-cols-2 gap-x-4 gap-y-5 px-5 py-5">
        {fields.map((field) => (
          <label key={field.name} className={cn("flex min-w-0 flex-col gap-1.5", getColSpan(field.data_type, field.name))}>
            <span className="text-sm font-medium leading-normal text-muted-foreground">
              {fieldLabel(field)}
              {field.is_required && !readOnly && (
                <span className="ml-0.5 text-destructive" aria-hidden>*</span>
              )}
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
      {footer}
    </div>
  );
}
