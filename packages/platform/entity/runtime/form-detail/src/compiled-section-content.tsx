"use client";
import { AttachmentThumbnail } from "./attachment-thumbnail";
import { CollaborationPresentationContext, CollaborationToolbarContext, CollaborationVisibilityContext } from "./collaboration-visibility";
import { CollaborationActions, collaborationTime, collaborationFileSize } from "./collaboration-actions";
import { AttachmentPreview } from "./attachment-preview";
import { FileTypeIcon } from "./file-type";
import { FileAction } from "./file-action";
import { useFileSearch, FileSearchInput, FileSearchResults } from "./file-search";
import type { EntityRuntimeSectionResource } from "@athyper/platform-entity-descriptor-client";
import { ApiTransportError, createOperation } from "@athyper/platform-api-client";
import { useApiClient, useSessionIdentity, useToasts } from "@athyper/platform-shell-app-foundation";
import { MessageCircleIcon, FileTextIcon, ThumbsUpIcon, ReplyIcon, EyeIcon, DownloadIcon, FolderPlusIcon, FolderInputIcon, PencilIcon, ArchiveIcon, UploadIcon, HistoryIcon, LinkIcon, UnlinkIcon, TagIcon, TrashIcon, SlidersHorizontalIcon, CloseIcon, ChevronDownIcon, ChevronLeftIcon } from "@athyper/platform-icons";
import { RichCommentComposer, type RichCommentSubmission, type RichTextDocument } from "@athyper/platform-communications-collaboration-ui";
import { FilterChipGroup, PanelEmptyState, Button, Card, Dialog, DialogContent, Tooltip } from "@athyper/platform-ui";
import { createPortal } from "react-dom";
import { Fragment, createContext, useContext, useEffect, useLayoutEffect, useId, useRef, useState, type ReactNode, type RefObject } from "react";

/** Generic renderer for the supported declarative field and related-collection surfaces. */
export function CompiledEntitySectionContent({ resource, entityCode, recordId, onChanged, onLoadMore, onLoadThreadPage }: { readonly resource: EntityRuntimeSectionResource; readonly entityCode?: string; readonly recordId?: string; readonly onChanged?: () => void; readonly onLoadMore?: () => void; readonly onLoadThreadPage?: (threadRootId: string, cursor?: string) => Promise<EntityRuntimeSectionResource> }) {
  const values = valueRecord(resource.data);
  const fieldValues = valueRecord(values?.values) ?? values;
  const items = collectionItems(resource.data);
  const actions = new Set(resource.capability?.actions.map(action => action.key) ?? []);
  if (resource.presentation.rendererKey === "platform.related-collection.v1") {
    return <Collection fields={resource.presentation.fields} items={items} emptyState={resource.presentation.emptyState} />;
  }
  if (resource.presentation.rendererKey === "platform.comments.v1") {
    if(entityCode && recordId && onChanged)return <CommentsWorkspace key={`${entityCode}:${recordId}`} resource={resource} entityCode={entityCode} recordId={recordId} onChanged={onChanged} onLoadMore={onLoadMore} onLoadThreadPage={onLoadThreadPage}/>;
    return <Collection fields={commentFields} items={items} sectionLabel="Comments"/>;

  }
  if (resource.presentation.rendererKey === "platform.attachments.v1") {
    const folderValue = valueRecord(resource.data)?.folders;
    const folders: readonly Readonly<Record<string, unknown>>[] = Array.isArray(folderValue) ? folderValue.filter(valueRecord) as readonly Readonly<Record<string, unknown>>[] : [];
    return <div className="a-collaboration-files">{entityCode && recordId && onChanged ? <AttachmentCollection key={`${entityCode}:${recordId}`} entityCode={entityCode} recordId={recordId} items={items} folders={folders} workspaceRevision={String(valueRecord(resource.data)?.workspaceRevision ?? resource.revision)} canPreview={actions.has("preview")} canSearch={actions.has("search")} canDownload={actions.has("download")} canUnlink={actions.has("unlink")} canArchive={actions.has("archive")} canRename={actions.has("rename")} canVersion={actions.has("version")} canCategory={actions.has("category")} canFolder={actions.has("folder")} onChanged={onChanged} loadMore={hasMore(resource.data) && onLoadMore ? <button type="button" onClick={onLoadMore}>Load more files</button> : null} upload={actions.has("create") && actions.has("finalize") ? <AttachmentUploader key={`${entityCode}:${recordId}`} capability={resource.capability} entityCode={entityCode} recordId={recordId} knownItems={items} canVersion={actions.has("version")} onChanged={onChanged}/> : null}/> : <Collection fields={attachmentFields} items={items} sectionLabel="Files" />}</div>;
  }
  return <Fields fields={resource.presentation.fields} values={fieldValues} />;
}

const commentFields = Object.freeze([
  { key: "text", label: { labelKey: "platform.comments.fields.text.label", defaultText: "Comment" } },
  { key: "authorDisplayName", label: { labelKey: "platform.comments.fields.author.label", defaultText: "Author" } },
  { key: "createdAt", label: { labelKey: "platform.comments.fields.created_at.label", defaultText: "Created" } },
  { key: "visibility", label: { labelKey: "platform.comments.fields.visibility.label", defaultText: "Visibility" } },
]);
const attachmentFields = Object.freeze([
  { key: "fileName", label: { labelKey: "platform.attachments.fields.file_name.label", defaultText: "File" } },
  { key: "contentType", label: { labelKey: "platform.attachments.fields.content_type.label", defaultText: "Type" } },
  { key: "sizeBytes", label: { labelKey: "platform.attachments.fields.size_bytes.label", defaultText: "Size" } },
  { key: "createdAt", label: { labelKey: "platform.attachments.fields.created_at.label", defaultText: "Created" } },
]);
const commentCreate = createOperation<unknown, Readonly<Record<string, unknown>>>({ method: "POST", path: () => "/api/collab/comments", idempotency: "required" });
const commentDraft = createOperation<unknown, Readonly<Record<string, unknown>>>({ method: "POST", path: () => "/api/collab/drafts" });
const commentDraftCancel = createOperation<unknown>({ method: "DELETE", path: () => "/api/collab/drafts" });
const attachmentStage = createOperation<{ attachmentId: string; uploadUrl: string }, { attachmentId: string; fileName: string; contentType: string; sizeBytes: number; entityType: string; entityId: string; parentAttachmentId?: string; expectedSeriesVersion?: number; duplicateNameChoice?: "new_version" }>({ method: "POST", path: () => "/api/attachments/stage", idempotency: "required" });
const attachmentFinalize = (attachmentId: string) => createOperation<unknown, { contentType: string }>({ method: "POST", path: () => `/api/attachments/${encodeURIComponent(attachmentId)}/finalize`, idempotency: "required" });
const commentEdit = (commentId: string) => createOperation<unknown, { text: string; expectedRevision: number; format?: string; content?: RichTextDocument; attachmentIds?: readonly string[] }>({ method: "PATCH", path: () => `/api/collab/comments/${encodeURIComponent(commentId)}` });
const commentDelete = (commentId: string) => createOperation<unknown>({ method: "DELETE", path: () => `/api/collab/comments/${encodeURIComponent(commentId)}` });
const commentReply = (commentId: string) => createOperation<unknown, Readonly<Record<string, unknown>>>({ method: "POST", path: () => `/api/collab/comments/${encodeURIComponent(commentId)}/replies`, idempotency: "required" });
const commentReaction = (commentId: string) => createOperation<unknown, { code: string }>({ method: "POST", path: () => `/api/collab/comments/${encodeURIComponent(commentId)}/reactions` });
const commentReactionDelete = (commentId: string, code: string) => createOperation<unknown>({ method: "DELETE", path: () => `/api/collab/comments/${encodeURIComponent(commentId)}/reactions/${encodeURIComponent(code)}` });
const commentFlag = (commentId: string) => createOperation<unknown, { reasonCode: string; detail?: string }>({ method: "POST", path: () => `/api/collab/comments/${encodeURIComponent(commentId)}/flag` });
const attachmentDownload = (attachmentId: string) => createOperation<{ url: string }, { expirySeconds: number }>({ method: "POST", path: () => `/api/attachments/${encodeURIComponent(attachmentId)}/download` });
const attachmentUnlink = (attachmentId: string) => createOperation<unknown>({ method: "DELETE", path: () => `/api/attachments/${encodeURIComponent(attachmentId)}`, idempotency: "required" });
const attachmentStatus = (attachmentId: string) => createOperation<{ status: string; extractionStatus?: string | null }>({ method: "GET", path: () => `/api/attachments/${encodeURIComponent(attachmentId)}/status` });
const attachmentRename = (attachmentId: string) => createOperation<unknown, { displayName: string; expectedSeriesRevision: string }>({ method: "PATCH", path: () => `/api/attachments/${encodeURIComponent(attachmentId)}`, idempotency: "required" });
const attachmentCategory = (attachmentId: string) => createOperation<unknown, { entityType: string; entityId: string; category: "general" | "evidence" }>({ method: "POST", path: () => `/api/attachments/${encodeURIComponent(attachmentId)}/category`, idempotency: "required" });
const attachmentFolder = createOperation<{ folderId: string | null; revision: number }, Readonly<Record<string, unknown>>>({ method: "POST", path: () => "/api/attachments/folders", idempotency: "required" });
const attachmentArchiveOutcome = (attachmentId: string) => createOperation<{ activeLinks: number; legalHold: boolean }>({ method: "GET", path: () => `/api/attachments/${encodeURIComponent(attachmentId)}/archive` });
const attachmentArchive = (attachmentId: string) => createOperation<{ activeLinks: number; legalHold: boolean }>({ method: "POST", path: () => `/api/attachments/${encodeURIComponent(attachmentId)}/archive`, idempotency: "required" });

async function prepareCommentFiles(client: ReturnType<typeof useApiClient>, entityCode:string, recordId:string, document:RichTextDocument, visibility:"public"|"internal"|"private", parentCommentId?:string, preserveDraft=false) {
  const section = (key:string) => createOperation<EntityRuntimeSectionResource>({method:"GET",path:()=>`/api/entity-runtime/${encodeURIComponent(entityCode)}/records/${encodeURIComponent(recordId)}/sections/${key}`});
  const files = await client.request(section("attachments"),{query:{surface:"detail"}});
  const capability=files.capability;
  if(!capability?.actions.some(action=>action.key==="create") || !capability.actions.some(action=>action.key==="finalize") || !capability.allowedContentTypes || !capability.maxFileBytes) throw new Error("File uploads are not authorized for this record.");
  let draft = preserveDraft ? valueRecord(valueRecord((await client.request(section("comments"),{query:{surface:"detail"}})).data)?.draft) : undefined;
  const createdDraft = !draft?.id;
  if(!draft?.id) draft=valueRecord(await client.request(commentDraft,{body:{entityType:entityCode,entityId:recordId,...(parentCommentId?{parentCommentId}:{}),text:richText(document)||"[Attachment draft]",format:"rich_json",content:document,visibility}}));
  if(typeof draft?.id!=="string") throw new Error("Unable to prepare the attachment draft.");
  return {createdDraft,draftId:draft.id,allowedContentTypes:capability.allowedContentTypes,maxFileBytes:capability.maxFileBytes};
}

