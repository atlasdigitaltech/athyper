"use client";
import { RecordPanelActionContext, RecordPanelToolbarActions } from "./panel-header-action";
import { RecordActionDock } from "./record-action-dock";
import { useEntityI18n } from "@athyper/platform-i18n/entity-react";
import { CollectionContinuation } from "./collection-continuation";
import { hasRichTextContent, mapRichText, visitRichText } from "@athyper/platform-communications-collaboration-ui";
import { downloadAttachment } from "./attachment-download";
import { asComment, type CommentRow } from "./collaboration-read-models";
import {
  CollaborationPresentationContext,
  CollaborationToolbarContext,
  CollaborationVisibilityContext,
} from "./collaboration-visibility";
import {
  CollaborationActions,
  collaborationTime,
  collaborationFileSize,
} from "./collaboration-actions";
import { AttachmentPreview } from "./attachment-preview";
import { AttachmentThumbnail } from "./attachment-thumbnail";
import { FileAction } from "./file-action";
import {
  entityRuntimeClient,
  type EntityRuntimeSectionResource,
} from "@athyper/platform-entity-descriptor-client";
import {
  ApiTransportError,
  createOperation,
} from "@athyper/platform-api-client";
import {
  useApiClient,
  readBrowserCsrfToken,
  useSessionIdentity,
  useToasts,
} from "@athyper/platform-shell-app-foundation";
import {
  MessageCircleIcon,
  ThumbsUpIcon,
  ReplyIcon,
  EyeIcon,
  DownloadIcon,
  CloseIcon,
} from "@athyper/platform-icons";
import {
  RichCommentComposer,
  type RichCommentSubmission,
  type RichTextDocument,
} from "@athyper/platform-communications-collaboration-ui";
import {
  Button,
  Card,
  Dialog,
  DialogContent,
  ChoiceSelect,
  Tooltip,
} from "@athyper/platform-ui";
import { createPortal } from "react-dom";
import {
  Fragment,
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";

import {
  EmptySectionState,
  collectionItems,
  valueRecord,
  hasMore,
  message,
} from "./section-primitives";
import {
  commentCreate,
  commentDraft,
  commentDraftCancel,
  commentEdit,
  commentDelete,
  commentReply,
  commentReaction,
  commentReactionDelete,
  commentFlag,
} from "./collaboration-operations";
import type { CompiledEntitySectionContent } from "./compiled-section-content";
import {
  editableCommentDocument,
  draftDocument,
  richText,
  renderComment,
} from "./rich-text-render";

export async function prepareCommentFiles(
  client: ReturnType<typeof useApiClient>,
  entityCode: string,
  recordId: string,
  document: RichTextDocument,
  visibility: "public" | "internal" | "private",
  parentCommentId?: string,
  editDraftScope?: string,
) {
  // Use the same record-scoped capability endpoint as Files. Reference entities
  // need not publish a presentation.detail surface.
  const files = await entityRuntimeClient.collaboration(client, {
    entityCode,
    recordId,
    kind: "attachments",
  });
  const capability = files.capability;
  if (
    !capability?.actions.some((action) => action.key === "create") ||
    !capability.actions.some((action) => action.key === "finalize") ||
    !capability.allowedContentTypes ||
    !capability.maxFileBytes
  )
    throw new Error("File uploads are not authorized for this record.");
  // The draft endpoint is an upsert for this isolated composer scope. The
  // caller owns that scope and must clean it up if the edit is abandoned.
  const draft = valueRecord(
    await client.request(commentDraft, {
      body: {
        entityType: entityCode,
        entityId: recordId,
        ...(editDraftScope ? { contextType: editDraftScope } : {}),
        ...(parentCommentId ? { parentCommentId } : {}),
        text: richText(document),
        format: "rich_json",
        content: document,
        visibility,
      },
    }),
  );
  if (typeof draft?.id !== "string")
    throw new Error("Unable to prepare the attachment draft.");
  return {
    draftId: draft.id,
    allowedContentTypes: capability.allowedContentTypes,
    maxFileBytes: capability.maxFileBytes,
  };
}

export type ReplyTarget = {
  id: string;
  rootId: string;
  name: string;
  excerpt: string;
};
/** Reveal newly opened editors, and re-check when a mobile keyboard resizes the viewport. */
function useComposerReveal(ref: RefObject<HTMLDivElement | null>, open: boolean) {
  useEffect(() => {
    if (!open) return;
    let frame = 0;
    const reveal = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const node = ref.current;
        if (!node) return;
        const viewport = window.visualViewport;
        const workspace = node.closest<HTMLElement>(".a-collaboration-comments");
        workspace?.style.setProperty("--comment-viewport-height", `${viewport?.height ?? window.innerHeight}px`);
        workspace?.style.setProperty("--comment-keyboard-inset", `${Math.max(0, window.innerHeight - (viewport?.height ?? window.innerHeight) - (viewport?.offsetTop ?? 0))}px`);
        node.scrollIntoView({ block: "nearest", behavior: "instant" });
        const bottom = (viewport?.height ?? window.innerHeight) + (viewport?.offsetTop ?? 0) - 12;
        const overflow = node.getBoundingClientRect().bottom - bottom;
        if (overflow > 0) window.scrollBy({ top: overflow, behavior: "instant" });
      });
    };
    reveal();
    window.visualViewport?.addEventListener("resize", reveal);
    return () => {
      cancelAnimationFrame(frame);
      window.visualViewport?.removeEventListener("resize", reveal);
      const workspace = ref.current?.closest<HTMLElement>(".a-collaboration-comments");
      workspace?.style.removeProperty("--comment-viewport-height");
      workspace?.style.removeProperty("--comment-keyboard-inset");
    };
  }, [ref, open]);
}
export const ReplyComposerContext = createContext<{
  activeEditor?: "create" | "edit";
  activate: (editor?: "create" | "edit") => void;
  target?: ReplyTarget;
  sent?: { rootId: string; id?: string; sequence: number };
  host?: HTMLDivElement;
  fallback?: RefObject<HTMLDivElement | null>;
  inline?: boolean;
  select: (target: ReplyTarget) => void;
}>({ select: () => {}, activate: () => {} });
/** Move the same editor DOM so changing presentation never restarts uploads. */
export function ReplyComposerPlacement({
  fallback = false,
}: {
  fallback?: boolean;
}) {
  const context = useContext(ReplyComposerContext);
  const slot = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const node = slot.current,
      host = context.host;
    if (!node || !host) return;
    if (fallback) context.fallback!.current = node;
    if (!fallback || !host.isConnected) node.appendChild(host);
    return () => {
      // Filters or collapsing a thread can remove the selected comment.
      // Keep its draft reachable in the bottom composer in that case.
      if (!fallback && node.contains(host))
        context.fallback?.current?.appendChild(host);
    };
  }, [context.host, fallback]);
  return <div ref={slot} className="a-comment-compose-placement" />;
}
export function CommentsWorkspace({
  resource,
  entityCode,
  recordId,
  onChanged,
  onLoadMore,
  loadingMore,
  loadMoreError,
  onLoadThreadPage,
  onLoadMentionsPage,
}: Parameters<typeof CompiledEntitySectionContent>[0] & {
  entityCode: string;
  recordId: string;
  onChanged: () => void;
}) {
  const intl = useEntityI18n();
  const [linkNotice, setLinkNotice] = useState<string>();
  const commentItems = useMemo(() => collectionItems(resource.data), [resource.data]);
  const [replyNotice, setReplyNotice] = useState<string>();
  const linkedPage = useRef<unknown>(undefined),
    linkedDone = useRef<string | undefined>(undefined);
  const linkedRootPages = useRef(0);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search),
      id = params.get("commentId"),
      root = params.get("threadRootId") ?? id;
    if (!id || !root || linkedDone.current === `${recordId}/${id}`) return;
    const element = document.getElementById(`comment-${id}`);
    if (element) {
      linkedDone.current = `${recordId}/${id}`;
      element.setAttribute("tabindex", "-1");
      element.focus({ preventScroll: true });
      element.scrollIntoView({ block: "center" });
      setLinkNotice(undefined);
      return;
    }
    const items = collectionItems(resource.data);
    if (items.some((item) => String(item.id) === root)) {
      linkedDone.current = `${recordId}/${id}`;
      setLinkNotice(undefined);
      return;
    } // Thread owns reply pagination.
    if (
      hasMore(resource.data) &&
      onLoadMore &&
      linkedPage.current !== resource.data
    ) {
      linkedPage.current = resource.data;
      if (linkedRootPages.current >= 5) {
        setLinkNotice("The linked comment is not loaded. Use Load more comments to continue.");
        return;
      }
      linkedRootPages.current++;
      setLinkNotice("Finding the linked comment…");
      Promise.resolve(onLoadMore()).catch(() =>
        setLinkNotice(
          "Could not load the linked comment. Use Load more comments to retry.",
        ),
      );
    } else if (!hasMore(resource.data) && items.length) {
      setLinkNotice(
        "This comment is no longer available in this conversation.",
      );
    }
  }, [recordId, resource.data, onLoadMore]);
  const [target, setTarget] = useState<ReplyTarget>(),
    [sent, setSent] = useState<{
      rootId: string;
      id?: string;
      sequence: number;
    }>();
  const [activeEditor, activateEditor] = useState<"create" | "edit">();
  const composerOpen = activeEditor === "create";
  const setComposerOpen = (open: boolean) => activateEditor(open ? "create" : undefined);
  const [hasDraft, setHasDraft] = useState(() => Boolean(valueRecord(valueRecord(resource.data)?.draft)));
  const composeToggle = useRef<HTMLButtonElement>(null);
  const { push: notify } = useToasts();
  const draftPresent = (draft?: Readonly<Record<string, unknown>>) => Boolean(draft && (draft.text || (draft.content && hasRichTextContent(draft.content as RichTextDocument))));
  const drafts = useRef(new Map<string, Readonly<Record<string, unknown>>>());
  const busyRef = useRef(false);
  const composer = useRef<HTMLDivElement>(null),
    fallback = useRef<HTMLDivElement>(null);
  useComposerReveal(composer, composerOpen);
  const managedPanel = useContext(RecordPanelActionContext);
  const fullView = useContext(CollaborationPresentationContext) === "content";
  const [host, setHost] = useState<HTMLDivElement>();
  useEffect(() => {
    const node = document.createElement("div");
    setHost(node);
    return () => node.remove();
  }, []);
  const actions = new Set(
    resource.capability?.actions.map((action) => action.key) ?? [],
  );
  const draftKey = target?.id ?? "root";
  const focusComposer = () =>
    requestAnimationFrame(() =>
      composer.current
        ?.querySelector<HTMLElement>('[contenteditable="true"]')
        ?.focus({ preventScroll: true }),
    );

  useEffect(() => {
    if (target) {
      const frame = requestAnimationFrame(() => {
        const editor = composer.current?.querySelector<HTMLElement>(
          '[contenteditable="true"]',
        );
        editor?.focus({ preventScroll: true });
        if (!fullView) editor?.scrollIntoView({ block: "nearest" });
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [target, fullView, host]);
  return (
    <ReplyComposerContext.Provider
      value={{
        activeEditor,
        activate: activateEditor,
        target,
        sent,
        host,
        fallback,
        inline: false,
        select: (next) => {
          if (busyRef.current) {
            setReplyNotice("Finish sending the current reply before starting another.");
            return;
          }
          setComposerOpen(true);
          setTarget(next);
          focusComposer();
        },
      }}
    >
      <div className="a-collaboration-comments" data-editing={activeEditor === "edit" || undefined}>
        <div className="a-comment-feed">
          {linkNotice ? <p role="status">{linkNotice}</p> : null}
          <CommentCollection
            entityCode={entityCode}
            recordId={recordId}
            items={commentItems}
            onChanged={onChanged}
            capability={resource.capability}
            actions={actions}
            onLoadThreadPage={onLoadThreadPage}
            onLoadMentionsPage={onLoadMentionsPage}
          />
          {hasMore(resource.data) && onLoadMore ? (
            <CollectionContinuation cursor={String(valueRecord(resource.data)?.nextCursor)} automatic={false} label={intl.message("comments.loadMore")} loading={loadingMore} failed={!!loadMoreError} onLoadMore={onLoadMore} />
          ) : null}
        </div>
        <RecordActionDock className="a-comment-compose-dock" tabIndex={-1} hidden={!(target ? actions.has("reply") : actions.has("create"))}>
          {target && !composerOpen ? <button ref={composeToggle} type="button" onClick={()=>{setComposerOpen(true);focusComposer();}}>{intl.message("comments.resumeReply")}</button> : null}
          <ReplyComposerPlacement fallback />
        </RecordActionDock>
        {host && (target ? actions.has("reply") : actions.has("create"))
          ? createPortal(
              <div ref={composer} className="a-comment-compose-slot" hidden={!composerOpen && Boolean(target)}>
                {replyNotice ? <p role="status">{replyNotice}</p> : null}
                <CommentComposer
                  key={draftKey}
                  compact={!composerOpen && !target}
                  onExpand={()=>setComposerOpen(true)}
                  placeholder={managedPanel?.recordLabel ? intl.message("comments.placeholderRecord",{record:managedPanel.recordLabel}) : intl.message("comments.placeholder")}
                  onMinimize={() => { setComposerOpen(false); requestAnimationFrame(() => composer.current?.closest<HTMLElement>(".a-comment-compose-dock")?.focus({preventScroll:true})); }}
                  entityCode={entityCode}
                  recordId={recordId}
                  parentCommentId={target?.id}
                  replyToName={target?.name}
                  replyExcerpt={target?.excerpt}
                  initialDraft={
                    drafts.current.get(draftKey) ??
                    (!target
                      ? valueRecord(valueRecord(resource.data)?.draft)
                      : undefined)
                  }
                  onBusyChange={(busy) => {
                    busyRef.current = busy;
                    if (!busy) setReplyNotice(undefined);
                  }}
                  onDraftSnapshot={(draft) => {
                    drafts.current.set(draftKey, draft);
                    setHasDraft(draftPresent(draft));
                  }}
                  onPosted={(id) => {
                    drafts.current.delete(draftKey);
                    setComposerOpen(false);
                    setHasDraft(draftPresent(drafts.current.get("root")));
                    notify({
                      tone: "success",
                      title: intl.message(target ? "comments.replyPosted" : "comments.postedTitle"),
                      ...(id ? { action: { label: intl.message("comments.view"), onClick: () => {
                        const comment = document.getElementById(`comment-${id}`);
                        if (comment?.getClientRects().length) {
                          comment.setAttribute("tabindex", "-1");
                          comment.focus({ preventScroll: true });
                          comment.scrollIntoView({ block: "center" });
                        } else {
                          setLinkNotice("Your comment was posted. Load more comments or adjust the filters to find it.");
                        }
                      } } } : {}),
                    });
                    requestAnimationFrame(() => composer.current?.closest<HTMLElement>(".a-comment-compose-dock")?.focus({preventScroll:true}));
                    if (target)
                      setSent({
                        rootId: target.rootId,
                        id,
                        sequence: Date.now(),
                      });
                    setTarget(undefined);
                  }}
                  onDismiss={
                    target
                      ? () => {
                          setTarget(undefined);
                          setHasDraft(draftPresent(drafts.current.get("root")));
                          focusComposer();
                        }
                      : undefined
                  }
                  capability={resource.capability}
                  onChanged={onChanged}
                />
              </div>,
              host,
            )
          : null}
      </div>
    </ReplyComposerContext.Provider>
  );
}
export function CommentComposer({
  entityCode,
  recordId,
  onChanged,
  capability,
  initialDraft,
  parentCommentId,
  replyToName,
  replyExcerpt,
  onDraftSnapshot,
  onPosted,
  onBusyChange,
  onDismiss,
  onMinimize, compact, onExpand, placeholder,
}: {
  readonly entityCode: string;
  readonly recordId: string;
  readonly onChanged: () => void;
  readonly capability?: EntityRuntimeSectionResource["capability"];
  readonly initialDraft?: Readonly<Record<string, unknown>>;
  readonly parentCommentId?: string;
  readonly replyToName?: string;
  readonly replyExcerpt?: string;
  readonly onBusyChange?: (busy: boolean) => void;
  readonly onDraftSnapshot?: (draft: Readonly<Record<string, unknown>>) => void;
  readonly onPosted?: (id?: string) => void;
  readonly onDismiss?: () => void;
  readonly onMinimize?: () => void;
  readonly compact?: boolean;
  readonly onExpand?: () => void;
  readonly placeholder?: string;
}) {
  const intl = useEntityI18n();
  const { push: notify } = useToasts();
  const identity = useSessionIdentity();
  const client = useApiClient(),
    [error, setError] = useState<string>();
  const [draftId, setDraftId] = useState<string | undefined>(
    typeof initialDraft?.id === "string" ? initialDraft.id : undefined,
  );
  const justPosted = useRef(false);
  const draftTimer = useRef<number | undefined>(undefined),
    draftEpoch = useRef(0);
  const draftWrite = useRef<Promise<void> | undefined>(undefined);
  // A key represents a user's submission intent, not an individual HTTP
  // attempt. Retaining it makes a retry after a timeout safely idempotent.
  const submissionIntent = useRef<
    { readonly signature: string; readonly idempotencyKey: string } | undefined
  >(undefined);
  useEffect(
    () => () => {
      if (draftTimer.current) window.clearTimeout(draftTimer.current);
    },
    [],
  );
  const actions = new Set(
    capability?.actions.map((action) => action.key) ?? [],
  );
  const initialDocument = draftDocument(initialDraft);
  const clearDraft = async () => {
    if (!actions.has("draft")) return;
    await client.request(commentDraftCancel, {
      query: {
        entityType: entityCode,
        entityId: recordId,
        ...(parentCommentId ? { parentCommentId } : {}),
      },
    });
    setDraftId(undefined);
  };
  const saveDraft = (
    document: RichTextDocument,
    visibility = capability?.defaultAudience ?? "private",
  ) => {
    if (justPosted.current) {
      justPosted.current = false;
      return;
    }
    onDraftSnapshot?.({
      id: draftId,
      content: document,
      format: "rich_json",
      visibility,
    });
    const epoch = ++draftEpoch.current;
    if (!actions.has("draft")) return;
    if (draftTimer.current) window.clearTimeout(draftTimer.current);
    draftTimer.current = window.setTimeout(() => {
      let uploading = false;
      visitRichText(document, node => { if (node.type === "pendingImage") uploading = true; });
      // Do not lose surrounding prose just because an inline image is still
      // uploading. Persist a safe draft without the pending node; the upload
      // completion emits another draft change and replaces it with the final
      // attachment reference.
      const transformed = uploading
        ? mapRichText(document, node => node.type === "pendingImage" ? null : node)
        : document;
      const persistable: RichTextDocument = transformed?.type === "doc"
        ? transformed as RichTextDocument
        : { ...document, content: [] };
      const text = richText(persistable);
      if (!hasRichTextContent(persistable)) {
        void clearDraft().catch((cause) => setError(message(cause)));
        return;
      }
      draftWrite.current = client
        .request(commentDraft, {
          body: {
            entityType: entityCode,
            entityId: recordId,
            ...(parentCommentId ? { parentCommentId } : {}),
            text,
            format: "rich_json",
            content: persistable,
            visibility,
          },
        })
        .then((saved) => {
          if (epoch !== draftEpoch.current) return;
          const value = valueRecord(saved);
          if (typeof value?.id === "string") setDraftId(value.id);
        })
        .catch((cause) => setError(message(cause)));
    }, 600);
  };
  const submit = async (submission: RichCommentSubmission) => {
    draftEpoch.current += 1;
    if (draftTimer.current) window.clearTimeout(draftTimer.current);
    setError(undefined);
    await draftWrite.current;
    const signature = JSON.stringify({
      text: submission.text || "[Attachment]",
      content: submission.content,
      visibility: submission.visibility,
      attachmentIds: submission.attachmentIds,
      parentCommentId,
    });
    const idempotencyKey = submissionIntent.current?.signature === signature
      ? submissionIntent.current.idempotencyKey
      : crypto.randomUUID();
    submissionIntent.current = { signature, idempotencyKey };
    try {
      const body = {
        entityType: entityCode,
        entityId: recordId,
        text: submission.text || "[Attachment]",
        format: submission.format,
        content: submission.content,
        visibility: submission.visibility,
        attachmentIds: submission.attachmentIds,
        idempotencyKey,
      };
      const posted = parentCommentId
        ? await client.request(commentReply(parentCommentId), {
            body,
            idempotencyKey,
          })
        : await client.request(commentCreate, { body, idempotencyKey });
      await clearDraft();
      submissionIntent.current = undefined;
      if (!onPosted) notify({
        tone: "success",
        title: parentCommentId ? intl.message("comments.replyPosted") : intl.message("comments.postedTitle"),
      });
      justPosted.current = true;
      onChanged();
      onPosted?.(
        typeof valueRecord(posted)?.id === "string"
          ? String(valueRecord(posted)?.id)
          : undefined,
      );
    } catch (cause) {
      setError(message(cause));
      throw cause;
    }
  };
  return (
    <RichCommentComposer
      className="a-comment-composer-card"
      compact={compact} onExpand={onExpand} placeholder={placeholder}
      header={
        <>
          <span className="a-comment-composer-title">
            {parentCommentId
              ? `Reply to ${replyToName ?? "participant"}`
              : intl.message("comments.composerTitle")}
          </span>
          {onMinimize ? <Tooltip portal label={intl.message("comments.minimize")}><button className="a-comment-minimize" type="button" aria-label={intl.message("comments.minimize")} onClick={onMinimize}><CloseIcon size={18}/></button></Tooltip> : null}
          {replyExcerpt ? (
            <p className="a-comment-reply-excerpt">{replyExcerpt}</p>
          ) : null}
        </>
      }
      supportingContent={<>{error ? <p role="alert">{error}</p> : null}</>}
      entityType={entityCode}
      entityId={recordId}
      parentCommentId={parentCommentId}
      initialDocument={initialDocument}
      currentPrincipalId={identity.scope?.principalId}
      searchMentions={
        actions.has("mention")
          ? mentionSearch(client, entityCode, recordId)
          : undefined
      }
      draftId={draftId}
      csrfToken={readBrowserCsrfToken}
      renderAttachment={(id, name) => <CommentFile attachmentId={id} name={name} version="" />}
      maxAttachments={capability?.maxAttachments}
      prepareAttachments={async (document, visibility) => {
        if (draftTimer.current) window.clearTimeout(draftTimer.current);
        draftEpoch.current++;
        await draftWrite.current;
        const prepared = await prepareCommentFiles(
          client,
          entityCode,
          recordId,
          document,
          visibility,
          parentCommentId,
        );
        setDraftId(prepared.draftId);
        return prepared;
      }}
      allowedAudiences={capability?.allowedAudiences}
      defaultAudience={
        (initialDraft?.visibility as
          "public" | "internal" | "private" | undefined) ??
        capability?.defaultAudience
      }
      allowAttachments={
        capability?.maxAttachments !== undefined &&
        capability.maxAttachments > 0
      }
      onDraftChange={saveDraft}
      onSubmit={submit}
      onBusyChange={onBusyChange}
      submitLabel={parentCommentId ? intl.message("comments.sendReply") : intl.message("action.send")}
      onCancel={onDismiss}
      cancelLabel={intl.message("comments.cancelReply")}
    />
  );
}
const PendingReactionsContext = createContext<ReadonlySet<string>>(new Set());

export const CommentEditContext = createContext<{
  id?: string;
  editor?: ReactNode;
}>({});
export function CommentCollection({
  entityCode,
  recordId,
  items,
  onChanged,
  capability,
  actions,
  onLoadThreadPage,
  onLoadMentionsPage,
}: {
  readonly entityCode: string;
  readonly recordId: string;
  readonly capability?: EntityRuntimeSectionResource["capability"];
  readonly actions: ReadonlySet<string>;
  readonly items: readonly Readonly<Record<string, unknown>>[];
  readonly onChanged: () => void;
  readonly onLoadMentionsPage?: (cursor?: string, signal?: AbortSignal) => Promise<EntityRuntimeSectionResource>;
  readonly onLoadThreadPage?: (
    threadRootId: string,
    cursor?: string,
  ) => Promise<EntityRuntimeSectionResource>;
}) {
  const intl = useEntityI18n();
  const { push: notify } = useToasts();
  const client = useApiClient(),
    identity = useSessionIdentity();
  const [busy, setBusy] = useState<string>(),
    [error, setError] = useState<string>();
  const [editing, setEditing] = useState<Readonly<Record<string, unknown>>>(),
    [history, setHistory] = useState<Readonly<Record<string, unknown>>>();
  const composerActivity = useContext(ReplyComposerContext);
  const editMinimized = composerActivity.activeEditor !== "edit";
  const setEditMinimized = (minimized: boolean) => composerActivity.activate(minimized ? undefined : "edit");
  const editContainer = useRef<HTMLDivElement>(null);
  useComposerReveal(editContainer, Boolean(editing) && !editMinimized);
  const resumeEdit = useRef<HTMLButtonElement>(null);
  const [deleteTarget, setDeleteTarget] = useState<string>();
  const [feedError, setFeedError] = useState<string>();
  const [reportReason, setReportReason] = useState("");
  const [editConflict, setEditConflict] = useState(false);
  const [reportingId, setReportingId] = useState<string>(),
    [reportDetail, setReportDetail] = useState("");
  const toolbarRef = useContext(CollaborationToolbarContext);
  const [groupBy, setGroupBy] = useState("date");
  const [commentFilter, setCommentFilter] = useState("all"),
    [newestFirst, setNewestFirst] = useState(false);
  const mentionsLoader = useRef(onLoadMentionsPage);
  mentionsLoader.current = onLoadMentionsPage;
  const [mentionItems, setMentionItems] = useState<readonly Readonly<Record<string, unknown>>[]>([]);
  const [mentionCursor, setMentionCursor] = useState<string>();
  const [mentionBusy, setMentionBusy] = useState(false);
  const [mentionError, setMentionError] = useState<string>();
  const mentionRequest = useRef<AbortController | undefined>(undefined);
  const loadMentions = async (cursor?: string) => {
    mentionRequest.current?.abort();
    const controller = new AbortController();
    mentionRequest.current = controller;
    setMentionBusy(true);
    setMentionError(undefined);
    try {
      if (!mentionsLoader.current) throw new Error("Mentions search is unavailable on this surface.");
      const page = await mentionsLoader.current(cursor, controller.signal);
      if (controller.signal.aborted) return;
      setMentionItems(previous => [...new Map([...(cursor ? previous : []), ...collectionItems(page.data)]
        .map(item => [String(item.id), item])).values()]);
      setMentionCursor(typeof valueRecord(page.data)?.nextCursor === "string" ? String(valueRecord(page.data)?.nextCursor) : undefined);
    } catch (cause) {
      if (!controller.signal.aborted) setMentionError(message(cause));
    } finally {
      if (!controller.signal.aborted) setMentionBusy(false);
    }
  };
  useEffect(() => {
    mentionRequest.current?.abort();
    setMentionItems([]);
    setMentionCursor(undefined);
    if (commentFilter === "mentions") void loadMentions();
    return () => mentionRequest.current?.abort();
  }, [commentFilter, items, entityCode, recordId]);
  const editCreatedDraft = useRef(false);
  const editDraftScope = useRef<string | undefined>(undefined);
  const cleanupEditDraft = async () => {
    if (editCreatedDraft.current && editDraftScope.current) {
      const contextType = editDraftScope.current;
      editCreatedDraft.current = false;
      await client.request(commentDraftCancel, {
        query: { entityType: entityCode, entityId: recordId, contextType },
      });
    }
  };
  // An edit attachment draft has a unique server scope. Clean it up when the
  // workspace unmounts as well as when the user explicitly cancels editing.
  useEffect(
    () => () => {
      void cleanupEditDraft().catch(() => undefined);
    },
    [client, entityCode, recordId],
  );
  const historyEpoch = useRef(0),
    mutationPending = useRef(false);
  const visibleComments = (commentFilter === "mentions" ? mentionItems : items)
    .filter((item) =>
      commentFilter === "internal"
        ? item.visibility === "internal"
        : true,
    )
    .slice()
    .sort(
      (a, b) =>
        (groupBy === "user"
          ? String(a.authorDisplayName ?? "").localeCompare(
              String(b.authorDisplayName ?? ""),
            ) ||
            String(a.authorId ?? "").localeCompare(String(b.authorId ?? ""))
          : 0) ||
        (new Date(String(a.createdAt)).getTime() -
          new Date(String(b.createdAt)).getTime()) *
          (newestFirst ? -1 : 1),
    );
  const closeAction = () => {
    if (mutationPending.current) return;
    if (editing) {
      const id = String(editing.id);
      // Restore the reading position, not an action trigger: focusing the
      // remounted menu summary immediately opens its focus tooltip.
      requestAnimationFrame(() =>
        document
          .getElementById(`comment-${id}`)
          ?.focus({ preventScroll: true }),
      );
    }
    historyEpoch.current++;
    void cleanupEditDraft().catch((cause) => setError(message(cause)));
    if (composerActivity.activeEditor === "edit") composerActivity.activate(undefined);
    setEditing(undefined);
    setHistory(undefined);
    setReportingId(undefined);
    setDeleteTarget(undefined);
    setError(undefined);
  };
  async function loadHistory(id: string, beforeRevision?: number) {
    const epoch = ++historyEpoch.current;
    setError(undefined);
    setHistory((current) => ({
      commentId: id,
      items: beforeRevision && current?.commentId === id ? current.items : [],
      loading: true,
    }));
    try {
      const result = await client.request(
        createOperation<Readonly<Record<string, unknown>>>({
          method: "GET",
          path: () =>
            `/api/collab/comments/${encodeURIComponent(id)}/history${beforeRevision ? `?beforeRevision=${beforeRevision}` : ""}`,
        }),
        {},
      );
      if (epoch !== historyEpoch.current) return;
      setHistory((current) => ({
        ...result,
        commentId: id,
        items: [
          ...(beforeRevision && Array.isArray(current?.items)
            ? current.items
            : []),
          ...(Array.isArray(result.items) ? result.items : []),
        ],
        loading: false,
      }));
    } catch (cause) {
      if (epoch === historyEpoch.current) {
        setHistory((current) => ({ ...current, loading: false }));
        setError(message(cause));
      }
    }
  }
  async function remove(id: string) {
    if (mutationPending.current) return;
    mutationPending.current = true;
    setBusy(id);
    setError(undefined);
    try {
      await client.request(commentDelete(id), {});
      setDeleteTarget(undefined);
      notify({ tone: "success", title: intl.message("comments.deleted") });
      onChanged();
    } catch (cause) {
      setError(message(cause));
    } finally {
      mutationPending.current = false;
      setBusy(undefined);
    }
  }
  async function edit(item: Readonly<Record<string, unknown>>) {
    if (mutationPending.current) return;
    closeAction();
    editDraftScope.current = `entity_edit_${crypto.randomUUID().replaceAll("-", "")}`;
    setEditConflict(false);
    setEditMinimized(false);
    setEditing(item);
    requestAnimationFrame(() =>
      document
        .getElementById(`comment-${item.id}`)
        ?.querySelector<HTMLElement>('[contenteditable="true"]')
        ?.focus({ preventScroll: true }),
    );
  }
  const reactionsPending = useRef(new Set<string>());
  const [reactionIds, setReactionIds] = useState<ReadonlySet<string>>(
    new Set(),
  );
  async function react(id: string, code: string, active: boolean) {
    if (mutationPending.current || reactionsPending.current.has(id)) return;
    reactionsPending.current.add(id);
    setReactionIds(new Set(reactionsPending.current));
    setFeedError(undefined);
    try {
      if (active) await client.request(commentReactionDelete(id, code), {});
      else await client.request(commentReaction(id), { body: { code } });
      onChanged();
    } catch (cause) {
      setFeedError(message(cause));
    } finally {
      reactionsPending.current.delete(id);
      setReactionIds(new Set(reactionsPending.current));
    }
  }
  async function flag(id: string) {
    closeAction();
    setReportingId(id);
    setReportReason("");
    setReportDetail("");
  }
  async function showHistory(id: string) {
    closeAction();
    await loadHistory(id);
  }
  async function submitReport() {
    if (!reportingId || !reportReason || mutationPending.current) return;
    mutationPending.current = true;
    setBusy(reportingId);
    setError(undefined);
    try {
      await client.request(commentFlag(reportingId), {
        body: {
          reasonCode: reportReason,
          ...(reportDetail.trim() ? { detail: reportDetail.trim() } : {}),
        },
      });
      setReportingId(undefined);
      setReportDetail("");
      notify({ tone: "success", title: intl.message("comments.reportSubmitted") });
      onChanged();
    } catch (cause) {
      setError(message(cause));
    } finally {
      mutationPending.current = false;
      setBusy(undefined);
    }
  }
  const historyContent = history ? (
    <section aria-label={intl.message("comments.savedRevisions")} aria-busy={history.loading === true}>
      {history.loading ? <p role="status">{intl.message("comments.loadingHistory")}</p> : null}
      {history.deletion ? (
        <div>
          <p>{intl.message("comments.deleted")}{valueRecord(history.deletion)?.deletedAt
              ? ` · ${collaborationTime(valueRecord(history.deletion)?.deletedAt, intl)}`
              : ""}
          </p>
          <p>{intl.message("comments.deletedHelp")}</p>
        </div>
      ) : null}
      {Array.isArray(history.items) && history.items.length ? (
        history.items.map((entry: any) => (
          <article className="a-comment-history-entry" key={entry.revision}>
            <strong>{intl.message("comments.revision", {revision: Number(entry.revision)})}</strong>
            <time dateTime={entry.createdAt}>
              {collaborationTime(entry.createdAt, intl)}
            </time>
            <div className="a-comment-content">{renderComment(entry)}</div>
          </article>
        ))
      ) : !history.loading && !error && !history.deletion ? (
        <p>{intl.message("comments.noRevisions")}</p>
      ) : null}
      {typeof history.nextRevision === "number" ? (
        <Button
          type="button"
          disabled={history.loading === true}
          onClick={() =>
            void loadHistory(
              String(history.commentId),
              Number(history.nextRevision),
            )
          }
        >{intl.message("comments.olderRevisions")}</Button>
      ) : null}
      {editing &&
      Array.isArray(history.items) &&
      Number(history.items[0]?.revision) > Number(editing.revision) ? (
        <Button
          type="button"
          onClick={() => {
            setEditing({
              ...editing,
              revision: Number((history.items as any[])[0].revision),
            });
            setError(undefined);
          }}
        >{intl.message("comments.keepUnsaved")}</Button>
      ) : null}
      {!editing ? (
        <Button type="button" onClick={closeAction}>{intl.message("comments.closeHistory")}</Button>
      ) : null}
    </section>
  ) : null;
  const editContent = editing ? (
    <>
      {editMinimized ? <div className="a-comment-compose-toggle"><button ref={resumeEdit} type="button" aria-expanded={false} onClick={() => {setEditMinimized(false); requestAnimationFrame(() => editContainer.current?.querySelector<HTMLElement>('[contenteditable="true"]')?.focus({preventScroll:true}));}}>{intl.message("comments.resumeEdit")}</button></div> : null}
      <div ref={editContainer} className="a-comment-edit-editor" hidden={editMinimized}>
      <RichCommentComposer
        key={String(editing.id)}
        entityType={entityCode}
        entityId={recordId}
        initialDocument={editableCommentDocument(editing)}
        currentPrincipalId={identity.scope?.principalId}
      searchMentions={
          actions.has("mention")
            ? mentionSearch(client, entityCode, recordId)
            : undefined
        }
        audienceLockedReason={intl.message("comments.audienceLocked")}
        allowedAudiences={[
          editing.visibility as "public" | "internal" | "private",
        ]}
        header={<span>{intl.message("comments.edit")}</span>}
        headerActions={<Tooltip portal label={intl.message("comments.minimize")}><button className="a-comment-minimize" type="button" aria-label={intl.message("comments.minimize")} onClick={() => {setEditMinimized(true);requestAnimationFrame(() => resumeEdit.current?.focus({preventScroll:true}));}}><CloseIcon size={18}/></button></Tooltip>}
        submitLabel={intl.message("action.saveChanges")}
        submitAriaLabel={intl.message("comments.save")}
        onCancel={closeAction}
        cancelLabel={intl.message("comments.cancelEdit")}
        csrfToken={readBrowserCsrfToken}
      renderAttachment={(id, name) => <CommentFile attachmentId={id} name={name} version="" />}
      maxAttachments={capability?.maxAttachments}
        allowAttachments={Boolean(capability?.maxAttachments)}
        prepareAttachments={async (document, visibility) => {
          const prepared = await prepareCommentFiles(
            client,
            entityCode,
            recordId,
            document,
            visibility,
            undefined,
            editDraftScope.current,
          );
          editCreatedDraft.current = true;
          return prepared;
        }}
        onSubmit={async (submission) => {
          mutationPending.current = true;
          setBusy(String(editing.id));
          setError(undefined);
          try {
            await client.request(commentEdit(String(editing.id)), {
              body: {
                text: submission.text || "[Attachment]",
                format: submission.format,
                content: submission.content,
                expectedRevision: Number(editing.revision),
                attachmentIds: submission.attachmentIds,
              },
            });
            await cleanupEditDraft();
            composerActivity.activate(undefined);
            setEditing(undefined);
            setHistory(undefined);
            notify({ tone: "success", title: intl.message("comments.updated") });
            onChanged();
          } catch (cause) {
            setEditConflict(
              cause instanceof ApiTransportError && cause.status === 409,
            );
            if (cause instanceof ApiTransportError && cause.status === 409)
              throw new Error("This comment changed. Review the latest saved revision below before retrying; your text is preserved.");
            throw cause;
          } finally {
            mutationPending.current = false;
            setBusy(undefined);
          }
        }}
      />
      {editConflict ? (
        <div className="a-comment-action-dialog__footer">
          <Button
            type="button"
            disabled={Boolean(busy) || history?.loading === true}
            onClick={() => void loadHistory(String(editing.id))}
          >{intl.message("comments.reviewLatest")}</Button>
        </div>
      ) : null}
      {historyContent}
      {error ? <p role="alert">{error}</p> : null}
      </div>
    </>
  ) : null;
  const title = deleteTarget
    ? intl.message("comments.deleteTitle")
    : editing
      ? intl.message("comments.edit")
      : reportingId
        ? intl.message("comments.reportTitle")
        : intl.message("comments.historyTitle");
  const dialogOpen = Boolean(
    deleteTarget || reportingId || (history && !editing),
  );
  return (
    <>
      <div className="a-comment-filters" aria-label={intl.message("comments.filterLoaded")}>
        <div role="group" aria-label={intl.message("comments.filters")}>
          {[
            ["all", intl.message("comments.all")],
            ["mentions", intl.message("comments.mentions")],
            ["internal", intl.message("comments.internal")],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              disabled={Boolean(editing)}
              aria-pressed={commentFilter === key}
              onClick={() => setCommentFilter(key!)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="a-comment-view-options">
          <label>
            <span className="a-visually-hidden">{intl.message("comments.order")}</span>
            <ChoiceSelect
              disabled={Boolean(editing)}
              label={intl.message("comments.order")}
              value={newestFirst ? "newest" : "oldest"}
              onChange={(order) => setNewestFirst(order === "newest")}
              options={[
                { value: "oldest", label: intl.message("comments.oldest") },
                { value: "newest", label: intl.message("comments.newest") },
              ]}
            />
          </label>
          <label>
            <span className="a-visually-hidden">{intl.message("comments.groupBy")}</span>
            <ChoiceSelect
              disabled={Boolean(editing)}
              label={intl.message("comments.groupBy")}
              value={groupBy}
              onChange={setGroupBy}
              options={[
                { value: "date", label: intl.message("comments.groupDate") },
                { value: "user", label: intl.message("comments.groupUser") },
              ]}
            />
          </label>
        </div>
        <div className="a-comment-view-controls" ref={toolbarRef}><RecordPanelToolbarActions/></div>
      </div>
      {!visibleComments.length && !(commentFilter === "mentions" && (mentionBusy || mentionError)) ? (
        <EmptySectionState
          centered
          icon={<MessageCircleIcon size={24} />}
          title={items.length ? intl.message("comments.noMatches") : intl.message("comments.emptyTitle")}
          detail={
            items.length
              ? intl.message("comments.tryFilter")
              : intl.message("comments.emptyDescription")
          }
        />
      ) : null}
      {commentFilter === "mentions" ? <>
        {mentionBusy ? <p role="status">{intl.message("comments.findingMentions")}</p> : null}
        {mentionError ? <p role="alert">{mentionError} <button onClick={() => void loadMentions()}>{intl.message("action.retry")}</button></p> : null}
        {mentionCursor ? <button disabled={mentionBusy} onClick={() => void loadMentions(mentionCursor)}>{intl.message("comments.moreMentions")}</button> : null}
      </> : null}
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) closeAction();
        }}
      >
        <DialogContent portal title={title} className="a-comment-action-dialog">
          {deleteTarget ? (
            <>
              <p>
                {intl.message("comments.deleteHelp")}
              </p>
              <div className="a-comment-action-dialog__footer">
                <Button
                  variant="secondary"
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={closeAction}
                >{intl.message("action.cancel")}</Button>
                <Button
                  variant="danger"
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={() => void remove(deleteTarget)}
                >
                  {busy ? "Deleting…" : intl.message("comments.deleteAction")}
                </Button>
              </div>
            </>
          ) : null}
          {reportingId ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void submitReport();
              }}
            >
              <p>
                {intl.message("comments.reportHelp")}
              </p>
              <label>{intl.message("comments.reason")}<ChoiceSelect
                  label={intl.message("comments.reason")}
                  autoFocus
                  required
                  placeholder={intl.message("comments.selectReason")}
                  value={reportReason}
                  onChange={setReportReason}
                  options={[
                    { value: "spam", label: intl.message("comments.spam") },
                    { value: "harassment", label: intl.message("comments.harassment") },
                    { value: "misinformation", label: intl.message("comments.misinformation") },
                    { value: "off_topic", label: intl.message("comments.offTopic") },
                    { value: "other", label: intl.message("comments.other") },
                  ]}
                />
              </label>
              <label>{intl.message("comments.optionalContext")}<textarea
                  value={reportDetail}
                  maxLength={4000}
                  onChange={(event) =>
                    setReportDetail(event.currentTarget.value)
                  }
                  placeholder={intl.message("comments.concern")}
                />
              </label>
              <div className="a-comment-action-dialog__footer">
                <Button
                  variant="ghost"
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={closeAction}
                >{intl.message("action.cancel")}</Button>
                <Button type="submit" disabled={Boolean(busy) || !reportReason}>
                  {busy ? "Submitting…" : intl.message("comments.submitReport")}
                </Button>
              </div>
            </form>
          ) : null}

          {!editing ? historyContent : null}
          {error ? <p role="alert">{error}</p> : null}
        </DialogContent>
      </Dialog>
      <PendingReactionsContext.Provider value={reactionIds}>
        <CommentEditContext.Provider
          value={{
            id: editing ? String(editing.id) : undefined,
            editor: editContent,
          }}
        >
          <div className="a-record-detail-collection">
            {visibleComments.map((item, index) => {
              const day =
                groupBy === "user"
                  ? String(item.authorDisplayName ?? "Participant")
                  : intl.date(String(item.createdAt),
                      { year: "numeric", month: "short", day: "numeric" },
                    );
              const previous = index
                ? groupBy === "user"
                  ? String(visibleComments[index - 1]?.authorId)
                  : intl.date(String(visibleComments[index - 1]?.createdAt), {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })
                : undefined;
              const group = groupBy === "user" ? String(item.authorId) : day;
              return (
                <Fragment key={String(item.id)}>
                  {group !== previous ? (
                    <div className="a-comment-date-divider">
                      {groupBy === "user" ? (
                        <span>{day}</span>
                      ) : (
                        <time dateTime={String(item.createdAt)}>{day}</time>
                      )}
                    </div>
                  ) : null}
                  <CommentThread
                    root={item}
                    maxDepth={capability && "maxDepth" in capability ? capability.maxDepth : undefined}
                    actions={actions}
                    busy={busy}
                    identity={identity.scope?.principalId}
                    onReact={react}
                    onFlag={flag}
                    onHistory={showHistory}
                    onEdit={edit}
                    onRemove={async (id) => {
                      closeAction();
                      setDeleteTarget(id);
                    }}
                    onError={(cause) => setFeedError(message(cause))}
                    onLoadThreadPage={onLoadThreadPage}
                  />
                </Fragment>
              );
            })}
          </div>
        </CommentEditContext.Provider>
      </PendingReactionsContext.Provider>
      {error && !dialogOpen && !editing ? <p role="alert">{error}</p> : null}
      {feedError ? <p role="alert">{feedError}</p> : null}
    </>
  );
}

