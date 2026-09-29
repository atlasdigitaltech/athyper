"use client";
import { useEntityI18n } from "@athyper/platform-i18n/entity-react";
import { useEffect, useMemo, useState } from "react";
import type {
  EntityDetailDescriptorV1,
  EntityRecordV1,
  EntityRelationshipV1,
} from "@athyper/contract-platform-entity-runtime";
import {
  entityListOperation,
  entityListScopeQuery,
} from "@athyper/platform-api-client";
import { entityDescriptorClient } from "@athyper/platform-entity-descriptor-client";
import { EntityListRuntime } from "@athyper/platform-entity-list-view";
import {
  useApiClient,
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
}: {
  ownerEntityCode: string;
  ownerRecordId: string;
  relationship: EntityRelationshipV1;
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
    />
  ) : (
    <RelatedSingleRecord
      key={key}
      entityCode={relationship.targetEntity}
      scope={scope}
    />
  );
}
function RelatedSingleRecord({
  entityCode,
  scope,
  recordId,
}: {
  entityCode: string;
  recordId?: string;
  scope: {
    parentEntityCode: string;
    parentRecordId: string;
    relationshipKey: string;
  };
}) {
  const client = useApiClient(),
    intl = useEntityI18n();
  const [value, setValue] = useState<{
    descriptor: EntityDetailDescriptorV1;
    record: EntityRecordV1;
  } | null>();
  const [error, setError] = useState(false),
    [retry, setRetry] = useState(0),
    [editing, setEditing] = useState(false);
  const [canCreate, setCanCreate] = useState(false);
  useEffect(() => {
    let current = true;
    setValue(undefined);
    setError(false);
    (async () => {
      const list = recordId
        ? { rows: [{ id: recordId }], pagination: { hasNext: false } }
        : await client.request(entityListOperation, {
            params: { entityCode },
            query: {
              ...entityListScopeQuery(scope),
              limit: 2,
              countMode: "none",
            },
          });
      if (list.rows.length > 1 || list.pagination.hasNext)
        throw Error("Related entity cardinality mismatch");
      const row = list.rows[0];
      if (!row) {
        let allowed = false;
        try {
          await entityDescriptorClient.form(client, entityCode, "create");
          allowed = true;
        } catch {}
        if (current) {
          setValue(null);
          setCanCreate(allowed);
        }
        return;
      }
      const [descriptor, record] = await Promise.all([
        entityDescriptorClient.detail(client, entityCode, row.id),
        entityDescriptorClient.record(client, entityCode, row.id),
      ]);
      if (current) setValue({ descriptor, record });
    })().catch(() => {
      if (current) {
        setValue(undefined);
        setError(true);
      }
    });
    return () => {
      current = false;
    };
  }, [client, entityCode, scope, retry, recordId]);
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
}: {
  entityCode: string;
  scope: {
    parentEntityCode: string;
    parentRecordId: string;
    relationshipKey: string;
  };
}) {
  const client = useApiClient(),
    intl = useEntityI18n();
  const [editing, setEditing] = useState<string | null>(),
    [revision, setRevision] = useState(0),
    [canCreate, setCanCreate] = useState(false);
  useEffect(() => {
    let current = true;
    entityDescriptorClient
      .form(client, entityCode, "create")
      .then(() => {
        if (current) setCanCreate(true);
      })
      .catch(() => {
        if (current) setCanCreate(false);
      });
    return () => {
      current = false;
    };
  }, [client, entityCode]);
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
        onNavigate={(href) => {
          const prefix = `/app/entity/${entityCode}/`;
          if (href.startsWith(prefix)) {
            const id = href.slice(prefix.length);
            if (/^[0-9a-f-]{36}$/i.test(id)) setEditing(id);
          }
        }}
      />
    </>
  );
}
