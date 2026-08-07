"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { runtimePath } from "@athyper/api-contracts/runtime-paths";
import { WorkPanel } from "@athyper/platform-surface-kit";
import type { EntityFieldDefaults } from "@athyper/cascade";
import type { MetaEntityField, MetaEntityLineItemsSurface, MetaEntityRuntimeDescriptor, ProcessRuntimeState } from "@athyper/runtime-contracts";
import type { EntityEditableField } from "@athyper/runtime-shared";
import { LineItemsSurface } from "@athyper/runtime-line-item/surface";
import { applyServerDefaultsResolve, createRefilterCheck } from "@athyper/runtime-shared/resolvers";
import { useActiveTab } from "../record/runtime-record-workspace";
import {
  useEntityEditState,
  type EntityEditState,
  type EntityEditStateResult,
  type ValidationResult,
} from "@athyper/runtime-shared";
import {
  buildMetaEntityEditableFields,
  buildMetaEntityFieldGroups,
  parseRuntimeWriteError,
} from "@athyper/runtime-shared/meta-entity";
import type { RuntimeRecordRow } from "@athyper/runtime-shared/core";
import { invalidateRuntimeListEntity } from "@athyper/runtime-shared/client";
import { RuntimeRecordWorkspace } from "../record/runtime-record-workspace";
import {
  buildInitialValues,
  defaultFormValue,
  getCookie,
  isEmptyFormValue,
  parseFieldValue,
  readJson,
  RuntimeEditState,
  type FormPrimitive,
  type FormValues,
} from "./runtime-edit-form";
import { RuntimeFieldSet } from "./runtime-field-set";
import { useFormProvenance } from "./use-form-provenance";
import {
  runtimeEditFormDomId,
  useRuntimeEditFormActionPublisher,
} from "./runtime-edit-form-actions";
import { hasClientSourceChangeCandidates } from "./source-change-candidates";
import {
  completeClassicWriteAttempt,
  createClassicWriteSignature,
  resolveClassicWriteAttempt,
  type ClassicWriteAttempt,
} from "./classic-write-idempotency";
import type { RuntimeRecordChromeModel } from "../record/runtime-header-model";

interface RuntimeDescriptorEditWorkspaceProps {
  contract: MetaEntityRuntimeDescriptor;
  record?: RuntimeRecordRow;
  recordId: string;
  processState?: ProcessRuntimeState;
  chrome: RuntimeRecordChromeModel;
  csrfCookieName: string;
  onSaveSuccess?: () => void;
}

