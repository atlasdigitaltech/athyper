"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { convertClipboard, serializeForClipboard, uploadClipboardImages, type ClipboardImageUploader } from "./clipboard-converter";
import { createAttachmentApiClient } from "./attachment-client";
import { RICH_TEXT_SCHEMA, type RichTextDocument, type RichTextNode } from "./rich-text-types";

export interface RichCommentSubmission {
  readonly entityType: string;
  readonly entityId: string;
  readonly parentCommentId?: string;
  readonly text: string;
  readonly format: "rich_json";
  readonly content: RichTextDocument;
  readonly contentSchema: typeof RICH_TEXT_SCHEMA;
  readonly attachmentIds: readonly string[];
  readonly visibility: "public" | "internal" | "private";
}
export interface RichCommentComposerProps {
  readonly entityType: string;
  readonly entityId: string;
  readonly parentCommentId?: string;
  readonly initialDocument?: RichTextDocument;
  readonly uploader?: ClipboardImageUploader;
  readonly onSubmit: (submission: RichCommentSubmission) => Promise<void>;
  readonly onDraftChange?: (document: RichTextDocument) => void;
  readonly placeholder?: string;
  readonly disabled?: boolean;
  readonly className?: string;
}

const EMPTY: RichTextDocument = { type: "doc", schema: RICH_TEXT_SCHEMA, content: [{ type: "paragraph", content: [] }] };

/** Dependency-light replacement composer; editor frameworks can wrap the same document callbacks later. */
export function RichCommentComposer(props: RichCommentComposerProps) {
  const [value, setValue] = useState(props.initialDocument ?? EMPTY); const [uploadCount, setUploadCount] = useState(0); const [submitting, setSubmitting] = useState(false); const [error, setError] = useState<string>();
  const editor = useRef<HTMLDivElement>(null); const uploader = useMemo(() => props.uploader ?? createAttachmentApiClient(), [props.uploader]);
  const busy = uploadCount > 0 || submitting || Boolean(props.disabled);

  const commit = useCallback((next: RichTextDocument) => { setValue(next); props.onDraftChange?.(next); }, [props.onDraftChange]);
  const append = useCallback((pasted: RichTextDocument) => { setValue((current) => { const next = merge(current, pasted); props.onDraftChange?.(next); return next; }); }, [props.onDraftChange]);
  useEffect(() => { if (editor.current && document.activeElement !== editor.current) editor.current.innerHTML = serializeForClipboard(value)["text/html"] ?? ""; }, [value]);

  const onPaste = useCallback(async (event: React.ClipboardEvent<HTMLDivElement>) => {
    let conversion;
    try { conversion = convertClipboard(event.clipboardData); } catch (cause) { event.preventDefault(); setError(message(cause)); return; }
    if (!conversion) return;
    event.preventDefault(); setError(undefined); setUploadCount((count) => count + conversion.pendingImages.length);
    try { const resolved = await uploadClipboardImages(conversion, uploader); append(resolved); }
    catch (cause) { setError(message(cause)); }
    finally { setUploadCount((count) => Math.max(0, count - conversion.pendingImages.length)); }
  }, [append, uploader]);

  const onInput = useCallback((event: FormEvent<HTMLDivElement>) => {
    const html = event.currentTarget.innerHTML; const text = event.currentTarget.innerText;
    const converted = convertClipboard({ getData: (type) => type === "text/html" ? html : type === "text/plain" ? text : "" });
    if (converted) commit(converted.document);
  }, [commit]);

  const submit = useCallback(async () => {
    if (busy) return; const serialized = serializeForClipboard(value); const text = (serialized["text/plain"] ?? "").trim(); const attachmentIds = collectAttachments(value);
    if (!text && attachmentIds.length === 0) return;
    setSubmitting(true); setError(undefined);
    try { await props.onSubmit({ entityType: props.entityType, entityId: props.entityId, ...(props.parentCommentId ? { parentCommentId: props.parentCommentId } : {}), text, format: "rich_json", content: value, contentSchema: RICH_TEXT_SCHEMA, attachmentIds, visibility: "internal" }); commit(EMPTY); if (editor.current) editor.current.innerHTML = ""; }
    catch (cause) { setError(message(cause)); }
    finally { setSubmitting(false); }
  }, [busy, commit, props, value]);

  return <div className={props.className} data-collaboration-composer="rich-json">
    <div ref={editor} role="textbox" aria-multiline="true" aria-label={props.placeholder ?? "Write a comment"} contentEditable={!busy} suppressContentEditableWarning onPaste={(event) => void onPaste(event)} onInput={onInput} onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); void submit(); } }} data-placeholder={props.placeholder ?? "Write a comment…"} />
    {uploadCount > 0 ? <p role="status">Uploading {uploadCount} pasted image{uploadCount === 1 ? "" : "s"}…</p> : null}
    {error ? <p role="alert">{error}</p> : null}
    <button type="button" disabled={busy} onClick={() => void submit()}>{submitting ? "Sending…" : "Send"}</button>
  </div>;
}

function merge(current: RichTextDocument, pasted: RichTextDocument): RichTextDocument { const empty = current.content.length === 1 && current.content[0]?.type === "paragraph" && !(current.content[0]?.content?.length); return { type: "doc", schema: RICH_TEXT_SCHEMA, content: empty ? pasted.content : [...current.content, ...pasted.content] }; }
function collectAttachments(document: RichTextDocument): string[] { const ids = new Set<string>(); const visit = (node: RichTextNode) => { if (node.type === "attachmentImage" && typeof node.attrs?.["attachmentId"] === "string") ids.add(node.attrs["attachmentId"]); node.content?.forEach(visit); }; document.content.forEach(visit); return [...ids]; }
function message(cause: unknown): string { return cause instanceof Error ? cause.message : "Unable to process clipboard content"; }