type ReplyTarget = {id:string;rootId:string;name:string;excerpt:string};
const ReplyComposerContext = createContext<{target?:ReplyTarget;sent?:{rootId:string;id?:string;sequence:number};host?:HTMLDivElement;fallback?:RefObject<HTMLDivElement|null>;inline?:boolean;select:(target:ReplyTarget)=>void}>({select:()=>{}});
/** Move the same editor DOM so changing presentation never restarts uploads. */
function ReplyComposerPlacement({fallback=false}:{fallback?:boolean}) {
  const context=useContext(ReplyComposerContext);
  const slot=useRef<HTMLDivElement>(null);
  useLayoutEffect(()=>{
    const node=slot.current,host=context.host;
    if(!node || !host)return;
    if(fallback)context.fallback!.current=node;
    if(!fallback || !host.isConnected)node.appendChild(host);
    return()=>{
      // Filters or collapsing a thread can remove the selected comment.
      // Keep its draft reachable in the bottom composer in that case.
      if(!fallback && node.contains(host))context.fallback?.current?.appendChild(host);
    };
  },[context.host,fallback]);
  return <div ref={slot} className="a-comment-compose-placement"/>;
}
function CommentsWorkspace({resource,entityCode,recordId,onChanged,onLoadMore,onLoadThreadPage}:Parameters<typeof CompiledEntitySectionContent>[0] & {entityCode:string;recordId:string;onChanged:()=>void}) {
  const [target,setTarget]=useState<ReplyTarget>(),[sent,setSent]=useState<{rootId:string;id?:string;sequence:number}>();
  const drafts=useRef(new Map<string,Readonly<Record<string,unknown>>>());
  const busyRef=useRef(false);
  const composer=useRef<HTMLDivElement>(null),fallback=useRef<HTMLDivElement>(null);
  const fullView=useContext(CollaborationPresentationContext)==="content";
  const [host,setHost]=useState<HTMLDivElement>();
  useEffect(()=>{const node=document.createElement("div");setHost(node);return()=>node.remove();},[]);
  const actions=new Set(resource.capability?.actions.map(action=>action.key)??[]);
  const draftKey=target?.id??"root";
  const focusComposer=()=>requestAnimationFrame(()=>composer.current?.querySelector<HTMLElement>('[contenteditable="true"]')?.focus({preventScroll:true}));
  useEffect(()=>{if(target){const frame=requestAnimationFrame(()=>{const editor=composer.current?.querySelector<HTMLElement>('[contenteditable="true"]');editor?.focus({preventScroll:true});editor?.scrollIntoView({block:"nearest"});});return()=>cancelAnimationFrame(frame);}},[target,fullView,host]);
  return <ReplyComposerContext.Provider value={{target,sent,host,fallback,inline:fullView,select:next=>{if(!busyRef.current)setTarget(next);}}}>
    <div className="a-collaboration-comments"><div className="a-comment-feed">
      <CommentCollection entityCode={entityCode} recordId={recordId} items={collectionItems(resource.data)} onChanged={onChanged} capability={resource.capability} actions={actions} onLoadThreadPage={onLoadThreadPage}/>
      {hasMore(resource.data)&&onLoadMore?<button type="button" onClick={onLoadMore}>Load more comments</button>:null}
    </div>
    <ReplyComposerPlacement fallback/>
    {host && (target?actions.has("reply"):actions.has("create"))?createPortal(<div ref={composer} className="a-comment-compose-slot">
      <CommentComposer key={draftKey} entityCode={entityCode} recordId={recordId} parentCommentId={target?.id} replyToName={target?.name} replyExcerpt={target?.excerpt}
        initialDraft={drafts.current.get(draftKey)??(!target?valueRecord(valueRecord(resource.data)?.draft):undefined)}
        onBusyChange={busy=>{busyRef.current=busy;}} onDraftSnapshot={draft=>drafts.current.set(draftKey,draft)}
        onPosted={id=>{drafts.current.delete(draftKey);if(target)setSent({rootId:target.rootId,id,sequence:Date.now()});setTarget(undefined);}}
        onDismiss={target?()=>{setTarget(undefined);focusComposer();}:undefined}
        capability={resource.capability} onChanged={onChanged}/>
    </div>,host):null}</div>
  </ReplyComposerContext.Provider>;
}
function CommentComposer({ entityCode, recordId, onChanged, capability, initialDraft, parentCommentId, replyToName, replyExcerpt, onDraftSnapshot, onPosted, onBusyChange, onDismiss }: { readonly entityCode: string; readonly recordId: string; readonly onChanged: () => void; readonly capability?: EntityRuntimeSectionResource["capability"]; readonly initialDraft?: Readonly<Record<string, unknown>>; readonly parentCommentId?: string; readonly replyToName?:string; readonly replyExcerpt?:string; readonly onBusyChange?:(busy:boolean)=>void; readonly onDraftSnapshot?:(draft:Readonly<Record<string,unknown>>)=>void; readonly onPosted?:(id?:string)=>void; readonly onDismiss?: () => void }) {
  const { push: notify } = useToasts();
  const client = useApiClient(), [error, setError] = useState<string>();
  const [draftId, setDraftId] = useState<string | undefined>(typeof initialDraft?.id === "string" ? initialDraft.id : undefined);
  const justPosted=useRef(false);
  const draftTimer = useRef<number | undefined>(undefined), draftEpoch = useRef(0);
  const draftWrite = useRef<Promise<void> | undefined>(undefined);
  useEffect(() => () => { if (draftTimer.current) window.clearTimeout(draftTimer.current); }, []);
  const actions = new Set(capability?.actions.map((action) => action.key) ?? []);
  const initialDocument = draftDocument(initialDraft);
  const clearDraft = async () => {
    if (!actions.has("draft")) return;
    await client.request(commentDraftCancel, { query: { entityType: entityCode, entityId: recordId, ...(parentCommentId ? { parentCommentId } : {}) } });
    setDraftId(undefined);
  };
  const saveDraft = (document: RichTextDocument, visibility = capability?.defaultAudience ?? "public") => {
    if(justPosted.current){justPosted.current=false;return;}
    onDraftSnapshot?.({id:draftId,content:document,format:"rich_json",visibility});
    const epoch = ++draftEpoch.current;
    if (!actions.has("draft")) return;
    if (draftTimer.current) window.clearTimeout(draftTimer.current);
    draftTimer.current = window.setTimeout(() => {
      const text = richText(document);
      if (!text) { void clearDraft().catch((cause) => setError(message(cause))); return; }
      draftWrite.current = client.request(commentDraft, { body: { entityType: entityCode, entityId: recordId, ...(parentCommentId ? { parentCommentId } : {}), text, format: "rich_json", content: document, visibility } }).then((saved) => { if (epoch !== draftEpoch.current) return; const value = valueRecord(saved); if (typeof value?.id === "string") setDraftId(value.id); }).catch((cause) => setError(message(cause)));
    }, 600);
  };
  const submit = async (submission: RichCommentSubmission) => {
    draftEpoch.current += 1;
    if (draftTimer.current) window.clearTimeout(draftTimer.current);
    setError(undefined);
    await draftWrite.current;
    const idempotencyKey = crypto.randomUUID();
    try { const body = { entityType: entityCode, entityId: recordId, text: submission.text || "[Attachment]", format: submission.format, content: submission.content, visibility: submission.visibility, attachmentIds: submission.attachmentIds, idempotencyKey }; const posted=parentCommentId ? await client.request(commentReply(parentCommentId), { body, idempotencyKey }) : await client.request(commentCreate, { body, idempotencyKey }); await clearDraft(); notify({tone:"success",title:parentCommentId ? "Reply posted" : "Comment posted"}); justPosted.current=true; onChanged(); onPosted?.(typeof valueRecord(posted)?.id==="string"?String(valueRecord(posted)?.id):undefined); }
    catch (cause) { setError(message(cause)); throw cause; }
  };
  return <RichCommentComposer className="a-comment-composer-card" header={<><span className="a-comment-composer-title">{parentCommentId ? `Replying to ${replyToName ?? "participant"}` : "Add a comment"}</span>{replyExcerpt?<p className="a-comment-reply-excerpt">{replyExcerpt}</p>:null}</>} supportingContent={<>{error ? <p role="alert">{error}</p> : null}</>} entityType={entityCode} entityId={recordId} parentCommentId={parentCommentId} initialDocument={initialDocument} searchMentions={actions.has("mention")?async(query,visibility)=>{const params=new URLSearchParams({entityType:entityCode,entityId:recordId,q:query,visibility});const result=await client.request(createOperation<{items:readonly {id:string;displayName:string}[]}>({method:"GET",path:()=>`/api/collab/participants?${params}`}),{});return result.items;}:undefined} draftId={draftId} maxAttachments={capability?.maxAttachments} prepareAttachments={async(document,visibility)=>{if(draftTimer.current)window.clearTimeout(draftTimer.current);draftEpoch.current++;await draftWrite.current;const prepared=await prepareCommentFiles(client,entityCode,recordId,document,visibility,parentCommentId);setDraftId(prepared.draftId);return prepared;}} allowedAudiences={capability?.allowedAudiences} defaultAudience={(initialDraft?.visibility as "public"|"internal"|"private"|undefined) ?? capability?.defaultAudience} allowAttachments={capability?.maxAttachments !== undefined && capability.maxAttachments > 0} onDraftChange={saveDraft} onSubmit={submit} onBusyChange={onBusyChange} submitLabel={parentCommentId?"Send reply":"Send"} onCancel={onDismiss} cancelLabel="Cancel reply"/>;
}
function AttachmentUploader({ capability, entityCode, recordId, knownItems, canVersion, onChanged }: { readonly capability?: EntityRuntimeSectionResource["capability"]; readonly entityCode: string; readonly recordId: string; readonly knownItems: readonly Readonly<Record<string, unknown>>[]; readonly canVersion: boolean; readonly onChanged: () => void }) {
  const { push: notify } = useToasts();
  const client = useApiClient(), [busy, setBusy] = useState(false), [error, setError] = useState<string>();
  const [queue, setQueue] = useState<readonly { readonly attachmentId: string; readonly file: File; readonly contentType: string; readonly parentAttachmentId?: string; readonly expectedSeriesVersion?: number; readonly state: "queued" | "uploading" | "finalizing" | "processing" | "ready" | "failed"; readonly progress?: number; readonly error?: string }[]>([]);
  const [duplicates, setDuplicates] = useState<readonly { readonly file: File; readonly existing: Readonly<Record<string, unknown>> }[]>([]);
  const [dragging,setDragging]=useState(false);
  const dragDepth=useRef(0);
  const retry = useRef<readonly { readonly attachmentId: string; readonly file: File; readonly contentType: string; readonly parentAttachmentId?: string; readonly expectedSeriesVersion?: number }[]>([]);
  async function upload(attempt: { readonly attachmentId: string; readonly file: File; readonly contentType: string; readonly parentAttachmentId?: string; readonly expectedSeriesVersion?: number }) {
    setBusy(true); setError(undefined); setQueue((items) => items.map((item) => item.attachmentId === attempt.attachmentId ? { ...item, state: "uploading" } : item));
    try {
      // A failed response can hide a successful commit. Resolve that outcome
      // before requesting another PUT URL for the same immutable attachment.
      let alreadyActive = false;
      if (retry.current.some(item => item.attachmentId === attempt.attachmentId)) {
        const outcome = await client.request(attachmentStatus(attempt.attachmentId), {}).catch(cause => {
          if (cause instanceof ApiTransportError && cause.status === 404) return undefined;
          throw cause;
        });
        alreadyActive = outcome?.status === "active";
      }
      if (!alreadyActive) {
      const staged = await client.request(attachmentStage, { body: { attachmentId: attempt.attachmentId, fileName: attempt.file.name, contentType: attempt.contentType, sizeBytes: attempt.file.size, entityType: entityCode, entityId: recordId, ...(attempt.parentAttachmentId ? { parentAttachmentId: attempt.parentAttachmentId, expectedSeriesVersion: attempt.expectedSeriesVersion, duplicateNameChoice: "new_version" as const } : {}) }, idempotencyKey: attempt.attachmentId });
      await putWithProgress(staged.uploadUrl, attempt.file, attempt.contentType, (progress) => setQueue((items) => items.map((item) => item.attachmentId === attempt.attachmentId ? { ...item, progress } : item)));
      setQueue((items) => items.map((item) => item.attachmentId === attempt.attachmentId ? { ...item, state: "finalizing" } : item));
      await client.request(attachmentFinalize(staged.attachmentId), { body: { contentType: attempt.contentType }, idempotencyKey: attempt.attachmentId });
      }
      retry.current = retry.current.filter((item) => item.attachmentId !== attempt.attachmentId);
      setQueue((items) => items.map((item) => item.attachmentId === attempt.attachmentId ? { ...item, state: "processing" } : item));
      onChanged();
      return true;
    } catch (cause) {
      const retryable = !(cause instanceof ApiTransportError && cause.status === 422);
      retry.current = [...retry.current.filter((item) => item.attachmentId !== attempt.attachmentId), ...(retryable ? [attempt] : [])];
      setQueue((items) => items.map((item) => item.attachmentId === attempt.attachmentId ? { ...item, state: "failed", error: message(cause) } : item));
      setError(`${message(cause)}${retryable ? " Retry uses the same upload reservation." : ""}`);
      return false;
    }
  }
  const refreshRef = useRef(onChanged);
  refreshRef.current = onChanged;
  const readySince = useRef(new Map<string,number>());
  const activeBatches = useRef(0);
  useEffect(()=>{
    const processing=queue.filter(item=>item.state==="processing");
    if(!processing.length)return;
    const ready=new Set(processing.filter(item=>knownItems.some(row=>row.id===item.attachmentId && row.processingStatus==="active")).map(item=>item.attachmentId));
    if(ready.size)setQueue(current=>current.map(item=>ready.has(item.attachmentId)?{...item,state:"ready"}:item));
    const timer=window.setInterval(()=>refreshRef.current(),5000);
    return()=>window.clearInterval(timer);
  },[queue,knownItems]);
  useEffect(()=>{
    const ready=queue.filter(item=>item.state==="ready" && knownItems.some(row=>row.id===item.attachmentId && row.processingStatus==="active"));
    if(!ready.length)return;
    const now=Date.now();
    for(const item of ready)if(!readySince.current.has(item.attachmentId))readySince.current.set(item.attachmentId,now);
    const timer=window.setTimeout(()=>{
      const completed=new Set(ready.filter(item=>Date.now()-readySince.current.get(item.attachmentId)!>=2000).map(item=>item.attachmentId));
      setQueue(current=>current.filter(item=>!completed.has(item.attachmentId)));
      for(const id of completed)readySince.current.delete(id);
    },Math.max(0,Math.min(...ready.map(item=>2000-(now-readySince.current.get(item.attachmentId)!)))));
    return()=>window.clearTimeout(timer);
  },[queue,knownItems]);
  const runBatch = async (attempts: typeof retry.current) => {
    activeBatches.current++;setBusy(true);
    const succeeded: typeof attempts[number][]=[];
    try { for(const attempt of attempts)if(await upload(attempt))succeeded.push(attempt); }
    finally { activeBatches.current--;setBusy(activeBatches.current>0); }
    if(succeeded.length)notify({tone:"success",title:succeeded.length===1 ? `“${succeeded[0]!.file.name}” uploaded` : `${succeeded.length} files uploaded`,...(succeeded.length<attempts.length?{detail:"Some uploads failed. Review the upload queue."}:{}),dedupeKey:`upload:${succeeded.map(item=>item.attachmentId).join(",")}`});
  };
  const enqueue = (files: readonly File[], versions = new Map<File, Readonly<Record<string, unknown>>>()) => {
    const attempts = files.map((file) => { const version = versions.get(file); return { attachmentId: crypto.randomUUID(), file, contentType: file.type || "application/octet-stream", ...(version ? { parentAttachmentId: String(version.id), expectedSeriesVersion: Number(version.version) } : {}) }; });
    setQueue((items) => [...items, ...attempts.map((item) => ({ ...item, state: "queued" as const }))]);
    void runBatch(attempts);
  };
  const addFiles = (files: readonly File[]) => {
    if (!files.length) return;
    if (busy || activeBatches.current) { setError("Wait for the current upload to finish before adding more files."); return; }
    const maxBatch = capability?.maxBatchCount ?? 10;
    const invalid = files.find(file => (capability?.allowedContentTypes && !capability.allowedContentTypes.includes(file.type || "application/octet-stream")) || file.size < 1 || (capability?.maxFileBytes !== undefined && file.size > capability.maxFileBytes));
    if (invalid) { setError(`“${invalid.name}” cannot be uploaded. Allowed types: ${capability?.allowedContentTypes?.join(", ") ?? "those enabled for this record"}.${capability?.maxFileBytes ? ` Maximum size: ${collaborationFileSize(capability.maxFileBytes)}.` : ""} Files must not be empty.`); return; }
    if (files.length > maxBatch) { setError(`Choose up to ${maxBatch} files at a time.`); return; }
    setError(undefined);
    const chosen = files, pending: { file: File; existing: Readonly<Record<string, unknown>> }[] = [], separate: File[] = [];
    for (const file of chosen) { const existing = knownItems.find((item) => item.fileName === file.name || item.displayName === file.name); if (existing && canVersion) pending.push({ file, existing }); else separate.push(file); }
    if (separate.length) enqueue(separate);
    if (pending.length) setDuplicates((current) => [...current, ...pending]);
  };
  const chooseDuplicate = (duplicate: { readonly file: File; readonly existing: Readonly<Record<string, unknown>> }, asVersion: boolean) => {
    setDuplicates((current) => current.filter((item) => item !== duplicate));
    enqueue([duplicate.file], asVersion ? new Map([[duplicate.file, duplicate.existing]]) : undefined);
  };
  const retryFailed = () => { void runBatch([...retry.current]); };
  return <Card className="a-attachment-uploader" role="region" aria-label="File upload drop zone" aria-busy={busy} data-dragging={dragging||undefined} tabIndex={0}
    onDragEnter={event=>{if(Array.from(event.dataTransfer.types).includes("Files")){event.preventDefault();dragDepth.current++;setDragging(true);}}}
    onDragOver={event=>{if(Array.from(event.dataTransfer.types).includes("Files")){event.preventDefault();event.dataTransfer.dropEffect=busy?"none":"copy";}}}
    onDragLeave={()=>{dragDepth.current=Math.max(0,dragDepth.current-1);if(!dragDepth.current)setDragging(false);}}
    onDrop={event=>{event.preventDefault();dragDepth.current=0;setDragging(false);addFiles(Array.from(event.dataTransfer.files));}}
    onPaste={event=>{const files=Array.from(event.clipboardData.files);if(files.length){event.preventDefault();addFiles(files);}}}>
    <div className="a-attachment-uploader__target"><span className="a-attachment-uploader__icon"><UploadIcon size={22} aria-hidden="true"/></span><div className="a-attachment-uploader__prompt"><strong>{dragging ? busy ? "Upload in progress" : "Drop files to upload" : "Drag and drop files here"}</strong><span>or <label className="a-attachment-uploader__drop">browse files<input aria-label="Upload files" type="file" accept={capability?.allowedContentTypes?.join(",")} multiple disabled={busy} onChange={event=>{const files=Array.from(event.currentTarget.files??[]);event.currentTarget.value="";addFiles(files);}}/></label></span></div></div>
    <div className="a-attachment-uploader__guidance"><span>Up to {capability?.maxBatchCount??10} files · scanned automatically</span><details className="a-upload-help"><summary>File requirements</summary><p>{capability?.allowedContentTypes?.length ? `Allowed types: ${capability.allowedContentTypes.map(type=>({"application/pdf":"PDF","image/jpeg":"JPEG","image/png":"PNG"}[type]??type)).join(", ")}.` : "Use the file types enabled for this record."}{capability?.maxFileBytes?` Maximum size: ${collaborationFileSize(capability.maxFileBytes)} per file.`:""} You can also paste files into this area.</p></details></div>
    {duplicates.length ? <section className="a-attachment-uploader__duplicates" aria-label="Duplicate file choices"><h3>Choose how to upload</h3>{duplicates.map((duplicate) => <div key={`${duplicate.file.name}-${duplicate.file.lastModified}`}><p><strong>{duplicate.file.name}</strong> already exists on this record.</p><button type="button" onClick={() => chooseDuplicate(duplicate, true)}>Upload as new version</button><button type="button" onClick={() => chooseDuplicate(duplicate, false)}>Keep as separate file</button><button type="button" onClick={()=>setDuplicates(current=>current.filter(value=>value!==duplicate))}>Cancel upload</button></div>)}</section> : null}
    {queue.length ? <ul aria-label="Upload queue">
      {queue.map((item) => <li key={item.attachmentId}><strong>{item.file.name}</strong>{" — "}<span role={item.state === "failed" ? "alert" : "status"}>{item.state === "uploading" ? `Uploading ${Math.round((item.progress ?? 0) * 100)}%` : item.state === "finalizing" ? "Uploaded · Finalizing" : item.state === "processing" ? "Uploaded · Processing" : item.state}</span>{item.state==="uploading"?<progress aria-label={`Uploading ${item.file.name}`} value={item.progress??0} max={1}/>:item.state==="finalizing"?<progress aria-label={`Finalizing ${item.file.name}`}/>:null}{item.error ? `: ${item.error}` : ""}{item.state === "failed" && retry.current.some(attempt=>attempt.attachmentId===item.attachmentId) ? <button type="button" disabled={busy} onClick={() => { const attempt=retry.current.find((value) => value.attachmentId === item.attachmentId); if(attempt) void runBatch([attempt]); }}>Retry this file</button> : null}{item.state==="failed"?<button type="button" disabled={busy} onClick={()=>{retry.current=retry.current.filter(attempt=>attempt.attachmentId!==item.attachmentId);setQueue(current=>current.filter(value=>value.attachmentId!==item.attachmentId));setError(undefined);}}>Remove from queue</button>:null}</li>)}
    </ul> : null}
    {error ? <p role="alert">{error}</p> : null}
    {retry.current.length && !busy ? <button type="button" onClick={retryFailed}>Retry failed uploads</button> : null}
  </Card>;
}
function putWithProgress(url: string, file: File, contentType: string, onProgress: (progress: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", url, true);
    request.setRequestHeader("Content-Type", contentType);
    request.upload.onprogress = (event) => { if (event.lengthComputable) onProgress(event.loaded / event.total); };
    request.onerror = () => reject(new Error("The file upload failed."));
    request.onabort = () => reject(new Error("The file upload was cancelled."));
    request.onload = () => request.status >= 200 && request.status < 300 ? resolve() : reject(new Error("The file upload failed."));
    request.send(file);
  });
}
const CommentEditContext=createContext<{id?:string;editor?:ReactNode}>({});
function CommentCollection({ entityCode, recordId, items, onChanged, capability, actions, onLoadThreadPage }: { readonly entityCode: string; readonly recordId: string; readonly capability?: EntityRuntimeSectionResource["capability"]; readonly actions: ReadonlySet<string>; readonly items: readonly Readonly<Record<string, unknown>>[]; readonly onChanged: () => void; readonly onLoadThreadPage?: (threadRootId: string, cursor?: string) => Promise<EntityRuntimeSectionResource> }) {
  const { push: notify } = useToasts();
  const client = useApiClient(), identity = useSessionIdentity();
  const [busy,setBusy] = useState<string>(), [error,setError] = useState<string>();
  const [editing,setEditing] = useState<Readonly<Record<string,unknown>>>(), [history,setHistory] = useState<Readonly<Record<string,unknown>>>();
  const [deleteTarget,setDeleteTarget]=useState<string>();
  const [reportReason,setReportReason]=useState("");
  const [editConflict,setEditConflict]=useState(false);
  const [reportingId,setReportingId] = useState<string>(), [reportDetail,setReportDetail] = useState("");
  const toolbarRef=useContext(CollaborationToolbarContext);
  const [groupBy,setGroupBy]=useState("date");
  const [commentFilter,setCommentFilter] = useState("all"), [newestFirst,setNewestFirst] = useState(false);
  const editCreatedDraft = useRef(false);
  const cleanupEditDraft = async () => { if(editCreatedDraft.current){await client.request(commentDraftCancel,{query:{entityType:entityCode,entityId:recordId}});editCreatedDraft.current=false;} };
  const historyEpoch = useRef(0), mutationPending = useRef(false);
  const visibleComments = items.filter(item => commentFilter === "internal" ? item.visibility === "internal" : commentFilter === "mentions" ? mentionsPrincipal(draftDocument(item), identity.scope?.principalId) : true).slice().sort((a,b) => (groupBy==="user" ? String(a.authorDisplayName??"").localeCompare(String(b.authorDisplayName??"")) || String(a.authorId??"").localeCompare(String(b.authorId??"")) : 0) || (new Date(String(a.createdAt)).getTime()-new Date(String(b.createdAt)).getTime())*(newestFirst ? -1 : 1));
  const closeAction = () => { if (mutationPending.current) return; if(editing){const id=String(editing.id);requestAnimationFrame(()=>document.getElementById(`comment-${id}`)?.querySelector<HTMLElement>("summary")?.focus());} historyEpoch.current++; void cleanupEditDraft().catch(cause=>setError(message(cause))); setEditing(undefined);setHistory(undefined);setReportingId(undefined);setDeleteTarget(undefined);setError(undefined); };
  async function loadHistory(id:string,beforeRevision?:number) {
    const epoch=++historyEpoch.current;
    setError(undefined);setHistory(current=>({commentId:id,items:beforeRevision && current?.commentId===id ? current.items : [],loading:true}));
    try {
      const result=await client.request(createOperation<Readonly<Record<string,unknown>>>({method:"GET",path:()=>`/api/collab/comments/${encodeURIComponent(id)}/history${beforeRevision?`?beforeRevision=${beforeRevision}`:""}`}),{});
      if(epoch!==historyEpoch.current)return;
      setHistory(current=>({...result,commentId:id,items:[...(beforeRevision && Array.isArray(current?.items)?current.items:[]),...(Array.isArray(result.items)?result.items:[])],loading:false}));
    } catch(cause) { if(epoch===historyEpoch.current){setHistory(current=>({...current,loading:false}));setError(message(cause));} }
  }
  async function remove(id:string) { if(mutationPending.current)return;mutationPending.current=true;setBusy(id);setError(undefined);try {await client.request(commentDelete(id),{});setDeleteTarget(undefined);notify({tone:"success",title:"Comment deleted"});onChanged();}catch(cause){setError(message(cause));}finally{mutationPending.current=false;setBusy(undefined);} }
  async function edit(item:Readonly<Record<string,unknown>>) {if(mutationPending.current)return;closeAction();setEditConflict(false);setEditing(item);requestAnimationFrame(()=>document.getElementById(`comment-${item.id}`)?.querySelector<HTMLElement>('[contenteditable="true"]')?.focus());}
  async function react(id:string,code:string,active:boolean) {if(mutationPending.current)return;mutationPending.current=true;setBusy(id);setError(undefined);try{if(active)await client.request(commentReactionDelete(id,code),{});else await client.request(commentReaction(id),{body:{code}});onChanged();}catch(cause){setError(message(cause));}finally{mutationPending.current=false;setBusy(undefined);} }
  async function flag(id:string) {closeAction();setReportingId(id);setReportReason("");setReportDetail("");}
  async function showHistory(id:string) {closeAction();await loadHistory(id);}
  async function submitReport() {
    if(!reportingId || !reportReason || mutationPending.current)return;
    mutationPending.current=true;setBusy(reportingId);setError(undefined);
    try{await client.request(commentFlag(reportingId),{body:{reasonCode:reportReason,...(reportDetail.trim()?{detail:reportDetail.trim()}:{})}});setReportingId(undefined);setReportDetail("");notify({tone:"success",title:"Report submitted for review"});onChanged();}
    catch(cause){setError(message(cause));}finally{mutationPending.current=false;setBusy(undefined);}
  }
  const historyContent = history ? <section aria-label="Saved revisions" aria-busy={history.loading===true}>{history.loading ? <p role="status">Loading history…</p> : null}{history.deletion ? <div><p>Comment deleted{valueRecord(history.deletion)?.deletedAt ? ` · ${collaborationTime(valueRecord(history.deletion)?.deletedAt)}` : ""}</p><p>Previous comment content is unavailable after deletion.</p></div> : null}{Array.isArray(history.items) && history.items.length ? history.items.map((entry:any)=><article className="a-comment-history-entry" key={entry.revision}><strong>Revision {entry.revision}</strong><time dateTime={entry.createdAt}>{collaborationTime(entry.createdAt)}</time><div className="a-comment-content">{renderComment(entry)}</div></article>) : !history.loading && !error && !history.deletion ? <p>No saved revisions are available.</p> : null}{typeof history.nextRevision==="number" ? <Button type="button" disabled={history.loading===true} onClick={()=>void loadHistory(String(history.commentId),Number(history.nextRevision))}>Older revisions</Button> : null}{editing && Array.isArray(history.items) && Number(history.items[0]?.revision)>Number(editing.revision) ? <Button type="button" onClick={()=>{setEditing({...editing,revision:Number((history.items as any[])[0].revision)});setError(undefined);}}>Use reviewed revision and keep my unsaved text</Button> : null}{!editing ? <Button type="button" onClick={closeAction}>Close history</Button> : null}</section> : null;
  const editContent = editing ? <><RichCommentComposer key={String(editing.id)} entityType={entityCode} entityId={recordId} initialDocument={editableCommentDocument(editing)} searchMentions={actions.has("mention")?async(query,visibility)=>{const params=new URLSearchParams({entityType:entityCode,entityId:recordId,q:query,visibility});const result=await client.request(createOperation<{items:readonly {id:string;displayName:string}[]}>({method:"GET",path:()=>`/api/collab/participants?${params}`}),{});return result.items;}:undefined} audienceLockedReason="Visibility is fixed after posting. Editing keeps the original audience." allowedAudiences={[editing.visibility as "public"|"internal"|"private"]} header="Edit comment" submitLabel="Save" submitAriaLabel="Save comment" onCancel={closeAction} cancelLabel="Cancel" maxAttachments={capability?.maxAttachments} allowAttachments={Boolean(capability?.maxAttachments)} prepareAttachments={async(document,visibility)=>{const prepared=await prepareCommentFiles(client,entityCode,recordId,document,visibility,undefined,true);editCreatedDraft.current ||= prepared.createdDraft;return prepared;}} onSubmit={async submission=>{
        mutationPending.current=true;setBusy(String(editing.id));setError(undefined);
        try{await client.request(commentEdit(String(editing.id)),{body:{text:submission.text||"[Attachment]",format:submission.format,content:submission.content,expectedRevision:Number(editing.revision),attachmentIds:submission.attachmentIds}});await cleanupEditDraft();setEditing(undefined);setHistory(undefined);notify({tone:"success",title:"Comment updated"});onChanged();}
        catch(cause){setEditConflict(cause instanceof ApiTransportError && cause.status===409);setError(cause instanceof ApiTransportError && cause.status===409 ? "This comment changed. Review the latest saved revision below before retrying; your text is preserved." : message(cause));throw cause;}
        finally{mutationPending.current=false;setBusy(undefined);}
      }}/>{editConflict ? <div className="a-comment-action-dialog__footer"><Button type="button" disabled={Boolean(busy)||history?.loading===true} onClick={()=>void loadHistory(String(editing.id))}>Review latest saved revision</Button></div> : null}{historyContent}{error?<p role="alert">{error}</p>:null}</> : null;
  const title = deleteTarget ? "Delete comment?" : editing ? "Edit comment" : reportingId ? "Report comment" : "Comment history";
  const dialogOpen = Boolean(deleteTarget || reportingId || (history && !editing));
  return <>
    <div className="a-comment-filters" aria-label="Filter loaded comments"><div role="group" aria-label="Comment filters">{[["all","All"],["mentions","Mentions"],["internal","Internal"]].map(([key,label])=><button key={key} type="button" disabled={Boolean(editing)} aria-pressed={commentFilter===key} onClick={()=>setCommentFilter(key!)}>{label}</button>)}</div><div className="a-comment-view-options"><label><span className="a-visually-hidden">Comment order</span><select disabled={Boolean(editing)} value={newestFirst?"newest":"oldest"} onChange={event=>setNewestFirst(event.currentTarget.value==="newest")}><option value="oldest">Oldest first</option><option value="newest">Newest first</option></select></label><label><span className="a-visually-hidden">Group comments by</span><select disabled={Boolean(editing)} aria-label="Group comments by" value={groupBy} onChange={event=>setGroupBy(event.currentTarget.value)}><option value="date">Group by date</option><option value="user">Group by user</option></select></label></div><div className="a-comment-view-controls" ref={toolbarRef}/></div>
    {!visibleComments.length ? <EmptySectionState centered icon={<MessageCircleIcon size={24}/>} title={items.length ? "No matching comments" : "No comments yet"} detail={items.length ? "Try another comment filter." : "Start the conversation below."}/> : null}
    <Dialog open={dialogOpen} onOpenChange={open=>{if(!open)closeAction();}}><DialogContent portal title={title} className="a-comment-action-dialog">
      {deleteTarget ? <><p>This removes the comment from the conversation. Existing replies remain visible.</p><div className="a-comment-action-dialog__footer"><Button variant="secondary" type="button" disabled={Boolean(busy)} onClick={closeAction}>Cancel</Button><Button variant="danger" type="button" disabled={Boolean(busy)} onClick={()=>void remove(deleteTarget)}>{busy?"Deleting…":"Delete comment"}</Button></div></> : null}
      {reportingId ? <form onSubmit={event=>{event.preventDefault();void submitReport();}}><p>Tell the reviewer what needs attention. Reporting does not remove the comment.</p><label>Reason<select aria-label="Reason" autoFocus required value={reportReason} onChange={event=>setReportReason(event.currentTarget.value)}><option value="" disabled>Select a reason</option><option value="spam">Spam</option><option value="harassment">Harassment</option><option value="misinformation">Misinformation</option><option value="off_topic">Off-topic</option><option value="other">Other</option></select></label><label>Additional context (optional)<textarea value={reportDetail} maxLength={4000} onChange={event=>setReportDetail(event.currentTarget.value)} placeholder="Describe the concern (optional)"/></label><div className="a-comment-action-dialog__footer"><Button variant="ghost" type="button" disabled={Boolean(busy)} onClick={closeAction}>Cancel</Button><Button type="submit" disabled={Boolean(busy)||!reportReason}>{busy?"Submitting…":"Submit report"}</Button></div></form> : null}

      {!editing ? historyContent : null}
      {error ? <p role="alert">{error}</p> : null}
    </DialogContent></Dialog>
    <CommentEditContext.Provider value={{id:editing?String(editing.id):undefined,editor:editContent}}><div className="a-record-detail-collection">{visibleComments.map((item,index)=>{const day=groupBy==="user"?String(item.authorDisplayName??"Participant"):new Date(String(item.createdAt)).toLocaleDateString(undefined,{year:"numeric",month:"short",day:"numeric"});const previous=index?(groupBy==="user"?String(visibleComments[index-1]?.authorId):new Date(String(visibleComments[index-1]?.createdAt)).toLocaleDateString(undefined,{year:"numeric",month:"short",day:"numeric"})):undefined;const group=groupBy==="user"?String(item.authorId):day;return <Fragment key={String(item.id)}>{group!==previous ? <div className="a-comment-date-divider">{groupBy==="user"?<span>{day}</span>:<time dateTime={String(item.createdAt)}>{day}</time>}</div>:null}<CommentThread root={item} actions={actions} busy={busy} identity={identity.scope?.principalId} onReact={react} onFlag={flag} onHistory={showHistory} onEdit={edit} onRemove={async id=>{closeAction();setDeleteTarget(id);}} onError={cause=>setError(message(cause))} onLoadThreadPage={onLoadThreadPage}/></Fragment>;})}</div></CommentEditContext.Provider>
    {error && !dialogOpen && !editing ? <p role="alert">{error}</p> : null}
  </>;
}

