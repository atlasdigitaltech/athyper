"use client";
import type { EntitySurfaceFieldV1 } from "@athyper/contract-platform-entity-runtime";
import { useEntityI18n } from "@athyper/platform-i18n/entity-react";
import { Checkbox, FormField, Input, Label, Select } from "@athyper/platform-ui";

/** One metadata-driven form control. Presentation only; value normalization
 * lives in `form-values` and validation is enforced by the server. */
export function FieldInput({
  field,
  value,
  onChange,
}: {
  readonly field: EntitySurfaceFieldV1;
  readonly value: unknown;
  readonly onChange: (value: unknown) => void;
}) {
  const intl = useEntityI18n();
  if (field.kind === "boolean" && field.required)
    return (
      <Label>
        <Checkbox
          checked={value === true}
          disabled={field.readOnly}
          onChange={(event) => onChange(event.currentTarget.checked)}
        />
        {field.label}
      </Label>
    );
  return (
    <FormField label={field.label} required={field.required}>
      {(control) => {
        if (field.kind === "boolean")
          return (
            <Select
              {...control}
              value={value === true ? "true" : value === false ? "false" : ""}
              disabled={field.readOnly}
              onChange={(event) =>
                onChange(
                  event.currentTarget.value === ""
                    ? null
                    : event.currentTarget.value === "true",
                )
              }
            >
              <option value="">{intl.message("form.useDefault")}</option>
              <option value="true">{intl.message("form.enabled")}</option>
              <option value="false">{intl.message("form.disabled")}</option>
            </Select>
          );
        if (field.options?.length)
          return (
            <Select
              {...control}
              value={String(value ?? "")}
              required={field.required}
              disabled={field.readOnly}
              onChange={(event) => onChange(event.currentTarget.value)}
            >
              <option value="">{intl.message("form.select")}</option>
              {field.options.map((option) => (
                <option value={option.value} key={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          );
        return (
          <Input
            {...control}
            value={String(value ?? "")}
            required={field.required}
            readOnly={field.readOnly}
            {...inputAttributes(field.kind)}
            onChange={(event) => onChange(event.currentTarget.value)}
          />
        );
      }}
    </FormField>
  );
}

/** Renders every field of a form descriptor. */
export function FormFields({
  fields,
  values,
  onChange,
}: {
  readonly fields: readonly EntitySurfaceFieldV1[];
  readonly values: Readonly<Record<string, unknown>>;
  readonly onChange: (key: string, value: unknown) => void;
}) {
  return (
    <>
      {fields.map((field) => (
        <FieldInput
          key={field.key}
          field={field}
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
