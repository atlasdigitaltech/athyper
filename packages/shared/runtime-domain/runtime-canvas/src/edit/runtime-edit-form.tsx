"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FocusEvent, type FormEvent, type ReactNode } from "react";
import { runtimePath } from "@athyper/api-contracts/runtime-paths";
import type { EntityFieldDefaults } from "@athyper/cascade";
import {
  type DocumentEditRuntimeContract,
  type MetaEntityField,
  type MetaEntityRuntimeDescriptor,
  type ResolveChangeInvalidation,
  type ResolveChangeResponse,
} from "@athyper/runtime-contracts";
import {
  buildMetaEntityFieldGroups,
  parseRuntimeWriteError,
  readRecordValue as readMetaEntityRecordValue,
  type RuntimeFieldGroupModel,
} from "@athyper/runtime-shared/meta-entity";
import { WorkPanel } from "@athyper/platform-surface-kit";
import type { RuntimeRecordRow } from "@athyper/runtime-shared/core";
import { csrfFetch, invalidateRuntimeListEntity } from "@athyper/runtime-shared/client";
import {
  runtimeEditFormDomId,
  useRuntimeEditFormActionPublisher,
} from "./runtime-edit-form-actions";
import { RuntimeFieldSet } from "./runtime-field-set";
import { applyServerDefaultsResolve, createRefilterCheck } from "@athyper/runtime-shared/resolvers";
import { useFormProvenance } from "./use-form-provenance";
import { hasClientSourceChangeCandidates } from "./source-change-candidates";
import {
  completeClassicWriteAttempt,
  createClassicWriteSignature,
  resolveClassicWriteAttempt,
  type ClassicWriteAttempt,
} from "./classic-write-idempotency";
import { FxExchangeRateInputShell } from "../fields/fx-exchange-rate-field";
import {
  incrementDocumentEditTelemetryCounter,
  useOptionalDocumentEditCoordinator,
} from "../document-runtime/document-edit-coordinator";
import { DatePicker, ZonedDateTimePicker } from "@athyper/platform-ui/composites";
import { resolveTemporalKind, type ZonedDateTimeValue } from "@athyper/platform-temporal";
import {
  RuntimeTemporalProvider,
  useRuntimeTemporalContextOptional,
  useIsPostingDateDisabled,
} from "../temporal";

export type FormPrimitive = string | boolean;
export type FormValues = Record<string, FormPrimitive>;

export interface RuntimeOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

interface DocumentResolveFieldConfig {
  debounceMs: number;
}

const RUNTIME_OPTION_SELECTED_CACHE_TTL_MS = 300_000;
const RUNTIME_OPTION_SEARCH_CACHE_TTL_MS = 60_000;
const RUNTIME_OPTION_CACHE_MAX_ENTRIES = 500;

const runtimeOptionCache = new Map<string, { expiresAt: number; options: RuntimeOption[] }>();
const runtimeOptionInflight = new Map<string, Promise<RuntimeOption[]>>();
const runtimeOptionBatchQueues = new Map<string, RuntimeOptionBatchQueue>();

export interface RuntimeOptionBatchContext {
  endpoint: string;
  permissionStamp?: string;
}

interface RuntimeOptionBatchQueue {
  timer: ReturnType<typeof setTimeout> | null;
  items: RuntimeOptionBatchQueueItem[];
}

interface RuntimeOptionBatchQueueItem {
  input: RuntimeOptionFetchInput;
  requestId: string;
  aborted: boolean;
  detachAbort?: () => void;
  resolve: (options: RuntimeOption[]) => void;
  reject: (error: unknown) => void;
}

export interface RuntimeOptionFetchInput {
  cacheKey: string;
  entitySlug: string;
  fieldName: string;
  params: URLSearchParams;
  ttlMs: number;
  batchContext?: RuntimeOptionBatchContext;
  signal?: AbortSignal;
}

class RuntimeOptionSecurityError extends Error {
  readonly code = "CSRF_VALIDATION_FAILED";
  readonly status = 403;

  constructor() {
    super("Your security session could not be validated. Refresh the page and try again.");
    this.name = "RuntimeOptionSecurityError";
  }
}

export interface RuntimeEditFormProps {
  fields: MetaEntityField[];
  descriptor?: MetaEntityRuntimeDescriptor;
  record?: RuntimeRecordRow;
  entitySlug: string;
  recordId?: string;
  detailHref?: string;
  listHref?: string;
  csrfCookieName: string;
  mode?: "create" | "edit";
  actionsPlacement?: "inline" | "header";
}

