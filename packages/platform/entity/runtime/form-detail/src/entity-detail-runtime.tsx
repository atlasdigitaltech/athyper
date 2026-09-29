"use client";
import {
  humanizeIdentifier,
  parseEntityRecordPresentation,
  type EntityDetailDescriptorV1,
  type EntityRecordPresentationV1,
  type EntityRecordV1,
} from "@athyper/contract-platform-entity-runtime";
import { entityDescriptorClient } from "@athyper/platform-entity-descriptor-client";
import { useEntityI18n } from "@athyper/platform-i18n/entity-react";
import { PageWorkspace, useRecordPage } from "@athyper/platform-shell";
import {
  ErrorSurface,
} from "@athyper/platform-shell-app-foundation";
import { classifyAppError } from "@athyper/platform-shell-app-foundation/error-taxonomy";
import {
  useApiClient,
  useSessionIdentity,
} from "@athyper/platform-shell-app-foundation";
import { Card, InlineStatus, SurfaceErrorBoundary } from "@athyper/platform-ui";
import { MetadataDetailWorkspace } from "./detail-workspace";
import { sessionScopeKey } from "./session-scope-key";
import { useAsyncResource } from "./use-async-resource";

interface LoadedDetail {
  readonly descriptor: EntityDetailDescriptorV1;
  readonly record: EntityRecordV1;
}

export function EntityDetailRuntime({
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
  const key = sessionScopeKey(identity.scope, entityCode, recordId);
  const loaded = useAsyncResource<LoadedDetail>(
    key,
    async () => {
      const [descriptor, record] = await Promise.all([
        entityDescriptorClient.detail(client, entityCode, recordId),
        entityDescriptorClient.record(client, entityCode, recordId),
      ]);
      return { descriptor, record };
    },
    [client, entityCode, recordId],
  );
  if (!loaded.data)
    return (
      <PageWorkspace
        header={{ level: "collection", title: humanizeIdentifier(entityCode) }}
      >
        {loaded.error ? (
          <ErrorSurface
            model={classifyAppError({ error: loaded.error, applicationName: humanizeIdentifier(entityCode) })}
            reset={loaded.reload}
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