export function RuntimeDescriptorEditWorkspace({
  contract,
  record,
  recordId,
  processState,
  chrome,
  csrfCookieName,
  onSaveSuccess,
}: RuntimeDescriptorEditWorkspaceProps) {
  const allFields = contract.fields;
  const initialValues = useMemo(
    () => withConcurrencyVersion(contract, buildInitialValues(allFields, record), record),
    [allFields, contract, record],
  );
  const [savedValues, setSavedValues] = useState<FormValues>(initialValues);
  const classicWriteAttemptsRef = useRef(new Map<string, ClassicWriteAttempt>());

  const currentStatus = readStatusValue(savedValues);

  const stateFields = useMemo(
    () => buildMetaEntityEditableFields(contract, "edit", { status: currentStatus }) as unknown as EntityEditableField[],
    [contract, currentStatus],
  );

  const stateResult = useEntityEditState<FormValues, Record<string, unknown>>({
    entityCode: contract.entityCode,
    recordId,
    record: savedValues,
    fields: stateFields,
    currentStatus,
    validatePatch: (patch) => validateRuntimePatch(contract, patch),
    save: async (patch) => {
      const built = buildRuntimeDataPatch(contract, patch);
      if (!built.ok) {
        return {
          ok: false,
          fieldErrors: built.fieldErrors,
          globalError: built.globalError,
        };
      }

      const expectedVersion = readConcurrencyVersion(contract, savedValues, record);
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "X-CSRF-Token": getCookie(csrfCookieName),
      };
      if (expectedVersion) headers["If-Match"] = expectedVersion;
      const classicSignature = expectedVersion
        ? createClassicWriteSignature({
            entityCode: contract.entityCode,
            recordId,
            expectedVersion,
            data: built.data,
          })
        : null;
      if (classicSignature) {
        headers["Idempotency-Key"] = resolveClassicWriteAttempt(
          classicWriteAttemptsRef.current,
          classicSignature,
        ).idempotencyKey;
      }

      const response = await fetch(
        runtimePath.detail(contract.routeSlug, recordId),
        {
          method: "PATCH",
          headers,
          body: JSON.stringify(expectedVersion
            ? { data: built.data, expectedVersion }
            : { data: built.data }),
        },
      );

      const result = await readJson(response);
      if (!response.ok) {
        const parsed = parseRuntimeWriteError(result, response.status);
        return {
          ok: false,
          fieldErrors: parsed.fieldErrors,
          globalError: parsed.message,
          conflict: parsed.conflict
            ? {
                message: parsed.conflict.message,
                serverVersion: stringifyVersion(parsed.conflict.actual),
              }
            : undefined,
        };
      }

      if (classicSignature) completeClassicWriteAttempt(classicWriteAttemptsRef.current, classicSignature);

      setSavedValues((current) => ({
        ...current,
        ...buildSavedFormValues(contract, built.formValues, result),
      }));
      invalidateRuntimeListEntity(contract.entityCode, "edit");
      onSaveSuccess?.();
      return { ok: true };
    },
  });

  const isDirtyRef = useRef(stateResult.isDirty);
  isDirtyRef.current = stateResult.isDirty;

  useEffect(() => {
    if (!isDirtyRef.current) {
      setSavedValues(initialValues);
    }
  }, [initialValues]);

  const editState = useMemo(
    () => toEntityEditState(stateResult),
    [
      stateResult.dirtyFields,
      stateResult.discard,
      stateResult.isDirty,
      stateResult.isSaving,
      stateResult.justSaved,
      stateResult.lastSavedAt,
      stateResult.save,
    ],
  );

  return (
    <RuntimeRecordWorkspace
      contract={contract}
      record={record}
      recordId={recordId}
      chrome={chrome}
      processState={processState}
      editMode
      editState={editState}
    >
      <RuntimeDescriptorEditForm
        contract={contract}
        recordId={recordId}
        savedValues={savedValues}
        stateResult={stateResult}
        record={record}
      />
    </RuntimeRecordWorkspace>
  );
}

