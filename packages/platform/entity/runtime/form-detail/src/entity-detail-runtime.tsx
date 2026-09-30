"use client";
import {
  humanizeIdentifier,
  parseEntityRecordPresentation,
  type EntityDetailDescriptorV1,
  type EntityRecordPresentationV1,
  type EntityRecordV1,
} from "@athyper/contract-platform-entity-runtime";
import { useEntityI18n } from "@athyper/platform-i18n/entity-react";
import { localizeEntityErrorModel, localizedEntityError } from "@athyper/platform-i18n/entity-errors";
import { PageWorkspace, useRecordPage } from "@athyper/platform-shell";
import { classifyAppError } from "@athyper/platform-shell-app-foundation/error-taxonomy";
import {
  ErrorSurface,
  useApiClient,
  useEntityContext,
  useExperienceRevision,
  usePermissions,
  useSessionIdentity,
} from "@athyper/platform-shell-app-foundation";
import { Card, InlineStatus, SurfaceErrorBoundary } from "@athyper/platform-ui";
import { MetadataDetailWorkspace } from "./detail-workspace";
import { sessionScopeKey } from "./session-scope-key";
import { useAsyncResource } from "./use-async-resource";
import { entityApplicationDescriptorOperation } from "@athyper/platform-api-client";
import { useEntityApplication } from "@athyper/platform-entity-list-view";
import { requestDetail } from "./detail-requests";
import { ThumbnailRecordScope } from "./thumbnail-scope";

interface LoadedDetail {
  readonly descriptor: EntityDetailDescriptorV1;
  readonly record: EntityRecordV1;
}

export function EntityDetailRuntime(props: { readonly entityCode: string; readonly recordId: string; readonly editHref?: string }) {
  const adapter = useEntityContext();
  const inherited = useEntityApplication();
  const identity = useSessionIdentity();
  const revision = useExperienceRevision();
  const client = useApiClient();
  const intl = useEntityI18n();
  const key = JSON.stringify([identity.scope, revision, props.entityCode]);
  const discovery = useAsyncResource(key, signal => client.request(entityApplicationDescriptorOperation, { params: { entityCode: props.entityCode }, signal }), [client, props.entityCode], Boolean(adapter && inherited?.descriptor.entity.code !== props.entityCode && identity.state === "authenticated" && revision.state === "ready"));
  const descriptor = inherited?.descriptor.entity.code === props.entityCode ? inherited.descriptor : discovery.data;
  const discoveryDenied = discovery.error && typeof discovery.error === "object" && "status" in discovery.error && discovery.error.status === 403;
  if (adapter && !descriptor && !discoveryDenied) return discovery.error
    ? <ErrorSurface model={localizeEntityErrorModel(classifyAppError({ error: discovery.error }), intl)} retryLabel={intl.message("entity.retry")} reset={discovery.reload} surface="content" />
    : <InlineStatus tone="neutral">{intl.message("detail.loadingRecord")}</InlineStatus>;
  const content = <AuthorizedDetailRuntime key={descriptor?.scope.workContext ? adapter?.generation : undefined} {...props} />;
  return adapter && descriptor?.scope.workContext ? adapter.gate(content) : content;
}

function AuthorizedDetailRuntime({
  entityCode,
  recordId,
  editHref,
}: {
  readonly entityCode: string;
  readonly recordId: string;
  readonly editHref?: string;
}) {
  const intl = useEntityI18n();
  useRecordPage();
  const client = useApiClient();
  const identity = useSessionIdentity();
  const revision = useExperienceRevision();
  const permissions = [...usePermissions()].sort();
  const key = JSON.stringify([sessionScopeKey(identity.scope, entityCode, recordId), revision, permissions]);
  const loaded = useAsyncResource<LoadedDetail>(
    key,
    (signal) => requestDetail(client, key, entityCode, recordId, signal),
    [client, entityCode, recordId],
    identity.state === "authenticated" && Boolean(identity.scope) && revision.state === "ready",
  );
  const errorModel = loaded.error
    ? localizeEntityErrorModel(classifyAppError({ error: loaded.error, applicationName: humanizeIdentifier(entityCode) }), intl)
    : undefined;
  if (!loaded.data)
    return (
      <PageWorkspace
        header={{ level: "collection", title: humanizeIdentifier(entityCode) }}
      >
        {loaded.error ? (
          <ErrorSurface
            model={{ ...errorModel!, description: localizedEntityError(loaded.error, intl, errorModel?.description) }}
            retryLabel={intl.message("entity.retry")} reset={loaded.reload}
            applicationName={humanizeIdentifier(entityCode)}
            surface="content"
          />
        ) : (
          <Card>
            <InlineStatus tone="neutral">{intl.message("detail.loadingRecord")}</InlineStatus>
          </Card>
        )}
      </PageWorkspace>
    );
  const { descriptor, record } = loaded.data;
  return (
    <SurfaceErrorBoundary
      resetKey={key}
      message={intl.message("error.unavailable")}
      retryLabel={intl.message("entity.retry")}
    >
      <ThumbnailRecordScope.Provider value={JSON.stringify([entityCode, recordId])}>
      <MetadataDetailWorkspace
        key={key}
        preferenceKey={`athyper.detail-view.${descriptor.plane}:${identity.scope?.tenantId}:${identity.scope?.principalId}:${entityCode}`}
        entityCode={entityCode}
        descriptor={{
          ...descriptor,
          presentation:
            descriptor.presentation ?? fallbackPresentation(descriptor, intl),
        }}
        record={record}
        editHref={editHref}
        status=""
      />
      </ThumbnailRecordScope.Provider>
    </SurfaceErrorBoundary>
  );
}

/** Single-section presentation for a descriptor that publishes none. It offers
 * Edit only when the descriptor itself allows the edit operation, so a
 * read-only entity never shows an action it cannot perform. */
function fallbackPresentation(
  descriptor: EntityDetailDescriptorV1,
  intl: ReturnType<typeof useEntityI18n>,
): EntityRecordPresentationV1 {
  const canEdit = descriptor.actions.some((action) => action.kind === "edit");
  return parseEntityRecordPresentation({
    schemaVersion: 1,
    titleField: descriptor.titleField,
    sections: [
      {
        key: "overview",
        label: intl.message("detail.overview"),
        fields: descriptor.fields.map((field) => field.key),
      },
    ],
    actions: canEdit
      ? [
          {
            key: "edit",
            label: descriptor.actions.find((action) => action.kind === "edit")!
              .label,
            operationKey: "patch",
            placement: "primary",
          },
        ]
      : [],
  });
}
