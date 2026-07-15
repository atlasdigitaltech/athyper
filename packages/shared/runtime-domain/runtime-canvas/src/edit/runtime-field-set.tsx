"use client";

import type { RuntimeFieldGroupModel } from "@athyper/runtime-shared/meta-entity";
import { evaluateMetaEntityFieldVisibility } from "@athyper/runtime-shared/meta-entity";
import type { MetaEntityField, MetaEntityRuntimeDescriptor } from "@athyper/runtime-contracts";
import {
  defaultFormValue,
  fieldInputId,
  RuntimeEditInput,
  type FormValues,
  type RuntimeOptionBatchContext,
  type RuntimeOption,
} from "./runtime-edit-form";

interface RuntimeFieldSetProps {
  group: RuntimeFieldGroupModel;
  formValues: FormValues;
  disabled: boolean;
  fieldErrors: Record<string, string>;
  fieldWarnings?: Record<string, string>;
  contract: MetaEntityRuntimeDescriptor;
  recordId: string;
  record?: Record<string, unknown>;
  surface: "create" | "edit";
  selectedOptionLabels?: Record<string, RuntimeOption | undefined>;
  optionInvalidationEpochs?: Record<string, number | undefined>;
  optionBatchContext?: RuntimeOptionBatchContext;
  onFieldChange: (name: string, value: string | boolean) => void;
}

const COLUMNS_CLASS: Record<1 | 2 | 3, string> = {
  1: "grid gap-3",
  2: "grid gap-3 md:grid-cols-2",
  3: "grid gap-3 md:grid-cols-2 lg:grid-cols-3",
};

export function RuntimeFieldSet({
  group,
  formValues,
  disabled,
  fieldErrors,
  fieldWarnings,
  contract,
  recordId,
  record,
  surface,
  selectedOptionLabels,
  optionInvalidationEpochs,
  optionBatchContext,
  onFieldChange,
}: RuntimeFieldSetProps) {
  const visibleFields = group.fields.filter((field) => {
    const result = evaluateMetaEntityFieldVisibility(field, {
      surface,
      values: formValues as Record<string, unknown>,
      record,
    });
    return result.visible;
  });

  if (visibleFields.length === 0) return null;

  return (
    <div className={COLUMNS_CLASS[group.columns]}>
      {visibleFields.map((field) => (
        <RuntimeFieldRow
          key={field.key}
          field={field}
          formValues={formValues}
          disabled={disabled}
          error={fieldErrors[field.name]}
          warning={fieldWarnings?.[field.name]}
          contract={contract}
          recordId={recordId}
          selectedOptionLabel={selectedOptionLabels?.[field.name]}
          optionInvalidationEpoch={optionInvalidationEpochs?.[field.name] ?? 0}
          optionBatchContext={optionBatchContext}
          onFieldChange={onFieldChange}
        />
      ))}
    </div>
  );
}

interface RuntimeFieldRowProps {
  field: MetaEntityField;
  formValues: FormValues;
  disabled: boolean;
  error?: string;
  warning?: string;
  contract: MetaEntityRuntimeDescriptor;
  recordId: string;
  selectedOptionLabel?: RuntimeOption;
  optionInvalidationEpoch?: number;
  optionBatchContext?: RuntimeOptionBatchContext;
  onFieldChange: (name: string, value: string | boolean) => void;
}

export function RuntimeFieldRow({
  field,
  formValues,
  disabled,
  error,
  warning,
  contract,
  recordId,
  selectedOptionLabel,
  optionInvalidationEpoch = 0,
  optionBatchContext,
  onFieldChange,
}: RuntimeFieldRowProps) {
  const inputId = fieldInputId(field);
  const labelId = `${inputId}-label`;
  const errorId = error ? `${inputId}-error` : undefined;
  const warnId  = !error && warning ? `${inputId}-warn` : undefined;

  return (
    <div className="grid gap-1">
      <span id={labelId} className="text-sm font-medium text-muted-foreground">
        {field.label}
        {field.isRequired ? (
          <span className="ml-0.5 text-sm font-medium text-destructive" aria-hidden="true">*</span>
        ) : null}
      </span>
      <RuntimeEditInput
        field={field}
        inputId={inputId}
        labelId={labelId}
        value={formValues[field.name] ?? defaultFormValue(field)}
        disabled={disabled}
        entitySlug={contract.routeSlug}
        recordId={recordId}
        formValues={formValues}
        selectedOptionLabel={selectedOptionLabel}
        optionInvalidationEpoch={optionInvalidationEpoch}
        optionBatchContext={optionBatchContext}
        onChange={(value) => onFieldChange(field.name, value)}
        ariaDescribedBy={errorId ?? warnId}
      />
      {error ? (
        <p id={errorId} className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : warning ? (
        <p id={warnId} className="text-xs text-muted-foreground" role="status">
          {warning}
        </p>
      ) : null}
    </div>
  );
}
