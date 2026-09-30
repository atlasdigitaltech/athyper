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
import { useApiClient } from "@athyper/platform-shell-app-foundation";
import { Button, Card, InlineStatus } from "@athyper/platform-ui";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { FormFields } from "./field-input";
import { isFormDirty } from "./form-dirty";
import {
  isUntouchedOptionalCreateField,
  normalizeFieldValue,
} from "./form-values";
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
  contentOnly = false,
  parentScope,
}: {
  readonly entityCode: string;
  readonly recordId?: string;
  readonly onCommitted?: (recordId: string) => void;
  readonly contentOnly?: boolean;
  readonly parentScope?: {
    parentEntityCode: string;
    parentRecordId: string;
    relationshipKey: string;
  };
}) {
  const intl = useEntityI18n();
  const client = useApiClient();
  const mode = recordId ? "edit" : "create";
  const loaded = useAsyncResource<LoadedForm>(
    `${entityCode}:${mode}:${recordId ?? ""}`,
    async () => {
      const [descriptor, record] = await Promise.all([
        entityDescriptorClient.form(client, entityCode, mode, recordId),
        recordId
          ? entityDescriptorClient.record(client, entityCode, recordId)
          : Promise.resolve(undefined),
      ]);
      return { descriptor, ...(record ? { record } : {}) };
    },
    [client, entityCode, mode, recordId],
  );
  const descriptor = useMemo(
    () =>
      loaded.data?.descriptor
        ? localizeEntityLabels(loaded.data.descriptor, intl)
        : undefined,
    [loaded.data?.descriptor, intl],
  );
  const record = loaded.data?.record;

  const [values, setValues] = useState<FormValues>({});
  // Last loaded or saved values; "dirty" means differing from this baseline.
  const [baseline, setBaseline] = useState<FormValues>({});
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState("");

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
    setValues(initial);
    setBaseline(initial);
    setSaveStatus("");
  }, [loaded.data]);

  const dirty =
    !!descriptor && isFormDirty(descriptor.fields, values, baseline);
  useAtlasBusinessContextPublisher(
    recordId
      ? {
          kind: "record",
          entityCode,
          recordId,
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
    if (!descriptor) return;
    setSaving(true);
    setSaveStatus("");
    try {
      const input = Object.fromEntries(
        descriptor.fields
          .filter((field) => !field.readOnly)
          .flatMap((field) =>
            !recordId &&
            isUntouchedOptionalCreateField(values[field.key], field)
              ? []
              : [[field.key, normalizeFieldValue(values[field.key], field)]],
          ),
      );
      const key = `entity-${descriptor.pageKind}-${crypto.randomUUID()}`;
      const receipt = recordId
        ? await entityDescriptorClient.patch(
            client,
            entityCode,
            recordId,
            input,
            record?.version ?? 0,
            key,
          )
        : await entityDescriptorClient.create(
            client,
            entityCode,
            input,
            key,
            parentScope,
          );
      // Saved values are the new baseline, so navigating away after a commit
      // is not treated as abandoning unsaved changes.
      setBaseline(values);
      setSaveStatus(
        intl.message("form.saved", { entity: descriptor.entity.label }),
      );
      onCommitted?.(receipt.recordId);
    } catch (error) {
      setSaveStatus(localizedEntityError(error, intl));
    } finally {
      setSaving(false);
    }
  };

  const setValue = (key: string, value: unknown) =>
    setValues((current) => ({ ...current, [key]: value }));

  if (!descriptor) {
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

  const fields = (
    <FormFields
      fields={descriptor.fields}
      values={values}
      onChange={setValue}
    />
  );
  const submitButton = (
    <Button type="submit" loading={saving}>
      {intl.message(
        descriptor.mode === "create" ? "form.submitCreate" : "form.submitEdit",
        { entity: descriptor.entity.label },
      )}
    </Button>
  );
  if (contentOnly)
    return (
      <form onSubmit={submit}>
        {fields}
        {submitButton}
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
        title={intl.message(
          descriptor.mode === "create" ? "form.titleCreate" : "form.titleEdit",
          { entity: descriptor.entity.label },
        )}
        description={intl.message(
          descriptor.mode === "create"
            ? "form.descriptionCreate"
            : "form.descriptionEdit",
          { entity: descriptor.entity.label },
        )}
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
        <div>{submitButton}</div>
        <InlineStatus>{status}</InlineStatus>
      </form>
    </PageFrame>
  );
}