function RuntimeDescriptorEditForm({
  contract,
  recordId,
  savedValues,
  stateResult,
  record,
}: {
  contract: MetaEntityRuntimeDescriptor;
  recordId: string;
  savedValues: FormValues;
  stateResult: EntityEditStateResult;
  record?: RuntimeRecordRow;
}) {
  const activeTab = useActiveTab();
  const activeLineItemsSurface = useMemo<MetaEntityLineItemsSurface | null>(() => {
    if (!activeTab) return null;
    const surface = contract.surfaces.find((s) => s.key === activeTab && s.kind === "line_items");
    return surface ? (surface as MetaEntityLineItemsSurface) : null;
  }, [activeTab, contract.surfaces]);

  const formId = useMemo(
    () => runtimeEditFormDomId(contract.routeSlug, recordId, "edit"),
    [contract.routeSlug, recordId],
  );
  const { clear, publish } = useRuntimeEditFormActionPublisher();
  const formValues = useMemo(
    () => ({ ...savedValues, ...toFormPatch(stateResult.patch) }),
    [savedValues, stateResult.patch],
  );

  const fieldGroups = useMemo(
    () => buildMetaEntityFieldGroups(contract, "edit"),
    [contract],
  );
  const defaultsByField = useMemo<Record<string, EntityFieldDefaults>>(() => {
    const out: Record<string, EntityFieldDefaults> = {};
    for (const field of contract.fields) {
      const defaults = field.defaults as EntityFieldDefaults | undefined;
      if (defaults && (defaults.on_source_change || defaults.default_value_source)) {
        out[field.name] = defaults;
      }
    }
    return out;
  }, [contract.fields]);
  const provenance = useFormProvenance(savedValues as Record<string, unknown>);
  const refilterCheck = useMemo(
    () => createRefilterCheck({ entityCode: contract.routeSlug || contract.entityCode }),
    [contract.entityCode, contract.routeSlug],
  );
  const cascadeSeqRef = useRef(0);
  const cascadeAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      cascadeAbortRef.current?.abort();
    };
  }, []);

  const actionStatus = stateResult.isSaving
    ? "saving"
    : stateResult.globalError
      ? "error"
      : stateResult.justSaved
        ? "saved"
        : "idle";
  const actionMessage = stateResult.globalError ?? (stateResult.justSaved ? "Saved" : "");

  const saveStatusText = stateResult.isSaving
    ? "Saving…"
    : stateResult.justSaved
      ? "Saved"
      : stateResult.globalError
        ? `Error: ${stateResult.globalError}`
        : "";

  useEffect(() => {
    publish({
      formId,
      mode: "edit",
      dirty: stateResult.isDirty,
      saving: stateResult.isSaving,
      status: actionStatus,
      message: actionMessage,
    });
  }, [
    actionMessage,
    actionStatus,
    formId,
    publish,
    stateResult.isDirty,
    stateResult.isSaving,
  ]);

  useEffect(() => () => clear(formId), [clear, formId]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!stateResult.isDirty || stateResult.isSaving) return;
    void stateResult.save();
  }

  function reset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (stateResult.isSaving) return;
    stateResult.discard();
  }

  function updateFieldWithCascade(name: string, value: FormPrimitive) {
    const oldValues = formValues;
    const nextValues: FormValues = { ...formValues, [name]: value };
    stateResult.updateField(name, value);
    provenance.markUserInput(name);

    if (!hasClientSourceChangeCandidates(contract.fields, [name], defaultsByField)) return;

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
        if (mySeq !== cascadeSeqRef.current) return;

        for (const [fieldName, nextValue] of Object.entries(result.valueUpdates)) {
          if (nextValue === null || nextValue === undefined) {
            stateResult.updateField(fieldName, "");
          } else if (typeof nextValue === "boolean") {
            stateResult.updateField(fieldName, nextValue);
          } else {
            stateResult.updateField(fieldName, String(nextValue));
          }
        }
        for (const target of result.derivedFields) provenance.markDerived(target);
        for (const target of result.clearedFields) provenance.markCleared(target);
      })
      .catch(() => {
        // Source-change derivation is best-effort in the classic edit shell.
      });
  }

  const recordData = useMemo(() => {
    const data = record && typeof record["data"] === "object" && record["data"] !== null
      ? record["data"] as Record<string, unknown>
      : {};
    return { ...record, ...data } as Record<string, unknown>;
  }, [record]);
  if (activeLineItemsSurface) {
    const currencyCode = typeof recordData["currency_code"] === "string" ? recordData["currency_code"] : undefined;
    const companyCodeId = typeof recordData["company_code_id"] === "string" ? recordData["company_code_id"] : undefined;
    return (
      <LineItemsSurface
        surface={activeLineItemsSurface}
        entityCode={contract.entityCode}
        recordId={recordId}
        record={recordData}
        currencyCode={currencyCode}
        companyCodeId={companyCodeId}
        editMode
      />
    );
  }

  if (fieldGroups.length === 0) {
    return <RuntimeEditState title="No editable fields" message="This entity does not expose editable fields." />;
  }

  return (
    <form id={formId} className="flex flex-col gap-2.5" onSubmit={submit} onReset={reset}>
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {saveStatusText}
      </div>

      {stateResult.globalError ? (
        <div
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          {stateResult.globalError}
        </div>
      ) : null}

      {fieldGroups.map((group) => (
        <WorkPanel key={group.key} title={group.label}>
          <RuntimeFieldSet
            group={group}
            formValues={formValues}
            disabled={stateResult.isSaving}
            fieldErrors={stateResult.fieldErrors}
            contract={contract}
            recordId={recordId}
            record={recordData}
            surface="edit"
            onFieldChange={(name, value) => updateFieldWithCascade(name, value)}
          />
        </WorkPanel>
      ))}
    </form>
  );
}

function validateRuntimePatch(
  contract: MetaEntityRuntimeDescriptor,
  patch: Record<string, unknown>,
): ValidationResult {
  const built = buildRuntimeDataPatch(contract, patch);
  return built.ok
    ? { valid: true }
    : {
        valid: false,
        fieldErrors: built.fieldErrors,
        globalError: built.globalError,
      };
}

