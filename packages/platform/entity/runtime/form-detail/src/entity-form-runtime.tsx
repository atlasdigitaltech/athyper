"use client";
import type {
  EntityFormDescriptorV1,
  EntityRecordV1,
} from "@athyper/contract-platform-entity-runtime";
import { humanizeIdentifier } from "@athyper/contract-platform-entity-runtime";
import { entityDescriptorClient } from "@athyper/platform-entity-descriptor-client";
import { localizedEntityError } from "@athyper/platform-i18n/entity-errors";
import { useEntityI18n } from "@athyper/platform-i18n/entity-react";
import { localizeEntityLabels } from "@athyper/platform-i18n/entity-labels";
import {
  PageFrame,
  PageHeader,
  useAtlasBusinessContextPublisher,
  useContextDepartureGuard,
} from "@athyper/platform-shell";
import { useApiClient, useSessionIdentity, useExperienceRevision, usePermissions } from "@athyper/platform-shell-app-foundation";
import { Button, Card, InlineStatus } from "@athyper/platform-ui";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { createFormSubmissionIdentity } from "./form-submission-identity";
import { formFieldErrors, formVersionConflict, formAlreadyExists } from "./form-errors";
import { FormFields } from "./field-input";
import { RegisteredEntitySection } from "./registered-renderers/entity-section-component";
import { isFormDirty } from "./form-dirty";
import { isUntouchedOptionalCreateField, normalizeFieldValue } from "./form-values";
import { useAsyncResource } from "./use-async-resource";

type FormValues = Readonly<Record<string, unknown>>;

interface LoadedForm {
  readonly descriptor: EntityFormDescriptorV1;
  readonly record?: EntityRecordV1;
}

