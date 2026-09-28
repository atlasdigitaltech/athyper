"use client";
import { useEntityI18n } from "@athyper/platform-i18n/entity-react";
import { visitRichText, isAttachmentNode, mapRichText } from "./rich-text-types";
import { validateUploadFile } from "./upload-lifecycle";
import { ComposerFrame, ComposerHeader, ComposerFooter, Tooltip } from "@athyper/platform-ui";
import { CommentAudiencePicker } from "./comment-audience-picker";

import { useCallback, useEffect, useEffectEvent, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { convertClipboard, serializeForClipboard, uploadClipboardImages, type ClipboardImageUploader } from "./clipboard-converter";
import { createAttachmentApiClient } from "./attachment-client";
import { RICH_TEXT_SCHEMA, type RichTextDocument, type RichTextNode } from "./rich-text-types";

export interface RichCommentSubmission {
  readonly entityType: string;
  readonly entityId: string;
  readonly parentCommentId?: string;
  /** Server-issued, principal-scoped draft identity for pasted attachment uploads. */
  readonly draftId?: string;
  readonly text: string;
  readonly format: "rich_json";
  readonly content: RichTextDocument;
  readonly contentSchema: typeof RICH_TEXT_SCHEMA;
  readonly attachmentIds: readonly string[];
  readonly visibility: "public" | "internal" | "private";
}
export interface RichCommentComposerProps {
  readonly header?: React.ReactNode;
  readonly headerActions?: React.ReactNode;
  readonly supportingContent?: React.ReactNode;
  readonly searchMentions?: (query:string,visibility:"public"|"internal"|"private")=>Promise<readonly {id:string;displayName:string}[]>;
  readonly entityType: string;
  readonly entityId: string;
  readonly parentCommentId?: string;
  /** Server-issued, principal-scoped draft identity for pasted attachment uploads. */
  readonly draftId?: string;
  readonly initialDocument?: RichTextDocument;
  readonly uploader?: ClipboardImageUploader;
  readonly prepareAttachments?: (document: RichTextDocument, visibility: "public" | "internal" | "private") => Promise<{draftId:string; allowedContentTypes:readonly string[]; maxFileBytes:number}>;
  readonly maxAttachments?: number;
  readonly onSubmit: (submission: RichCommentSubmission) => Promise<void>;
  readonly onDraftChange?: (document: RichTextDocument, visibility?: "public" | "internal" | "private") => void;
  readonly allowedAudiences?: readonly ("public" | "internal" | "private")[];
  readonly defaultAudience?: "public" | "internal" | "private";
  /** Attachment images require an admitted parent draft/attachment policy. */
  readonly allowAttachments?: boolean;
  readonly placeholder?: string;
  readonly submitLabel?: string;
  readonly submitAriaLabel?: string;
  readonly audienceLockedReason?: string;
  readonly onBusyChange?: (busy:boolean)=>void;
  readonly onCancel?: () => void;
  readonly cancelLabel?: string;
  readonly disabled?: boolean;
  readonly className?: string;
}

const EMPTY: RichTextDocument = { type: "doc", schema: RICH_TEXT_SCHEMA, content: [{ type: "paragraph", content: [] }] };

/** Dependency-light replacement composer; editor frameworks can wrap the same document callbacks later. */
export function RichCommentComposer(props: RichCommentComposerProps) {
  const intl = useEntityI18n();
  const filePicker = useRef<HTMLInputElement>(null);
  const mentionPicker = useRef<HTMLDetailsElement>(null);
  // Native pickers restore trigger focus after Cancel. That is not a fresh
  // request for its tooltip; re-enable only on deliberate hover or Tab.
  const [attachmentTooltipDismissed, setAttachmentTooltipDismissed] = useState(false);
  useEffect(() => {
    const input = filePicker.current;
    const cancel = () => setAttachmentTooltipDismissed(true);
    input?.addEventListener("cancel", cancel);
    return () => input?.removeEventListener("cancel", cancel);
  }, [props.allowAttachments, props.prepareAttachments]);
  const editorLabelId = useId();
  const [value, setValue] = useState(props.initialDocument ?? EMPTY); const [uploadCount, setUploadCount] = useState(0); const [submitting, setSubmitting] = useState(false); const [error, setError] = useState<string>();
  const audiences = props.allowedAudiences?.length ? props.allowedAudiences : ["internal"] as const;
  const [visibility, setVisibility] = useState<"public" | "internal" | "private">(audiences.includes(props.defaultAudience ?? "internal") ? props.defaultAudience ?? "internal" : audiences[0]!);
  const editor = useRef<HTMLDivElement>(null); const uploader = useMemo(() => props.uploader ?? createAttachmentApiClient({ baseUrl: "/api/relay/attachments", entityType: props.entityType, entityId: props.entityId, ...(props.draftId ? { draftId: props.draftId } : {}) }), [props.uploader, props.entityType, props.entityId, props.draftId]);
  const [mentionQuery,setMentionQuery]=useState(""), [mentionOptions,setMentionOptions]=useState<readonly {id:string;displayName:string}[]>([]);
  // Parent callbacks can be recreated on every render. They are event handlers,
  // not reasons to restart a search or publish another identical busy state.
  const searchMentions = useEffectEvent(async (query: string, audience: "public" | "internal" | "private") =>
    await props.searchMentions?.(query, audience) ?? []);
  const mentionsEnabled = Boolean(props.searchMentions);
  useEffect(() => {
    const picker = mentionPicker.current;
    if (!mentionsEnabled || !picker) return;
    const owner = picker.ownerDocument;
    const close = () => {
      picker.open = false;
      setMentionQuery("");
      setMentionOptions([]);
    };
    const outside = (event: Event) => {
      if (picker.open && event.target instanceof Node && !picker.contains(event.target)) close();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !picker.open) return;
      event.preventDefault();
      event.stopPropagation();
      close();
      picker.querySelector("summary")?.focus({preventScroll:true});
    };
    const toggle = () => { if (!picker.open) close(); };
    owner.addEventListener("pointerdown", outside, true);
    owner.addEventListener("focusin", outside);
    owner.addEventListener("keydown", escape, true);
    picker.addEventListener("toggle", toggle);
    return () => {
      owner.removeEventListener("pointerdown", outside, true);
      owner.removeEventListener("focusin", outside);
      owner.removeEventListener("keydown", escape, true);
      picker.removeEventListener("toggle", toggle);
    };
  }, [mentionsEnabled]);
  useEffect(() => {
    setMentionOptions(current => current.length ? [] : current);
    if (!mentionsEnabled || !mentionQuery.trim()) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void searchMentions(mentionQuery, visibility).then(items => {
        if (!cancelled) setMentionOptions(items);
      }).catch(() => {
        if (!cancelled) setMentionOptions(current => current.length ? [] : current);
      });
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [mentionsEnabled, mentionQuery, visibility, props.entityType, props.entityId, props.parentCommentId]);
  const uploadLock = useRef(false);
  const serializedValue=useMemo(()=>serializeForClipboard(value),[value]);
  const attachmentIds=useMemo(()=>collectAttachments(value),[value]);
  const busy = uploadCount > 0 || submitting || Boolean(props.disabled);
  const notifyBusy = useEffectEvent((value: boolean) => props.onBusyChange?.(value));
  useEffect(() => { notifyBusy(busy); }, [busy]);


  const commit = useCallback((next: RichTextDocument) => { setValue(next); props.onDraftChange?.(next,visibility); }, [props.onDraftChange,visibility]);
  const append = useCallback((pasted: RichTextDocument) => {
    const next = merge(value, pasted);
    setValue(next);
    props.onDraftChange?.(next,visibility);
    // Paste is prevented so hostile source markup cannot enter the editable
    // DOM. Synchronize the safe converted document immediately: the normal
    // effect deliberately avoids changing a focused editor to preserve its
    // typing caret, which otherwise leaves a successful paste invisible.
    if (editor.current) editor.current.innerHTML = serializeForClipboard(next)["text/html"] ?? "";
  }, [props.onDraftChange, value,visibility]);
  const selectMention = (person: {id:string;displayName:string}) => {
    append({type:"doc",schema:RICH_TEXT_SCHEMA,content:[{type:"paragraph",content:[{type:"mention",attrs:{principalId:person.id,label:person.displayName}}]}]});
    setMentionQuery("");
    setMentionOptions([]);
    if (mentionPicker.current) mentionPicker.current.open = false;
    if (editor.current) {
      editor.current.focus({preventScroll:true});
      const range = document.createRange();
      range.selectNodeContents(editor.current);
      range.collapse(false);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
  };
  useEffect(() => { if (editor.current && document.activeElement !== editor.current) editor.current.innerHTML = serializeForClipboard(value)["text/html"] ?? ""; }, [value]);

  const onPaste = useCallback(async (event: React.ClipboardEvent<HTMLDivElement>) => {
    let conversion;
    try { conversion = convertClipboard(event.clipboardData); } catch (cause) { event.preventDefault(); setError(message(cause)); return; }
    if (!conversion) return;
    if (conversion.pendingImages.length && props.allowAttachments === false) { event.preventDefault(); setError("Attachments are not enabled for this comment."); return; }
    if(uploadLock.current || submitting || props.disabled){event.preventDefault();return;}
    uploadLock.current=true;
    event.preventDefault(); setError(undefined); setUploadCount((count) => count + conversion.pendingImages.length);
    try {
      let activeUploader=uploader;
      if(conversion.pendingImages.length){
        if(collectAttachments(value).length+conversion.pendingImages.length>(props.maxAttachments ?? 10))throw new Error(`A comment can contain up to ${props.maxAttachments ?? 10} attachments.`);
        const policy=await props.prepareAttachments?.(value,visibility);
        if(!policy)throw new Error("Attachment upload is unavailable for this comment.");
        for(const image of conversion.pendingImages)validateUploadFile(image.file,policy);
        activeUploader=props.uploader ?? createAttachmentApiClient({entityType:props.entityType,entityId:props.entityId,draftId:policy.draftId});
      }
      const resolved=await uploadClipboardImages(conversion,activeUploader);append(resolved);
    }
    catch (cause) { setError(message(cause)); }
    finally { uploadLock.current=false;setUploadCount((count) => Math.max(0, count - conversion.pendingImages.length)); }
  }, [append, uploader, props, value, visibility, submitting]);

  const pickFiles = async (files: readonly File[]) => {
    if (uploadLock.current || busy || !files.length || props.allowAttachments === false) return;
    uploadLock.current=true;setError(undefined); setUploadCount(count=>count+files.length);
    try {
      if (collectAttachments(value).length + files.length > (props.maxAttachments ?? 10)) throw new Error(`A comment can contain up to ${props.maxAttachments ?? 10} attachments.`);
      const policy = await props.prepareAttachments?.(value, visibility);
      if (!policy) throw new Error("Attachment upload is unavailable for this comment.");
      for(const file of files)validateUploadFile(file,policy);
      const upload = props.uploader ?? createAttachmentApiClient({entityType:props.entityType,entityId:props.entityId,draftId:policy.draftId});
      let next = value;
      for (const file of files) {
        const result = await upload.upload(file,{token:crypto.randomUUID()});
        next = merge(next,{type:"doc",schema:RICH_TEXT_SCHEMA,content:[{type:file.type.startsWith("image/")?"attachmentImage":"attachmentFile",attrs:{attachmentId:result.attachmentId,alt:file.name}}]});
        commit(next);
        if(editor.current) editor.current.innerHTML=serializeForClipboard(next)["text/html"] ?? "";
      }
    } catch(cause) {setError(message(cause));} finally {uploadLock.current=false;setUploadCount(count=>Math.max(0,count-files.length));}
  };

  const onInput = useCallback((event: FormEvent<HTMLDivElement>) => {
    const html = event.currentTarget.innerHTML; const text = event.currentTarget.innerText;
    const converted = convertClipboard({ getData: (type) => type === "text/html" ? html : type === "text/plain" ? text : "" });
    if (converted) commit(converted.document);
  }, [commit]);

  const submit = useCallback(async () => {
    if (uploadLock.current || busy) return; const serialized = serializeForClipboard(value); const text = (serialized["text/plain"] ?? "").trim(); const attachmentIds = collectAttachments(value);
    if (!text && attachmentIds.length === 0) return;
    setSubmitting(true); setError(undefined);
    try { await props.onSubmit({ entityType: props.entityType, entityId: props.entityId, ...(props.parentCommentId ? { parentCommentId: props.parentCommentId } : {}), text, format: "rich_json", content: value, contentSchema: RICH_TEXT_SCHEMA, attachmentIds, visibility }); commit(EMPTY); if (editor.current) editor.current.innerHTML = ""; }
    catch (cause) { setError(message(cause)); }
    finally { setSubmitting(false); }
  }, [busy, commit, props, value]);

  const [linkEditing,setLinkEditing] = useState(false), [linkUrl,setLinkUrl] = useState("");
  const linkSelection = useRef<Range | undefined>(undefined);
  const closeLink = () => {
    setLinkEditing(false);
    setError(undefined);
    editor.current?.focus({preventScroll:true});
  };
  const insertLink = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const href = linkUrl.trim();
    try {
      const url = new URL(href);
      if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Invalid protocol");
    } catch {
      setError("Enter a valid http or https link.");
      return;
    }
    const element = editor.current;
    if (!element) return;
    try {
      element.focus({preventScroll:true});
      const selection = window.getSelection();
      const range = linkSelection.current;
      if (selection && range && element.contains(range.commonAncestorContainer)) {
        selection.removeAllRanges();
        selection.addRange(range);
      }
      document.execCommand("createLink", false, href);
      // Only advertise clipboard formats we actually provide. Plain text is
      // not the application's internal rich-document JSON representation.
      const converted = convertClipboard({getData:type =>
        type === "text/html" ? element.innerHTML : type === "text/plain" ? element.innerText : ""});
      if (converted) commit(converted.document);
      closeLink();
      setError(undefined);
    } catch {
      setError("The link could not be inserted. Try again.");
    }
  };
  const format = (command: "bold" | "italic" | "underline" | "createLink") => {
    editor.current?.focus();
    if (command === "createLink") {
      const selection = window.getSelection();
      linkSelection.current = selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : undefined;
      setLinkUrl(""); setLinkEditing(true); return;
    } else document.execCommand(command);
    editor.current?.dispatchEvent(new InputEvent("input", { bubbles: true }));
  };
  const audienceLabel = intl.message(`comments.${visibility}`);
  const lockedAudience = props.audienceLockedReason ? <Tooltip label={props.audienceLockedReason}><span className="a-rich-comment-composer__locked-audience" tabIndex={0} aria-label={intl.message("comments.visibilityLabel", {audience: audienceLabel, reason: props.audienceLockedReason})}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>{audienceLabel}</span></Tooltip> : null;
  return <ComposerFrame className={props.className} data-collaboration-composer="rich-json" header={props.header || lockedAudience || props.headerActions ? <ComposerHeader>{props.header}{lockedAudience || props.headerActions ? <div className="a-rich-comment-composer__header-actions">{lockedAudience}{props.headerActions}</div> : null}</ComposerHeader> : undefined}>
    {linkEditing ? <form className="a-rich-comment-composer__link" onSubmit={insertLink} onKeyDown={event=>{if(event.key==="Escape"){event.preventDefault();event.stopPropagation();closeLink();}}}>
      <label>{intl.message("comments.linkUrl")}<input type="url" required value={linkUrl} onChange={event=>setLinkUrl(event.currentTarget.value)} placeholder="https://" autoFocus /></label>
      <div className="a-rich-comment-composer__link-actions"><button type="submit" disabled={busy}>{intl.message("comments.insertLink")}</button><button type="button" onClick={closeLink}>{intl.message("action.cancel")}</button></div>
    </form> : null}
    <span id={editorLabelId} className="a-rich-comment-composer__editor-label a-visually-hidden">{intl.message("comments.label")}</span>
    <div ref={editor} className="a-rich-comment-composer__editor" data-composer-editor="" role="textbox" aria-multiline="true" aria-labelledby={editorLabelId} contentEditable={!busy} suppressContentEditableWarning onPaste={(event) => void onPaste(event)} onInput={onInput} onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); void submit(); } }} data-empty={!serializedValue["text/plain"]?.trim()} aria-placeholder={props.placeholder ?? intl.message("comments.placeholder")} data-placeholder={props.placeholder ?? intl.message("comments.placeholder")} />

    {attachmentIds.length ? <ul className="a-rich-comment-composer__attachments" aria-label={intl.message("comments.attachments")}>{attachmentIds.map((id) => <li key={id}>{attachmentLabel(value,id)}<button type="button" disabled={busy} aria-label={`Remove attachment ${attachmentLabel(value,id)}`} onClick={()=>commit(withoutAttachment(value,id))}>×</button></li>)}</ul> : null}
    {uploadCount > 0 ? <p role="status">{intl.message("comments.uploading", {count: uploadCount})}</p> : null}
    {error ? <p role="alert">{error}</p> : null}
    {props.supportingContent}
    <ComposerFooter className="a-rich-comment-composer__footer">
    <div role="toolbar" aria-label={intl.message("comments.formatting")}><button type="button" disabled={busy} onClick={() => format("bold")}><strong>B</strong><span className="a-visually-hidden">{intl.message("comments.bold")}</span></button><button type="button" disabled={busy} onClick={() => format("italic")}><em>I</em><span className="a-visually-hidden">{intl.message("comments.italic")}</span></button><button type="button" disabled={busy} onClick={() => format("underline")}><u>U</u><span className="a-visually-hidden">{intl.message("comments.underline")}</span></button><button type="button" disabled={busy} onClick={() => format("createLink")}>{intl.message("comments.link")}</button>{props.allowAttachments && props.prepareAttachments ? <><Tooltip label={intl.message("comments.attach")}><button type="button" aria-label={intl.message("comments.attachLabel")} disabled={busy} data-tooltip-dismissed={attachmentTooltipDismissed || undefined} onPointerEnter={()=>setAttachmentTooltipDismissed(false)} onKeyUp={event=>{if(event.key==="Tab")setAttachmentTooltipDismissed(false);}} onClick={()=>{setAttachmentTooltipDismissed(true);filePicker.current?.click();}}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="m21 11-9 9a6 6 0 0 1-8.5-8.5L13 2a4 4 0 0 1 5.7 5.7l-9.5 9.5a2 2 0 0 1-2.8-2.8L15 6"/></svg></button></Tooltip><input ref={filePicker} type="file" multiple hidden aria-label={intl.message("comments.chooseAttachments")} onChange={event=>{setAttachmentTooltipDismissed(true);const files=Array.from(event.currentTarget.files??[]);event.currentTarget.value="";void pickFiles(files);}}/></> : null}</div>
    {props.searchMentions ? <Tooltip label={intl.message("comments.mention")}><details ref={mentionPicker} className="a-rich-comment-composer__mentions"><summary aria-label={intl.message("comments.mention")}>@</summary><div><label>{intl.message("comments.mention")}<input value={mentionQuery} onChange={event=>setMentionQuery(event.currentTarget.value)} /></label><ul aria-label={intl.message("comments.matches")}>{mentionOptions.map(person=><li key={person.id}><button type="button" disabled={busy} onClick={()=>selectMention(person)}>{person.displayName}</button></li>)}</ul></div></details></Tooltip>:null}
    <div className="a-rich-comment-composer__submit-actions">
    {!props.audienceLockedReason ? <div className="a-rich-comment-composer__audience"><CommentAudiencePicker value={visibility} options={audiences} disabled={busy || audiences.length === 1} onChange={audience=>{setVisibility(audience);props.onDraftChange?.(value,audience);}}/></div> : null}{props.onCancel?<button type="button" disabled={busy} onClick={props.onCancel}>{props.cancelLabel??intl.message("action.cancel")}</button>:null}    <button className="a-rich-comment-composer__send" aria-label={props.submitAriaLabel} type="button" disabled={busy} onClick={() => void submit()}>{submitting ? intl.message("action.saving") : props.submitLabel ?? intl.message("action.send")}</button></div>
    </ComposerFooter>
  </ComposerFrame>;
}

function merge(current: RichTextDocument, pasted: RichTextDocument): RichTextDocument { const empty = current.content.length === 1 && current.content[0]?.type === "paragraph" && !(current.content[0]?.content?.length); return { type: "doc", schema: RICH_TEXT_SCHEMA, content: empty ? pasted.content : [...current.content, ...pasted.content] }; }
function collectAttachments(richDocument: RichTextDocument): string[] {const ids=new Set<string>();visitRichText(richDocument,node=>{if(isAttachmentNode(node)&&typeof node.attrs?.attachmentId==="string")ids.add(node.attrs.attachmentId);});return [...ids];}
function message(cause: unknown): string { return cause instanceof Error ? cause.message : "Unable to process clipboard content"; }

function attachmentLabel(richDocument: RichTextDocument,id:string):string {let label="File attachment";visitRichText(richDocument,node=>{if(isAttachmentNode(node)&&node.attrs?.attachmentId===id)label=String(node.attrs.alt??label);});return label;}
function withoutAttachment(richDocument: RichTextDocument,id:string):RichTextDocument {const next=mapRichText(richDocument,node=>isAttachmentNode(node)&&node.attrs?.attachmentId===id?null:node);return {...richDocument,content:next?.content?.length?next.content:EMPTY.content};}