export function CommentThread({
  root,
  maxDepth,
  actions,
  busy,
  identity,
  onReact,
  onFlag,
  onHistory,
  onEdit,
  onRemove,
  onError,
  onLoadThreadPage,
}: {
  readonly root: Readonly<Record<string, unknown>>;
  readonly maxDepth?: number;
  readonly actions: ReadonlySet<string>;
  readonly busy?: string;
  readonly identity?: string;
  readonly onReact: (
    id: string,
    code: string,
    active: boolean,
  ) => Promise<void>;
  readonly onFlag: (id: string) => Promise<void>;
  readonly onHistory: (id: string) => Promise<void>;
  readonly onEdit: (item: Readonly<Record<string, unknown>>) => Promise<void>;
  readonly onRemove: (id: string) => Promise<void>;
  readonly onError: (cause: unknown) => void;
  readonly onLoadThreadPage?: (
    threadRootId: string,
    cursor?: string,
  ) => Promise<EntityRuntimeSectionResource>;
}) {
  const intl = useEntityI18n();
  const replyComposer = useContext(ReplyComposerContext);
  const activeEdit = useContext(CommentEditContext);
  const received = useRef(0),
    loadingRef = useRef(false),
    requestEpoch = useRef(0);
  const [page, setPage] = useState<Readonly<Record<string, unknown>>>(),
    [expanded, setExpanded] = useState(false),
    [loading, setLoading] = useState(false),
    rootId = String(root.id);
  const threadEpoch = useRef(0);
  useEffect(() => {
    threadEpoch.current++;
    requestEpoch.current++;
    loadingRef.current = false;
    setLoading(false);
    return () => {
      threadEpoch.current++;
      requestEpoch.current++;
      loadingRef.current = false;
    };
  }, [rootId]);
  const loadedPages = useRef(1),
    pendingRefresh = useRef(false),
    reveal = useRef<string | undefined>(undefined);
  const load = async (
    cursor?: string,
  ): Promise<
    | {
        items: readonly Readonly<Record<string, unknown>>[];
        nextCursor?: string;
      }
    | undefined
  > => {
    if (!onLoadThreadPage) return;
    if (loadingRef.current) {
      if (!cursor) pendingRefresh.current = true;
      return;
    }
    const epoch = threadEpoch.current;
    const request = ++requestEpoch.current;
    loadingRef.current = true;
    setLoading(true);
    try {
      let nextCursor = cursor;
      let replies: Readonly<Record<string, unknown>>[] = [];
      let pages = 0;
      do {
        const resource = await onLoadThreadPage(rootId, nextCursor);
        if (epoch !== threadEpoch.current) return;
        const data = valueRecord(resource.data),
          next = valueRecord(data?.data) ?? data;
        for (const rawReply of collectionItems(resource.data)) {
          try {
            replies.push(asComment(rawReply));
          } catch {
            setParentNotice(
              "A malformed reply was omitted from this conversation.",
            );
          }
        }
        nextCursor =
          typeof next?.nextCursor === "string" ? next.nextCursor : undefined;
        pages++;
      } while (!cursor && nextCursor && pages < loadedPages.current);
      loadedPages.current = cursor ? loadedPages.current + 1 : pages;
      const result = { items: replies, ...(nextCursor ? { nextCursor } : {}) };
      setPage((current) => ({
        ...result,
        items: cursor
          ? Array.from(
              new Map(
                [
                  ...(Array.isArray(current?.items) ? current.items : []),
                  ...replies,
                ].map((item: any) => [item.id, item]),
              ).values(),
            )
          : replies,
      }));
      setExpanded(true);
      if (
        reveal.current &&
        (reveal.current === rootId ||
          replies.some((item) => item.id === reveal.current))
      ) {
        const id = reveal.current;
        reveal.current = undefined;
        requestAnimationFrame(() =>
          document
            .getElementById(`comment-${id}`)
            ?.scrollIntoView({ block: "nearest" }),
        );
      }
      if (reveal.current && nextCursor)
        setParentNotice(
          "Reply posted. Use Load more replies to reach the newest replies.",
        );
      return result;
    } catch (cause) {
      if (epoch === threadEpoch.current) onError(cause);
    } finally {
      // A stale request must never release a newer request's lock. It must,
      // however, not leave the old thread permanently marked as loading.
      if (request === requestEpoch.current) {
        loadingRef.current = false;
        if (epoch === threadEpoch.current) setLoading(false);
        if (epoch === threadEpoch.current && pendingRefresh.current) {
          pendingRefresh.current = false;
          void load();
        }
      }
    }
  };
  useEffect(() => {
    if (expanded) void load();
  }, [root]);
  const deepLinkNavigation = useRef(true);
  const deepLinkPages = useRef(0);
  useEffect(() => {
    const cancel = () => {
      deepLinkNavigation.current = false;
    };
    for (const event of ["pointerdown", "keydown", "wheel", "touchstart"])
      document.addEventListener(event, cancel, { passive: true });
    return () => {
      for (const event of ["pointerdown", "keydown", "wheel", "touchstart"])
        document.removeEventListener(event, cancel);
    };
  }, []);
  useLayoutEffect(() => {
    if (!deepLinkNavigation.current || loading) return;
    const params = new URLSearchParams(window.location.search),
      id = params.get("commentId");
    if (!id || params.get("threadRootId") !== rootId) return;
    const element = document.getElementById(`comment-${id}`);
    if (element) {
      element.setAttribute("tabindex", "-1");
      element.focus({ preventScroll: true });
      element.scrollIntoView({ block: "center" });
    }
  }, [page, loading, rootId]);
  useEffect(() => {
    if (!deepLinkNavigation.current || loading || loadingRef.current) return;
    const params = new URLSearchParams(window.location.search),
      id = params.get("commentId");
    if (!id || params.get("threadRootId") !== rootId || id === rootId) return;
    const items = Array.isArray(page?.items) ? page.items : [];
    if (items.some((item) => String(item.id) === id)) return;
    if (deepLinkPages.current >= 5) {
      setParentNotice("The linked reply is not loaded. Use Load more replies to continue.");
      return;
    }
    if (!page) {
      deepLinkPages.current++;
      void load();
      return;
    }
    if (typeof page.nextCursor === "string") {
      deepLinkPages.current++;
      void load(page.nextCursor);
      return;
    }
    setParentNotice("This reply is no longer available.");
  }, [page, loading, rootId]);
  useEffect(() => {
    if (replyComposer.target?.rootId === rootId) {
      if (!page) void load();
      else setExpanded(true);
    }
  }, [replyComposer.target]);
  useEffect(() => {
    const event = replyComposer.sent;
    if (event?.rootId === rootId && event.sequence !== received.current) {
      received.current = event.sequence;
      // Refresh replies without moving the reader; View comment is explicit.
      reveal.current = undefined;
      void load();
    }
  }, [replyComposer.sent]);
  const [parentNotice, setParentNotice] = useState<string>();
  const locateParent = async (id: string) => {
    const element = document.getElementById(`comment-${id}`);
    if (!element) {
      setParentNotice(
        "The parent comment is not loaded. Use Load more replies to continue.",
      );
      return;
    }
    setParentNotice(undefined);
    element.scrollIntoView({ block: "nearest" });
    element.focus({ preventScroll: true });
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches)
      element.animate(
        [
          { backgroundColor: "var(--a-selection-subtle)" },
          { backgroundColor: "transparent" },
        ],
        { duration: 1200 },
      );
  };
  const selectReply = async (id: string, name?: string) => {
    const target =
      id === rootId
        ? root
        : (Array.isArray(page?.items) ? page.items : []).find(
            (item: any) => item.id === id,
          );
    replyComposer.select({
      id,
      rootId,
      name: name ?? "participant",
      excerpt: String(target?.text ?? "")
        .replace(/\s+/g, " ")
        .slice(0, 140),
    });
    setExpanded(true);
    if (!page) void load();
  };
  const toggle = () => {
    if (page) setExpanded((current) => !current);
    else void load();
  };
  const parents = new Map<string, Readonly<Record<string, unknown>>>([
    [rootId, root],
    ...(Array.isArray(page?.items)
      ? page.items.map(
          (item: any) =>
            [String(item.id), item] as [
              string,
              Readonly<Record<string, unknown>>,
            ],
        )
      : []),
  ]);
  const replyCount =
    typeof root.replyCount === "number"
      ? root.replyCount
      : page && !page.nextCursor && Array.isArray(page.items)
        ? page.items.length
        : undefined;
  const threadAction = onLoadThreadPage ? (
    replyCount === 0 ? null : (
      <button
        type="button"
        className="a-comment-reply-toggle"
        aria-expanded={expanded}
        disabled={
          loading ||
          Boolean(
            activeEdit.id &&
            (activeEdit.id === rootId ||
              (Array.isArray(page?.items) &&
                page.items.some((item: any) => item.id === activeEdit.id))),
          )
        }
        onClick={toggle}
      >
        {loading
          ? intl.message("comments.loadingReplies")
          : expanded ? intl.message("comments.hideReplies", {count: replyCount ?? 0}) : replyCount === undefined ? intl.message("comments.showReplyList") : intl.message("comments.showReplies", {count: replyCount})}
      </button>
    )
  ) : null;
  return (
    <Card className="a-comment-thread" data-audience={String(root.visibility)}>
      <CommentItem
        item={root}
        maxDepth={maxDepth}
        actions={actions}
        busy={busy}
        identity={identity}
        onReply={selectReply}
        onReact={onReact}
        onFlag={onFlag}
        onHistory={onHistory}
        onEdit={onEdit}
        onRemove={onRemove}
        threadAction={threadAction}
      />
      {onLoadThreadPage ? (
        <section aria-label={intl.message("comments.replies")}>
          {parentNotice ? <p role="status">{parentNotice}</p> : null}
          {expanded && Array.isArray(page?.items) ? (
            <div className="a-comment-reply-group">
              {page.items.map((reply: any) => (
                <CommentItem
                  key={String(reply.id)}
                  maxDepth={maxDepth}
                  onReplyRoot={
                    root.tombstone
                      ? undefined
                      : () =>
                          selectReply(
                            rootId,
                            String(root.authorDisplayName ?? "participant"),
                          )
                  }
                  onLocateParent={locateParent}
                  item={{
                    ...reply,
                    replyToExcerpt:
                      reply.replyToExcerpt ??
                      parents.get(String(reply.parentCommentId))?.text,
                    replyToDeleted:
                      reply.replyToDeleted ??
                      parents.get(String(reply.parentCommentId))?.tombstone,
                    replyToName: String(
                      reply.replyToName ??
                        parents.get(String(reply.parentCommentId))
                          ?.authorDisplayName ??
                        "participant",
                    ),
                  }}
                  actions={actions}
                  busy={busy}
                  identity={identity}
                  onReply={selectReply}
                  onReact={onReact}
                  onFlag={onFlag}
                  onHistory={onHistory}
                  onEdit={onEdit}
                  onRemove={onRemove}
                />
              ))}
            </div>
          ) : null}
          {expanded && typeof page?.nextCursor === "string" ? (
            <button
              type="button"
              disabled={loading}
              onClick={() => void load(page.nextCursor as string)}
            >{intl.message("comments.moreReplies")}</button>
          ) : null}
        </section>
      ) : null}
    </Card>
  );
}

