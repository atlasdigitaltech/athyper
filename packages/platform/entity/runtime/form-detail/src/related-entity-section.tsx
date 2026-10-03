"use client";
import { useEntityI18n } from "@athyper/platform-i18n/entity-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type {
  EntityDetailDescriptorV1,
  EntityRecordV1,
  EntityRelationshipV1,
  EntityRelationshipScopeV1,
} from "@athyper/contract-platform-entity-runtime";
import { bindEntityRelationship } from "@athyper/contract-platform-entity-runtime";
import {
  entityListOperation,
  entityListScopeQuery,
} from "@athyper/platform-api-client";
import { requestDetail } from "./detail-requests";
import { entityDescriptorClient } from "@athyper/platform-entity-descriptor-client";
import { useAsyncResource } from "./use-async-resource";
import { EntityListRuntime } from "@athyper/platform-entity-list-view";
import {
  useApiClient,
  useApplicationNavigation,
  useSessionIdentity,
} from "@athyper/platform-shell-app-foundation";
import { contextDepartureState } from "@athyper/platform-shell";
import { Button, PanelEmptyState } from "@athyper/platform-ui";
import { PlusIcon, resolveMetadataIcon } from "@athyper/platform-icons";
import { EntityFormRuntime } from "./index";
import { EntityRecordFields } from "./record-fields";

/** Parent context is sent through the standard list API; server-owned predicates
 * enforce it independently of user filters, saved views and pagination. */
