"use client";
import {
  createContext,
  useContext,
  useState,
  useRef,
  type ReactNode,
  type MouseEvent,
} from "react";
import {
  entityRecordHref,
  resolveRecordHeader,
  type ResolvedEntityReferenceV1,
} from "@athyper/contract-platform-entity-runtime";
import { entityDescriptorClient } from "@athyper/platform-entity-descriptor-client";
import {
  useApiClient,
  useApplicationNavigation,
  useEntityContext,
  useExperienceRevision,
  usePermissions,
  useSessionIdentity,
} from "@athyper/platform-shell-app-foundation";
import { WorkspaceToolPanel } from "@athyper/platform-shell";
import { Badge, InlineStatus, PanelHeader } from "@athyper/platform-ui";
import { InfoIcon } from "@athyper/platform-icons";
import { useEntityI18n } from "@athyper/platform-i18n/entity-react";
import { localizeEntityLabels } from "@athyper/platform-i18n/entity-labels";
import { useAsyncResource } from "./use-async-resource";
import { EntityRecordFields } from "./record-fields";

type Selection = {
  sourceEntity: string;
  sourceRecord: string;
  field: string;
  reference: ResolvedEntityReferenceV1;
  scope: string;
};
const PreviewContext = createContext<
  ((value: Omit<Selection, "scope">, opener: HTMLElement) => void) | undefined
>(undefined);
export function EntityReferenceLink({
  sourceEntity,
  sourceRecord,
  field,
  reference,
}: {
  sourceEntity: string;
  sourceRecord: string;
  field: string;
  reference: ResolvedEntityReferenceV1;
}) {
  const open = useContext(PreviewContext);
  const intl = useEntityI18n();
  return (
    <a
      className="a-entity-reference-link"
      href={entityRecordHref(reference.entityCode, reference.recordId)}
      aria-label={intl.message("reference.previewRecord", {
        name: reference.label,
      })}
      onClick={(event) => {
        if (
          !open ||
          event.button !== 0 ||
          event.ctrlKey ||
          event.metaKey ||
          event.shiftKey ||
          event.altKey
        )
          return;
        event.preventDefault();
        open({ sourceEntity, sourceRecord, field, reference }, event.currentTarget);
      }}
    >
      {reference.label}
      {reference.label !== reference.value ? (
        <small> · {reference.value}</small>
      ) : null}
    </a>
  );
}

/** One shared shell panel; scope changes hide data synchronously and abort reads. */
export function EntityReferencePreviewProvider({
  children,
  sourceKey,
}: {
  children: ReactNode;
  sourceKey: string;
}) {
  const identity = useSessionIdentity(),
    revision = useExperienceRevision(),
    context = useEntityContext();
  const permissions = [...usePermissions()].sort();
  const scope = JSON.stringify([
    identity.state,
    identity.scope,
    revision,
    context?.generation,
    permissions,
    sourceKey,
  ]);
  const [selection, setSelection] = useState<Selection>();
  const opener = useRef<HTMLElement | null>(null);
  const ready =
    identity.state === "authenticated" &&
    revision.state === "ready" &&
    (!context || context.status === "ready");
  const active = ready && selection?.scope === scope ? selection : undefined;
  return (
    <PreviewContext.Provider
      value={(value, element) => {opener.current = element; setSelection({ ...value, scope });}}
    >
      {children}
      {active ? (
        <ReferencePreview
          key={JSON.stringify(active)}
          selection={active}
          fallbackFocus={() => opener.current}
          close={() => setSelection(undefined)}
        />
      ) : null}
    </PreviewContext.Provider>
  );
}

function ReferencePreview({
  selection,
  close,
  fallbackFocus,
}: {
  fallbackFocus: () => HTMLElement | null;
  selection: Selection;
  close: () => void;
}) {
  const intl = useEntityI18n(),
    client = useApiClient(),
    navigation = useApplicationNavigation();
  const loaded = useAsyncResource(
    JSON.stringify(selection),
    async (signal) => {
      // Re-admit the source and resolve its current mapping; a stale browser
      // label or caller-supplied target is never authority for the preview.
      const source = await entityDescriptorClient.detailRead(
        client,
        selection.sourceEntity,
        selection.sourceRecord,
        signal,
      );
      const reference = source.record.references?.[selection.field];
      if (
        !reference ||
        reference.entityCode !== selection.reference.entityCode ||
        reference.recordId !== selection.reference.recordId
      )
        throw Error("Reference unavailable");
      return entityDescriptorClient.detailRead(
        client,
        reference.entityCode,
        reference.recordId,
        signal,
      );
    },
    [client, selection],
  );
  const descriptor = loaded.data
    ? localizeEntityLabels(loaded.data.descriptor, intl)
    : undefined;
  const record = loaded.data?.record;
  const header =
    descriptor?.presentation && record
      ? resolveRecordHeader(descriptor.presentation, record.values, {
          entityLabel: descriptor.entity.label,
          fallbackTitle: descriptor.entity.label,
          choiceLabels: Object.fromEntries(
            descriptor.fields.map((field) => [
              field.key,
              Object.fromEntries(
                (field.options ?? []).map((option) => [
                  option.value,
                  option.label,
                ]),
              ),
            ]),
          ),
        })
      : undefined;
  const href = entityRecordHref(
    selection.reference.entityCode,
    selection.reference.recordId,
  );
  const navigate = (event: MouseEvent<HTMLAnchorElement>) => {
    if (
      event.button !== 0 ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    event.preventDefault();
    close();
    navigation.push(href);
  };
  return (
    <WorkspaceToolPanel
      id="entity-reference-preview"
      fallbackFocus={fallbackFocus}
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
      className="a-entity-reference-preview"
      labels={{
        region: intl.message("reference.preview"),
        close: intl.message("reference.close"),
        pin: intl.message("list.controls.pin"),
        unpin: intl.message("list.controls.unpin"),
        resize: intl.message("list.controls.resize"),
      }}
    >
      {({ capabilities }) => (
        <>
          <PanelHeader
            icon={<InfoIcon size={20} />}
            title={header?.title ?? intl.message("reference.preview")}
            subtitle={descriptor?.entity.label}
            capabilities={capabilities}
          />
          <div className="a-entity-reference-preview__body">
            {loaded.loading ? (
              <InlineStatus tone="neutral">
                {intl.message("detail.loadingRecord")}
              </InlineStatus>
            ) : loaded.error ? (
              <>
                <p role="alert">{intl.message("reference.unavailable")}</p>
                <button type="button" onClick={loaded.reload}>
                  {intl.message("entity.retry")}
                </button>
              </>
            ) : descriptor && record ? (
              <>
                {header?.badges.map((badge, index) => (
                  <Badge key={index} tone={badge.tone}>
                    {badge.label}
                  </Badge>
                ))}
                <EntityRecordFields
                  descriptor={descriptor}
                  record={record}
                  fieldKeys={
                    descriptor.referenceSummaryFields ?? [descriptor.titleField]
                  }
                />
                <a
                  className="a-entity-reference-preview__open"
                  href={href}
                  onClick={navigate}
                >
                  {intl.message("reference.openRecord")}
                </a>
              </>
            ) : null}
          </div>
        </>
      )}
    </WorkspaceToolPanel>
  );
}