function mentionsPrincipal(value: unknown, principalId?: string): boolean {
  if (!principalId || !value || typeof value !== "object") return false;
  const node = value as {type?: string;attrs?: {principalId?: string};content?: readonly unknown[]};
  return node.type === "mention" && node.attrs?.principalId === principalId || Boolean(node.content?.some(child => mentionsPrincipal(child, principalId)));
}

function CommentThread({ root, actions, busy, identity, onReact, onFlag, onHistory, onEdit, onRemove, onError, onLoadThreadPage }: { readonly root: Readonly<Record<string, unknown>>; readonly actions: ReadonlySet<string>; readonly busy?: string; readonly identity?: string; readonly onReact: (id: string, code: string, active: boolean) => Promise<void>; readonly onFlag: (id: string) => Promise<void>; readonly onHistory: (id: string) => Promise<void>; readonly onEdit: (item: Readonly<Record<string, unknown>>) => Promise<void>; readonly onRemove: (id: string) => Promise<void>; readonly onError: (cause: unknown) => void; readonly onLoadThreadPage?: (threadRootId: string, cursor?: string) => Promise<EntityRuntimeSectionResource> }) {
  const replyComposer=useContext(ReplyComposerContext);
  const activeEdit=useContext(CommentEditContext);
  const received=useRef(0), loadingRef=useRef(false);
  const [page, setPage] = useState<Readonly<Record<string, unknown>>>(), [expanded, setExpanded] = useState(false), [loading, setLoading] = useState(false), rootId = String(root.id);
  const loadedPages=useRef(1), pendingRefresh=useRef(false), reveal=useRef<string|undefined>(undefined);
  const load = async (cursor?:string):Promise<{items:readonly Readonly<Record<string,unknown>>[];nextCursor?:string}|undefined> => {
    if(!onLoadThreadPage)return;
    if(loadingRef.current){if(!cursor)pendingRefresh.current=true;return;}
    loadingRef.current=true;setLoading(true);
    try {
      let nextCursor=cursor;
      let replies:readonly Readonly<Record<string,unknown>>[]=[];
      let pages=0;
      do {
        const resource=await onLoadThreadPage(rootId,nextCursor);
        const data=valueRecord(resource.data),next=valueRecord(data?.data)??data;
        replies=[...replies,...collectionItems(resource.data)];
        nextCursor=typeof next?.nextCursor==="string"?next.nextCursor:undefined;
        pages++;
      } while(!cursor && nextCursor && pages<Math.min(loadedPages.current,5));
      loadedPages.current=cursor?loadedPages.current+1:pages;
      const result={items:replies,...(nextCursor?{nextCursor}:{})};
      setPage(current=>({...result,items:cursor?Array.from(new Map([...(Array.isArray(current?.items)?current.items:[]),...replies].map((item:any)=>[item.id,item])).values()):replies}));
      setExpanded(true);
      if(reveal.current && (reveal.current===rootId || replies.some(item=>item.id===reveal.current))){const id=reveal.current;reveal.current=undefined;requestAnimationFrame(()=>document.getElementById(`comment-${id}`)?.scrollIntoView({block:"nearest"}));}
      if(reveal.current && nextCursor)setParentNotice("Reply posted. Use Load more replies to reach the newest replies.");
      return result;
    } catch(cause){onError(cause);}
    finally {
      loadingRef.current=false;setLoading(false);
      if(pendingRefresh.current){pendingRefresh.current=false;void load();}
    }
  };
  useEffect(()=>{if(expanded)void load();},[root]);
  useEffect(()=>{if(replyComposer.target?.rootId===rootId){if(!page)void load();else setExpanded(true);}},[replyComposer.target]);
  useEffect(()=>{const event=replyComposer.sent;if(event?.rootId===rootId && event.sequence!==received.current){received.current=event.sequence;reveal.current=event.id??rootId;void load();}},[replyComposer.sent]);
  const [parentNotice,setParentNotice]=useState<string>();
  const locateParent=async(id:string)=>{
    const element=document.getElementById(`comment-${id}`);
    if(!element){setParentNotice("The parent comment is not loaded. Use Load more replies to continue.");return;}
    setParentNotice(undefined);element.scrollIntoView({block:"nearest"});
    element.focus({preventScroll:true});
    if(!window.matchMedia("(prefers-reduced-motion: reduce)").matches)element.animate([{backgroundColor:"var(--a-selection-subtle)"},{backgroundColor:"transparent"}],{duration:1200});
  };
  const selectReply = async(id:string,name?:string)=>{
    const target=id===rootId?root:(Array.isArray(page?.items)?page.items:[]).find((item:any)=>item.id===id);
    replyComposer.select({id,rootId,name:name??"participant",excerpt:String(target?.text??"").replace(/\s+/g," ").slice(0,140)});
    setExpanded(true);if(!page)void load();
  };
  const toggle = () => { if (page) setExpanded(current => !current); else void load(); };
  const parents=new Map<string,Readonly<Record<string,unknown>>>([[rootId,root],...(Array.isArray(page?.items)?page.items.map((item:any)=>[String(item.id),item] as [string,Readonly<Record<string,unknown>>]):[])]);
  const replyCount = typeof root.replyCount==="number" ? root.replyCount : page && !page.nextCursor && Array.isArray(page.items) ? page.items.length : undefined;
  const threadAction = onLoadThreadPage ? replyCount===0 ? null : <button type="button" className="a-comment-reply-toggle" aria-expanded={expanded} disabled={loading || Boolean(activeEdit.id && (activeEdit.id===rootId || (Array.isArray(page?.items) && page.items.some((item:any)=>item.id===activeEdit.id))))} onClick={toggle}>{loading?"Loading replies…":`${expanded?"Hide":"Show"} ${replyCount===undefined?"replies":`${replyCount} ${replyCount===1?"reply":"replies"}`}`}</button> : null;
  return <Card className="a-comment-thread" data-audience={String(root.visibility)}><CommentItem item={root} actions={actions} busy={busy} identity={identity} onReply={selectReply} onReact={onReact} onFlag={onFlag} onHistory={onHistory} onEdit={onEdit} onRemove={onRemove} threadAction={threadAction}/>{onLoadThreadPage ? <section aria-label="Replies">{parentNotice?<p role="status">{parentNotice}</p>:null}{expanded && Array.isArray(page?.items) ? <div className="a-comment-reply-group">{page.items.map((reply: any) => <CommentItem key={String(reply.id)} onReplyRoot={root.tombstone?undefined:()=>selectReply(rootId,String(root.authorDisplayName??"participant"))} onLocateParent={locateParent} item={{...reply,replyToExcerpt:reply.replyToExcerpt??parents.get(String(reply.parentCommentId))?.text,replyToDeleted:reply.replyToDeleted??parents.get(String(reply.parentCommentId))?.tombstone,replyToName:String(reply.replyToName??parents.get(String(reply.parentCommentId))?.authorDisplayName??"participant")}} actions={actions} busy={busy} identity={identity} onReply={selectReply} onReact={onReact} onFlag={onFlag} onHistory={onHistory} onEdit={onEdit} onRemove={onRemove} />)}</div> : null}{expanded && typeof page?.nextCursor === "string" ? <button type="button" disabled={loading} onClick={() => void load(page.nextCursor as string)}>Load more replies</button> : null}</section> : null}</Card>;
}