export function EntityRelatedSection({
  descriptor,
  ownerRecordId,
  relationshipKey,
  canCreate = false,
  sectionLabel,
  sectionIconKey,
}: {
  descriptor: EntityDetailDescriptorV1;
  ownerRecordId: string;
  relationshipKey: string;
  canCreate?: boolean;
  /** The record section's title; the back link of a child view names it. */
  sectionLabel?: string;
  /** The record section's published icon; an empty section shows it. */
  sectionIconKey?: string;
}) {
  const identity = useSessionIdentity();
  const { relationship, scope } = useMemo(
    () => bindEntityRelationship(descriptor, ownerRecordId, relationshipKey),
    [descriptor, ownerRecordId, relationshipKey],
  );
  const key = JSON.stringify([
    identity.scope,
    scope,
    relationship.targetEntity,
  ]);
  return relationship.cardinality === "many" ? (
    <RelatedRecordList
      key={key}
      entityCode={relationship.targetEntity}
      scope={scope}
      canCreate={canCreate}
      {...(sectionLabel ? { sectionLabel } : {})}
    />
  ) : (
    <RelatedSingleRecord
      key={key}
      entityCode={relationship.targetEntity}
      scope={scope}
      canCreate={canCreate}
      emptyState={relationship.emptyState}
      {...(sectionIconKey ? { iconKey: sectionIconKey } : {})}
    />
  );
}
function RelatedSingleRecord({
  entityCode,
  scope,
  recordId,
  canCreate = false,
  emptyState,
  back,
  iconKey,
}: {
  iconKey?: string;
  /** A child record opened from its list: the back link and its label. */
  back?: { readonly label: string; readonly onBack: () => void };
  emptyState?: EntityRelationshipV1["emptyState"];
  entityCode: string;
  recordId?: string;
  canCreate?: boolean;
  scope: EntityRelationshipScopeV1;
}) {
  const client = useApiClient(),
    intl = useEntityI18n();
  const identity = useSessionIdentity();
  const [retry, setRetry] = useState(0),
    [editing, setEditing] = useState(false),
    [saved, setSaved] = useState(false);
  const key = JSON.stringify([
    identity.scope,
    entityCode,
    scope,
    recordId,
    retry,
  ]);
  const loaded = useAsyncResource<{
    descriptor: EntityDetailDescriptorV1;
    record: EntityRecordV1;
  } | { sourceAuthority: 'linked' | 'unavailable'; canonical?: { descriptor: EntityDetailDescriptorV1; record: EntityRecordV1 } } | null>(
    key,
    async (signal) => {
      // Even an explicitly opened row must still belong to the locked parent scope.
      const list = await client.request(entityListOperation, {
        params: { entityCode },
        signal,
        query: {
          ...entityListScopeQuery(scope),
          ...(recordId ? { recordIds: [recordId] } : {}),
          limit: 2,
          countMode: "none",
        },
      });
      if (list.sourceAuthority && list.sourceAuthority.state !== 'local') {
        const reference = list.sourceAuthority.reference;
        const canonical = reference ? await requestDetail(client, JSON.stringify([identity.scope, 'canonical', scope, reference]), reference.entityCode, reference.recordId, signal) : undefined;
        return { sourceAuthority: list.sourceAuthority.state, ...(canonical ? { canonical } : {}) };
      }
      if (list.rows.length > 1 || list.pagination.hasNext)
        throw Error("Related entity cardinality mismatch");
      const row = list.rows[0];
      if (!row) return null;
      return requestDetail(
        client,
        JSON.stringify([identity.scope, entityCode, row.id]),
        entityCode,
        row.id,
        signal,
      );
    },
    [client, entityCode, scope, recordId],
    identity.state === "authenticated",
  );
  const value = loaded.data,
    error = loaded.error;
  if (error)
    return (
      <div role="alert">
        {intl.message("entity.related.unavailable")}{" "}
        <Button onClick={() => setRetry(retry + 1)}>
          {intl.message("entity.retry")}
        </Button>
      </div>
    );
  if (value === undefined)
    return <p role="status">{intl.message("entity.related.loading")}</p>;
  if (value && 'sourceAuthority' in value)
    return <div role="status">
      <p>{intl.message(value.sourceAuthority === 'linked' ? 'entity.related.sourceManaged' : 'entity.related.sourceUnavailable')}</p>
      {value.canonical ? <EntityRecordFields descriptor={value.canonical.descriptor} record={value.canonical.record} fieldKeys={value.canonical.descriptor.presentation?.sections.flatMap(section => section.fields) ?? value.canonical.descriptor.fields.map(field => field.key)} /> : null}
      {value.sourceAuthority === 'unavailable' ? <Button onClick={() => setRetry(retry + 1)}>{intl.message('entity.retry')}</Button> : null}
    </div>;
  const leave = () => { const state = contextDepartureState(); if (!state.busy && (!state.dirty || window.confirm(intl.message("form.discardChanges")))) setEditing(false); };
  const title = value ? recordTitle(value.descriptor, value.record) : undefined;
  if (editing)
    return (
      <RelatedSection
        crumb={back ? { back, current: title ? `${intl.message("entity.related.editing")} · ${title}` : intl.message(value ? "entity.related.editing" : "entity.related.new") } : undefined}
        editing
        onEscape={leave}
      >
        <EntityFormRuntime
          entityCode={entityCode}
          recordId={value?.record.id}
          parentScope={scope}
          contentOnly
          {...(back ? {} : { submitLabel: intl.message("entity.related.save") })}
          cancel={{ label: intl.message("entity.related.cancel"), onCancel: leave }}
          onConflictReload={() => { setEditing(false); setRetry(retry + 1); }}
          onCommitted={() => {
            setEditing(false);
            setSaved(true);
            setRetry(retry + 1);
          }}
        />
      </RelatedSection>
    );
  if (value === null) {
    // Shared empty-state anatomy (as Files): the section's icon, the published title and
    // message, and the one action inside it, so the heading row stays empty.
    const Icon = resolveMetadataIcon("record-section", iconKey);
    const message = emptyState ? intl.text(emptyState.message) : intl.message("entity.related.empty");
    return (
      <RelatedSection>
        <PanelEmptyState
          className="a-related-section__empty-state"
          role="status"
          icon={<Icon size={22} />}
          title={emptyState?.title ? intl.text(emptyState.title) : message}
          {...(emptyState?.title ? { description: message } : {})}
          {...(canCreate ? { action: (
            <Button size="small" onClick={() => setEditing(true)}>
              {emptyState ? intl.text(emptyState.setupLabel) : intl.message("entity.related.add")}
            </Button>
          ) } : {})}
        />
      </RelatedSection>
    );
  }
  return (
    <RelatedSection
      crumb={back && title ? { back, current: title } : back ? { back, current: "" } : undefined}
      saved={saved}
      actions={value.descriptor.actions.some((action) => action.kind === "edit") ? (
        <Button size="small" variant="secondary" onClick={() => { setSaved(false); setEditing(true); }}>
          {emptyState ? intl.text(emptyState.editLabel) : intl.message("entity.related.edit")}
        </Button>
      ) : undefined}
    >
      <EntityRecordFields
        descriptor={value.descriptor}
        record={value.record}
        fieldKeys={
          value.descriptor.presentation?.sections.flatMap(
            (section) => section.fields,
          ) ?? value.descriptor.fields.map((field) => field.key)
        }
      />
    </RelatedSection>
  );
}

/** The child entity's published create label ("Add preference"); the generic "Add" otherwise.
 * It comes from the same form descriptor the create form uses, so the label and form agree. */
function useCreateLabel(entityCode: string, fallback: string, enabled: boolean): string {
  const client = useApiClient(), identity = useSessionIdentity();
  const loaded = useAsyncResource<string | undefined>(
    JSON.stringify([identity.scope, entityCode, "create-label"]),
    async () => (await entityDescriptorClient.form(client, entityCode, "create")).submit.label,
    [client, entityCode],
    enabled && identity.state === "authenticated",
  );
  return loaded.data ?? fallback;
}

/** A record's display title from its published title field, when it has one. */
function recordTitle(descriptor: EntityDetailDescriptorV1, record: EntityRecordV1): string | undefined {
  const field = descriptor.presentation?.titleField, value = field ? record.values[field] : undefined;
  return typeof value === "string" && value.trim() ? value : undefined;
}

