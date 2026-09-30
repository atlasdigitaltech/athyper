"use client";
import { useEntityI18n } from "@athyper/platform-i18n/entity-react";
import { useMemo, useState } from "react";
import type {
  EntityDetailDescriptorV1,
  EntityRecordV1,
  EntityRelationshipV1,
} from "@athyper/contract-platform-entity-runtime";
import {
  entityListOperation,
  entityListScopeQuery,
} from "@athyper/platform-api-client";
import { requestDetail } from "./detail-requests";
import { useAsyncResource } from "./use-async-resource";
import { EntityListRuntime } from "@athyper/platform-entity-list-view";
import {
  useApiClient,
  useApplicationNavigation,
  useSessionIdentity,
} from "@athyper/platform-shell-app-foundation";
import { Button } from "@athyper/platform-ui";
import { EntityFormRuntime } from "./index";
import { EntityRecordFields } from "./record-fields";

/** Parent context is sent through the standard list API; server-owned predicates
 * enforce it independently of user filters, saved views and pagination. */
export function EntityRelatedSection({
  ownerEntityCode,
  ownerRecordId,
  relationship,
  canCreate = false,
}: {
  ownerEntityCode: string;
  ownerRecordId: string;
  relationship: EntityRelationshipV1;
  canCreate?: boolean;
}) {
  const identity = useSessionIdentity();
  const scope = useMemo(
    () => ({
      parentEntityCode: ownerEntityCode,
      parentRecordId: ownerRecordId,
      relationshipKey: relationship.key,
    }),
    [ownerEntityCode, ownerRecordId, relationship.key],
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
    />
  ) : (
    <RelatedSingleRecord
      key={key}
      entityCode={relationship.targetEntity}
      scope={scope}
      canCreate={canCreate}
    />
  );
}
function RelatedSingleRecord({
  entityCode,
  scope,
  recordId,
  canCreate = false,
}: {
  entityCode: string;
  recordId?: string;
  canCreate?: boolean;
  scope: {
    parentEntityCode: string;
    parentRecordId: string;
    relationshipKey: string;
  };
}) {
  const client = useApiClient(),
    intl = useEntityI18n();
  const identity = useSessionIdentity();
  const [retry, setRetry] = useState(0),
    [editing, setEditing] = useState(false);
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
  } | null>(
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
  if (editing)
    return (
      <>
        <Button onClick={() => setEditing(false)}>
          {intl.message("entity.related.cancel")}
        </Button>
        <EntityFormRuntime
          entityCode={entityCode}
          recordId={value?.record.id}
          parentScope={scope}
          contentOnly
          onCommitted={() => {
            setEditing(false);
            setRetry(retry + 1);
          }}
        />
      </>
    );
  if (value === null)
    return (
      <>
        <p>{intl.message("entity.related.empty")}</p>
        {canCreate ? (
          <Button onClick={() => setEditing(true)}>
            {intl.message("entity.related.add")}
          </Button>
        ) : null}
      </>
    );
  return (
    <>
      {value.descriptor.actions.some((action) => action.kind === "edit") ? (
        <Button onClick={() => setEditing(true)}>
          {intl.message("entity.related.edit")}
        </Button>
      ) : null}
      <EntityRecordFields
        descriptor={value.descriptor}
        record={value.record}
        fieldKeys={
          value.descriptor.presentation?.sections.flatMap(
            (section) => section.fields,
          ) ?? value.descriptor.fields.map((field) => field.key)
        }
      />
    </>
  );
}

function RelatedRecordList({
  entityCode,
  scope,
  canCreate = false,
}: {
  canCreate?: boolean;
  entityCode: string;
  scope: {
    parentEntityCode: string;
    parentRecordId: string;
    relationshipKey: string;
  };
}) {
  const navigation = useApplicationNavigation();
  const client = useApiClient(),
    intl = useEntityI18n();
  const [editing, setEditing] = useState<string | null>(),
    [revision, setRevision] = useState(0);
  if (editing !== undefined)
    return (
      <>
        <Button onClick={() => setEditing(undefined)}>
          {intl.message("entity.related.back")}
        </Button>
        {editing ? (
          <RelatedSingleRecord
            entityCode={entityCode}
            scope={scope}
            canCreate={canCreate}
            recordId={editing}
          />
        ) : (
          <EntityFormRuntime
            key={editing ?? "create"}
            entityCode={entityCode}
            recordId={editing ?? undefined}
            parentScope={scope}
            contentOnly
            onCommitted={() => {
              setEditing(undefined);
              setRevision(revision + 1);
            }}
          />
        )}
      </>
    );
  return (
    <>
      {canCreate ? (
        <Button onClick={() => setEditing(null)}>
          {intl.message("entity.related.add")}
        </Button>
      ) : null}
      <EntityListRuntime
        key={revision}
        client={client}
        entityCode={entityCode}
        scopeCoordinate={scope}
        contentOnly
        viewNamespace={`${scope.parentEntityCode}.${scope.relationshipKey}`}
        onNavigate={navigation.push}
        onOpenRecord={(row) => setEditing(row.id)}
      />
    </>
  );
}