function CommentItem({ item, actions, busy, identity, onReply, onReact, onFlag, onHistory, onEdit, onRemove, threadAction, onLocateParent, onReplyRoot }: { readonly onReplyRoot?:()=>Promise<void>; readonly onLocateParent?:(id:string)=>Promise<void>; readonly threadAction?: ReactNode; readonly item: Readonly<Record<string, unknown>>; readonly actions: ReadonlySet<string>; readonly busy?: string; readonly identity?: string; readonly onReply: (id: string,name?:string) => Promise<void>; readonly onReact: (id: string, code: string, active: boolean) => Promise<void>; readonly onFlag: (id: string) => Promise<void>; readonly onHistory: (id: string) => Promise<void>; readonly onEdit: (item: Readonly<Record<string, unknown>>) => Promise<void>; readonly onRemove: (id: string) => Promise<void> }) {
  const [reportOpen,setReportOpen]=useState(false);
  const report=valueRecord(item.viewerReport);
  const hasReport=Boolean(report || item.reportStatus);
  const reportState=String(report?.status??item.reportStatus??"");
  const reportLabel=reportState==="reviewing"?"Report under review":["resolved","dismissed","approved","rejected","removed"].includes(reportState)?"Report resolved":reportState==="open"?"Report pending review":"Report submitted";
  const editContext=useContext(CommentEditContext);
  const editingHere=editContext.id===String(item.id);
  const replyComposer=useContext(ReplyComposerContext);
  const liked=Array.isArray(item.viewerReactions) && item.viewerReactions.includes("thumbs_up");
  const author = String(item.authorDisplayName ?? "Participant"), initials = author.split(/\s+/).slice(0,2).map(word=>word[0]).join("");
  return <article tabIndex={-1} id={`comment-${String(item.id)}`} className="a-comment-item" data-audience={String(item.visibility)} data-deleted={Boolean(item.tombstone)}>
    <header className="a-comment-item__header"><span className="a-comment-avatar" aria-hidden="true">{initials}</span><strong>{author}</strong><time dateTime={String(item.createdAt)} title={String(item.createdAt)}>{collaborationTime(item.createdAt)}</time><span className="a-comment-audience">{String(item.visibility)}</span>{!item.tombstone && Number(item.revision)>1 ? <span title={item.updatedAt ? `Edited ${collaborationTime(item.updatedAt)}` : "Comment edited"}>Edited</span> : null}{!item.tombstone && !editContext.id ? <CollaborationActions label="Comment actions">{actions.has("flag") && !item.tombstone ? <button type="button" disabled={busy === item.id} onClick={() => hasReport?setReportOpen(true):void onFlag(String(item.id))}>{hasReport?"View your report":"Report comment"}</button> : null}{!item.tombstone && item.authorId === identity ? <>{actions.has("history") ? <button type="button" onClick={()=>void onHistory(String(item.id))}>History</button> : null}{actions.has("update_own") ? <button type="button" disabled={busy === item.id} onClick={() => void onEdit(item)}>Edit</button> : null}{actions.has("archive_own") ? <button type="button" disabled={busy === item.id} onClick={() => void onRemove(String(item.id))}>Delete</button> : null}</> : null}</CollaborationActions> : null}</header>
    {item.parentCommentId?<button type="button" className="a-comment-parent-reference" onClick={()=>void onLocateParent?.(String(item.parentCommentId))}><ReplyIcon size={14} aria-hidden="true"/><span className="a-comment-parent-reference__text">{item.replyToDeleted?"Replying to a deleted comment":`Replying to ${String(item.replyToName??"participant")}${item.replyToExcerpt?`: “${String(item.replyToExcerpt).replace(/\s+/g," ").slice(0,140)}”`:""}`}</span></button>:null}
    {hasReport ? <div className="a-comment-report-status"><span className="a-comment-report-badge">{reportLabel}</span><button type="button" onClick={()=>setReportOpen(true)}>View your report</button></div> : null}
    <Dialog open={reportOpen && hasReport} onOpenChange={setReportOpen}><DialogContent title="Your report" className="a-comment-action-dialog"><dl className="a-comment-report-details"><dt>Status</dt><dd>{reportLabel}</dd><dt>Reason</dt><dd>{({spam:"Spam",harassment:"Harassment",misinformation:"Misinformation",off_topic:"Off-topic",other:"Other",user_report:"General concern"} as Record<string,string>)[String(report?.reason)]??"Not available"}</dd><dt>Additional context</dt><dd>{String(report?.detail??"No additional context provided.")}</dd><dt>Submitted</dt><dd>{report?.submittedAt?collaborationTime(report.submittedAt):"Not available"}</dd>{report?.decision?<><dt>Outcome</dt><dd>{({approved:"Comment approved",rejected:"Comment rejected",removed:"Comment removed"} as Record<string,string>)[String(report.decision)]??"Review completed"}</dd></>:null}</dl><p>No reviewer response has been shared.</p><div className="a-comment-action-dialog__footer"><Button variant="secondary" type="button" onClick={()=>setReportOpen(false)}>Close</Button></div></DialogContent></Dialog>
    {item.tombstone ? <div className="a-comment-tombstone"><span>Comment deleted</span>{item.authorId===identity && actions.has("history")?<button type="button" className="a-comment-deletion-history" onClick={()=>void onHistory(String(item.id))}>View deletion details</button>:null}</div> : editingHere ? <section className="a-comment-inline-edit" aria-label="Edit comment">{editContext.editor}</section> : <><div className="a-comment-content">{renderComment(item)}</div>{Array.isArray(item.pinnedFiles) && item.pinnedFiles.length ? <ul aria-label="Pinned files">{item.pinnedFiles.map((file: any) => <li key={String(file.attachmentId)}><CommentFile attachmentId={String(file.attachmentId)} name={String(file.fileName ?? "File")} version={String(file.version ?? "")} size={file.sizeBytes}/></li>)}</ul> : null}</>}<div className="a-comment-item__actions" hidden={editingHere || Boolean(item.tombstone && !threadAction)}>{actions.has("reply") && !item.tombstone && Number(item.threadDepth??0)<5 ? <button type="button" disabled={busy === item.id} onClick={() => void onReply(String(item.id),author)}><ReplyIcon size={14}/> Reply</button> : null}{actions.has("reply") && !item.tombstone && Number(item.threadDepth??0)>=5?<><span className="a-comment-depth-limit">Maximum reply depth reached</span>{onReplyRoot?<button type="button" onClick={()=>void onReplyRoot()}>Reply to main comment</button>:null}</>:null}{actions.has("react") && !item.tombstone ? <Tooltip label={liked?"Remove like":"Like"}><button type="button" disabled={busy === item.id} aria-pressed={Array.isArray(item.viewerReactions) && item.viewerReactions.includes("thumbs_up")} aria-label={Array.isArray(item.viewerReactions) && item.viewerReactions.includes("thumbs_up") ? "Remove like" : "Like comment"} onClick={() => void onReact(String(item.id), "thumbs_up", Array.isArray(item.viewerReactions) && item.viewerReactions.includes("thumbs_up"))}><ThumbsUpIcon size={16} aria-hidden="true"/>{Array.isArray(item.reactions) && Number(item.reactions.find((reaction:any)=>reaction.code==="thumbs_up")?.count)>0 ? <span aria-label="Like count">{Number(item.reactions.find((reaction:any)=>reaction.code==="thumbs_up")?.count)}</span> : null}</button></Tooltip> : null}{threadAction}</div>{replyComposer.inline && replyComposer.target?.id===String(item.id)?<ReplyComposerPlacement/>:null}</article>;
}
function CommentFile({attachmentId,name,version,size}:{attachmentId:string;name:string;version:string;size?:unknown}) {
  const previewButtonId=useId();
  const client=useApiClient();const [error,setError]=useState<string>(),[busy,setBusy]=useState(false),[preview,setPreview]=useState(false);
  const visible=useContext(CollaborationVisibilityContext);
  return <div className="a-comment-file">
    <FileTypeIcon name={name}/>
    <div className="a-comment-file__identity"><button type="button" className="a-comment-file__name" aria-label={`Preview ${name}`} aria-expanded={preview} onClick={()=>setPreview(value=>!value)}>{name}</button><small>{size!=null?`${collaborationFileSize(size)} · `:""}v{version}</small></div>
    <FileAction id={previewButtonId} label={`Preview attachment ${name}`} tooltipLabel="Preview attachment" icon={<EyeIcon size={16} aria-hidden="true"/>} aria-expanded={preview} onClick={()=>setPreview(value=>!value)}/>
    <FileAction label={`Download ${name}`} tooltipLabel="Download attachment" icon={<DownloadIcon size={16} aria-hidden="true"/>} disabled={busy} onClick={async()=>{setBusy(true);setError(undefined);try{const result=await client.request(attachmentDownload(attachmentId),{body:{expirySeconds:120}});window.location.assign(result.url);}catch(cause){setError(message(cause));}finally{setBusy(false);}}}/>
    {preview&&visible?<div className="a-comment-file__preview"><button type="button" onClick={()=>{setPreview(false);requestAnimationFrame(()=>document.getElementById(previewButtonId)?.focus({preventScroll:true}));}}>Close preview</button><AttachmentPreview attachmentId={attachmentId} document/></div>:null}
    {error?<p role="alert">{error}</p>:null}
  </div>;
}