/**
 * One section pattern for related records in every mode. Actions sit on the section
 * heading's row (the card lays the heading and this action group side by side); a child
 * view adds a back link naming the list; editing ends with one Save / Cancel row, Esc
 * leaves like Cancel, the first field takes focus, and a save confirms beside the actions.
 */
export function RelatedSection({
  actions,
  count,
  crumb,
  editing = false,
  saved = false,
  onEscape,
  children,
}: {
  actions?: ReactNode;
  /** Records in a child list, shown beside the section heading when known. */
  count?: number | undefined;
  crumb?: { readonly back: { readonly label: string; readonly onBack: () => void }; readonly current: string } | undefined;
  editing?: boolean;
  saved?: boolean;
  onEscape?: () => void;
  children: ReactNode;
}) {
  const intl = useEntityI18n(), body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!editing) return;
    // The form loads its descriptor first; focus its first field once it appears.
    let frame = 0, tries = 0;
    const focus = () => {
      const field = body.current?.querySelector<HTMLElement>("input:not([type=hidden]):not([disabled]),select:not([disabled]),textarea:not([disabled]),[role=combobox]");
      if (field) field.focus();
      else if (tries++ < 120) frame = requestAnimationFrame(focus);
    };
    frame = requestAnimationFrame(focus);
    return () => cancelAnimationFrame(frame);
  }, [editing]);
  return (
    <div className="a-related-section" data-mode={editing ? "edit" : "view"}>
      {count !== undefined ? <span className="a-related-section__count">{intl.number(count)}</span> : null}
      {actions || saved ? (
        <div className="a-related-section__actions">
          {saved ? <span className="a-related-section__saved" role="status">{intl.message("entity.related.saved")}</span> : null}
          {actions}
        </div>
      ) : null}
      {crumb ? (
        <nav className="a-related-section__crumb" aria-label={intl.message("entity.related.backTo", { section: crumb.back.label })}>
          <button type="button" onClick={crumb.back.onBack}>{crumb.back.label}</button>
          {crumb.current ? <span aria-current="page">{crumb.current}</span> : null}
        </nav>
      ) : null}
      <div
        ref={body}
        className="a-related-section__body"
        onKeyDown={editing && onEscape ? (event) => {
          if (event.key !== "Escape" || event.defaultPrevented) return;
          event.preventDefault();
          onEscape();
        } : undefined}
      >
        {children}
      </div>
    </div>
  );
}

function RelatedRecordList({
  entityCode,
  scope,
  canCreate = false,
  sectionLabel,
}: {
  canCreate?: boolean;
  entityCode: string;
  scope: EntityRelationshipScopeV1;
  sectionLabel?: string;
}) {
  const navigation = useApplicationNavigation();
  const client = useApiClient(),
    intl = useEntityI18n();
  const [editing, setEditing] = useState<string | null>(),
    [revision, setRevision] = useState(0),
    [summary, setSummary] = useState<Readonly<{ total?: number; constrained: boolean }>>();
  const createLabel = useCreateLabel(entityCode, intl.message("entity.related.add"), canCreate);
  const listLabel = sectionLabel ?? intl.message("entity.related.back");
  const leave = () => { const state = contextDepartureState(); if (!state.busy && (!state.dirty || window.confirm(intl.message("form.discardChanges")))) setEditing(undefined); };
  const back = { label: listLabel, onBack: leave };
  if (editing)
    return (
      <RelatedSingleRecord
        entityCode={entityCode}
        scope={scope}
        canCreate={canCreate}
        recordId={editing}
        back={back}
      />
    );
  if (editing === null)
    return (
      <RelatedSection crumb={{ back, current: intl.message("entity.related.new") }} editing onEscape={leave}>
        <EntityFormRuntime
          key="create"
          entityCode={entityCode}
          parentScope={scope}
          contentOnly
          cancel={{ label: intl.message("entity.related.cancel"), onCancel: leave }}
          onCommitted={() => {
            setEditing(undefined);
            setRevision(revision + 1);
          }}
        />
      </RelatedSection>
    );
  const add = canCreate ? (
    <Button size="small" onClick={() => setEditing(null)}>
      <PlusIcon size={16} aria-hidden="true" />
      {createLabel}
    </Button>
  ) : undefined;
  // One card: the section owns the heading (title, count, create action); the list below
  // drops its own panel. While the list is empty the create action sits in its empty state.
  return (
    <RelatedSection
      {...(summary?.total !== undefined && !summary.constrained ? { count: summary.total } : {})}
      actions={summary?.total === 0 && !summary.constrained ? undefined : add}
    >
      <EntityListRuntime
        key={revision}
        client={client}
        entityCode={entityCode}
        scopeCoordinate={scope}
        contentOnly
        viewNamespace={`${scope.parentEntityCode}.${scope.relationshipKey}`}
        onNavigate={navigation.push}
        onOpenRecord={(row) => setEditing(row.id)}
        section={{ ...(add ? { emptyAction: add } : {}), onSummary: setSummary }}
      />
    </RelatedSection>
  );
}