export function RuntimeEditForm({
  fields,
  descriptor,
  record,
  entitySlug,
  recordId = "new",
  detailHref,
  listHref,
  csrfCookieName,
  mode = "edit",
  actionsPlacement = "inline",
}: RuntimeEditFormProps) {
  const isCreateMode = mode === "create";
  const formId = useMemo(() => runtimeEditFormDomId(entitySlug, recordId, mode), [entitySlug, mode, recordId]);
  const exposeHeaderActions = actionsPlacement === "header";
  const { clear: clearHeaderActions, publish: publishHeaderActions } = useRuntimeEditFormActionPublisher();
  const documentEditCoordinator = useOptionalDocumentEditCoordinator();
  const initialValues = useMemo(
    () => withConcurrencyVersion(descriptor, buildInitialValues(fields, record), record),
    [descriptor, fields, record],
  );
  const [baseline, setBaseline] = useState<FormValues>(initialValues);
  const [values, setValues] = useState<FormValues>(initialValues);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [fieldWarnings, setFieldWarnings] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState<string>("");
  const [optionInvalidationEpochs, setOptionInvalidationEpochs] = useState<Record<string, number>>({});
  const [documentTabId] = useState(() => createDocumentEditTabId());
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const classicWriteAttemptsRef = useRef(new Map<string, ClassicWriteAttempt>());

  // Per-field provenance for the `mode: "if_empty_or_derived"` rederive path
  // and `target_was_user_overridden` predicates. Initialized from the loaded
  // values; ref preserves state across re-renders while values mutate.
  const provenance = useFormProvenance(initialValues as Record<string, unknown>);

  // Source-change rules — extracted from MetaEntityField.defaults JSONB once.
  const defaultsByField = useMemo<Record<string, EntityFieldDefaults>>(() => {
    const out: Record<string, EntityFieldDefaults> = {};
    for (const f of fields) {
      const d = f.defaults as EntityFieldDefaults | undefined;
      if (d && (d.on_source_change || d.default_value_source)) out[f.name] = d;
    }
    return out;
  }, [fields]);

  // Client refilter check — validates target value against BFF options
  // endpoint; treats `disabled: true` (stale-source hydration) as failure.
  const refilterCheck = useMemo(
    () => createRefilterCheck({ entityCode: entitySlug }),
    [entitySlug],
  );

  const documentResolveConfigByField = useMemo(
    () => buildDocumentResolveConfigByField(documentEditCoordinator?.contract),
    [documentEditCoordinator?.contract],
  );
  const selectedOptionLabels = useMemo(
    () => readSelectedOptionLabels(documentEditCoordinator?.initialCore),
    [documentEditCoordinator?.initialCore],
  );

  // Race protection — see fields-surface.tsx for the same pattern.
  const cascadeSeqRef = useRef(0);
  const cascadeAbortRef = useRef<AbortController | null>(null);
  const documentResolveTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const documentResolveSeqRef = useRef(0);
  const draftRevisionRef = useRef(0);
  const initialDefaultsAppliedRef = useRef(false);
  useEffect(() => () => {
    cascadeAbortRef.current?.abort();
    clearDocumentResolveTimers(documentResolveTimersRef.current);
  }, []);

  const dirtyFields = fields.filter((field) => !sameFormValue(values[field.name], baseline[field.name]));
  const isDirty = dirtyFields.length > 0;
  const isSaving = status === "saving";
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;

  const fieldGroups = useMemo<RuntimeFieldGroupModel[]>(() => {
    if (descriptor) {
      const groups = buildMetaEntityFieldGroups(descriptor, mode);
      const fieldNameSet = new Set(fields.map((f) => f.name));
      return groups
        .map((g) => ({ ...g, fields: g.fields.filter((f) => fieldNameSet.has(f.name)) }))
        .filter((g) => g.fields.length > 0);
    }
    return [{
      key: "general",
      label: "General",
      order: 0,
      columns: 2 as const,
      pageSpan: "full" as const,
      fields: [...fields].sort((a, b) => a.order - b.order),
    }];
  }, [descriptor, fields, mode]);

  useEffect(() => {
    return () => {
      if (savedTimer.current) clearTimeout(savedTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!exposeHeaderActions) return;
    publishHeaderActions({
      formId,
      mode,
      dirty: isDirty,
      saving: isSaving,
      status,
      message,
    });
  }, [
    exposeHeaderActions,
    formId,
    isDirty,
    isSaving,
    message,
    mode,
    publishHeaderActions,
    status,
  ]);

  useEffect(() => {
    if (!exposeHeaderActions) return;
    return () => clearHeaderActions(formId);
  }, [clearHeaderActions, exposeHeaderActions, formId]);

  useEffect(() => {
    if (!isDirtyRef.current) {
      draftRevisionRef.current += 1;
      clearDocumentResolveTimers(documentResolveTimersRef.current);
      setBaseline(initialValues);
      setValues(initialValues);
      provenance.reset(initialValues as Record<string, unknown>);
      setFieldWarnings({});
      setOptionInvalidationEpochs({});
    }
    // provenance.reset is stable (useCallback in useFormProvenance); omit to
    // avoid an infinite reload loop on initialValues identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialValues]);

  useEffect(() => {
    if (!isCreateMode || initialDefaultsAppliedRef.current) return;
    const changedFields = Object.entries(initialValues)
      .filter(([, value]) => !isBlankFormValue(value))
      .map(([field]) => field)
      .sort();
    if (changedFields.length === 0) return;
    if (!hasClientSourceChangeCandidates(fields, changedFields, defaultsByField)) return;

    initialDefaultsAppliedRef.current = true;
    const controller = new AbortController();

    void applyServerDefaultsResolve({
      entityCode:       entitySlug,
      recordId:         null,
      changedFields,
      oldValues:        {},
      newValues:        initialValues as Record<string, unknown>,
      provenance:       provenance.provenance,
      defaultsByField,
      refilterCheck,
      signal:           controller.signal,
      csrfToken:        getCookie(csrfCookieName),
    })
      .then((result) => {
        const updateKeys = Object.keys(result.valueUpdates);
        if (updateKeys.length > 0) {
          setValues((current) => applyValueUpdates(current, result.valueUpdates));
          setBaseline((current) => applyValueUpdates(current, result.valueUpdates));
          for (const t of result.derivedFields) provenance.markDerived(t);
          for (const t of result.clearedFields) provenance.markCleared(t);
        }
        if (Object.keys(result.warnings).length > 0 || Object.keys(result.errors).length > 0) {
          setFieldWarnings((current) => ({ ...current, ...result.warnings }));
          if (Object.keys(result.errors).length > 0) {
            setFieldErrors((current) => ({ ...current, ...result.errors }));
          }
        }
      })
      .catch(() => {});

    return () => controller.abort();
  }, [
    csrfCookieName,
    defaultsByField,
    entitySlug,
    initialValues,
    isCreateMode,
    provenance,
    refilterCheck,
  ]);

  function clearSavedTimer() {
    if (savedTimer.current) {
      clearTimeout(savedTimer.current);
      savedTimer.current = null;
    }
  }

  function acknowledgeSaved() {
    clearSavedTimer();
    setStatus("saved");
    setMessage("Saved");
    savedTimer.current = setTimeout(() => {
      setStatus((current) => (current === "saved" ? "idle" : current));
      setMessage((current) => (current === "Saved" ? "" : current));
      savedTimer.current = null;
    }, 2500);
  }

  function updateField(field: MetaEntityField, value: FormPrimitive) {
    clearSavedTimer();
    const oldValues = values;
    const nextValues: FormValues = { ...values, [field.name]: value };
    draftRevisionRef.current += 1;
    const draftRevision = draftRevisionRef.current;
    setValues(nextValues);
    provenance.markUserInput(field.name);

    if (fieldErrors[field.name]) {
      setFieldErrors((current) => {
        const next = { ...current };
        delete next[field.name];
        return next;
      });
    }
    if (fieldWarnings[field.name]) {
      setFieldWarnings((current) => {
        const next = { ...current };
        delete next[field.name];
        return next;
      });
    }
    setStatus("idle");
    setMessage("");

    const documentResolveConfig = documentResolveConfigByField.get(field.name);
    if (!isCreateMode && documentEditCoordinator && documentResolveConfig) {
      cascadeSeqRef.current += 1;
      cascadeAbortRef.current?.abort();
      scheduleDocumentFieldResolve({
        coordinator: documentEditCoordinator,
        fieldName: field.name,
        value,
        values: nextValues,
        draftRevision,
        debounceMs: documentResolveConfig.debounceMs,
      });
      return;
    }

    // Skip the source-change pass when this field has no downstream rule or
    // picker dependency. The server remains the authority for actual values.
    if (!hasClientSourceChangeCandidates(fields, [field.name], defaultsByField)) return;

    cascadeSeqRef.current += 1;
    const mySeq = cascadeSeqRef.current;
    cascadeAbortRef.current?.abort();
    const controller = new AbortController();
    cascadeAbortRef.current = controller;

    void applyServerDefaultsResolve({
      entityCode:       entitySlug,
      recordId,
      changedFields:   [field.name],
      oldValues:       oldValues as Record<string, unknown>,
      newValues:       nextValues as Record<string, unknown>,
      provenance:      provenance.provenance,
      defaultsByField,
      refilterCheck,
      signal:          controller.signal,
      csrfToken:       getCookie(csrfCookieName),
    })
      .then((result) => {
        if (mySeq !== cascadeSeqRef.current) return;

        const updateKeys = Object.keys(result.valueUpdates);
        if (updateKeys.length > 0) {
          setValues((current) => applyValueUpdates(current, result.valueUpdates));
          for (const t of result.derivedFields) provenance.markDerived(t);
          for (const t of result.clearedFields) provenance.markCleared(t);
        }

        if (Object.keys(result.warnings).length > 0 || Object.keys(result.errors).length > 0) {
          setFieldWarnings((current) => ({ ...current, ...result.warnings }));
          if (Object.keys(result.errors).length > 0) {
            setFieldErrors((current) => ({ ...current, ...result.errors }));
          }
        }
      })
      .catch(() => {
        // Best-effort — a resolver failure should not turn the form red.
      });
  }

  function scheduleDocumentFieldResolve({
    coordinator,
    fieldName,
    value,
    values: nextValues,
    draftRevision,
    debounceMs,
  }: {
    coordinator: NonNullable<typeof documentEditCoordinator>;
    fieldName: string;
    value: FormPrimitive;
    values: FormValues;
    draftRevision: number;
    debounceMs: number;
  }) {
    const existingTimer = documentResolveTimersRef.current[fieldName];
    if (existingTimer) clearTimeout(existingTimer);

    const clientSeq = documentResolveSeqRef.current + 1;
    documentResolveSeqRef.current = clientSeq;

    documentResolveTimersRef.current[fieldName] = setTimeout(() => {
      delete documentResolveTimersRef.current[fieldName];
      if (draftRevisionRef.current !== draftRevision) return;

      void coordinator.resolveFieldChange({
        entityCode: coordinator.entityCode,
        recordId: coordinator.recordId,
        sourceField: fieldName,
        newValue: value,
        currentDraft: toJsonObject(nextValues),
        draftVersion: `draft_${draftRevision}`,
        sectionVersions: buildSectionVersionMap(coordinator.contract),
        tabId: documentTabId,
        clientSeq,
        idempotencyKey: createDocumentEditIdempotencyKey(documentTabId, clientSeq, fieldName),
      })
        .then((response) => {
          if (draftRevisionRef.current !== draftRevision) return;

          if (!response.accepted) {
            if (response.category && response.category !== "stale") {
              setFieldWarnings((current) => ({
                ...current,
                [fieldName]: documentResolveWarning(response),
              }));
            }
            return;
          }

          const updates = buildDocumentResolveUpdates(response);
          if (Object.keys(updates).length > 0) {
            setValues((current) =>
              draftRevisionRef.current === draftRevision
                ? applyValueUpdates(current, updates)
                : current,
            );
            for (const item of response.defaults) provenance.markDerived(item.field);
            for (const clearedField of response.clearedFields) provenance.markCleared(clearedField);
          }

          if (response.invalidations.length > 0) {
            handleDocumentResolveInvalidations(coordinator, response.invalidations, nextValues);
          }
        })
        .catch(() => {
          // Best-effort: document resolve must never make typing feel blocked.
        });
    }, Math.max(0, debounceMs));
  }

  function handleDocumentResolveInvalidations(
    coordinator: NonNullable<typeof documentEditCoordinator>,
    invalidations: ResolveChangeInvalidation[],
    context: FormValues,
  ) {
    const optionKeys = invalidations
      .filter((invalidation) => invalidation.type === "field_options" || invalidation.type === "lookup")
      .map((invalidation) => invalidation.key);

    if (optionKeys.length > 0) {
      const stamp = Date.now();
      setOptionInvalidationEpochs((current) => {
        const next = { ...current };
        for (const key of optionKeys) next[key] = stamp;
        return next;
      });
      for (const key of optionKeys) clearRuntimeOptionCacheForField(entitySlug, key);
    }

    void coordinator.applyInvalidations(invalidations, context);
  }

  function revertChanges() {
    clearSavedTimer();
    draftRevisionRef.current += 1;
    clearDocumentResolveTimers(documentResolveTimersRef.current);
    setValues(baseline);
    setFieldErrors({});
    setFieldWarnings({});
    provenance.reset(baseline as Record<string, unknown>);
    setStatus("idle");
    setMessage("");
  }

  function reset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSaving) return;
    revertChanges();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isDirty || isSaving) return;

    const submitFields = isCreateMode
      ? fields.filter((field) => shouldSubmitCreateValue(field, values[field.name] ?? defaultFormValue(field), baseline[field.name]))
      : dirtyFields;

    const data: Record<string, unknown> = {};
    for (const field of submitFields) {
      const rawValue = values[field.name] ?? defaultFormValue(field);
      if (field.isRequired && isEmptyFormValue(rawValue)) {
        setStatus("error");
        setFieldErrors({ [field.name]: `${field.label} is required.` });
        setMessage("Please fix the highlighted fields before saving.");
        return;
      }

      const parsed = parseFieldValue(field, rawValue);
      if (parsed.status === "error") {
        setStatus("error");
        setFieldErrors({ [field.name]: parsed.message });
        setMessage(parsed.message);
        return;
      }
      data[field.name] = parsed.value;
    }

    if (Object.keys(data).length === 0) return;

    setStatus("saving");
    setMessage("");
    setFieldErrors({});
    clearSavedTimer();

    try {
      const expectedVersion = !isCreateMode ? readConcurrencyVersion(descriptor, baseline, record) : null;
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "X-CSRF-Token": getCookie(csrfCookieName),
      };
      if (expectedVersion) headers["If-Match"] = expectedVersion;
      const classicSignature = !isCreateMode && expectedVersion
        ? createClassicWriteSignature({ entityCode: entitySlug, recordId, expectedVersion, data })
        : null;
      if (classicSignature) {
        headers["Idempotency-Key"] = resolveClassicWriteAttempt(
          classicWriteAttemptsRef.current,
          classicSignature,
        ).idempotencyKey;
      }

      const response = await fetch(runtimeRecordWriteHref(entitySlug, recordId, isCreateMode), {
        method: isCreateMode ? "POST" : "PATCH",
        headers,
        body: JSON.stringify(expectedVersion ? { data, expectedVersion } : { data }),
      });

      const result = await readJson(response);
      if (!response.ok) {
        const parsed = parseRuntimeWriteError(result, response.status);
        setStatus("error");
        setFieldErrors(parsed.fieldErrors);
        setMessage(parsed.message);
        return;
      }
      if (classicSignature) completeClassicWriteAttempt(classicWriteAttemptsRef.current, classicSignature);

      const savedValues = buildSavedValues(fields, values, result, descriptor);
      draftRevisionRef.current += 1;
      clearDocumentResolveTimers(documentResolveTimersRef.current);
      setBaseline(savedValues);
      setValues(savedValues);
      setFieldErrors({});
      setFieldWarnings({});
      acknowledgeSaved();
      invalidateRuntimeListEntity(entitySlug, isCreateMode ? "create" : "edit");
      if (isCreateMode) {
        const createdId = readRecordId(result);
        if (createdId) {
          window.location.href = detailHref ?? `/app/${encodeURIComponent(entitySlug)}/${encodeURIComponent(createdId)}`;
        }
        return;
      }

      void refreshSavedRecord(savedValues);
    } catch {
      setStatus("error");
      setFieldErrors({});
      setMessage(isCreateMode ? "Unable to create record." : "Unable to save changes.");
    }
  }

  async function refreshSavedRecord(currentValues: FormValues) {
    try {
      const response = await fetch(runtimePath.detail(entitySlug, recordId), {
        method: "GET",
        headers: { "Cache-Control": "no-cache" },
        cache: "no-store",
      });
      if (!response.ok) return;

      const latest = await readJson(response);
      const refreshedValues = buildSavedValues(fields, currentValues, latest, descriptor);
      setBaseline(refreshedValues);
      if (!isDirtyRef.current) {
        setValues(refreshedValues);
      }
    } catch {
      // The save already succeeded. A stale read-back should not turn the form red.
    }
  }

  if (fields.length === 0) {
    return <RuntimeEditState title="No editable fields" message="This entity does not expose editable fields." />;
  }

  // The document's "business clock" — drives DatePicker locale / timezone /
  // weekStart for every temporal field rendered below. Reads the form value
  // (not the original record) so a user changing company_code mid-edit gets
  // the new owner's locale applied immediately.
  const companyCodeIdValue = values["company_code_id"];
  const companyCodeId = typeof companyCodeIdValue === "string" && companyCodeIdValue.length > 0
    ? companyCodeIdValue
    : null;

  if (descriptor) {
    return (
      <RuntimeTemporalProvider companyCodeId={companyCodeId}>
      <form id={formId} className="flex flex-col gap-2.5" onSubmit={submit} onReset={reset}>
        {fieldGroups.map((group) => (
          <WorkPanel key={group.key} title={group.label}>
            <RuntimeFieldSet
              group={group}
              formValues={values}
              disabled={isSaving}
              fieldErrors={fieldErrors}
              fieldWarnings={fieldWarnings}
              contract={descriptor}
              recordId={recordId}
              record={record}
              surface="create"
              selectedOptionLabels={selectedOptionLabels}
              optionInvalidationEpochs={optionInvalidationEpochs}
              optionBatchContext={documentEditCoordinator ? {
                endpoint: documentEditCoordinator.endpoints.fieldOptionsBatch,
                permissionStamp: documentEditCoordinator.identity.permissionStamp,
              } : undefined}
              onFieldChange={(name, value) => {
                const matchedField = fields.find((f) => f.name === name);
                if (matchedField) updateField(matchedField, value);
              }}
            />
          </WorkPanel>
        ))}
        {actionsPlacement === "inline" ? (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={!isDirty || isSaving}
              className="inline-flex h-9 items-center rounded-md border bg-foreground px-4 text-sm font-medium text-background disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSaving ? (isCreateMode ? "Creating" : "Saving") : (isCreateMode ? "Create" : "Save")}
            </button>
            {isDirty ? (
              <button
                type="reset"
                disabled={isSaving}
                className="inline-flex h-9 items-center rounded-md border bg-background px-4 text-sm font-medium text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
              >
                Discard
              </button>
            ) : null}
            {isCreateMode ? (
              <a
                href={listHref ?? `/app/${entitySlug}`}
                className="inline-flex h-9 items-center rounded-md border bg-background px-4 text-sm font-medium text-foreground hover:bg-muted"
              >
                List
              </a>
            ) : detailHref ? (
              <a
                href={detailHref}
                className="inline-flex h-9 items-center rounded-md border bg-background px-4 text-sm font-medium text-foreground hover:bg-muted"
              >
                View
              </a>
            ) : null}
            {message ? (
              <span
                role={status === "error" ? "alert" : "status"}
                className={status === "error" ? "text-sm font-medium text-destructive" : "text-sm font-medium text-muted-foreground"}
              >
                {message}
              </span>
            ) : null}
          </div>
        ) : null}
      </form>
      </RuntimeTemporalProvider>
    );
  }

  return (
    <RuntimeTemporalProvider companyCodeId={companyCodeId}>
    <form id={formId} className="grid gap-3 md:grid-cols-2" onSubmit={submit} onReset={reset}>
      {fields.map((field) => {
        const inputId = fieldInputId(field);
        const labelId = `${inputId}-label`;
        const error = fieldErrors[field.name];
        const errorId = `${inputId}-error`;

        return (
          <div key={field.key} className="grid gap-1">
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
              value={values[field.name] ?? defaultFormValue(field)}
              disabled={isSaving}
              entitySlug={entitySlug}
              recordId={recordId}
              formValues={values}
              selectedOptionLabel={selectedOptionLabels[field.name]}
              optionInvalidationEpoch={optionInvalidationEpochs[field.name] ?? 0}
              optionBatchContext={documentEditCoordinator ? {
                endpoint: documentEditCoordinator.endpoints.fieldOptionsBatch,
                permissionStamp: documentEditCoordinator.identity.permissionStamp,
              } : undefined}
              ariaDescribedBy={error ? errorId : undefined}
              onChange={(value) => updateField(field, value)}
            />
            {error ? (
              <p id={errorId} className="text-xs text-destructive" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        );
      })}
      {actionsPlacement === "inline" ? (
        <div className="flex flex-wrap items-center gap-2 md:col-span-2">
          <button
            type="submit"
            disabled={!isDirty || isSaving}
            className="inline-flex h-9 items-center rounded-md border bg-foreground px-4 text-sm font-medium text-background disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? (isCreateMode ? "Creating" : "Saving") : (isCreateMode ? "Create" : "Save")}
          </button>
          {isDirty ? (
            <button
              type="reset"
              disabled={isSaving}
              className="inline-flex h-9 items-center rounded-md border bg-background px-4 text-sm font-medium text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              Discard
            </button>
          ) : null}
          {isCreateMode ? (
            <a
              href={listHref ?? `/app/${entitySlug}`}
              className="inline-flex h-9 items-center rounded-md border bg-background px-4 text-sm font-medium text-foreground hover:bg-muted"
            >
              List
            </a>
          ) : detailHref ? (
            <a
              href={detailHref}
              className="inline-flex h-9 items-center rounded-md border bg-background px-4 text-sm font-medium text-foreground hover:bg-muted"
            >
              View
            </a>
          ) : null}
          {message ? (
            <span
              role={status === "error" ? "alert" : "status"}
              className={status === "error" ? "text-sm font-medium text-destructive" : "text-sm font-medium text-muted-foreground"}
            >
              {message}
            </span>
          ) : null}
        </div>
      ) : null}
    </form>
    </RuntimeTemporalProvider>
  );
}

function buildSavedValues(
  fields: MetaEntityField[],
  fallback: FormValues,
  responseBody: unknown,
  descriptor: MetaEntityRuntimeDescriptor | undefined,
): FormValues {
  const savedRecord = readSavedRecord(responseBody);
  if (!savedRecord) return fallback;
  return withConcurrencyVersion(descriptor, {
    ...fallback,
    ...buildInitialValues(fields, savedRecord),
  }, savedRecord);
}

function withConcurrencyVersion(
  descriptor: MetaEntityRuntimeDescriptor | undefined,
  values: FormValues,
  record: RuntimeRecordRow | undefined,
): FormValues {
  const versionField = descriptor?.concurrency?.versionColumn ?? "row_version";
  const version = readRecordPrimitive(record, versionField);
  return version === null ? values : { ...values, [versionField]: version };
}

function readConcurrencyVersion(
  descriptor: MetaEntityRuntimeDescriptor | undefined,
  values: FormValues,
  record: RuntimeRecordRow | undefined,
): string | null {
  const versionField = descriptor?.concurrency?.versionColumn ?? "row_version";
  const value = values[versionField] ?? readRecordPrimitive(record, versionField);
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
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

function readSavedRecord(value: unknown): RuntimeRecordRow | undefined {
  if (!isRecord(value)) return undefined;
  const saved = value["record"];
  return (isRecord(saved) ? saved : value) as RuntimeRecordRow;
}

function readRecordId(value: unknown): string | undefined {
  const record = readSavedRecord(value) ?? (isRecord(value) ? value : undefined);
  if (!record) return undefined;
  const id = record["id"] ?? (isRecord(record["data"]) ? record["data"]["id"] : undefined);
  return typeof id === "string" && id.trim() ? id : undefined;
}

function runtimeRecordWriteHref(entitySlug: string, recordId: string, isCreateMode: boolean): string {
  if (isCreateMode) return runtimePath.create(entitySlug);
  return runtimePath.detail(entitySlug, recordId);
}

function shouldSubmitCreateValue(
  field: MetaEntityField,
  value: FormPrimitive,
  baselineValue: FormPrimitive | undefined,
): boolean {
  if (field.isRequired) return true;
  return !isEmptyFormValue(value) || !sameFormValue(value, baselineValue);
}

export function isEmptyFormValue(value: FormPrimitive): boolean {
  return typeof value === "string" ? value.trim() === "" : value === false;
}

export function RuntimeEditInput({
  field,
  inputId,
  labelId,
  value,
  disabled,
  entitySlug,
  recordId,
  formValues,
  selectedOptionLabel,
  optionInvalidationEpoch = 0,
  optionBatchContext,
  onChange,
  ariaDescribedBy,
}: {
  field: MetaEntityField;
  inputId: string;
  labelId: string;
  value: FormPrimitive;
  disabled: boolean;
  entitySlug: string;
  recordId: string;
  formValues: FormValues;
  selectedOptionLabel?: RuntimeOption;
  optionInvalidationEpoch?: number;
  optionBatchContext?: RuntimeOptionBatchContext;
  onChange: (value: FormPrimitive) => void;
  ariaDescribedBy?: string;
}) {
  const isDisabled = disabled || field.isComputed || field.isReadOnly;
  const control = resolveEditorControl(field);
  const optionSource = resolveOptionSource(field);
  const temporalCtx = useRuntimeTemporalContextOptional();

  // Period-gate hook — runs unconditionally so hook-order is stable, but the
  // returned predicate is a no-op (always false) unless this field actually
  // gates on the posting calendar.
  const gatePosting = field.affectsPostingPeriod === true;
  const { isDateDisabled: postingGate } = useIsPostingDateDisabled({
    companyCodeId: temporalCtx?.companyCodeId ?? null,
    fiscalYearStartMonth: temporalCtx?.fiscalYearStartMonth ?? null,
    businessTimeZone: temporalCtx?.businessTimeZone ?? "UTC",
    enabled: gatePosting,
  });

  // Temporal field branch — replaces the native <input type="date"|"datetime-local">.
  // Defaults: businessDate is inferred from data_type='date'; instant from 'timestamptz'.
  // Explicit `temporalKind` on the descriptor always wins. See @athyper/temporal::resolveTemporalKind.
  const temporal = resolveTemporalKind({
    dataType: field.dataType,
    temporalKind: field.temporalKind,
    displayMode: field.displayMode,
    affectsPostingPeriod: field.affectsPostingPeriod,
  });
  const editorWantsTemporal = control === "date" || control === "datetime";

  // ZonedDateTime branch — object-valued, JSON-serialised through FormPrimitive.
  if (temporal.status === "resolved" && temporal.kind === "zonedDateTime") {
    const objectValue = parseZonedFormValue(value);
    return (
      <ZonedDateTimePicker
        id={inputId}
        value={objectValue}
        onChange={(next) => onChange(next ? JSON.stringify(next) : "")}
        disabled={isDisabled}
        locale={temporalCtx?.businessLocale ?? temporalCtx?.userLocale}
        defaultTimeZone={temporalCtx?.businessTimeZone ?? temporalCtx?.userTimeZone ?? "UTC"}
        weekStart={temporalCtx?.businessWeekStart}
        size="sm"
      />
    );
  }

  if (
    (temporal.status === "resolved" && temporal.kind !== "zonedDateTime") ||
    (editorWantsTemporal && temporal.status !== "resolved")
  ) {
    const kind = temporal.status === "resolved"
      ? (temporal.kind as "businessDate" | "instant")
      : (control === "datetime" ? "instant" : "businessDate");
    const stringValue = typeof value === "string" ? value : "";
    const locale = kind === "businessDate"
      ? (temporalCtx?.businessLocale ?? temporalCtx?.userLocale)
      : (temporalCtx?.userLocale ?? temporalCtx?.businessLocale);
    const timeZone = kind === "businessDate"
      ? (temporalCtx?.businessTimeZone ?? temporalCtx?.userTimeZone ?? "UTC")
      : (temporalCtx?.userTimeZone ?? temporalCtx?.businessTimeZone ?? "UTC");
    const dateFormat = kind === "businessDate"
      ? (temporalCtx?.businessDateFormat ?? temporalCtx?.userDateFormat)
      : undefined;
    return (
      <DatePicker
        id={inputId}
        kind={kind}
        value={stringValue || null}
        onChange={(next) => onChange(next ?? "")}
        disabled={isDisabled}
        locale={locale}
        timeZone={timeZone}
        weekStart={temporalCtx?.businessWeekStart}
        dateFormat={dateFormat}
        isDateDisabled={gatePosting && kind === "businessDate" ? postingGate : undefined}
        // Compact so the popover fits above/below fields in dense document forms
        // without the pager row clipping against the viewport top.
        size="sm"
      />
    );
  }

  if (optionSource || control === "select" || control === "combobox" || control === "reference_picker") {
    return (
      <RuntimeOptionChooser
        field={field}
        inputId={inputId}
        labelId={labelId}
        value={typeof value === "boolean" ? String(value) : value}
        disabled={isDisabled}
        entitySlug={entitySlug}
        recordId={recordId}
        formValues={formValues}
        placeholder={`Select ${field.label}`}
        selectedOptionLabel={selectedOptionLabel}
        optionInvalidationEpoch={optionInvalidationEpoch}
        optionBatchContext={optionBatchContext}
        ariaDescribedBy={ariaDescribedBy}
        onChange={(next) => onChange(next ?? "")}
      />
    );
  }

  if (control === "checkbox" || isBooleanField(field)) {
    return (
      <input
        type="checkbox"
        id={inputId}
        name={field.name}
        disabled={isDisabled}
        checked={value === true}
        onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.checked)}
        aria-labelledby={labelId}
        aria-describedby={ariaDescribedBy}
        className="h-4 w-4 rounded border bg-background text-foreground disabled:bg-muted disabled:text-muted-foreground"
      />
    );
  }

  if (control === "textarea" || control === "json") {
    return (
      <textarea
        id={inputId}
        name={field.name}
        required={field.isRequired}
        disabled={isDisabled}
        value={typeof value === "boolean" ? (value ? "true" : "false") : value}
        onChange={(event: ChangeEvent<HTMLTextAreaElement>) => onChange(event.target.value)}
        aria-labelledby={labelId}
        aria-describedby={ariaDescribedBy}
        rows={control === "json" ? 5 : 3}
        className="min-h-24 rounded-md border bg-background px-3 py-2 text-sm font-normal text-foreground placeholder:text-muted-foreground disabled:bg-muted disabled:text-muted-foreground"
      />
    );
  }

  const input = (
    <input
      id={inputId}
      type={inputType(field, control)}
      name={field.name}
      required={field.isRequired}
      disabled={isDisabled}
      value={typeof value === "boolean" ? (value ? "true" : "false") : value}
      onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value)}
      aria-labelledby={labelId}
      aria-describedby={ariaDescribedBy}
      className="h-9 rounded-md border bg-background px-3 text-sm font-normal text-foreground placeholder:text-muted-foreground disabled:bg-muted disabled:text-muted-foreground"
    />
  );

  if (isFxExchangeRateField(field)) {
    return (
      <FxExchangeRateInputShell value={value} field={field} formData={formValues}>
        {input}
      </FxExchangeRateInputShell>
    );
  }

  return input;
}