function buildRuntimeDataPatch(
  contract: MetaEntityRuntimeDescriptor,
  patch: Record<string, unknown>,
): (
  | { ok: true; data: Record<string, unknown>; formValues: FormValues }
  | { ok: false; fieldErrors: Record<string, string>; globalError: string }
) {
  const fieldByName = new Map(contract.fields.map((field) => [field.name, field]));
  const data: Record<string, unknown> = {};
  const formValues: FormValues = {};
  const fieldErrors: Record<string, string> = {};

  for (const [fieldName, rawValue] of Object.entries(patch)) {
    const field = fieldByName.get(fieldName);
    if (!field) continue;

    const value = toFormPrimitive(rawValue, field);
    if (field.isRequired && isEmptyFormValue(value)) {
      fieldErrors[fieldName] = `${field.label} is required.`;
      continue;
    }

    const parsed = parseFieldValue(field, value);
    if (parsed.status === "error") {
      fieldErrors[fieldName] = parsed.message;
      continue;
    }

    data[field.name] = parsed.value;
    formValues[field.name] = value;
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      ok: false,
      fieldErrors,
      globalError: "Please fix the highlighted fields before saving.",
    };
  }

  return { ok: true, data, formValues };
}

function buildSavedFormValues(
  contract: MetaEntityRuntimeDescriptor,
  submittedValues: FormValues,
  responseBody: unknown,
): FormValues {
  const savedRecord = readSavedRecord(responseBody);
  return savedRecord
    ? withConcurrencyVersion(contract, buildInitialValues(contract.fields, savedRecord), savedRecord)
    : submittedValues;
}

function withConcurrencyVersion(
  contract: MetaEntityRuntimeDescriptor,
  values: FormValues,
  record: RuntimeRecordRow | undefined,
): FormValues {
  const versionField = contract.concurrency?.versionColumn ?? "row_version";

  const version = readRecordPrimitive(record, versionField);
  if (version === null) return values;
  return { ...values, [versionField]: version };
}

function readConcurrencyVersion(
  contract: MetaEntityRuntimeDescriptor,
  values: FormValues,
  record: RuntimeRecordRow | undefined,
): string | null {
  const versionField = contract.concurrency?.versionColumn ?? "row_version";

  const value = values[versionField] ?? readRecordPrimitive(record, versionField);
  return stringifyVersion(value) ?? null;
}

function readRecordPrimitive(record: RuntimeRecordRow | undefined, fieldName: string): FormPrimitive | null {
  if (!record) return null;
  const data = isRecord(record.data) ? record.data : {};
  const value = data[fieldName] ?? record[fieldName];
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  if (typeof value === "boolean") return value;
  return null;
}

function stringifyVersion(value: unknown): string | undefined {
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "bigint") return undefined;
  const normalized = String(value).trim();
  return normalized || undefined;
}

function toFormPrimitive(value: unknown, field: MetaEntityField): FormPrimitive {
  if (typeof value === "boolean" || typeof value === "string") return value;
  return defaultFormValue(field);
}

function toFormPatch(patch: Record<string, unknown>): FormValues {
  const result: FormValues = {};
  for (const [key, value] of Object.entries(patch)) {
    if (typeof value === "boolean" || typeof value === "string") {
      result[key] = value;
    }
  }
  return result;
}

function toEntityEditState(state: EntityEditStateResult): EntityEditState {
  return {
    isDirty: state.isDirty,
    dirtyFields: state.dirtyFields,
    isSaving: state.isSaving,
    lastSavedAt: state.lastSavedAt,
    justSaved: state.justSaved,
    save: state.save,
    discard: state.discard,
  };
}

function readSavedRecord(value: unknown): RuntimeRecordRow | undefined {
  if (!isRecord(value)) return undefined;
  const saved = value["record"];
  return (isRecord(saved) ? saved : value) as RuntimeRecordRow;
}

function readStatusValue(values: FormValues): string | undefined {
  const status = values["status"] ?? values["lifecycle_state"] ?? values["state"];
  return typeof status === "string" && status.trim() ? status : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
