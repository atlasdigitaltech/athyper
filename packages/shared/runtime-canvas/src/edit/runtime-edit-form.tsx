"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FocusEvent, type FormEvent, type ReactNode } from "react";
import type { MetaEntityField, MetaEntityRuntimeDescriptor } from "@athyper/runtime-contracts";
import {
  buildMetaEntityFieldGroups,
  parseRuntimeWriteError,
  readRecordValue as readMetaEntityRecordValue,
  type RuntimeFieldGroupModel,
} from "@athyper/runtime-shared/meta-entity";
import { WorkPanel } from "@athyper/surface-kit";
import type { RuntimeRecordRow } from "@athyper/runtime-shared/core";
import {
  runtimeEditFormDomId,
  useRuntimeEditFormActionPublisher,
} from "./runtime-edit-form-actions";
import { RuntimeFieldSet } from "./runtime-field-set";

export type FormPrimitive = string | boolean;
export type FormValues = Record<string, FormPrimitive>;

interface RuntimeOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
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
  const initialValues = useMemo(
    () => withConcurrencyVersion(descriptor, buildInitialValues(fields, record), record),
    [descriptor, fields, record],
  );
  const [baseline, setBaseline] = useState<FormValues>(initialValues);
  const [values, setValues] = useState<FormValues>(initialValues);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState<string>("");
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      setBaseline(initialValues);
      setValues(initialValues);
    }
  }, [initialValues]);

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
    setValues((current) => ({ ...current, [field.name]: value }));
    if (fieldErrors[field.name]) {
      setFieldErrors((current) => {
        const next = { ...current };
        delete next[field.name];
        return next;
      });
    }
    setStatus("idle");
    setMessage("");
  }

  function revertChanges() {
    clearSavedTimer();
    setValues(baseline);
    setFieldErrors({});
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

      const savedValues = buildSavedValues(fields, values, result, descriptor);
      setBaseline(savedValues);
      setValues(savedValues);
      setFieldErrors({});
      acknowledgeSaved();
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
      const response = await fetch(`/api/runtime-records/${encodeURIComponent(entitySlug)}/${encodeURIComponent(recordId)}`, {
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

  if (descriptor) {
    return (
      <form id={formId} className="flex flex-col gap-2.5" onSubmit={submit} onReset={reset}>
        {fieldGroups.map((group) => (
          <WorkPanel key={group.key} title={group.label}>
            <RuntimeFieldSet
              group={group}
              formValues={values}
              disabled={isSaving}
              fieldErrors={fieldErrors}
              contract={descriptor}
              recordId={recordId}
              record={record}
              surface="create"
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
                Revert
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
    );
  }

  return (
    <form id={formId} className="grid gap-3 md:grid-cols-2" onSubmit={submit} onReset={reset}>
      {fields.map((field) => {
        const inputId = fieldInputId(field);
        const labelId = `${inputId}-label`;
        const error = fieldErrors[field.name];
        const errorId = `${inputId}-error`;

        return (
          <div key={field.key} className="grid gap-1 text-sm">
            <span id={labelId} className="font-medium text-foreground">{field.label}</span>
            <RuntimeEditInput
              field={field}
              inputId={inputId}
              labelId={labelId}
              value={values[field.name] ?? defaultFormValue(field)}
              disabled={isSaving}
              entitySlug={entitySlug}
              recordId={recordId}
              formValues={values}
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
              Revert
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
  if (!descriptor?.concurrency || descriptor.concurrency.strategy === "none") return values;
  const versionField = descriptor.concurrency.versionColumn ?? "row_version";
  const version = readRecordPrimitive(record, versionField);
  return version === null ? values : { ...values, [versionField]: version };
}

function readConcurrencyVersion(
  descriptor: MetaEntityRuntimeDescriptor | undefined,
  values: FormValues,
  record: RuntimeRecordRow | undefined,
): string | null {
  if (!descriptor?.concurrency || descriptor.concurrency.strategy === "none") return null;
  const versionField = descriptor.concurrency.versionColumn ?? "row_version";
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
  return isRecord(saved) ? saved : undefined;
}

function readRecordId(value: unknown): string | undefined {
  const record = readSavedRecord(value) ?? (isRecord(value) ? value : undefined);
  if (!record) return undefined;
  const id = record["id"] ?? (isRecord(record["data"]) ? record["data"]["id"] : undefined);
  return typeof id === "string" && id.trim() ? id : undefined;
}

function runtimeRecordWriteHref(entitySlug: string, recordId: string, isCreateMode: boolean): string {
  const encodedEntity = encodeURIComponent(entitySlug);
  if (isCreateMode) return `/api/runtime-records/${encodedEntity}`;
  return `/api/runtime-records/${encodedEntity}/${encodeURIComponent(recordId)}`;
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
  onChange: (value: FormPrimitive) => void;
  ariaDescribedBy?: string;
}) {
  const isDisabled = disabled || field.isComputed || field.isReadOnly;
  const control = resolveEditorControl(field);
  const optionSource = resolveOptionSource(field);

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
        className="min-h-24 rounded-md border bg-background px-3 py-2 text-sm text-foreground disabled:bg-muted disabled:text-muted-foreground"
      />
    );
  }

  return (
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
      className="h-9 rounded-md border bg-background px-3 text-sm text-foreground disabled:bg-muted disabled:text-muted-foreground"
    />
  );
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

  useEffect(() => {
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!open && !value) return;
    if (searchTimer.current) clearTimeout(searchTimer.current);

    searchTimer.current = setTimeout(() => {
      void loadOptions(query, value, buildOptionRequestContext(field, formValues, recordId));
    }, open ? 180 : 0);

    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [open, query, value, dependencySignature, field, recordId]);

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
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (nextQuery.trim()) params.set("q", nextQuery.trim());
      if (selectedValue) params.set("value", selectedValue);
      for (const [key, item] of Object.entries(context)) {
        if (item) params.set(`context.${key}`, item);
      }

      const response = await fetch(
        `/api/runtime-options/${encodeURIComponent(entitySlug)}/${encodeURIComponent(field.name)}?${params}`,
        { cache: "no-store", signal: abortController.signal },
      );
      const body = await readJson(response);
      if (requestId !== loadSequence.current) return;
      if (!response.ok) {
        setOptions([]);
        setError(readErrorMessage(body, response.status));
        return;
      }

      const loaded = isRecord(body) && Array.isArray(body["options"])
        ? body["options"].filter(isRuntimeOption)
        : [];
      setOptions(loaded);
    } catch (err) {
      if (isAbortError(err)) return;
      if (requestId !== loadSequence.current) return;
      setOptions([]);
      setError("Options are unavailable.");
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

  const selectedOption = options.find((option) => option.value === value);
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
        className="flex h-9 w-full items-center justify-between rounded-md border bg-background px-3 text-left text-sm text-foreground disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
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
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    if (option.disabled) return;
                    onChange(option.value);
                    setOpen(false);
                    setQuery("");
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
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(null);
                  setOpen(false);
                  setQuery("");
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

function resolveOptionSource(field: MetaEntityField): "lookup" | "reference" | "static" | null {
  const declared = field.editor?.optionSource ?? field.optionSource;
  if (declared?.kind === "lookup" || declared?.kind === "reference" || declared?.kind === "static") {
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
    || field.name.endsWith("_type")
    || isStatusField(field.name)
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
    || isLikelyReferenceField(field.name, dataType)
  ) {
    return "reference";
  }

  return null;
}

function isLikelyReferenceField(fieldName: string, dataType: string): boolean {
  if (dataType !== "uuid") return false;
  if (fieldName === "id" || fieldName === "tenant_id") return false;
  return fieldName === "parent_id" || fieldName.endsWith("_id");
}

function isStatusField(fieldName: string): boolean {
  return fieldName === "status" || fieldName.endsWith("_status");
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

function inputType(field: MetaEntityField, control?: string): string {
  if (control === "date") return "date";
  if (control === "datetime") return "datetime-local";
  if (control === "number") return "number";

  const dataType = field.dataType.toLowerCase();
  if (dataType === "date") return "date";
  if (dataType === "datetime" || dataType === "timestamptz") return "datetime-local";
  if (["integer", "bigint", "decimal", "numeric", "money"].includes(dataType)) return "number";
  return "text";
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
