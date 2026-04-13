/**
 * @athyper/entity-runtime — EntityForm
 *
 * Metadata-driven form for creating and editing master records.
 * Renders form sections from field_groups, validates via descriptor rules.
 */
"use client";

import { useState, type FormEvent } from "react";
import { useCompiledEntity } from "@athyper/query";
import { resolveFormConfig } from "@athyper/metadata-client/compiled-reader";
import { Card, CardContent, CardHeader, CardTitle, Button, Label, Separator, Skeleton } from "@athyper/ui/primitives";
import { PageFrame } from "@athyper/ui/layout";
import { resolveFieldRenderer } from "../field-renderers/registry";

export interface EntityFormProps {
  entityCode: string;
  /** Existing data for edit mode. Null = create mode. */
  initialData?: Record<string, unknown> | null;
  /** Called with form data on submit */
  onSubmit: (data: Record<string, unknown>) => void | Promise<void>;
  /** Called on cancel */
  onCancel?: () => void;
  /** Loading state during submission */
  submitting?: boolean;
}

export function EntityForm({
  entityCode,
  initialData = null,
  onSubmit,
  onCancel,
  submitting = false,
}: EntityFormProps) {
  const { data: entity, isLoading } = useCompiledEntity(entityCode);
  const [formData, setFormData] = useState<Record<string, unknown>>(initialData ?? {});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  if (isLoading || !entity) {
    return (
      <PageFrame>
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96 w-full" />
      </PageFrame>
    );
  }

  const formConfig = resolveFormConfig(entity);
  const isEdit = initialData !== null;

  function handleFieldChange(fieldName: string, value: unknown) {
    setFormData((prev) => ({ ...prev, [fieldName]: value }));
    // Clear error on change
    if (errors[fieldName]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[fieldName];
        return next;
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
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setSubmitError(null);
    try {
      await onSubmit(formData);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "An unexpected error occurred";
      setSubmitError(msg);
    }
  }

  return (
    <PageFrame
      title={isEdit ? `Edit ${entity.entity_name}` : `New ${entity.entity_name}`}
    >
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
                  return (
                    <div key={field.name} className="space-y-1.5">
                      <Label error={!!errors[field.name]}>
                        {field.label ?? field.name}
                        {field.is_required && <span className="ml-1 text-destructive">*</span>}
                      </Label>
                      <Renderer
                        value={formData[field.name]}
                        field={field}
                        mode="edit"
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

        <Separator />

        {submitError && (
          <p className="text-sm text-destructive rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2">
            {submitError}
          </p>
        )}

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
      </form>
    </PageFrame>
  );
}
