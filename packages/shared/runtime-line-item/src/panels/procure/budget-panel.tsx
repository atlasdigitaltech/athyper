"use client";

import { useMemo } from "react";
import { cn } from "@athyper/theme/utils";
import { LABEL_SM } from "@athyper/ui/typography";
import { fieldLabel, formatFieldValue, isEditableLineField } from "../../meta";
import { MetaFieldInput } from "../../components/meta-field-input";
import type { LineItemPanelProps } from "../../types";
import type { EntityField } from "@athyper/api-contracts/metadata";

const EDITABLE_BUDGET_FIELDS = [
  "budget_profile_id",
];

const STATUS_BUDGET_FIELDS = [
  "budget_allocation_id",
  "budget_check_result",
  "encumbrance_je_id",
];

function fieldValue(draft: Record<string, unknown>, record: Record<string, unknown> | undefined, fieldName: string): unknown {
  if (Object.prototype.hasOwnProperty.call(draft, fieldName)) return draft[fieldName];
  return record?.[fieldName];
}

function StatusField({
  field,
  value,
  currencyCode,
}: {
  field: EntityField;
  value: unknown;
  currencyCode?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
      <span className={LABEL_SM}>{fieldLabel(field)}</span>
      <span className="min-h-5 truncate text-sm font-medium text-foreground">
        {value == null || value === "" ? "-" : formatFieldValue(value, field, currencyCode)}
      </span>
    </div>
  );
}

export function BudgetPanel({
  entity,
  draft,
  onDraftChange,
  readOnly,
  saving,
  record,
  companyCodeId,
  currencyCode,
}: LineItemPanelProps) {
  const disabled = readOnly || saving;
  const formData: Record<string, unknown> = useMemo(
    () => ({ ...(record ?? {}), ...draft, ...(companyCodeId ? { company_code_id: companyCodeId } : {}) }),
    [record, draft, companyCodeId],
  );

  const { editableFields, statusFields } = useMemo(() => {
    if (!entity) return { editableFields: [], statusFields: [] };
    const byName = new Map(entity.fields.map((field) => [field.name, field]));

    const editable = EDITABLE_BUDGET_FIELDS.flatMap((name) => {
      const field = byName.get(name);
      return field && isEditableLineField(field) ? [field] : [];
    });

    const status = STATUS_BUDGET_FIELDS.flatMap((name) => {
      const field = byName.get(name);
      return field ? [field] : [];
    });

    return { editableFields: editable, statusFields: status };
  }, [entity]);

  if (!entity) {
    return (
      <div className="px-5 py-10 text-center text-sm text-muted-foreground">
        Loading budget configuration...
      </div>
    );
  }

  if (editableFields.length === 0 && statusFields.length === 0) {
    return (
      <div className="px-5 py-10 text-center text-sm text-muted-foreground">
        Budget is resolved from accounting distributions when budget control is enabled.
      </div>
    );
  }

  return (
    <div className="flex flex-col divide-y divide-border/40">
      {editableFields.length > 0 && (
        <section className="flex flex-col gap-3 px-5 py-5">
          <h3 className="text-sm font-semibold text-foreground">Budget Profile</h3>
          <div className="grid grid-cols-2 gap-x-4 gap-y-5">
            {editableFields.map((field) => (
              <label key={field.name} className="col-span-2 flex min-w-0 flex-col gap-1.5">
                <span className={LABEL_SM}>
                  {fieldLabel(field)}
                  {field.is_required && !disabled && <span className="ml-0.5 text-destructive" aria-hidden>*</span>}
                </span>
                <MetaFieldInput
                  field={field}
                  value={draft[field.name]}
                  onChange={(value) => onDraftChange({ [field.name]: value })}
                  disabled={disabled}
                  formData={formData}
                />
                <span className="text-xs text-muted-foreground">
                  Used to resolve the budget allocation during budget check.
                </span>
              </label>
            ))}
          </div>
        </section>
      )}

      {statusFields.length > 0 && (
        <section className="flex flex-col gap-3 px-5 py-5">
          <h3 className="text-sm font-semibold text-foreground">Budget & Commitment Status</h3>
          <div className={cn("grid gap-3", statusFields.length === 1 ? "grid-cols-1" : "grid-cols-2")}>
            {statusFields.map((field) => (
              <StatusField
                key={field.name}
                field={field}
                value={fieldValue(draft, record, field.name)}
                currencyCode={currencyCode}
              />
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Budget allocation, check result, and encumbrance references are controlled by the budget and posting engines.
          </p>
        </section>
      )}
    </div>
  );
}
