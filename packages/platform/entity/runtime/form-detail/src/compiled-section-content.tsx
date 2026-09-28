"use client";
import { useMemo } from "react";
import { useEntityI18n } from "@athyper/platform-i18n/entity-react";
import { asComment, asAttachment } from "./collaboration-read-models";
import type { EntityRuntimeSectionResource } from "@athyper/platform-entity-descriptor-client";
import { FileTextIcon } from "@athyper/platform-icons";
import { PanelEmptyState } from "@athyper/platform-ui";

import { CommentsWorkspace } from "./comments-workspace";
import { CollectionContinuation } from "./collection-continuation";
import {
  AttachmentCollection,
  AttachmentUploader,
} from "./attachment-workspace";
import {
  commentFields,
  attachmentFields,
  Fields,
  Collection,
  collectionItems,
  valueRecord,
  hasMore,
  humanize,
} from "./section-primitives";


export function CompiledEntitySectionContent({
  resource,
  entityCode,
  recordId,
  onChanged,
  onLoadMore,
  loadingMore,
  loadMoreError,
  onLoadThreadPage,
  onLoadMentionsPage,
}: {
  readonly resource: EntityRuntimeSectionResource;
  readonly entityCode?: string;
  readonly recordId?: string;
  readonly onChanged?: () => void;
  readonly onLoadMore?: () => void;
  readonly loadingMore?: boolean;
  readonly loadMoreError?: string;
  readonly onLoadMentionsPage?: (cursor?: string, signal?: AbortSignal) => Promise<EntityRuntimeSectionResource>;
  readonly onLoadThreadPage?: (
    threadRootId: string,
    cursor?: string,
  ) => Promise<EntityRuntimeSectionResource>;
}) {
  const intl = useEntityI18n();
  const values = valueRecord(resource.data);
  const fieldValues = valueRecord(values?.values) ?? values;
  const parsed = useMemo(() => {
    const parser = resource.presentation.rendererKey === "platform.comments.v1" ? asComment
      : resource.presentation.rendererKey === "platform.attachments.v1" ? asAttachment : undefined;
    if (!parser) return { items: collectionItems(resource.data), rejected: 0 };
    const root = valueRecord(resource.data);
    const envelope = root && Object.hasOwn(root, "data") ? valueRecord(root.data) : root;
    if (!envelope || !Array.isArray(envelope.items)) return undefined;
    let rejected = 0;
    const items = envelope.items.flatMap(item => {
      try { return [parser(item)]; } catch { rejected++; return []; }
    });
    return { items, rejected };
  }, [resource.data, resource.presentation.rendererKey]);
  const items = parsed?.items;
  const warning = parsed?.rejected ? <p role="status">{intl.message("collaboration.partialResponse")}</p> : null;
  if (!items) {
    return (
      <PanelEmptyState
        icon={<FileTextIcon />}
        title={intl.message("collaboration.invalidResponseTitle")}
        description={intl.message("collaboration.invalidResponse")}
      />
    );
  }
  const actions = new Set(
    resource.capability?.actions.map((action) => action.key) ?? [],
  );
  const collections = valueRecord((valueRecord(values?.data) ?? values)?.collections);
  const groups = resource.presentation.childCollections.filter(group => Array.isArray(collections?.[group.key]));
  const more = hasMore(resource.data) && onLoadMore
    ? <CollectionContinuation key={`${entityCode}:${recordId}:${resource.sectionKey}`} cursor={String(values?.nextCursor)} loading={loadingMore} failed={!!loadMoreError} onLoadMore={onLoadMore} /> : null;
  const groupedContent = groups.length ? <div>{groups.map(group => {
    const label = group.label?.defaultText ?? humanize(group.key);
    const content = <>{group.description && <p>{group.description}</p>}<Collection fields={group.fields} rowFields={group.rowFields} items={(collections![group.key] as unknown[]).filter(valueRecord) as Readonly<Record<string, unknown>>[]}
      sectionLabel={label} emptyState={group.display === "disclosure" ? undefined : resource.presentation.emptyState} /></>;
    return group.display === "disclosure" ? <details key={group.key}><summary>{label}</summary>{content}</details>
      : <section key={group.key}><h3>{label}</h3>{content}</section>;
  })}</div> : null;
  if (resource.presentation.rendererKey === "platform.postal-address.v1") {
    return <><Collection fields={resource.presentation.fields} items={items} sectionLabel="Addresses" emptyState={resource.presentation.emptyState} />{more}</>;
  }
  if (resource.presentation.rendererKey === "platform.related-collection.v1") {
    if (groupedContent) return <>{items.length ? <Collection fields={resource.presentation.fields} items={items} emptyState={resource.presentation.emptyState} /> : null}{groupedContent}{more}</>;
    return (<>
      <Collection
        fields={resource.presentation.fields}
        items={items}
        emptyState={resource.presentation.emptyState}
      />
      {more}
    </>);
  }
  if (resource.presentation.rendererKey === "platform.comments.v1") {
    if (entityCode && recordId && onChanged)
      return (
        <>{warning}<CommentsWorkspace
          key={`${entityCode}:${recordId}`}
          resource={resource}
          entityCode={entityCode}
          recordId={recordId}
          onChanged={onChanged}
          onLoadMore={onLoadMore}
          loadingMore={loadingMore}
          loadMoreError={loadMoreError}
          onLoadThreadPage={onLoadThreadPage}
          onLoadMentionsPage={onLoadMentionsPage}
        /></>
      );
    return (
      <>{warning}<Collection
        fields={commentFields}
        items={items}
        sectionLabel={intl.message("collaboration.comments")}
      /></>
    );
  }
  if (resource.presentation.rendererKey === "platform.attachments.v1") {
    const folderValue = valueRecord(resource.data)?.folders;
    const folders: readonly Readonly<Record<string, unknown>>[] = Array.isArray(
      folderValue,
    )
      ? (folderValue.filter(valueRecord) as readonly Readonly<
          Record<string, unknown>
        >[])
      : [];
    return (
      <div className="a-collaboration-files">
        {warning}
        {entityCode && recordId && onChanged ? (
          <AttachmentCollection
            uploadPolicy={resource.capability}
            key={`${entityCode}:${recordId}`}
            entityCode={entityCode}
            recordId={recordId}
            items={items}
            folders={folders}
            workspaceRevision={String(
              valueRecord(resource.data)?.workspaceRevision ??
                resource.revision,
            )}
            canPreview={actions.has("preview")}
            canSearch={actions.has("search")}
            canDownload={actions.has("download")}
            canUnlink={actions.has("unlink")}
            canArchive={actions.has("archive")}
            canRename={actions.has("rename")}
            canVersion={actions.has("version")}
            canCategory={actions.has("category")}
            canFolder={actions.has("folder")}
            onChanged={onChanged}
            loadMore={
              hasMore(resource.data) && onLoadMore ? (
                <CollectionContinuation cursor={String(values?.nextCursor)} automatic={false} label="Load more files" loading={loadingMore} failed={!!loadMoreError} onLoadMore={onLoadMore} />
              ) : null
            }
            upload={
              actions.has("create") && actions.has("finalize") ? (
                <AttachmentUploader
                  key={`${entityCode}:${recordId}`}
                  capability={resource.capability}
                  entityCode={entityCode}
                  recordId={recordId}
                  knownItems={items}
                  canVersion={actions.has("version")}
                  onChanged={onChanged}
                />
              ) : null
            }
          />
        ) : (
          <Collection
            fields={attachmentFields}
            items={items}
            sectionLabel="Files"
          />
        )}
      </div>
    );
  }
  return <><Fields fields={resource.presentation.fields} values={fieldValues} />{groupedContent}{more}</>;
}