function RuntimeOptionChooser({
  field,
  inputId,
  labelId,
  value,
  disabled,
  entitySlug,
  recordId,
  formValues,
  placeholder,
  selectedOptionLabel,
  optionInvalidationEpoch = 0,
  optionBatchContext,
  ariaDescribedBy,
  onChange,
}: {
  field: MetaEntityField;
  inputId: string;
  labelId: string;
  value: string;
  disabled: boolean;
  entitySlug: string;
  recordId: string;
  formValues: FormValues;
  placeholder: string;
  selectedOptionLabel?: RuntimeOption;
  optionInvalidationEpoch?: number;
  optionBatchContext?: RuntimeOptionBatchContext;
  ariaDescribedBy?: string;
  onChange: (value: string | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<RuntimeOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const loadSequence = useRef(0);
  const dependencySignature = useMemo(
    () => optionDependencySignature(field, formValues),
    [field, formValues],
  );
  const selectedLabelMatches = Boolean(selectedOptionLabel && selectedOptionLabel.value === value);

  useEffect(() => {
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!open && (!value || selectedLabelMatches)) return;
    if (searchTimer.current) clearTimeout(searchTimer.current);

    searchTimer.current = setTimeout(() => {
      void loadOptions(query, value, buildOptionRequestContext(field, formValues, recordId));
    }, open ? 180 : 0);

    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [open, query, value, dependencySignature, field, recordId, selectedLabelMatches, optionInvalidationEpoch]);

  useEffect(() => {
    if (open) {
      window.setTimeout(() => searchRef.current?.focus(), 0);
    }
  }, [open]);

  async function loadOptions(
    nextQuery: string,
    selectedValue: string,
    context: Record<string, string>,
  ) {
    const requestId = loadSequence.current + 1;
    loadSequence.current = requestId;
    abortRef.current?.abort();
    const abortController = new AbortController();
    abortRef.current = abortController;
    setError(null);

    try {
      const params = new URLSearchParams();
      if (nextQuery.trim()) params.set("q", nextQuery.trim());
      if (selectedValue) params.set("value", selectedValue);
      for (const [key, item] of Object.entries(context)) {
        if (item) params.set(`context.${key}`, item);
      }

      const cacheKey = buildRuntimeOptionCacheKey({
        entitySlug,
        fieldName: field.name,
        query: nextQuery,
        selectedValue,
        context,
        invalidationEpoch: optionInvalidationEpoch,
      });
      const cachedOptions = readRuntimeOptionCache(cacheKey);
      if (cachedOptions) {
        incrementDocumentEditTelemetryCounter("options.cache_hit");
        if (requestId !== loadSequence.current) return;
        setOptions(cachedOptions);
        setLoading(false);
        return;
      }

      setLoading(true);
      const loaded = await fetchRuntimeOptionsCached({
        cacheKey,
        entitySlug,
        fieldName: field.name,
        params,
        ttlMs: nextQuery.trim() ? RUNTIME_OPTION_SEARCH_CACHE_TTL_MS : RUNTIME_OPTION_SELECTED_CACHE_TTL_MS,
        batchContext: optionBatchContext,
        signal: abortController.signal,
      });
      if (requestId !== loadSequence.current) return;
      setOptions(loaded);
    } catch (err) {
      if (isAbortError(err)) return;
      if (requestId !== loadSequence.current) return;
      setOptions([]);
      setError(err instanceof Error ? err.message : "Options are unavailable.");
    } finally {
      if (requestId === loadSequence.current) setLoading(false);
    }
  }

  function closeIfFocusLeaves(event: FocusEvent<HTMLDivElement>) {
    if (!containerRef.current?.contains(event.relatedTarget as Node | null)) {
      setOpen(false);
      setQuery("");
    }
  }

  function selectOption(nextValue: string | null) {
    onChange(nextValue);
    setOpen(false);
    setQuery("");
  }

  const selectedOption = options.find((option) => option.value === value)
    ?? (selectedLabelMatches ? selectedOptionLabel : undefined);
  const displayValue = selectedOption?.label ?? (value ? compactUnknownValue(value) : placeholder);
  const valueId = `${inputId}-value`;

  return (
    <div ref={containerRef} className="relative" onBlur={closeIfFocusLeaves}>
      <button
        id={inputId}
        type="button"
        disabled={disabled}
        aria-labelledby={`${labelId} ${valueId}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-describedby={ariaDescribedBy}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className="flex h-9 w-full items-center justify-between rounded-md border bg-background px-3 text-left text-sm font-normal text-foreground disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
      >
        <span id={valueId} className={value ? "truncate" : "truncate text-muted-foreground"}>{displayValue}</span>
        <span className="ml-2 text-xs text-muted-foreground" aria-hidden="true">v</span>
      </button>

      {open ? (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border bg-background shadow-lg">
          <div className="border-b p-2">
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`Search ${field.label}`}
              className="h-8 w-full rounded-md border bg-background px-2 text-sm"
            />
          </div>
          <div className="max-h-64 overflow-auto p-1" role="listbox">
            {loading ? (
              <div className="px-3 py-4 text-center text-sm text-muted-foreground">Loading...</div>
            ) : error ? (
              <div className="px-3 py-4 text-center text-sm text-destructive">{error}</div>
            ) : options.length === 0 ? (
              <div className="px-3 py-4 text-center text-sm text-muted-foreground">No options found.</div>
            ) : (
              options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  disabled={option.disabled}
                  role="option"
                  aria-selected={option.value === value}
                  onPointerDown={(event) => {
                    event.preventDefault();
                    if (option.disabled) return;
                    selectOption(option.value);
                  }}
                  className="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="truncate font-medium">
                    {option.value === value ? "Selected: " : ""}
                    {option.label}
                  </span>
                  {option.description ? (
                    <span className="max-w-56 truncate text-xs text-muted-foreground">{option.description}</span>
                  ) : null}
                </button>
              ))
            )}
          </div>
          {!field.isRequired && value ? (
            <div className="border-t p-1">
              <button
                type="button"
                onPointerDown={(event) => {
                  event.preventDefault();
                  selectOption(null);
                }}
                className="w-full rounded-sm px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-muted"
              >
                Clear selection
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function optionDependencySignature(field: MetaEntityField, formValues: FormValues): string {
  return optionDependencyFields(field)
    .map((name) => `${name}:${String(formValues[name] ?? "")}`)
    .join("|");
}

function buildOptionRequestContext(
  field: MetaEntityField,
  formValues: FormValues,
  recordId: string,
): Record<string, string> {
  const context: Record<string, string> = { id: recordId };
  for (const fieldName of optionDependencyFields(field)) {
    const value = formValues[fieldName];
    if (value !== "" && value !== false && value !== undefined) {
      context[fieldName] = String(value);
    }
  }
  return context;
}

function buildRuntimeOptionCacheKey(input: {
  entitySlug: string;
  fieldName: string;
  query: string;
  selectedValue: string;
  context: Record<string, string>;
  invalidationEpoch: number;
}): string {
  const contextKey = Object.keys(input.context)
    .sort()
    .map((key) => `${key}=${input.context[key]}`)
    .join("&");
  return [
    input.entitySlug,
    input.fieldName,
    input.query.trim(),
    input.selectedValue,
    contextKey,
    String(input.invalidationEpoch),
  ].join("::");
}

function readRuntimeOptionCache(cacheKey: string): RuntimeOption[] | null {
  const cached = runtimeOptionCache.get(cacheKey);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    runtimeOptionCache.delete(cacheKey);
    return null;
  }
  return cached.options;
}

function writeRuntimeOptionCache(cacheKey: string, options: RuntimeOption[], ttlMs: number) {
  pruneRuntimeOptionCache();
  runtimeOptionCache.set(cacheKey, {
    expiresAt: Date.now() + ttlMs,
    options,
  });
}

function pruneRuntimeOptionCache() {
  const now = Date.now();
  for (const [key, entry] of runtimeOptionCache) {
    if (entry.expiresAt <= now) runtimeOptionCache.delete(key);
  }
  while (runtimeOptionCache.size >= RUNTIME_OPTION_CACHE_MAX_ENTRIES) {
    const firstKey = runtimeOptionCache.keys().next().value as string | undefined;
    if (!firstKey) break;
    runtimeOptionCache.delete(firstKey);
  }
}

function clearRuntimeOptionCacheForField(entitySlug: string, fieldName: string) {
  const prefix = `${entitySlug}::${fieldName}::`;
  for (const key of runtimeOptionCache.keys()) {
    if (key.startsWith(prefix)) runtimeOptionCache.delete(key);
  }
  for (const key of runtimeOptionInflight.keys()) {
    if (key.startsWith(prefix)) runtimeOptionInflight.delete(key);
  }
}

/** @internal Exported for focused transport regression tests; not part of the package entry point. */
export async function fetchRuntimeOptionsCached(input: RuntimeOptionFetchInput): Promise<RuntimeOption[]> {
  const existing = runtimeOptionInflight.get(input.cacheKey);
  if (existing) {
    incrementDocumentEditTelemetryCounter("options.inflight_dedupe_hit");
    return waitForRuntimeOptionPromise(existing, input.signal);
  }
  if (input.batchContext) {
    incrementDocumentEditTelemetryCounter("options.batch_enqueued");
  } else {
    incrementDocumentEditTelemetryCounter("options.network_fetch");
  }

  const promise = (
    input.batchContext
      ? enqueueRuntimeOptionBatch(input)
      : fetchRuntimeOptionList(input.entitySlug, input.fieldName, input.params, input.signal)
  )
    .then((options) => {
      writeRuntimeOptionCache(input.cacheKey, options, input.ttlMs);
      return options;
    })
    .finally(() => {
      runtimeOptionInflight.delete(input.cacheKey);
    });

  runtimeOptionInflight.set(input.cacheKey, promise);
  return waitForRuntimeOptionPromise(promise, input.signal);
}

function enqueueRuntimeOptionBatch(input: RuntimeOptionFetchInput): Promise<RuntimeOption[]> {
  const batchContext = input.batchContext;
  if (!batchContext) return fetchRuntimeOptionList(input.entitySlug, input.fieldName, input.params);

  return new Promise<RuntimeOption[]>((resolve, reject) => {
    const queueKey = `${batchContext.endpoint}::${batchContext.permissionStamp ?? ""}`;
    const queue = runtimeOptionBatchQueues.get(queueKey) ?? { timer: null, items: [] };
    const requestId = `opt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const item: RuntimeOptionBatchQueueItem = { input, requestId, aborted: false, resolve, reject };
    queue.items.push(item);
    if (input.signal) {
      const abort = () => {
        item.aborted = true;
        reject(createAbortError());
      };
      if (input.signal.aborted) abort();
      else {
        input.signal.addEventListener("abort", abort, { once: true });
        item.detachAbort = () => input.signal?.removeEventListener("abort", abort);
      }
    }
    if (!queue.timer) {
      queue.timer = setTimeout(() => {
        void flushRuntimeOptionBatch(queueKey);
      }, 0);
    }
    runtimeOptionBatchQueues.set(queueKey, queue);
  });
}

async function flushRuntimeOptionBatch(queueKey: string): Promise<void> {
  const queue = runtimeOptionBatchQueues.get(queueKey);
  if (!queue) return;
  runtimeOptionBatchQueues.delete(queueKey);
  if (queue.timer) clearTimeout(queue.timer);
  if (queue.items.length === 0) return;

  const activeItems = queue.items.filter((item) => !item.aborted);
  if (activeItems.length === 0) return;

  const batchContext = activeItems[0]?.input.batchContext;
  if (!batchContext) {
    await Promise.all(activeItems.map(async (item) => {
      try {
        item.resolve(await fetchRuntimeOptionList(item.input.entitySlug, item.input.fieldName, item.input.params, item.input.signal));
      } catch (error) {
        item.reject(error);
      }
    }));
    return;
  }

  incrementDocumentEditTelemetryCounter("options.batch_network_fetch");
  incrementDocumentEditTelemetryCounter("options.batch_item_count", activeItems.length);

  const batchAbortController = new AbortController();
  const abortBatchWhenUnused = () => {
    if (activeItems.every((item) => item.aborted)) batchAbortController.abort();
  };
  for (const item of activeItems) {
    item.input.signal?.addEventListener("abort", abortBatchWhenUnused, { once: true });
  }

  try {
    const response = await csrfFetch(batchContext.endpoint, {
      method: "POST",
      cache: "no-store",
      credentials: "include",
      signal: batchAbortController.signal,
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        ...(batchContext.permissionStamp
          ? { "x-document-edit-permission-stamp": batchContext.permissionStamp }
          : {}),
      },
      body: JSON.stringify({
        requests: activeItems.map((item) => ({
          requestId: item.requestId,
          fieldName: item.input.fieldName,
          query: item.input.params.get("q") ?? "",
          value: item.input.params.get("value") ?? "",
          context: runtimeOptionContextFromParams(item.input.params),
        })),
      }),
    });
    const body = await readJson(response);
    if (response.status === 403 && isRecord(body) && body["error"] === "CSRF_VALIDATION_FAILED") {
      incrementDocumentEditTelemetryCounter("options.batch_security_failure");
      throw new RuntimeOptionSecurityError();
    }
    if (!response.ok) throw new Error(readErrorMessage(body, response.status));
    const results = isRecord(body) && Array.isArray(body["results"]) ? body["results"] : [];
    const byId = new Map<string, Record<string, unknown>>();
    for (const result of results) {
      if (!isRecord(result)) continue;
      const requestId = typeof result["requestId"] === "string" ? result["requestId"] : "";
      if (requestId) byId.set(requestId, result);
    }

    for (const item of activeItems) {
      if (item.aborted) continue;
      const result = byId.get(item.requestId);
      if (!result) {
        item.reject(new Error("Field options batch response did not include this request."));
        continue;
      }
      if (result["ok"] === false) {
        item.reject(new Error(readRuntimeOptionBatchMessage(result)));
        continue;
      }
      const options = Array.isArray(result["options"])
        ? result["options"].filter(isRuntimeOption)
        : [];
      item.resolve(options);
    }
  } catch (error) {
    for (const item of activeItems) {
      if (!item.aborted) item.reject(error);
    }
  } finally {
    for (const item of activeItems) {
      item.detachAbort?.();
      item.input.signal?.removeEventListener("abort", abortBatchWhenUnused);
    }
  }
}

function waitForRuntimeOptionPromise(
  promise: Promise<RuntimeOption[]>,
  signal?: AbortSignal,
): Promise<RuntimeOption[]> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(createAbortError());
  return new Promise((resolve, reject) => {
    const abort = () => reject(createAbortError());
    signal.addEventListener("abort", abort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", abort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      },
    );
  });
}

