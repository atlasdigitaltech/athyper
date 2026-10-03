"use client";
import {
  createContext,
  useContext,
  Fragment,
  useMemo,
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
import { Badge, InlineStatus, PanelContextRow, PanelFooter, PanelHeader } from "@athyper/platform-ui";
import { ChevronRightIcon, resolveMetadataIcon } from "@athyper/platform-icons";
import { useEntityI18n } from "@athyper/platform-i18n/entity-react";
import { localizeEntityLabels } from "@athyper/platform-i18n/entity-labels";
import { useAsyncResource } from "./use-async-resource";
import { EntityRecordFields } from "./record-fields";

type Selection = {
  sourceEntity: string;
  sourceRecord: string;
  field: string;
  reference: ResolvedEntityReferenceV1;
  origin?: ReferenceOriginValue;
  scope: string;
};

/** Where a reference sits on the page: the record's title and the section's label. */
type ReferenceOriginValue = Readonly<{ recordTitle?: string; sectionLabel?: string }>;
const ReferenceOriginContext = createContext<ReferenceOriginValue>({});
/** Record pages and their sections name the place a reference preview is opened from;
 * nested origins add to the outer one (record, then section). */
export function ReferenceOrigin({ recordTitle, sectionLabel, children }: ReferenceOriginValue & { children: ReactNode }) {
  const outer = useContext(ReferenceOriginContext);
  const value = useMemo(() => ({ ...outer, ...(recordTitle ? { recordTitle } : {}), ...(sectionLabel ? { sectionLabel } : {}) }), [outer, recordTitle, sectionLabel]);
  return <ReferenceOriginContext.Provider value={value}>{children}</ReferenceOriginContext.Provider>;
}
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
  const origin = useContext(ReferenceOriginContext);
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
        open({ sourceEntity, sourceRecord, field, reference, origin }, event.currentTarget);
      }}
    >
      {reference.label}
      {reference.label !== reference.value ? (
        <small> · {reference.value}</small>
      ) : null}
      {/* Always laid out, shown only on hover / focus, so the value never shifts. */}
      <ChevronRightIcon className="a-entity-reference-link__cue" size={14} aria-hidden="true" />
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
      const target = await entityDescriptorClient.detailRead(
        client,
        reference.entityCode,
        reference.recordId,
        signal,
      );
      return { ...target, source: source.descriptor };
    },
    [client, selection],
  );
  const descriptor = loaded.data
    ? localizeEntityLabels(loaded.data.descriptor, intl)
    : undefined;
  const record = loaded.data?.record;
  // Where the preview was opened from: the source entity and the reference field.
  const source = loaded.data ? localizeEntityLabels(loaded.data.source, intl) : undefined;
  const sourceField = source?.fields.find((field) => field.key === selection.field)?.label;
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
      {({ capabilities }) => {
        // The shared panel anatomy (as Manage views): entity icon tile, record title
        // with its status, context row, body, pinned footer action.
        const Icon = resolveMetadataIcon("entity", header?.iconKey);
        const subtitle = descriptor
          ? header?.code && header.code !== header.title
            ? `${descriptor.entity.label} · ${header.code}`
            : descriptor.entity.label
          : undefined;
        return (
          <>
            <PanelHeader
              icon={<Icon size={20} />}
              title={
                <>
                  {header?.title ?? intl.message("reference.preview")}
                  {header?.badges.map((badge, index) => (
                    <Badge key={index} tone={badge.tone} className="a-entity-reference-preview__badge">
                      {badge.label}
                    </Badge>
                  ))}
                </>
              }
              {...(subtitle ? { subtitle } : {})}
              capabilities={capabilities}
            />
            {source && sourceField ? (
              <ReferenceOriginRow
                parts={selection.origin?.recordTitle && selection.origin.sectionLabel
                  ? [selection.origin.recordTitle, selection.origin.sectionLabel, sourceField]
                  : [source.entity.label, sourceField]}
              />
            ) : null}
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
                <EntityRecordFields
                  descriptor={descriptor}
                  record={record}
                  fieldKeys={
                    descriptor.referenceSummaryFields ?? [descriptor.titleField]
                  }
                />
              ) : null}
            </div>
            {descriptor && record ? (
              <PanelFooter className="a-entity-reference-preview__footer">
                <a
                  className="a-button a-button--secondary a-button--small"
                  href={href}
                  onClick={navigate}
                >
                  {intl.message("reference.openEntity", { entity: descriptor.entity.label })}
                  <ChevronRightIcon size={16} aria-hidden="true" />
                </a>
              </PanelFooter>
            ) : null}
          </>
        );
      }}
    </WorkspaceToolPanel>
  );
}

/** "From Catl Admin › UI Profile › Locale": the same path as the page breadcrumb. One
 * line; the record title gives way first so the section and field stay readable. */
function ReferenceOriginRow({ parts }: { parts: readonly string[] }) {
  const intl = useEntityI18n();
  const path = parts.join(" › ");
  return (
    <PanelContextRow
      className="a-entity-reference-preview__origin"
      title={intl.message("reference.openedFromPath", { path })}
      scope={{
        kind: "record",
        label: (
          <>
            <span className="a-entity-reference-preview__origin-lead">{intl.message("reference.openedFromLead")}</span>
            {parts.map((part, index) => (
              <Fragment key={index}>
                {index ? <span className="a-entity-reference-preview__origin-separator">›</span> : null}
                <span className="a-entity-reference-preview__origin-part" data-first={index === 0 || undefined}>{part}</span>
              </Fragment>
            ))}
          </>
        ),
      }}
    />
  );
}
