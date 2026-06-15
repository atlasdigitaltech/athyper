"use client";

import { useMemo } from "react";
import { WorkPanel } from "@athyper/surface-kit";
import {
  buildMetaEntityFieldGroups,
  evaluateMetaEntityFieldVisibility,
  formatFieldTitle,
  formatFieldValue,
} from "@athyper/runtime-shared/meta-entity";
import { useEditSessionContext } from "@athyper/content-ui";
import type { RuntimeRecordRow } from "@athyper/runtime-shared/core";
import { RuntimeFieldValueView } from "../fields/runtime-field-value-view";
import { RuntimeFieldRow } from "../edit/runtime-field-set";
import {
  buildInitialValues,
  type FormValues,
  type FormPrimitive,
} from "../edit/runtime-edit-form";
import type { RuntimeSurfaceRendererProps } from "./types";

const COLUMNS_CLASS: Record<1 | 2 | 3, string> = {
  1: "grid gap-3",
  2: "grid gap-3 md:grid-cols-2",
  3: "grid gap-3 md:grid-cols-2 lg:grid-cols-3",
};

export function FieldsSurfaceRenderer({
  contract,
  record,
  recordId,
  detailState,
  flags,
  editMode,
}: RuntimeSurfaceRendererProps) {
  // Editor branch wins when both the parent shell asks for edit mode AND a
  // document edit session is active. Without a session there is nothing to
  // wire `onChange` against, so we fall back to read-only — defensive against
  // misuse by non-document shells that haven't mounted EditSessionProvider.
  const session = useEditSessionContext();
  const isEditing = Boolean(editMode && session?.isEditing);

  if (detailState?.status === "unavailable") {
    return (
      <FieldsUnavailableState
        message={detailState.message ?? "This record could not be loaded in the active organization scope."}
      />
    );
  }

  if (isEditing && session) {
    return (
      <FieldsEditView
        contract={contract}
        record={record}
        recordId={recordId}
        session={session}
      />
    );
  }

  return (
    <FieldsReadView
      contract={contract}
      record={record}
      recordId={recordId}
      useSharedRenderers={flags?.sharedFieldRenderers ?? false}
    />
  );
}

// ── Read view (unchanged behavior) ──────────────────────────────────────────