/** @internal Test isolation for the module-level cache and event-loop queue. */
export function resetRuntimeOptionTransportForTest(): void {
  for (const queue of runtimeOptionBatchQueues.values()) {
    if (queue.timer) clearTimeout(queue.timer);
  }
  runtimeOptionBatchQueues.clear();
  runtimeOptionInflight.clear();
  runtimeOptionCache.clear();
}

function createAbortError(): DOMException {
  return new DOMException("The option request was aborted.", "AbortError");
}

function runtimeOptionContextFromParams(params: URLSearchParams): Record<string, string> {
  const context: Record<string, string> = {};
  for (const [key, value] of params.entries()) {
    if (key.startsWith("context.") && value) {
      context[key.slice("context.".length)] = value;
    }
  }
  return context;
}

function readRuntimeOptionBatchMessage(result: Record<string, unknown>): string {
  return typeof result["message"] === "string"
    ? result["message"]
    : "Field options batch item failed.";
}

async function fetchRuntimeOptionList(
  entitySlug: string,
  fieldName: string,
  params: URLSearchParams,
  signal?: AbortSignal,
): Promise<RuntimeOption[]> {
  const response = await fetch(
    `${runtimePath.fieldOptions(entitySlug, fieldName)}?${params}`,
    { cache: "no-store", signal },
  );
  const body = await readJson(response);
  if (!response.ok) throw new Error(readErrorMessage(body, response.status));
  return isRecord(body) && Array.isArray(body["options"])
    ? body["options"].filter(isRuntimeOption)
    : [];
}

