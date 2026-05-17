/**
 * @athyper/entity-runtime — EntityForm
 *
 * Metadata-driven form for creating and editing master records.
 * Renders form sections from field_groups, validates via descriptor rules.
 *
 * External submit: pass a ref (EntityFormHandle) and call ref.current.submit()
 * to trigger submission programmatically (e.g. from a header Save button).
 */
"use client";

import { forwardRef, useImperativeHandle, useState, type FormEvent } from "react";
import { useCompiledEntity } from "@athyper/query";
import { resolveFormConfig } from "@athyper/metadata-client/compiled-reader";
import {
  validateMetaFieldRules,
  validationFieldsAffectedByChange,
} from "@athyper/runtime-shared/validation";
import { Card, CardContent, CardHeader, CardTitle, Button, Label, Separator, Skeleton } from "@athyper/ui/primitives";
import { PageFrame } from "@athyper/ui/layout";
import { resolveFieldRenderer, BOOLEAN_UI_TYPES, BOOLEAN_FULL_WIDTH_UI_TYPES } from "../field-renderers";

export interface EntityFormHandle {
  /** Validate and submit the form. Resolves after onSubmit completes. */
  submit(): Promise<void>;
}

export interface EntityFormProps {
  entityCode: string;
  /** Existing data for edit mode. Null = create mode. */
  initialData?: Record<string, unknown> | null;
  /** Called with form data on submit */
  onSubmit: (data: Record<string, unknown>) => void | Promise<void>;
  /** Called on cancel */
  onCancel?: () => void;
  /** Called on every field change — use for dirty tracking */
  onChange?: (data: Record<string, unknown>) => void;
  /** Loading state during submission */
  submitting?: boolean;
  /** Hide the bottom Save/Cancel action row — use when a header drives save/cancel */
  hideActions?: boolean;
  /** Omit the PageFrame wrapper — use inside drawers/panels that provide their own header */
  noFrame?: boolean;
}

export const EntityForm = forwardRef<EntityFormHandle, EntityFormProps>(
  function EntityForm({
    entityCode,
    initialData = null,
    onSubmit,
    onCancel,
    onChange,
    submitting = false,
    hideActions = false,
    noFrame = false,
  }, ref) {
    const { data: entity, isLoading } = useCompiledEntity(entityCode);
    const [formData, setFormData]     = useState<Record<string, unknown>>(initialData ?? {});
    const [errors, setErrors]         = useState<Record<string, string>>({});
    const [submitError, setSubmitError] = useState<string | null>(null);

    useImperativeHandle(ref, () => ({
      async submit() {
        if (!validate()) return;
        setSubmitError(null);
        try {
          await onSubmit(submittableData());
        } catch (err) {
          const msg = err instanceof Error ? err.message : "An unexpected error occurred";
          setSubmitError(msg);
        }
      },
    }));

    if (isLoading || !entity) {
      return noFrame ? (
        <div className="space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-96 w-full" />
        </div>
      ) : (
        <PageFrame>
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-96 w-full" />
        </PageFrame>
      );
    }

    const formConfig = resolveFormConfig(entity);
    const isEdit = initialData !== null;

    // Only send fields that appear in form sections — never leak system columns
    // (is_active, created_at, tenant_id, etc.) that live in initialData but
    // are not user-editable.
    function submittableData(): Record<string, unknown> {
      const editableFields = new Set(
        formConfig.sections.flatMap((s) => s.fields.map((f) => f.name)),
      );
      return Object.fromEntries(
        Object.entries(formData).filter(([key]) => editableFields.has(key)),
      );
    }

    function handleFieldChange(fieldName: string, value: unknown) {
      const next = { ...formData, [fieldName]: value };
      setFormData(next);
      onChange?.(next);
      if (Object.keys(errors).length > 0) {
        setErrors((prev) => {
          const updated = { ...prev };
          for (const affectedField of validationFieldsAffectedByChange(entity?.fields ?? [], fieldName)) {
            delete updated[affectedField];
          }
          return updated;
        });
      }
    }

    function validate(): boolean {
      const newErrors: Record<string, string> = {};
      for (const field of formConfig.requiredFields) {
        const value = formData[field.name];
        if (value === undefined || value === null || value === "") {
          newErrors[field.name] = `${field.label ?? field.name} is required`;
        }
      }
      const metaValidation = validateMetaFieldRules(formConfig.sections.flatMap((section) => section.fields), formData);
      Object.assign(newErrors, metaValidation.fieldErrors);
      setErrors(newErrors);
      return Object.keys(newErrors).length === 0;
    }

    async function handleSubmit(e: FormEvent) {
      e.preventDefault();
      if (!validate()) return;
      setSubmitError(null);
      try {
        await onSubmit(submittableData());
      } catch (err) {
        const msg = err instanceof Error ? err.message : "An unexpected error occurred";
        setSubmitError(msg);
      }
    }

    const formBody = (
      <form onSubmit={handleSubmit} className="space-y-6">
        {formConfig.sections.map((section) => (
          <Card key={section.group.group_key}>
            <CardHeader>
              <CardTitle className="text-base">{section.group.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {section.fields.map((field) => {
                  const Renderer = resolveFieldRenderer(field);
                  const effectiveUiType = field.ui_type ?? field.data_type;
                  const embedsLabel = BOOLEAN_UI_TYPES.has(effectiveUiType);
                  const isFullWidth = BOOLEAN_FULL_WIDTH_UI_TYPES.has(effectiveUiType);
                  return (
                    <div key={field.name} className={isFullWidth ? "space-y-1.5 md:col-span-2" : "space-y-1.5"}>
                      {!embedsLabel && (
                        <Label error={!!errors[field.name]}>
                          {field.label ?? field.name}
                          {field.is_required && <span className="ml-1 text-destructive">*</span>}
                        </Label>
                      )}
                      <Renderer
                        value={formData[field.name]}
                        field={field}
                        mode="edit"
                        formData={formData}
                        onChange={(v) => handleFieldChange(field.name, v)}
                        error={errors[field.name]}
                      />
                      {errors[field.name] && (
                        <p className="text-xs text-destructive">{errors[field.name]}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        ))}

        {submitError && (
          <p className="text-sm text-destructive rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2">
            {submitError}
          </p>
        )}

        {!hideActions && (
          <>
            <Separator />
            <div className="flex justify-end gap-3">
              {onCancel && (
                <Button type="button" variant="outline" onClick={onCancel}>
                  Cancel
                </Button>
              )}
              <Button type="submit" loading={submitting}>
                {isEdit ? "Save Changes" : "Create"}
              </Button>
            </div>
          </>
        )}
      </form>
    );

    if (noFrame) return formBody;

    return (
      <PageFrame
        title={isEdit ? `Edit ${entity.entity_name}` : `New ${entity.entity_name}`}
      >
        {formBody}
      </PageFrame>
    );
  }
);
