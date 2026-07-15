"use client";

import { cloneElement, useEffect, useMemo, useRef, useState } from "react";
import { WorkPanel } from "@athyper/surface-kit";
import type { EntityFieldDefaults } from "@athyper/cascade";
import {
  buildMetaEntityFieldGroups,
  evaluateMetaEntityFieldVisibility,
  formatFieldTitle,
  formatFieldValue,
} from "@athyper/runtime-shared/meta-entity";
import { lockReasonMessage, titleCaseStatus } from "@athyper/runtime-shared";
import { applyServerDefaultsResolve, createRefilterCheck } from "@athyper/runtime-shared/resolvers";
import { useEditDraftContext } from "@athyper/content-ui";
import type { RuntimeRecordRow } from "@athyper/runtime-shared/core";
import { RuntimeFieldValueView } from "../fields/runtime-field-value-view";
import { RuntimeFieldRow } from "../edit/runtime-field-set";
import { useFormProvenance } from "../edit/use-form-provenance";
import {
  buildInitialValues,
  readSelectedOptionLabels,
  type FormValues,
  type FormPrimitive,
} from "../edit/runtime-edit-form";
import { useOptionalDocumentEditCoordinator } from "../document-runtime/document-edit-coordinator";
import { hasClientSourceChangeCandidates } from "../edit/source-change-candidates";
import type { RuntimeSurfaceRendererProps } from "./types";

const COLUMNS_CLASS: Record<1 | 2 | 3, string> = {
  1: "grid gap-3",
  2: "grid gap-3 md:grid-cols-2",
  3: "grid gap-3 md:grid-cols-2 lg:grid-cols-3",
};

// Per-field col-span overrides. `colSpan: "full"` makes a field claim every
// column of its group's grid (e.g. take a whole row alone above a 2-col pair).
const COL_SPAN_CLASS: Record<1 | 2 | 3, string> = {
  1: "",
  2: "md:col-span-2",
  3: "md:col-span-2 lg:col-span-3",
};