function AttachmentCollection({ entityCode, recordId, items, folders, workspaceRevision, canPreview, canSearch, canDownload, canUnlink, canArchive, canRename, canVersion, canCategory, canFolder, onChanged, upload, loadMore }: { readonly upload?: ReactNode; readonly loadMore?: ReactNode; readonly entityCode: string; readonly recordId: string; readonly folders: readonly Readonly<Record<string, unknown>>[]; readonly workspaceRevision: string; readonly canPreview: boolean; readonly canSearch: boolean; readonly canDownload: boolean; readonly canUnlink: boolean; readonly canArchive: boolean; readonly canRename: boolean; readonly canVersion: boolean; readonly canCategory: boolean; readonly canFolder: boolean; readonly items: readonly Readonly<Record<string, unknown>>[]; readonly onChanged: () => void }) {
  const fullView=useContext(CollaborationPresentationContext)==="content";
  const panelVisible=useContext(CollaborationVisibilityContext);
  const [folderFilter, setFolderFilter] = useState(""), [categoryFilter, setCategoryFilter] = useState("");
  const search=useFileSearch(entityCode,recordId,canSearch,folderFilter,categoryFilter);
  const contentSearch=search.scope==="contents";
  const { push: notify } = useToasts();
  const notifySuccess = (title:string) => notify({tone:"success",title});
  const [filtersOpen,setFiltersOpen]=useState(false), [selectedName,setSelectedName]=useState("");
  const workspaceRef=useRef<HTMLElement>(null), previewRef=useRef<HTMLElement>(null), previewOpener=useRef<HTMLElement|null>(null);
  const previewScroll=useRef<{element:Element|null;top:number;page:number}|undefined>(undefined);
  const browseScroll=useRef<{element:Element|null;top:number;page:number}|undefined>(undefined);
  const rememberBrowse=()=>{const element=workspaceRef.current?.closest(".a-collaboration-panel__body")??null;browseScroll.current={element,top:element?.scrollTop??0,page:window.scrollY};};
  const clearPreviewLink=()=>{const url=new URL(window.location.href);if(url.searchParams.has("file")){url.searchParams.delete("file");window.history.replaceState(window.history.state,"",url);}};
  const appliedPreviewLink=useRef<string|undefined>(undefined);
  const clearSearch=()=>{clearPreviewLink();search.reset();search.setScope("names");setSelected(undefined);requestAnimationFrame(()=>{const saved=browseScroll.current;if(saved){if(saved.element)saved.element.scrollTop=saved.top;window.scrollTo({top:saved.page,behavior:"instant"});}});};
  const openPreview=(id:string,name:string)=>{previewOpener.current=document.activeElement as HTMLElement;const element=workspaceRef.current?.closest(".a-collaboration-panel__body")??null;previewScroll.current={element,top:element?.scrollTop??0,page:window.scrollY};setSelected(id);setSelectedName(name);requestAnimationFrame(()=>previewRef.current?.focus({preventScroll:fullView && (workspaceRef.current?.clientWidth??0)>=680}));};
  const closePreview=()=>{clearPreviewLink();setSelected(undefined);requestAnimationFrame(()=>{if(previewOpener.current?.isConnected)previewOpener.current.focus({preventScroll:true});const saved=previewScroll.current;if(saved){if(saved.element)saved.element.scrollTop=saved.top;window.scrollTo({top:saved.page,behavior:"instant"});}});};

  const [folderOpen,setFolderOpen]=useState(false),[moveTarget,setMoveTarget]=useState<Readonly<Record<string,unknown>>>(),[moveValue,setMoveValue]=useState(""),[categoryValue,setCategoryValue]=useState<"general"|"evidence">("general");
  const client = useApiClient(), [busy, setBusy] = useState<string>(), [error, setError] = useState<string>(), [filter, setFilter] = useState(""), [selected, setSelected] = useState<string>(), [history, setHistory] = useState<ReadonlySet<string>>(new Set()), [status, setStatus] = useState<Readonly<Record<string, string>>>({}), [newFolderName, setNewFolderName] = useState(""), [renameTarget, setRenameTarget] = useState<Readonly<Record<string, unknown>>>(), [renameValue, setRenameValue] = useState(""), [categoryTarget, setCategoryTarget] = useState<string>(), [confirm, setConfirm] = useState<{ readonly kind: "unlink" | "archive" | "folder"; readonly item: Readonly<Record<string, unknown>>; readonly detail: string }>(), versionTarget = useRef<Readonly<Record<string, unknown>> | undefined>(undefined), versionInput = useRef<HTMLInputElement>(null), folderCommands = useRef(new Map<string, { readonly folderId: string | null; readonly idempotencyKey: string; readonly expectedRevision: number }>());
  useEffect(()=>{
    const applyLink=()=>{const file=new URLSearchParams(window.location.search).get("file");if(!file)return;if(file!==appliedPreviewLink.current && items.some(item=>item.id===file)){appliedPreviewLink.current=file;setSelected(file);setSelectedName(String(items.find(item=>item.id===file)?.displayName??items.find(item=>item.id===file)?.fileName??"File preview"));}};
    applyLink();const navigate=()=>{appliedPreviewLink.current=undefined;if(!new URLSearchParams(window.location.search).has("file"))setSelected(undefined);else applyLink();};window.addEventListener("popstate",navigate);return()=>window.removeEventListener("popstate",navigate);
  },[items]);
  useEffect(() => {
    const pending = items.filter((item) => ["pending", "uploading", "uploaded", "processing"].includes(String(item.processingStatus))).map((item) => String(item.id));
    if (!pending.length) return;
    let cancelled = false, delay = 2000, timer: number | undefined;
    const poll = async () => {
      await Promise.all(pending.map(async (id) => { try { const value = await client.request(attachmentStatus(id), {}); if (!cancelled) setStatus((current) => ({ ...current, [id]: `${value.status}${value.extractionStatus ? `; extraction ${value.extractionStatus}` : ""}` })); } catch { /* The authorized reader remains the source of row visibility. */ } }));
      if (!cancelled) { delay = Math.min(delay * 2, 10000); timer = window.setTimeout(() => void poll(), delay); }
    };
    void poll();
    return () => { cancelled = true; if (timer) window.clearTimeout(timer); };
  }, [client, items]);
  async function download(id: string) { setBusy(id); setError(undefined); try { const result = await client.request(attachmentDownload(id), { body: { expirySeconds: 120 } }); window.location.assign(result.url); } catch (cause) { setError(message(cause)); } finally { setBusy(undefined); } }
  async function unlink(item: Readonly<Record<string, unknown>>) { const id=String(item.id); setBusy(id); setError(undefined); try { await client.request(attachmentUnlink(id), {idempotencyKey:`unlink:${id}`});setConfirm(undefined);notifySuccess(`File “${String(item.displayName??item.fileName)}” removed from record`); onChanged(); } catch (cause) { setError(message(cause)); } finally { setBusy(undefined); } }
  async function requestArchive(item: Readonly<Record<string, unknown>>) { const id=String(item.id); setBusy(id); setError(undefined); try { const outcome=await client.request(attachmentArchiveOutcome(id),{}); if (outcome.legalHold) { setError("A legal hold blocks archive."); return; } setConfirm({kind:"archive",item,detail:`This archives the file everywhere it is linked, including other records. It currently has ${outcome.activeLinks} active ${outcome.activeLinks === 1 ? "record link" : "record links"}.`}); } catch(cause) { setError(message(cause)); } finally { setBusy(undefined); } }
  async function archive(item: Readonly<Record<string, unknown>>) { const id=String(item.id); setBusy(id); setError(undefined); try { await client.request(attachmentArchive(id),{idempotencyKey:crypto.randomUUID()});setConfirm(undefined);notifySuccess(`File “${String(item.displayName??item.fileName)}” archived`); onChanged(); } catch(cause) { setError(message(cause)); } finally { setBusy(undefined); } }
  async function rename(item: Readonly<Record<string, unknown>>, displayName: string) { const id = String(item.id), current = String(item.displayName ?? item.fileName ?? ""); if (!displayName.trim() || displayName.trim() === current) { setRenameTarget(undefined); return; } setBusy(id); setError(undefined); try { await client.request(attachmentRename(id), { body: { displayName: displayName.trim(), expectedSeriesRevision: String(item.revision) }, idempotencyKey: crypto.randomUUID() }); setRenameTarget(undefined);notifySuccess(`File renamed to “${displayName.trim()}”`); onChanged(); } catch (cause) { setError(message(cause)); } finally { setBusy(undefined); } }
  async function category(id: string, value: "general" | "evidence") { setBusy(id); try { await client.request(attachmentCategory(id),{body:{entityType:entityCode,entityId:recordId,category:value},idempotencyKey:crypto.randomUUID()}); setCategoryTarget(undefined);notifySuccess(`Category updated for “${String(items.find(item=>item.id===id)?.displayName??items.find(item=>item.id===id)?.fileName??"file")}”`); onChanged(); } catch(cause) { setError(message(cause)); } finally { setBusy(undefined); } }
  async function folderCommand(key: string, body: Readonly<Record<string, unknown>>) { const current=folderCommands.current.get(key) ?? {folderId:body.folderId===null?null:String(body.folderId),idempotencyKey:crypto.randomUUID(),expectedRevision:Number(workspaceRevision)}; folderCommands.current.set(key,current); try { await client.request(attachmentFolder,{body:{...body,folderId:current.folderId,expectedRevision:current.expectedRevision},idempotencyKey:current.idempotencyKey}); folderCommands.current.delete(key); onChanged(); } catch(cause) { onChanged(); throw cause; } }
  async function createFolder() { if(!newFolderName.trim() || busy) return; setBusy("new-folder");setError(undefined); const name=newFolderName.trim(), key=`create:${name}`; const command=folderCommands.current.get(key) ?? {folderId:crypto.randomUUID(),idempotencyKey:crypto.randomUUID(),expectedRevision:Number(workspaceRevision)}; folderCommands.current.set(key,command); try { await folderCommand(key,{command:"create",entityType:entityCode,entityId:recordId,folderId:command.folderId,name}); setNewFolderName(""); setFolderOpen(false);notifySuccess(`Folder “${name}” created for this record.`); } catch(cause) { setError(message(cause)); } finally{setBusy(undefined);} }
  async function move(item: Readonly<Record<string, unknown>>, folderId: string) { setBusy(String(item.id)); try { await folderCommand(`move:${String(item.id)}:${folderId}`,{command:"move",entityType:entityCode,entityId:recordId,folderId:folderId || null,attachmentId:item.id});setMoveTarget(undefined);notifySuccess(`“${String(item.displayName??item.fileName)}” moved to “${String(folders.find(folder=>folder.id===folderId)?.name??"Unfiled")}”.`); } catch(cause) { setError(message(cause)); } finally { setBusy(undefined); } }
  async function deleteFolder(folder: Readonly<Record<string, unknown>>) { setBusy(String(folder.id));setError(undefined);try { await folderCommand(`delete:${String(folder.id)}`,{command:"delete",entityType:entityCode,entityId:recordId,folderId:folder.id});setConfirm(undefined);if(folderFilter===folder.id)setFolderFilter("");notifySuccess(`Folder “${String(folder.name)}” deleted`); } catch(cause) { setError(message(cause)); } finally{setBusy(undefined);} }
  async function stageVersion(file: File) { const parent = versionTarget.current; versionTarget.current = undefined; if (!parent) return; const parentAttachmentId = String(parent.id), attachmentId = crypto.randomUUID(), contentType = file.type || "application/octet-stream"; setBusy(parentAttachmentId); setError(undefined); try { const staged = await client.request(attachmentStage, { body: { attachmentId, fileName: file.name, contentType, sizeBytes: file.size, entityType: entityCode, entityId: recordId, parentAttachmentId, expectedSeriesVersion: Number(parent.version), duplicateNameChoice: "new_version" }, idempotencyKey: attachmentId }); await putWithProgress(staged.uploadUrl, file, contentType, () => undefined); await client.request(attachmentFinalize(staged.attachmentId), { body: { contentType }, idempotencyKey: attachmentId }); onChanged(); } catch (cause) { setError(`Version upload failed: ${message(cause)}`); } finally { setBusy(undefined); } }
  async function copyLink(id: string) { setError(undefined); try { const link = new URL(window.location.href); link.searchParams.set("panel", "collaboration"); link.searchParams.set("collaborationSection", "attachments"); link.searchParams.set("file", id); await navigator.clipboard.writeText(link.toString()); } catch (cause) { setError(`Unable to copy file link: ${message(cause)}`); } }
  const visible = items.filter((item) => `${item.fileName ?? ""} ${item.displayName ?? ""} ${item.contentType ?? ""}`.toLowerCase().includes(filter.trim().toLowerCase()) && (!folderFilter || (folderFilter==="__unfiled"?!item.folderId:item.folderId===folderFilter)) && (!categoryFilter || item.category === categoryFilter));
  return <section ref={workspaceRef} className="a-attachment-workspace" aria-label="Files" data-viewing={Boolean(selected)||undefined}>
    <div className="a-files-upload-area">{upload}</div>
    <section className="a-files-discovery-controls" aria-label="Search and filter files">
      <div onFocusCapture={()=>{if(!contentSearch)rememberBrowse();}}><FileSearchInput search={search} nameQuery={filter} onNameQuery={setFilter} canSearch={canSearch} onClear={()=>{if(contentSearch)clearSearch();else setFilter("");}} actions={<div className="a-files-toolbar">{canFolder ? <FileAction label="New folder" icon={<FolderPlusIcon size={18} aria-hidden="true"/>} onClick={()=>{setError(undefined);setFolderOpen(true);}}/> : null}{<span className="a-file-filter-action"><FileAction label="Filters" icon={<SlidersHorizontalIcon size={18} aria-hidden="true"/>} aria-expanded={filtersOpen} aria-controls="file-browse-filters" onClick={()=>setFiltersOpen(value=>!value)}/>{folderFilter||categoryFilter?<span className="a-file-filter-count" aria-label="Active filters">{Number(Boolean(folderFilter))+Number(Boolean(categoryFilter))}</span>:null}</span>}</div>}/></div>
      {items.some(item=>["pending","uploading","uploaded","processing"].includes(String(item.processingStatus))) ? <p className="a-files-processing" role="status">Some files are still processing and may not appear in content search yet.</p> : null}
    <input ref={versionInput} type="file" hidden onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (file) void stageVersion(file); }} />
    <Dialog open={Boolean(folderOpen || renameTarget || categoryTarget || moveTarget)} onOpenChange={open=>{if(!open&&!busy){setFolderOpen(false);setRenameTarget(undefined);setCategoryTarget(undefined);setMoveTarget(undefined);setError(undefined);}}}>
      <DialogContent portal description={folderOpen?"Create a folder for this record only.":`File: ${String(renameTarget?.displayName??renameTarget?.fileName??moveTarget?.displayName??moveTarget?.fileName??items.find(item=>item.id===categoryTarget)?.displayName??items.find(item=>item.id===categoryTarget)?.fileName??"Selected file")}`} className="a-comment-action-dialog a-file-action-dialog" title={folderOpen?"New folder":renameTarget?"Rename file":categoryTarget?"Set category":"Move to folder"}>
        <form onSubmit={event=>{event.preventDefault();if(folderOpen)void createFolder();else if(renameTarget)void rename(renameTarget,renameValue);else if(categoryTarget)void category(categoryTarget,categoryValue);else if(moveTarget)void move(moveTarget,moveValue);}}>
          {folderOpen?<label>Folder name<input autoFocus value={newFolderName} maxLength={256} onChange={event=>setNewFolderName(event.currentTarget.value)}/></label>:renameTarget?<label>Display name<input autoFocus value={renameValue} maxLength={1024} onChange={event=>setRenameValue(event.currentTarget.value)}/></label>:categoryTarget?<label>Category<select value={categoryValue} onChange={event=>setCategoryValue(event.currentTarget.value as "general"|"evidence")}><option value="general">General</option><option value="evidence">Evidence</option></select></label>:<label>Folder<select value={moveValue} onChange={event=>setMoveValue(event.currentTarget.value)}><option value="">Unfiled (no folder)</option>{folders.map(folder=><option key={String(folder.id)} value={String(folder.id)}>{String(folder.name)}</option>)}</select></label>}
          {error?<p role="alert">{error}</p>:null}
          <div className="a-comment-action-dialog__footer"><Button variant="secondary" type="button" disabled={Boolean(busy)} onClick={()=>{setFolderOpen(false);setRenameTarget(undefined);setCategoryTarget(undefined);setMoveTarget(undefined);setError(undefined);}}>Cancel</Button><Button type="submit" disabled={Boolean(busy)||(folderOpen?!newFolderName.trim():renameTarget?!renameValue.trim():moveTarget?moveValue===String(moveTarget.folderId??""):false)}>{folderOpen?"Create folder":"Save"}</Button></div>
        </form>
      </DialogContent>
    </Dialog>
    <div id="file-browse-filters" hidden={!filtersOpen} className="a-attachment-workspace__filters">
      <label>Folder<select value={folderFilter} onChange={(event) => setFolderFilter(event.currentTarget.value)}><option value="">All folders</option><option value="__unfiled">Unfiled</option>{folders.map((folder) => <option key={String(folder.id)} value={String(folder.id)}>{String(folder.name)}</option>)}</select></label>
      <label>Category<select value={categoryFilter} onChange={(event) => setCategoryFilter(event.currentTarget.value)}><option value="">All categories</option><option value="general">General</option><option value="evidence">Evidence</option></select></label>
    </div>
    {categoryFilter ? <div className="a-file-filter-chips"><button type="button" onClick={()=>setCategoryFilter("")}>Category: {categoryFilter} ×<span className="a-file-search__label">Remove category filter</span></button></div>:null}
    <nav className="a-file-folders" aria-label="Record folders"><FilterChipGroup label="Folder filter" value={folderFilter} onValueChange={setFolderFilter} items={[{value:"",label:"All files"},{value:"__unfiled",label:"Unfiled"},...folders.map(folder=>({value:String(folder.id),label:String(folder.name),className:"a-file-folder",icon:<FolderInputIcon size={16}/>,action:canFolder?<CollaborationActions portal label={`Actions for folder ${folder.name}`}><button className="a-menu__item" type="button" onClick={()=>setConfirm({kind:"folder",item:folder,detail:"Move files to Unfiled or another folder first. Only empty folders can be deleted; this applies to this record only."})}><TrashIcon size={16} aria-hidden="true"/>Delete folder</button></CollaborationActions>:undefined}))]}/></nav>
    </section>
    <Dialog open={Boolean(confirm)} onOpenChange={open=>{if(!open&&!busy){setConfirm(undefined);setError(undefined);}}}><DialogContent portal title={confirm?.kind==="archive"?"Archive file":confirm?.kind==="folder"?"Delete folder":"Remove from this record"} description={confirm?.detail} className="a-comment-action-dialog a-file-action-dialog"><p>{String(confirm?.item.displayName??confirm?.item.fileName??confirm?.item.name??"")}</p>{error?<p role="alert">{error}</p>:null}<div className="a-comment-action-dialog__footer"><Button variant="secondary" type="button" disabled={Boolean(busy)} onClick={()=>{setConfirm(undefined);setError(undefined);}}>Cancel</Button><Button variant="danger" type="button" disabled={Boolean(busy)} onClick={()=>{if(!confirm)return;const action=confirm;void (action.kind==="archive"?archive(action.item):action.kind==="folder"?deleteFolder(action.item):unlink(action.item));}}>{confirm?.kind==="archive"?"Archive file everywhere":confirm?.kind==="folder"?"Delete folder":"Remove from this record"}</Button></div></DialogContent></Dialog>
    <section className="a-files-results-area" aria-label={contentSearch ? "File search results" : "Record files"}>
    <p hidden={contentSearch || !visible.length} className="a-attachment-workspace__count" role="status">{visible.length} of {items.length} loaded files shown</p>
    {!contentSearch && !items.length ? <EmptySectionState centered title="No files yet" detail="Upload files or create a folder to start organizing this record." /> : null}
    <div className="a-files-content-layout" data-preview={Boolean(selected) || undefined}><div className="a-files-results-pane">
    {contentSearch ? <FileSearchResults search={search} canPreview={canPreview&&panelVisible} canDownload={canDownload} selected={selected} downloading={busy} onPreview={hit=>openPreview(hit.attachmentId,hit.fileName)} onDownload={id=>void download(id)}/> : null}
    <div hidden={contentSearch} className="a-record-detail-collection a-attachment-workspace__list">{visible.map((item) => <Card key={String(item.id)} className="a-attachment-card" role="group" aria-label={String(item.displayName??item.fileName)} data-selected={selected === item.id || undefined}>
      <header className="a-attachment-card__header"><AttachmentThumbnail key={String(item.id)} attachmentId={String(item.id)} name={String(item.fileName??item.displayName??"")} contentType={String(item.contentType??"")} canPreview={canPreview && item.processingStatus === "active"} onPreview={()=>openPreview(String(item.id),String(item.displayName??item.fileName))}/><div><span className="a-file-name"><Tooltip portal onlyWhenTruncated label={String(item.displayName??item.fileName)}>{canPreview && item.processingStatus === "active" ? <button type="button" className="a-file-name__preview" onClick={()=>openPreview(String(item.id),String(item.displayName??item.fileName))}>{String(item.displayName ?? item.fileName)}</button> : <strong tabIndex={0}>{String(item.displayName ?? item.fileName)}</strong>}</Tooltip></span><small>{collaborationFileSize(item.sizeBytes)} · {collaborationTime(item.createdAt)}</small><small>v{display(item.version)} · <span className="a-file-status" data-state={String(item.processingStatus)}>{status[String(item.id)] ?? display(item.processingStatus)}</span>{item.category ? ` · ${item.category}` : ""}</small><small className="a-file-location"><FolderInputIcon size={14} aria-hidden="true"/>{String(item.folderName??folders.find(folder=>folder.id===item.folderId)?.name??"Unfiled")}</small></div></header><div className="a-attachment-card__primary">
      {canPreview && item.processingStatus === "active" ? <FileAction label="Preview file" icon={<EyeIcon size={18} aria-hidden="true"/>} aria-pressed={selected===item.id} onClick={()=>openPreview(String(item.id),String(item.displayName??item.fileName))}>Preview</FileAction> : null}
      {canDownload ? <FileAction label="Download" icon={<DownloadIcon size={18} aria-hidden="true"/>} disabled={busy===item.id} onClick={()=>void download(String(item.id))}/> : null}
      {fullView && canVersion ? <FileAction label={history.has(String(item.id)) ? "Hide history" : "Version history"} icon={history.has(String(item.id)) ? <ChevronDownIcon style={{transform:"rotate(180deg)"}} size={18} aria-hidden="true"/> : <ChevronDownIcon size={18} aria-hidden="true"/>} aria-expanded={history.has(String(item.id))} onClick={() => setHistory((current) => { const next=new Set(current); next.has(String(item.id)) ? next.delete(String(item.id)) : next.add(String(item.id)); return next; })}>{history.has(String(item.id)) ? "Hide history" : "Version history"}</FileAction> : null}
      <CollaborationActions portal label="File actions">{canVersion ? <><button type="button" disabled={busy === item.id} onClick={() => { versionTarget.current = item; versionInput.current?.click(); }}><UploadIcon size={16} aria-hidden="true"/>Upload new version</button>{!fullView ? <button type="button" aria-expanded={history.has(String(item.id))} onClick={() => setHistory((current) => { const next=new Set(current); next.has(String(item.id)) ? next.delete(String(item.id)) : next.add(String(item.id)); return next; })}>{history.has(String(item.id)) ? <ChevronDownIcon style={{transform:"rotate(180deg)"}} size={16} aria-hidden="true"/> : <ChevronDownIcon size={16} aria-hidden="true"/>}{history.has(String(item.id)) ? "Hide history" : "Version history"}</button> : null}</> : null}{canVersion && (canRename||canFolder||canCategory) ? <hr/> : null}{canRename ? <button type="button" disabled={busy === item.id} onClick={() => { setError(undefined); setRenameTarget(item); setRenameValue(String(item.displayName ?? item.fileName ?? "")); }}><PencilIcon size={16} aria-hidden="true"/>Rename</button> : null}
      {canFolder ? <button type="button" onClick={()=>{setError(undefined);setMoveTarget(item);setMoveValue(String(item.folderId??""));}}><FolderInputIcon size={16} aria-hidden="true"/>Move to folder</button> : null}
      {canCategory ? <button type="button" onClick={()=>{setError(undefined);setCategoryValue(item.category==="evidence"?"evidence":"general");setCategoryTarget(String(item.id));}}><TagIcon size={16} aria-hidden="true"/>Set category</button> : null}
      {canVersion||canRename||canFolder||canCategory?<hr/>:null}<button type="button" onClick={() => void copyLink(String(item.id))}><LinkIcon size={16} aria-hidden="true"/>Copy link</button>{canArchive||canUnlink?<hr/>:null}
      {canArchive ? <button type="button" className="a-attachment-card__danger" disabled={busy === item.id} onClick={() => void requestArchive(item)}><ArchiveIcon size={16} aria-hidden="true"/>Archive file</button> : null}{canUnlink ? <button type="button" className="a-attachment-card__danger" disabled={busy === item.id} onClick={() => setConfirm({kind:"unlink",item,detail:"This removes the file from this record. The file remains available wherever else it is linked."})}><UnlinkIcon size={16} aria-hidden="true"/>Remove from this record</button> : null}
      </CollaborationActions></div>

      {!fullView && history.has(String(item.id)) ? <div className="a-attachment-card__history-controls"><button type="button" aria-expanded="true" onClick={event=>{
        const trigger=event.currentTarget.closest(".a-attachment-card")?.querySelector<HTMLElement>(".a-collaboration-actions > summary");
        setHistory(current=>{const next=new Set(current);next.delete(String(item.id));return next;});
        trigger?.focus();
      }}><ChevronDownIcon style={{transform:"rotate(180deg)"}} size={16} aria-hidden="true"/>Hide history</button></div> : null}
      {history.has(String(item.id)) && Array.isArray(item.versionHistory) ? <ul className="a-attachment-card__history" aria-label="Version history">{item.versionHistory.map((version: any) => <li key={String(version.id)}><div><strong>v{display(version.version)} · {version.id===item.id ? item.pinnedAttachmentId?"Pinned to this record":version.status==="active"?"Current":"Pending version":"Previous version"}</strong><span>{display(version.fileName)}</span><small>{version.status==="active"?"Available · retained version":display(version.status)} · {collaborationTime(version.createdAt)}</small></div><div className="a-version-actions">{version.id===item.id && canPreview && version.status==="active"?<FileAction label={`Preview version ${version.version}`} icon={<EyeIcon size={18} aria-hidden="true"/>} onClick={()=>openPreview(String(version.id),String(version.fileName))}>Preview</FileAction>:null}{canDownload && version.status==="active"?<FileAction label={`Download version ${version.version}`} icon={<DownloadIcon size={18} aria-hidden="true"/>} disabled={busy===version.id} onClick={()=>void download(String(version.id))}>Download</FileAction>:null}</div></li>)}</ul> : null}
    {history.has(String(item.id))?<p className="a-version-note">Previous versions are retained. Preview is available for the version linked to this record; downloads are checked when requested.</p>:null}
    </Card>)}</div>{!contentSearch?loadMore:null}</div>{selected && canPreview ? <aside ref={previewRef} tabIndex={-1} className="a-files-selected-preview" aria-label="Selected file preview"><header>{fullView?<FileAction label="Close preview" icon={<CloseIcon size={18} aria-hidden="true"/>} onClick={closePreview}/>:<button type="button" className="a-file-back" onClick={closePreview}><ChevronLeftIcon size={18} aria-hidden="true"/>Back to results</button>}<strong>{selectedName||String(items.find(item=>item.id===selected)?.displayName ?? items.find(item=>item.id===selected)?.fileName ?? "File preview")}</strong></header>{panelVisible ? <AttachmentPreview key={selected} attachmentId={selected} document/> : null}</aside> : null}</div>
    {!contentSearch && !visible.length && items.length ? <PanelEmptyState className="a-files-empty-state" role="status" icon={<FileTextIcon size={22}/>} title="No matching files" description={filter?"No file names match your search. Try searching inside files, or clear your search and filters.":"No files match these filters. Clear them to show the file list."} action={<div className="a-files-empty-state__actions">{canSearch && filter?<Button variant="secondary" type="button" onClick={()=>{search.setQuery(filter);search.setScope("contents");}}>Search file contents</Button>:null}<Button variant="ghost" type="button" onClick={()=>{setFilter("");setFolderFilter("");setCategoryFilter("");}}>Show all files</Button></div>}/> : null}
    </section>
    {error ? <p className="a-attachment-workspace__error" role="alert">{error}</p> : null}
  </section>;
}