function FieldsReadView({
  contract,
  record,
  recordId,
  useSharedRenderers,
}: {
  contract: RuntimeSurfaceRendererProps["contract"];
  record: RuntimeSurfaceRendererProps["record"];
  recordId: string;
  useSharedRenderers: boolean;
}) {
  const fieldGroups = useMemo(
    () => buildMetaEntityFieldGroups(contract, "detail"),
    [contract],
  );

  const recordData = record ?? {};

  if (fieldGroups.length === 0) {
    return (
      <FieldsUnavailableState message="No fields are configured for detail view." />
    );
  }

  return (
    <div id={`record-${recordId}-fields`} className="flex flex-col gap-2.5">
      {fieldGroups.map((group) => {
        const visibleFields = group.fields.filter((field) => {
          const result = evaluateMetaEntityFieldVisibility(field, {
            surface: "detail",
            values: recordData,
            record: recordData,
          });
          return result.visible;
        });

        if (visibleFields.length === 0) return null;

        return (
          <WorkPanel key={group.key} title={group.label}>
            <dl className={COLUMNS_CLASS[group.columns]}>
              {visibleFields.map((field) => {
                const title = formatFieldTitle(recordData, field);

                return (
                  <div key={field.key} className="py-1">
                    <dt className="text-sm font-medium text-muted-foreground">
                      {field.label}
                    </dt>
                    <dd
                      title={title}
                      className="mt-0.5 truncate text-sm font-medium text-foreground"
                    >
                      {useSharedRenderers ? (
                        <RuntimeFieldValueView
                          field={field}
                          record={recordData}
                          sourceEntityCode={contract.entityCode}
                        />
                      ) : (
                        formatFieldValue(recordData, field)
                      )}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </WorkPanel>
        );
      })}
    </div>
  );
}

// ── Edit view (document edit-session backbone) ──────────────────────────────

function FieldsEditView({
  contract,
  record,
  recordId,
  session,
}: {
  contract: RuntimeSurfaceRendererProps["contract"];
  record: RuntimeSurfaceRendererProps["record"];
  recordId: string;
  session: NonNullable<ReturnType<typeof useEditSessionContext>>;
}) {
  // Use the "edit" field-group projection so visibility / ordering / column
  // layout match what the master edit form uses for the same entity.
  const fieldGroups = useMemo(
    () => buildMetaEntityFieldGroups(contract, "edit"),
    [contract],
  );

  const allFields = useMemo(
    () => fieldGroups.flatMap((g) => g.fields),
    [fieldGroups],
  );

  // Baseline = current saved values projected to FormPrimitive (string|bool).
  // pendingHeaderPatch already carries FormPrimitive values written by
  // RuntimeEditInput's onChange, so a shallow merge is sufficient.
  const baselineValues = useMemo<FormValues>(
    () => buildInitialValues(allFields, record as RuntimeRecordRow | undefined),
    [allFields, record],
  );
  const formValues = useMemo<FormValues>(() => {
    const merged: FormValues = { ...baselineValues };
    for (const [name, value] of Object.entries(session.pendingHeaderPatch)) {
      if (typeof value === "string" || typeof value === "boolean") {
        merged[name] = value;
      } else if (value === null || value === undefined) {
        merged[name] = "";
      } else {
        merged[name] = String(value);
      }
    }
    return merged;
  }, [baselineValues, session.pendingHeaderPatch]);

  const recordData = record ?? {};
  const isSaving = session.saveStatus === "saving";

  if (fieldGroups.length === 0) {
    return (
      <FieldsUnavailableState message="No fields are configured for edit." />
    );
  }

  return (
    <div id={`record-${recordId}-fields`} className="flex flex-col gap-2.5">
      {fieldGroups.map((group) => {
        const visibleFields = group.fields.filter((field) => {
          const result = evaluateMetaEntityFieldVisibility(field, {
            surface: "edit",
            values: formValues as Record<string, unknown>,
            record: recordData,
          });
          return result.visible;
        });

        if (visibleFields.length === 0) return null;

        return (
          <WorkPanel key={group.key} title={group.label}>
            <div className={COLUMNS_CLASS[group.columns]}>
              {visibleFields.map((field) => {
                // Per-field editability — descriptor flags first, then the
                // server-truthed FieldMask. Mask explicitly false wins; a
                // missing mask entry defaults to `editable: true`.
                const descriptorEditable =
                  !field.isReadOnly && !field.isComputed && !field.isWriteOnce;
                const maskEntry = session.getFieldMask(field.name);
                const fieldEditable = descriptorEditable && maskEntry.editable !== false;
                const error = session.fieldErrors[field.name];

                if (!fieldEditable) {
                  return (
                    <FieldReadCell
                      key={field.key}
                      label={field.label}
                      value={formatFieldValue(recordData, field)}
                      reason={maskEntry.editable === false ? maskEntry.reason : undefined}
                    />
                  );
                }

                return (
                  <RuntimeFieldRow
                    key={field.key}
                    field={field}
                    formValues={formValues}
                    disabled={isSaving}
                    error={error}
                    contract={contract}
                    recordId={recordId}
                    onFieldChange={(name, value: FormPrimitive) => {
                      session.setHeaderField(name, value);
                    }}
                  />
                );
              })}
            </div>
          </WorkPanel>
        );
      })}
    </div>
  );
}

function FieldReadCell({
  label,
  value,
  reason,
}: {
  label: string;
  value: string;
  reason?: string;
}) {
  return (
    <div className="grid gap-1 text-sm">
      <span className="font-medium text-muted-foreground">{label}</span>
      <span className="truncate text-sm font-medium text-foreground" title={reason}>
        {value || "—"}
      </span>
      {reason ? (
        <span className="text-xs text-muted-foreground/80">{reason}</span>
      ) : null}
    </div>
  );
}

function FieldsUnavailableState({ message }: { message: string }) {
  return (
    <div className="flex min-h-40 items-center justify-center rounded-md border bg-background p-6 text-center">
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
