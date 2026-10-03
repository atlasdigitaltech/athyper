"use client";
import { ReferenceFieldInput } from "./reference-field-input";
import type { EntitySurfaceFieldV1 } from "@athyper/contract-platform-entity-runtime";
import { useOptionalI18n } from "@athyper/platform-i18n/react";
import { useEntityI18n } from "@athyper/platform-i18n/entity-react";
import { Checkbox, ChoiceSelect, FormField, Input } from "@athyper/platform-ui";

/** One metadata-driven form control. Presentation only; value normalization
 * lives in `form-values` and validation is enforced by the server. */
export function FieldInput({
  field,
  value,
  onChange,
  entityCode,
  values,
  error,
}: {
  readonly error?: string;
  readonly entityCode?: string;
  readonly values?: Readonly<Record<string,unknown>>;
  readonly field: EntitySurfaceFieldV1;
  readonly value: unknown;
  readonly onChange: (value: unknown) => void;
}) {
  const intl = useEntityI18n();
  const localization = useOptionalI18n()?.localization;
  if (field.referenceLookup && entityCode) return <ReferenceFieldInput field={field} entityCode={entityCode} value={value} values={values ?? {}} onChange={onChange} error={error} />;
  if (field.kind === "boolean" && field.required)
    return (
      <FormField label={field.label} required={field.required} error={error} hint={field.helpText}>
        {control => <Checkbox
          {...control}
          checked={value === true}
          disabled={field.readOnly}
          onChange={(event) => onChange(event.currentTarget.checked)}
        />}
      </FormField>
    );
  return (
    <FormField label={field.label} required={field.required} error={error} hint={field.helpText}>
      {(control) => {
        if (field.kind === "boolean")
          return (
            <ChoiceSelect
              {...control}
              value={value === true ? "true" : value === false ? "false" : ""}
              disabled={field.readOnly}
              onChange={(next) => onChange(next === "" ? null : next === "true")}
              options={[
                { value: "", label: intl.message("form.useDefault") },
                { value: "true", label: intl.message("form.enabled") },
                { value: "false", label: intl.message("form.disabled") },
              ]}
            />
          );
        if (field.options?.length)
          return (
            <ChoiceSelect
              {...control}
              value={String(value ?? "")}
              required={field.required}
              disabled={field.readOnly}
              placeholder={intl.message("form.select")}
              // Published options are strings; a numeric field keeps its number type.
              onChange={(next) => onChange(field.kind === "integer" || field.kind === "decimal" ? (next === "" ? null : Number(next)) : next)}
              options={[
                // An optional field can be cleared, as with the native empty option.
                ...(field.required ? [] : [{ value: "", label: intl.message("form.select") }]),
                ...field.options.map((option) => ({ value: option.value, label: option.label })),
              ]}
            />
          );
        return (
          <Input
            {...control}
            value={String(value ?? "")}
            required={field.required}
            readOnly={field.readOnly}
            {...inputAttributes(field.kind)}
            locale={localization?.formatLocale}
            weekStart={localization?.weekStart}
            onChange={(event) => onChange(event.currentTarget.value)}
          />
        );
      }}
    </FormField>
  );
}

/** Renders every field of a form descriptor. */
export function FormFields({
  entityCode,
  fields,
  values,
  onChange,
  errors,
}: {
  readonly errors?: Readonly<Record<string, string>>;
  readonly entityCode?: string;
  readonly fields: readonly EntitySurfaceFieldV1[];
  readonly values: Readonly<Record<string, unknown>>;
  readonly onChange: (key: string, value: unknown) => void;
}) {
  return (
    <>
      {fields.map((field) => (
        <FieldInput
          key={field.key}
          entityCode={entityCode}
          values={values}
          field={field}
          error={errors?.[field.key]}
          value={values[field.key]}
          onChange={(value) => onChange(field.key, value)}
        />
      ))}
    </>
  );
}

/** Field metadata carries no scale, so decimal and money accept any precision
 * and the server remains the authority on rounding and range. */
function inputAttributes(kind: EntitySurfaceFieldV1["kind"]) {
  switch (kind) {
    case "integer":
      return { type: "number", step: 1, inputMode: "numeric" } as const;
    case "decimal":
    case "money":
      return { type: "number", step: "any", inputMode: "decimal" } as const;
    case "date":
      return { type: "date" } as const;
    case "datetime":
      return { type: "datetime-local" } as const;
    default:
      return { type: "text" } as const;
  }
}