function Fields({ fields, values }: { readonly fields: EntityRuntimeSectionResource["presentation"]["fields"]; readonly values?: Readonly<Record<string, unknown>> }) {
  if (!values) return <EmptySectionState title="No details to display" detail="There are no values available for this section." />;
  const visible: readonly { readonly key: string; readonly label?: Readonly<{ readonly labelKey: string; readonly defaultText: string }> }[] = fields.length ? fields : Object.keys(values).map((key) => ({ key }));
  return <Card className="a-record-detail-content"><dl className="a-record-detail-fields">
    {visible.map((field) => <div key={field.key}><dt>{field.label?.defaultText ?? humanize(field.key)}</dt><dd>{display(values[field.key])}</dd></div>)}
  </dl></Card>;
}
function Collection({ fields, items, sectionLabel, emptyState }: { readonly fields: EntityRuntimeSectionResource["presentation"]["fields"]; readonly items: readonly Readonly<Record<string, unknown>>[]; readonly sectionLabel?: string; readonly emptyState?: Readonly<{ readonly title: string; readonly detail: string }> }) {
  if (!items.length) {
    return <EmptySectionState title={emptyState?.title ?? "No entries yet"} detail={emptyState?.detail ?? "When entries are added, they’ll appear here."} />;
  }
  const visible: readonly { readonly key: string; readonly label?: Readonly<{ readonly labelKey: string; readonly defaultText: string }> }[] = fields.length ? fields : Object.keys(items[0] ?? {}).map((key) => ({ key }));
  return <div className="a-record-detail-collection">{items.map((item, index) => <Card key={String(item.id ?? index)}><dl className="a-record-detail-fields">
    {visible.map((field) => <div key={field.key}><dt>{field.label?.defaultText ?? humanize(field.key)}</dt><dd>{display(item[field.key])}</dd></div>)}
  </dl></Card>)}</div>;
}

