"use client";

import { useMemo } from "react";
import { cn } from "@athyper/platform-theme/utils";
import { fieldsForGroups } from "../variants/procure";
import { fieldLabel, isEditableLineField } from "../meta";
import { MetaFieldInput } from "../components/meta-field-input";
import type { LineItemPanelProps } from "../types";
import type { CompiledEntity, EntityField, FieldGroup } from "@athyper/api-contracts/metadata";

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
  /** Render field groups matching these control.field_group.ui_intent values. */
  uiIntents?: string[];
  /** Optional header rendered above the field grid */
  header?: React.ReactNode;
  /** Optional footer rendered below the field grid */
  footer?: React.ReactNode;
}

type MetaFieldSection = {
  key: string;
  label: string;
  columns: 1 | 2 | 3;
  fields: EntityField[];
};

function gridColumns(columns: 1 | 2 | 3): string {
  if (columns === 1) return "grid-cols-1";
  if (columns === 3) return "grid-cols-3";
  return "grid-cols-2";
}

function fieldValue(
  draft: Record<string, unknown>,
  record: Record<string, unknown> | undefined,
  fieldName: string,
): unknown {
  if (Object.prototype.hasOwnProperty.call(draft, fieldName)) return draft[fieldName];
  return record?.[fieldName];
}

function sortedFields(fields: EntityField[]): EntityField[] {
  return [...fields].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
}

function fieldsForGroup(
  entity: CompiledEntity,
  groupKey: string,
  values: Record<string, unknown>,
): EntityField[] {
  return sortedFields(
    entity.fields.filter((field) =>
      field.group_key === groupKey &&
      isEditableLineField(field, "edit", values),
    ),
  );
}

function resolveIntentSections(
  entity: CompiledEntity,
  uiIntents: string[],
  values: Record<string, unknown>,
): MetaFieldSection[] {
  const intents = new Set(uiIntents);
  return [...entity.field_groups]
    .filter((group) => group.ui_intent && intents.has(group.ui_intent))
    .sort((a, b) => a.sort_order - b.sort_order || a.group_key.localeCompare(b.group_key))
    .flatMap((group: FieldGroup): MetaFieldSection[] => {
      const fields = fieldsForGroup(entity, group.group_key, values);
      if (fields.length === 0) return [];
      return [{
        key: group.group_key,
        label: group.label,
        columns: group.columns,
        fields,
      }];
    });
}

function resolveGroupSections(
  entity: CompiledEntity,
  groupKeys: string[],
  values: Record<string, unknown>,
): MetaFieldSection[] {
  const keys = new Set(groupKeys);
  const groupsByKey = new Map(entity.field_groups.map((group) => [group.group_key, group]));
  const groupOrder = new Map(groupKeys.map((key, index) => [key, index]));
  const grouped = new Map<string, EntityField[]>();

  for (const field of fieldsForGroups(entity, groupKeys).filter((item) => isEditableLineField(item, "edit", values))) {
    if (!field.group_key || !keys.has(field.group_key)) continue;
    const list = grouped.get(field.group_key) ?? [];
    list.push(field);
    grouped.set(field.group_key, list);
  }

  return Array.from(grouped.entries())
    .sort(([a], [b]) => {
      const explicitA = groupOrder.get(a);
      const explicitB = groupOrder.get(b);
      if (explicitA !== undefined || explicitB !== undefined) {
        return (explicitA ?? 999) - (explicitB ?? 999);
      }
      const groupA = groupsByKey.get(a);
      const groupB = groupsByKey.get(b);
      return (groupA?.sort_order ?? 999) - (groupB?.sort_order ?? 999);
    })
    .map(([groupKey, fields]) => {
      const group = groupsByKey.get(groupKey);
      return {
        key: groupKey,
        label: group?.label ?? groupKey,
        columns: group?.columns ?? 2,
        fields: sortedFields(fields),
      };
    });
}

function MetaFieldControl({
  field,
  draft,
  onDraftChange,
  disabled,
  readOnly,
  formData,
  record,
}: {
  field: EntityField;
  draft: Record<string, unknown>;
  onDraftChange: (patch: Record<string, unknown>) => void;
  disabled: boolean;
  readOnly?: boolean;
  formData: Record<string, unknown>;
  record?: Record<string, unknown>;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-sm font-semibold leading-normal text-muted-foreground">
        {fieldLabel(field)}
        {field.is_required && !readOnly && (
          <span className="ml-0.5 text-sm font-semibold text-destructive" aria-hidden>*</span>
        )}
      </span>
      <MetaFieldInput
        field={field}
        value={fieldValue(draft, record, field.name)}
        onChange={(v) => onDraftChange({ [field.name]: v })}
        disabled={disabled}
        formData={formData}
      />
    </label>
  );
}

export function MetaFieldPanel({
  entity,
  groupKeys = [],
  uiIntents = [],
  draft,
  onDraftChange,
  readOnly,
  saving,
  record,
  companyCodeId,
  header,
  footer,
}: MetaFieldPanelProps) {
  const formData: Record<string, unknown> = { ...(record ?? {}), ...draft, ...(companyCodeId ? { company_code_id: companyCodeId } : {}) };
  const sections = useMemo(
    () => {
      if (!entity) return [];
      if (uiIntents.length > 0) {
        const intentSections = resolveIntentSections(entity, uiIntents, formData);
        if (intentSections.length > 0) return intentSections;
      }
      return resolveGroupSections(entity, groupKeys, formData);
    },
    [entity, formData, groupKeys, uiIntents],
  );

  if (!entity) {
    return (
      <div className="px-5 py-10 text-center text-sm text-muted-foreground">
        Loading field metadata…
      </div>
    );
  }

  if (sections.length === 0) {
    return (
      <div className="px-5 py-10 text-center text-sm text-muted-foreground">
        No fields configured for this section.
      </div>
    );
  }

  const disabled = Boolean(readOnly || saving);

  return (
    <div className="flex flex-col gap-0 divide-y divide-border/40">
      {header}
      {sections.map((section) => (
        <section key={section.key} className="flex flex-col gap-3 px-5 py-5">
          {sections.length > 1 && (
            <h3 className="text-base font-semibold text-foreground">{section.label}</h3>
          )}
          <div className={cn("grid gap-x-4 gap-y-5", gridColumns(section.columns))}>
            {section.fields.map((field) => (
              <MetaFieldControl
                key={field.name}
                field={field}
                draft={draft}
                onDraftChange={onDraftChange}
                disabled={disabled}
                readOnly={readOnly}
                formData={formData}
                record={record}
              />
            ))}
          </div>
        </section>
      ))}
      {footer}
    </div>
  );
}
