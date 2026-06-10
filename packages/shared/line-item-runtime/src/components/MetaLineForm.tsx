"use client";

import { useMemo } from "react";
import type { CompiledEntity, EntityField } from "@athyper/api-contracts/metadata";
import { cn } from "@athyper/theme/utils";
import {
  editableLineFields,
  fieldLabel,
  formatFieldValue,
  isEditableLineField,
  recordValue,
} from "../meta";
import type { LineRecord } from "../types";
import { MetaFieldInput } from "./MetaFieldInput";

// ─────────────────────────────────────────────────────────────────────────────
// FIELD LABEL CLASS
// ─────────────────────────────────────────────────────────────────────────────

const FIELD_LABEL_CLASS = "text-sm font-medium leading-normal text-muted-foreground";

// ─────────────────────────────────────────────────────────────────────────────
// READ-ONLY FIELD VALUE
// ─────────────────────────────────────────────────────────────────────────────

function ReadonlyFieldValue({
  value,
  field,
  currencyCode,
}: {
  value:       unknown;
  field:       EntityField;
  currencyCode?: string;
}) {
  const text = formatFieldValue(value, field, currencyCode);
  return (
    <span className={cn("text-sm", text === "-" ? "text-muted-foreground/40" : "text-foreground")}>
      {text}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FIELD CELL
// ─────────────────────────────────────────────────────────────────────────────

function FieldCell({
  field,
  draft,
  onDraftChange,
  disabled,
  mode,
  currencyCode,
  formData,
}: {
  field:          EntityField;
  draft:          Record<string, unknown>;
  onDraftChange:  (next: Record<string, unknown>) => void;
  disabled?:      boolean;
  mode?:          "compose" | "view" | "edit";
  currencyCode?:  string;
  formData?:      Record<string, unknown>;
}) {
  const isReadOnly = mode === "view";
  const value = draft[field.name];

  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className={FIELD_LABEL_CLASS}>
        {fieldLabel(field)}
        {!isReadOnly && field.is_required && <span className="ml-0.5 text-destructive">*</span>}
      </span>
      {isReadOnly ? (
        <ReadonlyFieldValue value={value} field={field} currencyCode={currencyCode} />
      ) : (
        <MetaFieldInput
          field={field}
          value={value}
          onChange={(v) => onDraftChange({ ...draft, [field.name]: v })}
          disabled={disabled}
          formData={formData ?? draft}
        />
      )}
    </label>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// META LINE FORM
// ─────────────────────────────────────────────────────────────────────────────

export interface MetaLineFormProps {
  entity:         CompiledEntity;
  draft:          Record<string, unknown>;
  onDraftChange:  (next: Record<string, unknown>) => void;
  disabled?:      boolean;
  mode?:          "compose" | "view" | "edit";
  currencyCode?:  string;
  formData?:      Record<string, unknown>;
  /** Show only these field names (in order). Falls back to all editable fields. */
  fields?:        string[];
}

export function MetaLineForm({
  entity,
  draft,
  onDraftChange,
  disabled,
  mode = "compose",
  currencyCode,
  formData,
  fields: fieldFilter,
}: MetaLineFormProps) {
  const resolvedFields = useMemo<EntityField[]>(() => {
    if (fieldFilter && fieldFilter.length > 0) {
      const byName = new Map(entity.fields.map((f) => [f.name, f]));
      return fieldFilter.flatMap((name) => {
        const f = byName.get(name);
        return f ? [f] : [];
      });
    }
    return editableLineFields(entity);
  }, [entity, fieldFilter]);

  if (resolvedFields.length === 0) {
    return (
      <div className="px-5 py-8 text-sm text-muted-foreground">
        No configurable fields for this line type.
      </div>
    );
  }

  return (
    <div className="grid gap-4 px-5 py-5 sm:grid-cols-2">
      {resolvedFields.map((field) => (
        <FieldCell
          key={field.name}
          field={field}
          draft={draft}
          onDraftChange={onDraftChange}
          disabled={disabled}
          mode={mode}
          currencyCode={currencyCode}
          formData={formData}
        />
      ))}
    </div>
  );
}