function EmptySectionState({ title, detail, centered=false, icon }: { readonly title: string; readonly detail: string; readonly centered?: boolean; readonly icon?: ReactNode }) {
  if(centered)return <PanelEmptyState className="a-files-empty-state" role="status" icon={icon??<FileTextIcon size={22}/>} title={title} description={detail}/>;
  return <Card className={`a-runtime-section-empty${centered?" a-files-empty-state":""}`} role="status">
    <span className="a-runtime-section-empty__icon" aria-hidden="true">{icon??<FileTextIcon size={22} />}</span>
    <div><h3>{title}</h3><p>{detail}</p></div>
  </Card>;
}

function collectionItems(value: unknown): readonly Readonly<Record<string, unknown>>[] {
  const root = valueRecord(value), data = valueRecord(root?.data) ?? root;
  const items = data?.items;
  return Array.isArray(items) ? items.filter(valueRecord) : [];
}
function editableCommentDocument(item:Readonly<Record<string,unknown>>):RichTextDocument {
  const document=draftDocument(item) ?? {type:"doc",schema:"athyper.rich-text/1.0",content:[{type:"paragraph",content:[{type:"text",text:String(item.text??"")}]}]} as RichTextDocument;
  const ids=new Set<string>();const visit=(node:any)=>{if(node.attrs?.attachmentId)ids.add(node.attrs.attachmentId);node.content?.forEach(visit);};visit(document);
  const missing=Array.isArray(item.pinnedFiles)?item.pinnedFiles.filter((file:any)=>!ids.has(file.attachmentId)).map((file:any)=>({type:"attachmentFile",attrs:{attachmentId:String(file.attachmentId),alt:String(file.fileName??"File")}})):[];
  return {...document,content:[...document.content,...missing]};
}
function draftDocument(value?: Readonly<Record<string, unknown>>): RichTextDocument | undefined {
  const content = value?.content;
  return content && typeof content === "object" && !Array.isArray(content) && (content as { type?: unknown }).type === "doc"
    ? content as RichTextDocument
    : undefined;
}
function richText(document: RichTextDocument): string {
  const visit = (node: { readonly type: string; readonly text?: string; readonly content?: readonly any[] }): string => node.type === "text" ? node.text ?? "" : (node.type === "attachmentImage" || node.type === "attachmentFile") ? "[Attachment]" : (node.content ?? []).map(visit).join(node.type === "paragraph" ? "\n" : "");
  return visit(document).trim();
}
function renderComment(item: Readonly<Record<string, unknown>>): ReactNode {
  const content = item.content;
  if (!content || typeof content !== "object" || Array.isArray(content)) return <p>{display(item.text)}</p>;
  const visit = (node: any): ReactNode => {
    if (node.type === "text") return applyCommentMarks(node.text ?? "", node.marks);
    if (node.type === "hardBreak") return <br />;
    if (node.type === "mention") return <span>@{node.attrs?.label ?? "mention"}</span>;
    if ((node.type === "attachmentImage" || node.type === "attachmentFile")) return Array.isArray(item.pinnedFiles) && item.pinnedFiles.some((file:any)=>file.attachmentId===node.attrs?.attachmentId) ? null : <span>[Attachment: {node.attrs?.alt ?? "file"}]</span>;
    const children = Array.isArray(node.content) ? node.content.map((child: any, index: number) => <Fragment key={index}>{visit(child)}</Fragment>) : null;
    if (node.type === "paragraph") return <p>{children}</p>;
    if (node.type === "heading") { const Heading = ([1,2,3,4,5,6].includes(Number(node.attrs?.level)) ? `h${Number(node.attrs.level)}` : "h3") as "h1"|"h2"|"h3"|"h4"|"h5"|"h6"; return <Heading>{children}</Heading>; }
    if (node.type === "bulletList") return <ul>{children}</ul>;
    if (node.type === "orderedList") return <ol>{children}</ol>;
    if (node.type === "listItem") return <li>{children}</li>;
    if (node.type === "blockquote") return <blockquote>{children}</blockquote>;
    if (node.type === "table") return <div className="a-comment-rich-table-wrap"><table className="a-comment-rich-table"><tbody>{children}</tbody></table></div>;
    if (node.type === "tableRow") return <tr>{children}</tr>;
    if (node.type === "tableHeader") return <th scope="col" colSpan={tableSpan(node.attrs?.colspan)} rowSpan={tableSpan(node.attrs?.rowspan)}>{children}</th>;
    if (node.type === "tableCell") return <td colSpan={tableSpan(node.attrs?.colspan)} rowSpan={tableSpan(node.attrs?.rowspan)}>{children}</td>;
    return <>{children}</>;
  };
  return visit(content);
}
function applyCommentMarks(value: string, marks: unknown): ReactNode {
  return Array.isArray(marks) ? marks.reduce<ReactNode>((result, mark) => {
    const type = valueRecord(mark)?.type, attrs = valueRecord(valueRecord(mark)?.attrs);
    if (type === "bold") return <strong>{result}</strong>;
    if (type === "italic") return <em>{result}</em>;
    if (type === "underline") return <u>{result}</u>;
    if (type === "strike") return <s>{result}</s>;
    if (type === "code") return <code>{result}</code>;
    if (type === "link" && typeof attrs?.href === "string" && /^(https?:|mailto:)/.test(attrs.href)) return <a href={attrs.href} rel="noopener noreferrer nofollow" target="_blank">{result}</a>;
    return result;
  }, value) : value;
}
function tableSpan(value: unknown): number { const span = Number(value ?? 1); return Number.isInteger(span) && span >= 1 && span <= 30 ? span : 1; }
function valueRecord(value: unknown): Readonly<Record<string, unknown>> | undefined { return value && typeof value === "object" && !Array.isArray(value) ? value as Readonly<Record<string, unknown>> : undefined; }
function hasMore(value: unknown): boolean { return typeof valueRecord(value)?.nextCursor === "string"; }
function display(value: unknown): string { if (value === null || value === undefined || value === "") return "—"; if (typeof value === "boolean") return value ? "Yes" : "No"; if (Array.isArray(value)) return value.map(display).join(", "); if (typeof value === "object") return "Available"; return String(value); }
function humanize(value: string): string { return value.replace(/[_.-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function message(cause: unknown): string { return cause instanceof Error && cause.message ? cause.message : "This action could not be completed."; }
