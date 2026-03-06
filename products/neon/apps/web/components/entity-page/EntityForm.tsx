"use client";

/**
 * EntityForm — Create / Edit Form
 *
 * Renders a section-based form using react-hook-form and FieldMeta.
 * Supports "create" (POST) and "edit" (PATCH) modes.
 */

import { Button, Card, Separator } from "@neon/ui";
import { Loader2, Save, X } from "lucide-react";
import { useCallback, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { FieldRenderer } from "./fields/FieldRenderer";

import type { SectionDescriptor, ViewMode } from "@/lib/entity-page/types";
import type { SessionBootstrap } from "@/lib/session-bootstrap";
import type { FieldMeta } from "@/lib/use-entity-fields";

import {
  groupFieldsIntoSections,
  getFieldEditBehavior,
} from "@/lib/entity-page/section-grouping";
import { isFieldVisible, resolveFieldMeta } from "@/lib/entity-page/resolve-field-meta";
import { useCollectionField } from "@/lib/use-collection-field";
import { CollectionFieldRenderer } from "./fields/renderers";

// ============================================================================
// Types
// ============================================================================

interface EntityFormProps {
  entityName: string;
  /** Required for edit mode */
  entityId?: string;
  viewMode: "create" | "edit";
  sections: SectionDescriptor[];
  fieldMeta: FieldMeta[];
  /** Pre-filled record data for edit mode */
  initialData?: Record<string, unknown>;
  /** Resolved FK display names (columnName → displayName) */
  resolvedRefs?: Map<string, string>;
  /** Entity feature flags for section override resolution */
  featureFlags?: Record<string, unknown> | null;
  /** Called after successful save */
  onSuccess?: (savedRecord: Record<string, unknown>) => void;
  /** Called when user cancels */
  onCancel?: () => void;
}

// System fields that should never appear in the form
const SYSTEM_FIELDS = new Set([
  "id",
  "tenant_id",
  "realm_id",
  "created_at",
  "created_by",
  "updated_at",
  "updated_by",
  "deleted_at",
  "deleted_by",
  "version",
]);

// ============================================================================
// CSRF Helper
// ============================================================================

function getCsrfToken(): string {
  if (typeof window === "undefined") return "";
  const bootstrap = (window as any).__SESSION_BOOTSTRAP__ as
    | SessionBootstrap
    | undefined;
  return bootstrap?.csrfToken ?? "";
}

// ============================================================================
// Component
// ============================================================================

export function EntityForm({
  entityName,
  entityId,
  viewMode,
  sections,
  fieldMeta,
  initialData,
  resolvedRefs,
  featureFlags,
  onSuccess,
  onCancel,
}: EntityFormProps) {
  const [submitting, setSubmitting] = useState(false);

  // Build field metadata map for lookups
  const fieldMetaMap = new Map(fieldMeta.map((f) => [f.columnName, f]));

  // Build default values from initial data or empty
  const defaultValues: Record<string, unknown> = {};
  for (const field of fieldMeta) {
    if (SYSTEM_FIELDS.has(field.columnName)) continue;
    const existing = initialData?.[field.columnName];
    defaultValues[field.columnName] =
      existing ?? (field.dataType === "boolean" ? false : "");
  }

  const form = useForm({ defaultValues });
  const { setValue, getValues, handleSubmit, formState: _formState } = form;

  // Field change handler bridging FieldRenderer to react-hook-form
  const onFieldChange = useCallback(
    (fieldName: string, value: unknown) => {
      setValue(fieldName, value, { shouldDirty: true });
    },
    [setValue],
  );

  // ── Submit ──
  const onSubmit = useCallback(
    async (data: Record<string, unknown>) => {
      setSubmitting(true);
      try {
        const csrfToken = getCsrfToken();
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (csrfToken) headers["x-csrf-token"] = csrfToken;

        // Strip empty strings → null, and remove system fields
        const body: Record<string, unknown> = {};
        for (const [key, val] of Object.entries(data)) {
          if (SYSTEM_FIELDS.has(key)) continue;
          body[key] = val === "" ? null : val;
        }

        let url: string;
        let method: string;

        if (viewMode === "create") {
          url = `/api/data/${encodeURIComponent(entityName)}`;
          method = "POST";
        } else {
          if (!entityId) throw new Error("entityId is required for edit mode");
          url = `/api/data/${encodeURIComponent(entityName)}/${encodeURIComponent(entityId)}`;
          method = "PATCH";
        }

        const res = await fetch(url, {
          method,
          headers,
          credentials: "same-origin",
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const errorBody = (await res.json().catch(() => ({}))) as {
            error?: { message?: string };
          };
          throw new Error(
            errorBody.error?.message ?? `Save failed (${res.status})`,
          );
        }

        const result = (await res.json()) as { data?: Record<string, unknown> };

        toast.success(
          viewMode === "create" ? "Record created" : "Record updated",
        );

        onSuccess?.(result.data ?? body);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Save failed";
        toast.error(message);
      } finally {
        setSubmitting(false);
      }
    },
    [entityName, entityId, viewMode, onSuccess],
  );

  // ── Determine which fields to render per section ──
  // Filter sections to only include editable (non-system) fields that are visible in this context
  const vmForFilter: ViewMode = viewMode === "create" ? "create" : "edit";
  const editableSections = sections
    .map((section) => ({
      ...section,
      fields: section.fields.filter((f) => {
        if (SYSTEM_FIELDS.has(f)) return false;
        const meta = fieldMetaMap.get(f);
        if (meta && !isFieldVisible(meta, vmForFilter)) return false;
        return true;
      }),
    }))
    .filter((section) => section.fields.length > 0);

  // If no sections are defined, auto-generate from field metadata
  let resolvedSections: SectionDescriptor[];
  if (editableSections.length > 0) {
    resolvedSections = editableSections;
  } else {
    const uiFlags = (featureFlags as any)?.ui as
      | Record<string, unknown>
      | undefined;
    resolvedSections = groupFieldsIntoSections(fieldMeta, {
      sectionOverrides: uiFlags?.sectionOverrides as
        | Record<string, string>
        | undefined,
      sectionLabels: uiFlags?.sectionLabels as
        | Record<string, string>
        | undefined,
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Action bar */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          {viewMode === "create" ? "New Record" : "Edit Record"}
        </h2>
        <div className="flex items-center gap-2">
          {onCancel && (
            <Button
              type="button"
              variant="ghost"
              onClick={onCancel}
              disabled={submitting}
            >
              <X className="size-4 mr-1" />
              Cancel
            </Button>
          )}
          <Button type="submit" disabled={submitting}>
            {submitting ? (
              <Loader2 className="size-4 mr-1 animate-spin" />
            ) : (
              <Save className="size-4 mr-1" />
            )}
            {viewMode === "create" ? "Create" : "Save"}
          </Button>
        </div>
      </div>

      <Separator />

      {/* Sections */}
      {resolvedSections.map((section, _idx) => {
        const gridCols = section.columns === 2 ? "grid-cols-2" : "grid-cols-1";

        return (
          <Card key={section.code} className="p-4">
            <h3 className="text-sm font-semibold mb-4">{section.label}</h3>
            <div className={`grid ${gridCols} gap-4`}>
              {section.fields.map((fieldName) => {
                const meta = fieldMetaMap.get(fieldName);
                if (!meta) return null;

                // Collection fields use a dedicated wrapper
                if (meta.childEntityName && meta.childFkField) {
                  return (
                    <FormCollectionFieldWrapper
                      key={fieldName}
                      field={meta}
                      viewMode={viewMode === "create" ? "create" : "edit"}
                      parentEntity={entityName}
                      parentId={entityId}
                    />
                  );
                }

                const currentVal = getValues(fieldName);
                const vmForField: ViewMode =
                  viewMode === "create" ? "create" : "edit";

                // Check read-only behavior with reason
                const editBehavior = getFieldEditBehavior(meta, vmForField);
                const effectiveViewMode = editBehavior.readOnly
                  ? "view"
                  : vmForField;

                return (
                  <FieldRenderer
                    key={fieldName}
                    field={meta}
                    value={currentVal}
                    viewMode={effectiveViewMode}
                    resolvedRef={resolvedRefs?.get(fieldName)}
                    readOnlyReason={
                      editBehavior.readOnly ? editBehavior.reason : undefined
                    }
                    onChange={editBehavior.readOnly ? undefined : onFieldChange}
                  />
                );
              })}
            </div>
          </Card>
        );
      })}

      {/* Bottom submit for long forms */}
      {resolvedSections.length > 2 && (
        <div className="flex justify-end gap-2 pt-2">
          {onCancel && (
            <Button
              type="button"
              variant="ghost"
              onClick={onCancel}
              disabled={submitting}
            >
              Cancel
            </Button>
          )}
          <Button type="submit" disabled={submitting}>
            {submitting ? (
              <Loader2 className="size-4 mr-1 animate-spin" />
            ) : (
              <Save className="size-4 mr-1" />
            )}
            {viewMode === "create" ? "Create" : "Save"}
          </Button>
        </div>
      )}
    </form>
  );
}

// ── Collection field wrapper (manages hook lifecycle within form) ──

function FormCollectionFieldWrapper({
  field,
  viewMode,
  parentEntity,
  parentId,
}: {
  field: FieldMeta;
  viewMode: ViewMode;
  parentEntity: string;
  parentId?: string;
}) {
  const collection = useCollectionField(
    parentEntity,
    parentId,
    field.columnName,
    field.childEntityName!,
  );

  const resolved = resolveFieldMeta(field, viewMode);

  return (
    <CollectionFieldRenderer
      resolved={resolved}
      parentEntity={parentEntity}
      parentId={parentId}
      collection={collection}
      viewMode={viewMode}
    />
  );
}