export function commentCanReply(item: Readonly<Record<string, unknown>>, maxDepth?: number): boolean {
  return item.canReply !== false && (maxDepth === undefined
    ? item.canReply === true : Number(item.threadDepth ?? 0) < maxDepth);
}

export function CommentItem({
  item: rawItem,
  maxDepth,
  actions,
  busy,
  identity,
  onReply,
  onReact,
  onFlag,
  onHistory,
  onEdit,
  onRemove,
  threadAction,
  onLocateParent,
  onReplyRoot,
}: {
  readonly onReplyRoot?: () => Promise<void>;
  readonly onLocateParent?: (id: string) => Promise<void>;
  readonly threadAction?: ReactNode;
  readonly item: Readonly<Record<string, unknown>>;
  readonly maxDepth?: number;
  readonly actions: ReadonlySet<string>;
  readonly busy?: string;
  readonly identity?: string;
  readonly onReply: (id: string, name?: string) => Promise<void>;
  readonly onReact: (
    id: string,
    code: string,
    active: boolean,
  ) => Promise<void>;
  readonly onFlag: (id: string) => Promise<void>;
  readonly onHistory: (id: string) => Promise<void>;
  readonly onEdit: (item: Readonly<Record<string, unknown>>) => Promise<void>;
  readonly onRemove: (id: string) => Promise<void>;
}) {
  const intl = useEntityI18n();
  // Root comments are validated by the section boundary and replies by
  // CommentThread.load(), before either can reach the render path.
  const item = rawItem as CommentRow;
  const canReply = commentCanReply(item, maxDepth);
  const pendingReactions = useContext(PendingReactionsContext);
  const itemBusy = busy === item.id || pendingReactions.has(item.id);
  const [reportOpen, setReportOpen] = useState(false);
  const report = valueRecord(item.viewerReport);
  const hasReport = Boolean(report || item.reportStatus);
  const reportState = String(report?.status ?? item.reportStatus ?? "");
  const reportLabel =
    reportState === "reviewing"
      ? intl.message("comments.reportReview")
      : ["resolved", "dismissed", "approved", "rejected", "removed"].includes(
            reportState,
          )
        ? intl.message("comments.reportResolved")
        : reportState === "open"
          ? intl.message("comments.reportPending")
          : intl.message("comments.reportSent");
  const editContext = useContext(CommentEditContext);
  const editingHere = editContext.id === String(item.id);
  const replyComposer = useContext(ReplyComposerContext);
  const liked =
    Array.isArray(item.viewerReactions) &&
    item.viewerReactions.includes("thumbs_up");
  const author = String(item.authorDisplayName ?? "Participant"),
    initials = author
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => word[0])
      .join("");
  return (
    <article
      tabIndex={-1}
      id={`comment-${String(item.id)}`}
      className="a-comment-item"
      data-audience={String(item.visibility)}
      data-deleted={Boolean(item.tombstone)}
    >
      <header className="a-comment-item__header">
        <span className="a-comment-avatar" aria-hidden="true">
          {initials}
        </span>
        <strong>{author}</strong>
        <time dateTime={String(item.createdAt)} title={String(item.createdAt)}>
          {collaborationTime(item.createdAt, intl)}
        </time>
        <span className="a-comment-audience">{intl.message(`comments.${item.visibility}`)}</span>
        {!item.tombstone && Number(item.revision) > 1 ? (
          <span
            title={
              item.updatedAt
                ? intl.message("comments.editedAt", {date: collaborationTime(item.updatedAt, intl)})
                : intl.message("comments.editedLabel")
            }
          >{intl.message("comments.edited")}</span>
        ) : null}
        {!item.tombstone && !editContext.id ? (
          <CollaborationActions label={intl.message("comments.actions")}>
            {actions.has("flag") && !item.tombstone ? (
              <button
                type="button"
                disabled={itemBusy}
                onClick={() =>
                  hasReport ? setReportOpen(true) : void onFlag(String(item.id))
                }
              >
                {hasReport ? intl.message("comments.viewReport") : intl.message("comments.reportTitle")}
              </button>
            ) : null}
            {!item.tombstone && item.authorId === identity ? (
              <>
                {actions.has("history") ? (
                  <button
                    type="button"
                    onClick={() => void onHistory(String(item.id))}
                  >{intl.message("comments.history")}</button>
                ) : null}
                {actions.has("update_own") ? (
                  <button
                    type="button"
                    disabled={itemBusy}
                    onClick={() => void onEdit(item)}
                  >{intl.message("action.edit")}</button>
                ) : null}
                {actions.has("archive_own") ? (
                  <button
                    type="button"
                    disabled={itemBusy}
                    onClick={() => void onRemove(String(item.id))}
                  >{intl.message("action.delete")}</button>
                ) : null}
              </>
            ) : null}
          </CollaborationActions>
        ) : null}
      </header>
      {item.parentCommentId ? (
        <button
          type="button"
          className="a-comment-parent-reference"
          onClick={() => void onLocateParent?.(String(item.parentCommentId))}
        >
          <ReplyIcon size={14} aria-hidden="true" />
          <span className="a-comment-parent-reference__text">
            {item.replyToDeleted
              ? intl.message("comments.deletedReply")
              : `Replying to ${String(item.replyToName ?? "participant")}${item.replyToExcerpt ? `: “${String(item.replyToExcerpt).replace(/\s+/g, " ").slice(0, 140)}”` : ""}`}
          </span>
        </button>
      ) : null}
      {hasReport ? (
        <div className="a-comment-report-status">
          <span className="a-comment-report-badge">{reportLabel}</span>
        </div>
      ) : null}
      <Dialog open={reportOpen && hasReport} onOpenChange={setReportOpen}>
        <DialogContent title={intl.message("comments.yourReport")} className="a-comment-action-dialog">
          <dl className="a-comment-report-details">
            <dt>{intl.message("comments.status")}</dt>
            <dd>{reportLabel}</dd>
            <dt>{intl.message("comments.reason")}</dt>
            <dd>
              {(
                {
                  spam: intl.message("comments.spam"),
                  harassment: intl.message("comments.harassment"),
                  misinformation: intl.message("comments.misinformation"),
                  off_topic: intl.message("comments.offTopic"),
                  other: intl.message("comments.other"),
                  user_report: intl.message("comments.generalConcern"),
                } as Record<string, string>
              )[String(report?.reason)] ?? "Not available"}
            </dd>
            <dt>{intl.message("comments.context")}</dt>
            <dd>
              {String(report?.detail ?? intl.message("comments.noContext"))}
            </dd>
            <dt>{intl.message("comments.submitted")}</dt>
            <dd>
              {report?.submittedAt
                ? collaborationTime(report.submittedAt, intl)
                : "Not available"}
            </dd>
            {report?.decision ? (
              <>
                <dt>{intl.message("comments.outcome")}</dt>
                <dd>
                  {(
                    {
                      approved: "Comment approved",
                      rejected: "Comment rejected",
                      removed: "Comment removed",
                    } as Record<string, string>
                  )[String(report.decision)] ?? "Review completed"}
                </dd>
              </>
            ) : null}
          </dl>
          <p>{intl.message("comments.noResponse")}</p>
          <div className="a-comment-action-dialog__footer">
            <Button
              variant="secondary"
              type="button"
              onClick={() => setReportOpen(false)}
            >{intl.message("action.close")}</Button>
          </div>
        </DialogContent>
      </Dialog>
      {item.tombstone ? (
        <div className="a-comment-tombstone">
          <span>{intl.message("comments.deleted")}</span>
          {item.authorId === identity && actions.has("history") ? (
            <button
              type="button"
              className="a-comment-deletion-history"
              onClick={() => void onHistory(String(item.id))}
            >{intl.message("comments.deletionDetails")}</button>
          ) : null}
        </div>
      ) : editingHere ? (
        <section className="a-comment-inline-edit" aria-label={intl.message("comments.edit")}>
          {editContext.editor}
        </section>
      ) : (
        <>
          <div className="a-comment-content">{renderComment(item)}</div>
          {Array.isArray(item.pinnedFiles) && item.pinnedFiles.length ? (
            <ul aria-label={intl.message("comments.pinnedFiles")}>
              {item.pinnedFiles.map((file) => (
                <li key={String(file.attachmentId)}>
                  <CommentFile
                    attachmentId={String(file.attachmentId)}
                    name={String(file.fileName ?? "File")}
                    version={String(file.version ?? "")}
                    size={file.sizeBytes}
                  />
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
      <div
        className="a-comment-item__actions"
        hidden={editingHere || Boolean(item.tombstone && !threadAction)}
      >
        {actions.has("reply") &&
        !item.tombstone &&
        canReply ? (
          <button
            type="button"
            disabled={itemBusy}
            onClick={() => void onReply(String(item.id), author)}
          >
            <ReplyIcon size={14} />{intl.message("comments.reply")}</button>
        ) : null}
        {actions.has("reply") &&
        !item.tombstone &&
        !canReply ? (
          <>
            <span className="a-comment-depth-limit">{intl.message("comments.maxDepth")}</span>
            {onReplyRoot ? (
              <button type="button" onClick={() => void onReplyRoot()}>{intl.message("comments.replyMain")}</button>
            ) : null}
          </>
        ) : null}
        {actions.has("react") && !item.tombstone ? (
          <Tooltip label={liked ? "Remove like" : "Like"}>
            <button
              type="button"
              disabled={itemBusy}
              aria-pressed={liked}
              aria-label={liked ? "Remove like" : "Like comment"}
              onClick={() => void onReact(String(item.id), "thumbs_up", liked)}
            >
              <ThumbsUpIcon size={16} aria-hidden="true" />
              {Array.isArray(item.reactions) &&
              Number(
                item.reactions.find((reaction) => reaction.code === "thumbs_up")
                  ?.count,
              ) > 0 ? (
                <span aria-label={intl.message("comments.likeCount")}>
                  {Number(
                    item.reactions.find(
                      (reaction) => reaction.code === "thumbs_up",
                    )?.count,
                  )}
                </span>
              ) : null}
            </button>
          </Tooltip>
        ) : null}
        {threadAction}
      </div>
      {replyComposer.inline && replyComposer.target?.id === String(item.id) ? (
        <ReplyComposerPlacement />
      ) : null}
    </article>
  );
}
export function CommentFile({
  attachmentId,
  name,
  version,
  size,
}: {
  attachmentId: string;
  name: string;
  version: string;
  size?: unknown;
}) {
  const intl = useEntityI18n();
  const previewButtonId = useId();
  const client = useApiClient();
  const [error, setError] = useState<string>(),
    [busy, setBusy] = useState(false),
    [preview, setPreview] = useState(false);
  const visible = useContext(CollaborationVisibilityContext);
  return (
    <div className="a-comment-file">
      <AttachmentThumbnail attachmentId={attachmentId} name={name} contentType="" canPreview onPreview={() => setPreview(value => !value)} />
      <div className="a-comment-file__identity">
        <button
          type="button"
          className="a-comment-file__name"
          aria-label={`Preview ${name}`}
          aria-expanded={preview}
          onClick={() => setPreview((value) => !value)}
        >
          {name}
        </button>
        {size != null || version ? <small>
          {size != null ? collaborationFileSize(size, intl) : ""}{size != null && version ? " · " : ""}{version ? `v${version}` : ""}
        </small> : null}
      </div>
      <FileAction
        id={previewButtonId}
        label={`Preview attachment ${name}`}
        tooltipLabel="Preview attachment"
        icon={<EyeIcon size={16} aria-hidden="true" />}
        aria-expanded={preview}
        onClick={() => setPreview((value) => !value)}
      />
      <FileAction
        label={`Download ${name}`}
        tooltipLabel="Download attachment"
        icon={<DownloadIcon size={16} aria-hidden="true" />}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(undefined);
          try {
            await downloadAttachment(client, attachmentId);
          } catch (cause) {
            setError(message(cause));
          } finally {
            setBusy(false);
          }
        }}
      />
      {preview && visible ? (
        <div className="a-comment-file__preview">
          <button
            type="button"
            onClick={() => {
              setPreview(false);
              requestAnimationFrame(() =>
                document
                  .getElementById(previewButtonId)
                  ?.focus({ preventScroll: true }),
              );
            }}
          >{intl.message("action.closePreview")}</button>
          <AttachmentPreview attachmentId={attachmentId} document />
        </div>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}

function mentionSearch(
  client: ReturnType<typeof useApiClient>,
  entityType: string,
  entityId: string,
) {
  return async (q: string, visibility: "public" | "internal" | "private") => {
    const params = new URLSearchParams({ entityType, entityId, q, visibility });
    const result = await client.request(
      createOperation<{
        items: readonly { id: string; displayName: string; username?: string }[];
      }>({ method: "GET", path: () => `/api/collab/participants?${params}` }),
      {},
    );
    return result.items;
  };
}
