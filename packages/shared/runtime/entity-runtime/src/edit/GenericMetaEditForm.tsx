"use client";

/**
 * GenericMetaEditForm — slot-based form renderer for Tier 2 adapters.
 *
 * Renders the adapter's editableFields list using:
 *   1. adapter.fieldRenderers[field.name]  — custom slot (picker, rich text, etc.)
 *   2. field.inputType fallback            — text | textarea | date | number | email
 *
 * The GenericMetaEditPage uses adapter.renderForm instead when the Tier 3
 * escape hatch is present. This component is never rendered in that case.
 */

import { cn } from "@athyper/theme/utils";
import { Card, CardContent, Input, Textarea } from "@athyper/ui/primitives";
import type { EntityField } from "@athyper/api-contracts/metadata";
import { resolveFieldRenderer } from "../field-renderers/registry";
import type { EntityEditableField, FieldRenderer, SectionRenderer } from "./adapter/types";

// ── Generic field fallback ────────────────────────────────────────────────────

function GenericFieldInput({
  field,
  value,
  onChange,
  error,
  disabled,
}: {
  field:    EntityEditableField;
  value:    unknown;
  onChange: (v: unknown) => void;
  error?:   string;
  disabled?: boolean;
}) {
  const strVal = value == null ? "" : String(value);

  if (field.inputType === "textarea") {
    return (
      <Textarea
        id={field.name}
        value={strVal}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder ?? field.label}
        maxLength={field.maxLength}
        disabled={disabled}
        className={cn("resize-none", error && "border-destructive focus-visible:ring-destructive")}
        rows={3}
        aria-describedby={error ? `${field.name}-error` : undefined}
      />
    );
  }

  return (
    <Input
      id={field.name}
      type={field.inputType ?? "text"}
      value={strVal}
      onChange={(e) => onChange(e.target.value)}
      placeholder={field.placeholder ?? field.label}
      maxLength={field.maxLength}
      disabled={disabled}
      className={cn(error && "border-destructive focus-visible:ring-destructive")}
      required={field.required}
      aria-describedby={error ? `${field.name}-error` : undefined}
    />
  );
}

// ── Form field wrapper ────────────────────────────────────────────────────────

function FormField({
  field,
  value,
  onChange,
  error,
  disabled,
  customRenderer,
  metadataField,
  formData,
}: {
  field:           EntityEditableField;
  value:           unknown;
  onChange:        (v: unknown) => void;
  error?:          string;
  disabled?:       boolean;
  customRenderer?: FieldRenderer;
  metadataField?:  EntityField;
  formData?:       Record<string, unknown>;
}) {
  if (metadataField && !customRenderer) {
    const Renderer = resolveFieldRenderer(metadataField);
    return (
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={field.name}
          className="text-sm font-medium leading-none text-foreground"
        >
          {field.label}
          {field.required && <span className="text-destructive ml-0.5">*</span>}
        </label>
        <Renderer
          value={value}
          field={metadataField}
          mode="edit"
          formData={formData}
          onChange={onChange}
          error={error}
          disabled={disabled}
        />
        {field.hint && !error && (
          <p className="text-xs text-muted-foreground">{field.hint}</p>
        )}
        {error && (
          <p id={`${field.name}-error`} className="text-xs text-destructive" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={field.name}
        className="text-sm font-medium leading-none text-foreground"
      >
        {field.label}
        {field.required && <span className="text-destructive ml-0.5">*</span>}
      </label>
      {customRenderer
        ? customRenderer({ field, value, onChange, error, disabled })
        : (
          <GenericFieldInput
            field={field}
            value={value}
            onChange={onChange}
            error={error}
            disabled={disabled}
          />
        )
      }
      {field.hint && !error && (
        <p className="text-xs text-muted-foreground">{field.hint}</p>
      )}
      {error && (
        <p id={`${field.name}-error`} className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface GenericMetaEditFormProps {
  record:         Record<string, unknown>;
  patch:          Record<string, unknown>;
  updateField:    (field: string, value: unknown) => void;
  editableFields: EntityEditableField[];
  fieldRenderers?: Partial<Record<string, FieldRenderer>>;
  sectionRenderers?: Partial<Record<string, SectionRenderer>>;
  fieldErrors:    Record<string, string>;
  globalError:    string | null;
  isSaving:       boolean;
  /** When set, only fields whose name is in this set are editable. */
  editableFieldNames?: Set<string>;
  metadataFields?: EntityField[];
}

// ── Component ─────────────────────────────────────────────────────────────────

export function GenericMetaEditForm({
  record,
  patch,
  updateField,
  editableFields,
  fieldRenderers,
  fieldErrors,
  globalError,
  isSaving,
  editableFieldNames,
  metadataFields,
}: GenericMetaEditFormProps) {
  const visibleFields = editableFields.filter((f) => f.editable !== false);
  const metadataByName = new Map((metadataFields ?? []).map((field) => [field.name, field]));
  const formData = { ...record, ...patch };

  return (
    <div className="flex flex-col gap-5">
      {globalError && (
        <div
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          {globalError}
        </div>
      )}
      <Card>
        <CardContent className="pt-5">
          <div className="grid grid-cols-1 gap-x-6 gap-y-5 md:grid-cols-2">
            {visibleFields.map((field) => {
              const currentValue =
                patch[field.name] !== undefined ? patch[field.name] : record[field.name];
              const isDisabled =
                isSaving ||
                (editableFieldNames !== undefined && !editableFieldNames.has(field.name));

              return (
                <div
                  key={field.name}
                  className={cn(
                    field.inputType === "textarea" && "md:col-span-2",
                  )}
                >
                  <FormField
                    field={field}
                    value={currentValue}
                    onChange={(v) => updateField(field.name, v)}
                    error={fieldErrors[field.name]}
                    disabled={isDisabled}
                    customRenderer={fieldRenderers?.[field.name]}
                    metadataField={metadataByName.get(field.name)}
                    formData={formData}
                  />
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