function optionDependencyFields(field: MetaEntityField): string[] {
  const fields = new Set<string>();
  const source = field.editor?.optionSource ?? field.optionSource;
  if (source?.kind === "reference" && source.dependsOn?.field) {
    fields.add(source.dependsOn.field);
  }

  for (const config of [field.referenceConfig, field.lookupConfig]) {
    const dependency = readRecord(config, "dependent_filter");
    const sourceField =
      readString(dependency, "source_field")
      ?? readString(dependency, "sourceField")
      ?? readString(dependency, "field");
    if (sourceField) fields.add(sourceField);
  }

  return [...fields].sort();
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function buildDocumentResolveConfigByField(
  contract: DocumentEditRuntimeContract | undefined,
): Map<string, DocumentResolveFieldConfig> {
  const byField = new Map<string, DocumentResolveFieldConfig>();
  if (!contract) return byField;

  for (const dependency of contract.fieldDependencies) {
    rememberDocumentResolveField(byField, dependency.sourceField, dependency.debounceMs);
  }

  for (const optionField of contract.optionFields) {
    for (const sourceField of optionField.dependsOn) {
      rememberDocumentResolveField(byField, sourceField, optionField.debounceMs);
    }
  }

  for (const role of contract.addressRoles) {
    for (const sourceField of [...role.ownerInputs, ...role.invalidateOn]) {
      rememberDocumentResolveField(byField, sourceField, 250);
    }
  }

  return byField;
}

function rememberDocumentResolveField(
  byField: Map<string, DocumentResolveFieldConfig>,
  fieldName: string,
  debounceMs: number,
) {
  const existing = byField.get(fieldName);
  byField.set(fieldName, {
    debounceMs: existing ? Math.min(existing.debounceMs, debounceMs) : debounceMs,
  });
}

export function readSelectedOptionLabels(core: unknown): Record<string, RuntimeOption | undefined> {
  if (!isRecord(core)) return {};
  const selected = core["selectedOptionLabels"];
  if (!isRecord(selected)) return {};

  const out: Record<string, RuntimeOption | undefined> = {};
  for (const [key, value] of Object.entries(selected)) {
    if (!isRecord(value)) continue;
    const fieldName = readString(value, "field") ?? key;
    const rawValue = value["value"];
    const label = readString(value, "label");
    if (rawValue === null || rawValue === undefined || !label) continue;
    out[fieldName] = {
      value: String(rawValue),
      label,
      description: readString(value, "code") ?? readString(value, "source"),
    };
  }
  return out;
}

function buildSectionVersionMap(contract: DocumentEditRuntimeContract): Record<string, string> {
  const versions: Record<string, string> = {};
  for (const section of contract.sections) {
    if (section.versionRef) versions[section.key] = section.versionRef;
  }
  return versions;
}

function buildDocumentResolveUpdates(response: ResolveChangeResponse): Record<string, unknown> {
  const updates: Record<string, unknown> = {};
  for (const field of response.clearedFields) updates[field] = "";
  for (const [key, value] of Object.entries(response.patch)) updates[key] = value;
  return updates;
}

function documentResolveWarning(response: ResolveChangeResponse): string {
  if (response.category === "conflict") return "This change needs a refresh before dependent values can be recalculated.";
  if (response.category === "forbidden") return "Dependent values could not be recalculated with your current access.";
  if (response.category === "timeout") return "Dependent values are taking longer than expected. You can continue editing.";
  return "Dependent values could not be recalculated yet.";
}

function toJsonObject(values: FormValues): Record<string, unknown> {
  return { ...values };
}

function createDocumentEditTabId(): string {
  return `tab_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function createDocumentEditIdempotencyKey(tabId: string, clientSeq: number, fieldName: string): string {
  return `chg_${tabId}_${clientSeq}_${fieldName.replace(/[^a-zA-Z0-9_]+/g, "_")}`;
}

function clearDocumentResolveTimers(timers: Record<string, ReturnType<typeof setTimeout>>) {
  for (const timer of Object.values(timers)) clearTimeout(timer);
  for (const key of Object.keys(timers)) delete timers[key];
}

export function RuntimeEditState({
  title,
  message,
  children,
}: {
  title?: string;
  message?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex min-h-40 items-center justify-center rounded-md border bg-background p-6 text-center">
      {children ?? (
        <div>
          {title && <p className="font-medium text-foreground">{title}</p>}
          {message && <p className="mt-1 text-sm text-muted-foreground">{message}</p>}
        </div>
      )}
    </div>
  );
}

export function buildInitialValues(fields: MetaEntityField[], record: RuntimeRecordRow | undefined): FormValues {
  const values: FormValues = {};
  for (const field of fields) {
    values[field.name] = toFormValue(field, record ? readMetaEntityRecordValue(record, field) : field.defaultValue);
  }
  return values;
}

function toFormValue(field: MetaEntityField, value: unknown): FormPrimitive {
  if (isBooleanField(field)) return toBooleanInputValue(value);
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) return value.join(", ");
  if (isRecord(value)) return JSON.stringify(value);
  return String(value);
}

export function defaultFormValue(field: MetaEntityField): FormPrimitive {
  return isBooleanField(field) ? false : "";
}

export function fieldInputId(field: MetaEntityField): string {
  return `runtime-edit-${field.name.replace(/[^a-zA-Z0-9_-]+/g, "-")}`;
}

function resolveEditorControl(field: MetaEntityField): string | undefined {
  return field.editor?.control;
}

function resolveOptionSource(field: MetaEntityField): "lookup" | "reference" | "static" | "lifecycle" | null {
  const declared = field.editor?.optionSource ?? field.optionSource;
  if (declared?.kind === "lookup" || declared?.kind === "reference" || declared?.kind === "static" || declared?.kind === "lifecycle") {
    return declared.kind;
  }

  const dataType = field.dataType.toLowerCase();
  if (
    field.enumDomainCode
    || readString(field.lookupConfig, "domain_code")
    || readString(field.lookupConfig, "domainCode")
    || readString(field.lookupConfig, "lookup_domain")
    || readString(field.lookupConfig, "lookupDomain")
    || readString(field.lookupConfig, "domain")
    || dataType === "enum"
    || dataType === "lifecycle_state"
    || hasStringArray(field.constraints, "options")
    || hasStringArray(field.constraints, "values")
    || hasStringArray(field.validation, "options")
    || hasStringArray(field.validation, "values")
  ) {
    return "lookup";
  }

  if (
    field.referenceEntity
    || field.referenceConfig
    || dataType === "reference"
  ) {
    return "reference";
  }

  return null;
}

function isRuntimeOption(value: unknown): value is RuntimeOption {
  if (!isRecord(value)) return false;
  return typeof value["value"] === "string" && typeof value["label"] === "string";
}

function compactUnknownValue(value: string): string {
  return value.length > 18 ? `${value.slice(0, 8)}...${value.slice(-6)}` : value;
}

function readString(value: unknown, key: string): string | undefined {
  if (!isRecord(value)) return undefined;
  const item = value[key];
  return typeof item === "string" && item.trim() ? item.trim() : undefined;
}

function readRecord(value: unknown, key: string): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  const item = value[key];
  return isRecord(item) ? item : null;
}

function hasStringArray(value: unknown, key: string): boolean {
  if (!isRecord(value)) return false;
  const item = value[key];
  return Array.isArray(item) && item.some((entry) => typeof entry === "string");
}

export function parseFieldValue(field: MetaEntityField, value: FormPrimitive): { status: "ready"; value: unknown } | { status: "error"; message: string } {
  if (isBooleanField(field)) return { status: "ready", value: value === true };

  const text = typeof value === "string" ? value : String(value);
  const dataType = field.dataType.toLowerCase();
  if (text === "" && !field.isRequired) return { status: "ready", value: null };

  if (["integer", "bigint"].includes(dataType)) {
    const parsed = Number.parseInt(text, 10);
    return Number.isFinite(parsed)
      ? { status: "ready", value: parsed }
      : { status: "error", message: `${field.label} must be a whole number.` };
  }

  if (["decimal", "numeric", "money"].includes(dataType)) {
    const parsed = Number(text);
    return Number.isFinite(parsed)
      ? { status: "ready", value: parsed }
      : { status: "error", message: `${field.label} must be a number.` };
  }

  if (dataType === "json" || dataType === "jsonb") {
    try {
      return { status: "ready", value: JSON.parse(text) as unknown };
    } catch {
      return { status: "error", message: `${field.label} must be valid JSON.` };
    }
  }

  return { status: "ready", value: text };
}

/**
 * ZonedDateTimePicker holds object values, but FormPrimitive is string|boolean.
 * The form serialises zonedDateTime as JSON. This helper parses the form
 * cell back into the object shape; returns null on any malformed input so
 * the picker treats it as empty (server will reject anything not matching
 * the wire schema anyway).
 */
function parseZonedFormValue(value: FormPrimitive): ZonedDateTimeValue | null {
  if (typeof value !== "string" || value.length === 0) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (parsed && typeof parsed === "object"
      && typeof (parsed as { localDateTime?: unknown }).localDateTime === "string"
      && typeof (parsed as { timeZone?: unknown }).timeZone === "string") {
      const obj = parsed as { localDateTime: string; timeZone: string };
      return { localDateTime: obj.localDateTime, timeZone: obj.timeZone };
    }
  } catch {
    // fall through
  }
  return null;
}

function inputType(field: MetaEntityField, control?: string): string {
  // Temporal (date / datetime / timestamptz) fields no longer pass through here —
  // they're handled by the DatePicker branch in RuntimeEditInput. Keeping the
  // legacy strings here would create a sneaky fallback path. Throw in dev so
  // anything that *does* reach this for a temporal field surfaces loudly.
  if (control === "number") return "number";

  const dataType = field.dataType.toLowerCase();
  if (["integer", "bigint", "decimal", "numeric", "money"].includes(dataType)) return "number";
  return "text";
}

function isFxExchangeRateField(field: MetaEntityField): boolean {
  return field.uiType === "fx_exchange_rate";
}

function isBooleanField(field: MetaEntityField): boolean {
  const dataType = field.dataType.toLowerCase();
  return dataType === "boolean" || dataType === "bool" || field.uiType === "checkbox";
}

function toBooleanInputValue(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.toLowerCase() === "true" || value.toLowerCase() === "yes";
  if (typeof value === "number") return value !== 0;
  return false;
}

function sameFormValue(left: FormPrimitive | undefined, right: FormPrimitive | undefined): boolean {
  return left === right;
}

function applyValueUpdates(current: FormValues, updates: Record<string, unknown>): FormValues {
  const next = { ...current };
  for (const [key, value] of Object.entries(updates)) {
    next[key] = coerceFormPrimitive(value);
  }
  return next;
}

function coerceFormPrimitive(value: unknown): FormPrimitive {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value;
  if (isRecord(value)) return JSON.stringify(value);
  return String(value);
}

function isBlankFormValue(value: unknown): boolean {
  return value === null || value === undefined || value === "";
}

export async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json() as unknown;
  } catch {
    return null;
  }
}

export function readErrorMessage(value: unknown, status: number): string {
  if (isRecord(value) && typeof value["message"] === "string") return value["message"];
  return `Save failed with status ${status}.`;
}

export function getCookie(name: string): string {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${escapedName}=([^;]+)`));
  return match ? decodeURIComponent(match[1] ?? "") : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