function fieldColSpanClass(
  field: { colSpan?: "full" },
  groupColumns: 1 | 2 | 3,
): string {
  return field.colSpan === "full" ? COL_SPAN_CLASS[groupColumns] : "";
}

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
  // misuse by non-document shells that haven't mounted EditDraftProvider.
  const session = useEditDraftContext();
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
                const spanClass = fieldColSpanClass(field, group.columns);

                return (
                  <div key={field.key} className={`py-1 ${spanClass}`.trim()}>
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

// ── Edit view (document workspace-draft backbone) ──────────────────────────

function FieldsEditView({
  contract,
  record,
  recordId,
  session,
}: {
  contract: RuntimeSurfaceRendererProps["contract"];
  record: RuntimeSurfaceRendererProps["record"];
  recordId: string;
  session: NonNullable<ReturnType<typeof useEditDraftContext>>;
}) {
  const documentEditCoordinator = useOptionalDocumentEditCoordinator();
  const selectedOptionLabels = useMemo(
    () => readSelectedOptionLabels(documentEditCoordinator?.initialCore),
    [documentEditCoordinator?.initialCore],
  );
  const optionBatchContext = documentEditCoordinator ? {
    endpoint: documentEditCoordinator.endpoints.fieldOptionsBatch,
    permissionStamp: documentEditCoordinator.identity.permissionStamp,
  } : undefined;

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

  // Source-change rules — extracted from MetaEntityField.defaults JSONB.
  // Spec: docs/specs/entity_field_defaults.md
  const defaultsByField = useMemo<Record<string, EntityFieldDefaults>>(() => {
    const out: Record<string, EntityFieldDefaults> = {};
    for (const f of allFields) {
      const d = f.defaults as EntityFieldDefaults | undefined;
      if (d && (d.on_source_change || d.default_value_source)) out[f.name] = d;
    }
    return out;
  }, [allFields]);

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

  // Per-field provenance for `mode: "if_empty_or_derived"` rederive +
  // `target_was_user_overridden` predicates. Initialized from baseline (loaded)
  // values so user vs derived can be distinguished mid-session.
  const provenance = useFormProvenance(baselineValues as Record<string, unknown>);

  // Seed warnings from BFF detail's `_dependency_warnings` payload so a
  // record whose source field was edited out-of-band shows "needs review"
  // affordances on initial load — before the user touches anything.
  // Spec: docs/specs/entity_field_defaults.md §5 (bff_on_load_hydrate)
  const initialDependencyWarnings = useMemo<Record<string, string>>(() => {
    if (!record || typeof record !== "object") return {};
    const block = (record as Record<string, unknown>)["_dependency_warnings"];
    if (!block || typeof block !== "object" || Array.isArray(block)) return {};
    const out: Record<string, string> = {};
    for (const [field, raw] of Object.entries(block as Record<string, unknown>)) {
      if (!raw || typeof raw !== "object") continue;
      const r = raw as Record<string, unknown>;
      const message = typeof r["message"] === "string" && r["message"].trim()
        ? r["message"]
        : `Verify ${field} — ${Array.isArray(r["sources"]) ? r["sources"].join(", ") : "a related field"} changed.`;
      out[field] = message;
    }
    return out;
  }, [record]);

  const [fieldWarnings, setFieldWarnings] = useState<Record<string, string>>(initialDependencyWarnings);

  // Re-seed on record reload (e.g., after a save).
  useEffect(() => {
    setFieldWarnings(initialDependencyWarnings);
  }, [initialDependencyWarnings]);

  // Client refilter check — calls the BFF options endpoint with current value
  // + context, treats `disabled: true` (BFF stale-source hydration) as failure.
  const refilterCheck = useMemo(
    () => createRefilterCheck({ entityCode: contract.entityCode }),
    [contract.entityCode],
  );

  // Race protection for the source-change cascade: rapid Supplier A→B→A
  // changes must not let Supplier A's late resolver response overwrite
  // B-derived fields. The seq is incremented on every change; the .then()
  // bails when the seq has advanced. The AbortController also cancels any
  // in-flight resolver/refilter fetches.
  const cascadeSeqRef = useRef(0);
  const cascadeAbortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    return () => {
      cascadeAbortRef.current?.abort();
    };
  }, []);

  const recordData = record ?? {};
  const isSaving = session.saveStatus === "saving";
  // Status label for the parameterized `status_locked` reason message.
  // Lifecycle masks carry the status *code*, not a display label, so we
  // Title-Case the code (`"partially_paid"` → `"Partially Paid"`). When the
  // record has no status, `lockReasonMessage` falls back to the generic copy.
  const statusLabel = typeof recordData["status"] === "string" && recordData["status"].length > 0
    ? titleCaseStatus(recordData["status"] as string)
    : undefined;

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
                const spanClass = fieldColSpanClass(field, group.columns);

                const inner = fieldEditable ? (
                  <RuntimeFieldRow
                    field={field}
                    formValues={formValues}
                    disabled={isSaving}
                    error={error}
                    warning={fieldWarnings[field.name]}
                    contract={contract}
                    recordId={recordId}
                    selectedOptionLabel={selectedOptionLabels[field.name]}
                    optionBatchContext={optionBatchContext}
                    onFieldChange={(name, value: FormPrimitive) => {
                      const oldValues = formValues;
                      const nextValues: FormValues = { ...formValues, [name]: value };
                      session.setHeaderField(name, value);
                      provenance.markUserInput(name);

                      if (!hasClientSourceChangeCandidates(allFields, [name], defaultsByField)) return;

                      // Race protection: bump the seq, abort prior in-flight
                      // requests, allocate a fresh AbortController for this run.
                      cascadeSeqRef.current += 1;
                      const mySeq = cascadeSeqRef.current;
                      cascadeAbortRef.current?.abort();
                      const controller = new AbortController();
                      cascadeAbortRef.current = controller;

                      void applyServerDefaultsResolve({
                        entityCode:       contract.routeSlug || contract.entityCode,
                        recordId,
                        changedFields:   [name],
                        oldValues:       oldValues as Record<string, unknown>,
                        newValues:       nextValues as Record<string, unknown>,
                        provenance:      provenance.provenance,
                        defaultsByField,
                        refilterCheck,
                        signal:          controller.signal,
                      })
                        .then((result) => {
                          // Drop if a newer change has fired meanwhile.
                          if (mySeq !== cascadeSeqRef.current) return;

                          for (const k of Object.keys(result.valueUpdates)) {
                            const v = result.valueUpdates[k];
                            // session.setHeaderField accepts unknown; null is
                            // honored as "clear this field" by the server
                            // source-change validator.
                            session.setHeaderField(k, v);
                          }
                          for (const t of result.derivedFields) provenance.markDerived(t);
                          for (const t of result.clearedFields) provenance.markCleared(t);
                          if (Object.keys(result.warnings).length > 0) {
                            setFieldWarnings((curr) => ({ ...curr, ...result.warnings }));
                          }
                          for (const intent of result.intents) {
                            if (
                              intent.action === "rederive"
                              && intent.resolver === "picker.first_option"
                              && !(intent.target in result.valueUpdates)
                            ) {
                              setFieldWarnings((curr) => ({
                                ...curr,
                                [intent.target]: intent.message ?? "No default option was available for the current selection.",
                              }));
                            }
                          }
                        })
                        .catch(() => {
                          // Best-effort: a resolver failure should not turn the form red.
                        });
                    }}
                  />
                ) : (
                  <FieldReadCell
                    label={field.label}
                    value={formatFieldValue(recordData, field)}
                    reason={
                      maskEntry.editable === false && maskEntry.reason
                        ? lockReasonMessage(maskEntry.reason, {
                            statusLabel,
                            serverMessage: maskEntry.message,
                          })
                        : undefined
                    }
                  />
                );

                if (!spanClass) return cloneElement(inner, { key: field.key });
                return (
                  <div key={field.key} className={spanClass}>{inner}</div>
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