export function EntityFormRuntime({
  entityCode,
  recordId,
  onCommitted,
  onConflictReload,
  contentOnly = false,
  parentScope,
  cancel,
  submitLabel,
}: {
  /** Embedded forms: the submit label when the published one repeats the entry action. */
  readonly submitLabel?: string;
  /** Embedded forms: a secondary action that leaves the form, shown beside Save. */
  readonly cancel?: Readonly<{ label: string; onCancel: () => void }>;
  readonly entityCode: string;
  readonly recordId?: string;
  readonly onConflictReload?: () => void;
  readonly onCommitted?: (recordId: string) => void;
  readonly contentOnly?: boolean;
  readonly parentScope?: {
    parentEntityCode: string;
    parentRecordId: string;
    relationshipKey: string;
    parentDescriptorHash?: string;
  };
}) {
  const intl = useEntityI18n();
  const client = useApiClient();
  const identity = useSessionIdentity();
  const revision = useExperienceRevision();
  const permissions = [...usePermissions()].sort();
  const accessKey = JSON.stringify([identity.state, identity.scope, revision, permissions, entityCode, recordId]);
  const access = useRef(accessKey);
  access.current = accessKey;
  const mode = recordId ? "edit" : "create";
  const loaded = useAsyncResource<LoadedForm>(
    accessKey,
    async () => {
      const [descriptor, record] = await Promise.all([
        entityDescriptorClient.form(client, entityCode, mode, recordId),
        recordId
          ? entityDescriptorClient.record(client, entityCode, recordId)
          : Promise.resolve(undefined),
      ]);
      return { descriptor, ...(record ? { record } : {}) };
    },
    [client, accessKey, entityCode, mode, recordId],
    identity.state === "authenticated" && Boolean(identity.scope) && revision.state === "ready",
  );
  const descriptor = useMemo(() => loaded.data?.descriptor ? localizeEntityLabels(loaded.data.descriptor, intl) : undefined, [loaded.data?.descriptor, intl]);
  const record = loaded.data?.record;

  const [values, setValues] = useState<FormValues>({});
  const [initializedAccess, setInitializedAccess] = useState<string>();
  // Last loaded or saved values; "dirty" means differing from this baseline.
  const [baseline, setBaseline] = useState<FormValues>({});
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);
  const submissionIdentity = useRef(createFormSubmissionIdentity());
  const [saveStatus, setSaveStatus] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Readonly<Record<string, string>>>({});
  const [conflict, setConflict] = useState(false);
  const [currentVersion, setCurrentVersion] = useState<number>();

  useEffect(() => {
    if (!loaded.data) return;
    const initial: FormValues = loaded.data.record
      ? Object.fromEntries(
          loaded.data.descriptor.fields.map((field) => [
            field.key,
            loaded.data?.record?.values[field.key] ?? "",
          ]),
        )
      : {};
    setInitializedAccess(accessKey);
    setCurrentVersion(loaded.data.record?.version);
    setValues(initial);
    setBaseline(initial);
    setSaveStatus("");
    setFieldErrors({});
    setConflict(false);
  }, [loaded.data]);

  const dirty = !!descriptor && isFormDirty(descriptor.fields, values, baseline);
  useAtlasBusinessContextPublisher(
    recordId
      ? {
          kind: "record",
          entityCode,
          recordId,
          parentScope,
          dirty: record?.id === recordId && dirty,
          savedRevision:
            record?.id !== recordId || record?.version === undefined
              ? undefined
              : String(record.version),
        }
      : undefined,
  );
  useContextDepartureGuard({ dirty, busy: saving });

  const status = loaded.error
    ? localizedEntityError(loaded.error, intl)
    : loaded.loading
      ? intl.message("form.loadingMetadata")
      : saveStatus;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!descriptor || submitting.current) return;
    submitting.current = true;
    setSaving(true);
    setSaveStatus("");
    setFieldErrors({});
    try {
      const input = Object.fromEntries(
        descriptor.fields
          .filter((field) => !field.readOnly && (!recordId || isFormDirty([field], values, baseline)))
          .flatMap((field) =>
            !recordId &&
            isUntouchedOptionalCreateField(values[field.key], field)
              ? []
              : [[field.key, normalizeFieldValue(values[field.key], field)]],
          ),
      );
      const key = submissionIdentity.current.key({ entityCode, recordId, mode, version: currentVersion, parentScope, input });
      const receipt = recordId
        ? await entityDescriptorClient.patch(
            client,
            entityCode,
            recordId,
            input,
            currentVersion ?? 0,
            key,
          )
        : await entityDescriptorClient.create(
            client,
            entityCode,
            input,
            key,
            parentScope,
          );
      if (access.current !== accessKey) return;
      // Saved values are the new baseline, so navigating away after a commit
      // is not treated as abandoning unsaved changes.
      submissionIdentity.current.clear();
      setCurrentVersion(receipt.version);
      setBaseline(values);
      setSaveStatus(
        intl.message("form.saved", { entity: descriptor.entity.label }),
      );
      onCommitted?.(receipt.recordId);
    } catch (error) {
      if (access.current !== accessKey) return;
      const errors = formFieldErrors(error, descriptor.fields, (key, params) => intl.message(key, params));
      setFieldErrors(errors);
      setConflict(formVersionConflict(error) || formAlreadyExists(error));
      setSaveStatus(Object.keys(errors).length ? intl.message("validation.summary") : formAlreadyExists(error) ? intl.message("form.alreadyExists") : formVersionConflict(error) ? intl.message("form.versionConflict") : localizedEntityError(error, intl));
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  };

  const setValue = (key: string, value: unknown) =>
    setValues((current) => ({ ...current, [key]: value }));

  if (!descriptor || initializedAccess !== accessKey) {
    const pending = <InlineStatus>{status}</InlineStatus>;
    if (contentOnly) return pending;
    return (
      <PageFrame>
        <PageHeader
          level="collection"
          context={intl.message("form.context")}
          title={humanizeIdentifier(entityCode)}
        />
        <Card>{pending}</Card>
      </PageFrame>
    );
  }

  const grouped = new Set(descriptor.sections?.flatMap(section => section.fields) ?? []);
  const renderFields = (keys: readonly string[]) => <div className="a-entity-form-fields"><FormFields entityCode={entityCode} fields={keys.flatMap(key => descriptor.fields.find(field => field.key === key) ?? [])} values={values} errors={fieldErrors} onChange={setValue} /></div>;
  const fields = <>
    {descriptor.sections?.map(section => <fieldset className="a-entity-form-section" key={section.key}><legend>{section.label}</legend>{section.component ? <RegisteredEntitySection component={section.component} fields={section.fields} renderField={key => renderFields([key])} /> : renderFields(section.fields)}</fieldset>)}
    {renderFields(descriptor.fields.filter(field => !grouped.has(field.key)).map(field => field.key))}
  </>;
  const recovery = conflict && (recordId || onConflictReload) ? <Button type="button" onClick={() => { if (window.confirm(intl.message("form.reloadDiscard"))) { if (onConflictReload) onConflictReload(); else loaded.reload(); } }}>{intl.message("form.reloadRecord")}</Button> : null;
  const submitButton = (
    <Button type="submit" size={contentOnly ? "small" : "medium"} loading={saving} disabled={conflict || (mode === "edit" && !dirty)}>
      {submitLabel ?? descriptor.submit.label}
    </Button>
  );
  if (contentOnly)
    return (
      <form onSubmit={submit}>
        {fields}
        <div className="a-entity-form-actions">
          {submitButton}
          {cancel ? <Button type="button" variant="secondary" size="small" disabled={saving} onClick={cancel.onCancel}>{cancel.label}</Button> : null}
          {recovery}
        </div>
        <InlineStatus>{status}</InlineStatus>
      </form>
    );
  return (
    <PageFrame>
      <PageHeader
        level="collection"
        context={intl.message(
          descriptor.pageKind === "create"
            ? "form.contextCreate"
            : "form.contextEdit",
          { entity: descriptor.entity.label },
        )}
        title={intl.message(descriptor.mode === "create" ? "form.titleCreate" : "form.titleEdit", { entity: descriptor.entity.label })}
        description={intl.message(descriptor.mode === "create" ? "form.descriptionCreate" : "form.descriptionEdit", { entity: descriptor.entity.label })}
        metadata={
          <span>
            {intl.message("form.release", {
              release: descriptor.revision.release,
            })}
          </span>
        }
      />
      <form onSubmit={submit}>
        <Card>{fields}</Card>
        <div className="a-entity-form-actions">{submitButton}{recovery}</div>
        <InlineStatus>{status}</InlineStatus>
      </form>
    </PageFrame>
  );
}
