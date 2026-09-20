"use client";
import type { EntityRuntimeSectionResource } from "@athyper/platform-entity-descriptor-client";
import { createOperation } from "@athyper/platform-api-client";
import { useApiClient, useSessionIdentity } from "@athyper/platform-shell-app-foundation";
import { FileTextIcon } from "@athyper/platform-icons";
import { Card } from "@athyper/platform-ui";
import { useRef, useState } from "react";

/** Generic renderer for the supported declarative field and related-collection surfaces. */
export function CompiledEntitySectionContent({ resource, entityCode, recordId, onChanged, onLoadMore }: { readonly resource: EntityRuntimeSectionResource; readonly entityCode?: string; readonly recordId?: string; readonly onChanged?: () => void; readonly onLoadMore?: () => void }) {
  const values = valueRecord(resource.data);
  const fieldValues = valueRecord(values?.values) ?? values;
  const items = collectionItems(resource.data);
  if (resource.presentation.rendererKey === "platform.related-collection.v1") {
    return <Collection fields={resource.presentation.fields} items={items} emptyState={resource.presentation.emptyState} />;
  }
  if (resource.presentation.rendererKey === "platform.comments.v1") {
    return <>{entityCode && recordId && onChanged ? <CommentCollection items={items} onChanged={onChanged}/> : <Collection fields={commentFields} items={items} sectionLabel="Comments" />}{hasMore(resource.data) && onLoadMore ? <button type="button" onClick={onLoadMore}>Load more comments</button> : null}{entityCode && recordId && onChanged ? <CommentComposer entityCode={entityCode} recordId={recordId} onChanged={onChanged}/> : null}</>;
  }
  if (resource.presentation.rendererKey === "platform.attachments.v1") {
    return <>{entityCode && recordId && onChanged ? <AttachmentCollection items={items}/> : <Collection fields={attachmentFields} items={items} sectionLabel="Files" />}{hasMore(resource.data) && onLoadMore ? <button type="button" onClick={onLoadMore}>Load more files</button> : null}{entityCode && recordId && onChanged ? <AttachmentUploader entityCode={entityCode} recordId={recordId} onChanged={onChanged}/> : null}</>;
  }
  return <Fields fields={resource.presentation.fields} values={fieldValues} />;
}

const commentFields = Object.freeze([
  { key: "text", label: { labelKey: "platform.comments.fields.text.label", defaultText: "Comment" } },
  { key: "authorId", label: { labelKey: "platform.comments.fields.author.label", defaultText: "Author" } },
  { key: "createdAt", label: { labelKey: "platform.comments.fields.created_at.label", defaultText: "Created" } },
  { key: "visibility", label: { labelKey: "platform.comments.fields.visibility.label", defaultText: "Visibility" } },
]);
const attachmentFields = Object.freeze([
  { key: "fileName", label: { labelKey: "platform.attachments.fields.file_name.label", defaultText: "File" } },
  { key: "contentType", label: { labelKey: "platform.attachments.fields.content_type.label", defaultText: "Type" } },
  { key: "sizeBytes", label: { labelKey: "platform.attachments.fields.size_bytes.label", defaultText: "Size" } },
  { key: "createdAt", label: { labelKey: "platform.attachments.fields.created_at.label", defaultText: "Created" } },
]);
const commentCreate = createOperation<unknown, { entityType: string; entityId: string; text: string; idempotencyKey: string }>({ method: "POST", path: () => "/api/collab/comments", idempotency: "required" });
const attachmentStage = createOperation<{ attachmentId: string; uploadUrl: string }, { attachmentId: string; fileName: string; contentType: string; sizeBytes: number; entityType: string; entityId: string }>({ method: "POST", path: () => "/api/attachments/stage" });
const attachmentFinalize = (attachmentId: string) => createOperation<unknown, { contentType: string }>({ method: "POST", path: () => `/api/attachments/${encodeURIComponent(attachmentId)}/finalize` });
const commentEdit = (commentId: string) => createOperation<unknown, { text: string; expectedUpdatedAt?: string }>({ method: "PATCH", path: () => `/api/collab/comments/${encodeURIComponent(commentId)}` });
const commentDelete = (commentId: string) => createOperation<unknown>({ method: "DELETE", path: () => `/api/collab/comments/${encodeURIComponent(commentId)}` });
const attachmentDownload = (attachmentId: string) => createOperation<{ url: string }, { expirySeconds: number }>({ method: "POST", path: () => `/api/attachments/${encodeURIComponent(attachmentId)}/download` });

function CommentComposer({ entityCode, recordId, onChanged }: { readonly entityCode: string; readonly recordId: string; readonly onChanged: () => void }) {
  const client = useApiClient(), [text, setText] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState<string>();
  async function create() {
    const value = text.trim(); if (!value) return;
    setBusy(true); setError(undefined);
    try { const idempotencyKey = crypto.randomUUID(); await client.request(commentCreate, { body: { entityType: entityCode, entityId: recordId, text: value, idempotencyKey }, idempotencyKey }); setText(""); onChanged(); }
    catch (cause) { setError(message(cause)); } finally { setBusy(false); }
  }
  return <Card><label>New comment<textarea value={text} disabled={busy} onChange={(event) => setText(event.currentTarget.value)} /></label><button type="button" disabled={busy || !text.trim()} onClick={() => void create()}>{busy ? "Adding…" : "Add comment"}</button>{error ? <p role="alert">{error}</p> : null}</Card>;
}
function AttachmentUploader({ entityCode, recordId, onChanged }: { readonly entityCode: string; readonly recordId: string; readonly onChanged: () => void }) {
  const client = useApiClient(), [busy, setBusy] = useState(false), [error, setError] = useState<string>();
  const retry = useRef<{ readonly attachmentId: string; readonly file: File; readonly contentType: string } | undefined>(undefined);
  async function upload(attempt: { readonly attachmentId: string; readonly file: File; readonly contentType: string }) {
    setBusy(true); setError(undefined);
    try {
      // stage() is idempotent for this identity and returns a fresh upload URL.  finalize()
      // is also idempotent once the attachment is active, so every retry retains one
      // reservation rather than creating another staged attachment.
      const staged = await client.request(attachmentStage, { body: { attachmentId: attempt.attachmentId, fileName: attempt.file.name, contentType: attempt.contentType, sizeBytes: attempt.file.size, entityType: entityCode, entityId: recordId } });
      const response = await fetch(staged.uploadUrl, { method: "PUT", headers: { "Content-Type": attempt.contentType }, body: attempt.file, credentials: "omit" });
      if (!response.ok) throw new Error("The file upload failed.");
      await client.request(attachmentFinalize(staged.attachmentId), { body: { contentType: attempt.contentType } });
      retry.current = undefined;
      onChanged();
    } catch (cause) {
      retry.current = attempt;
      setError(`${message(cause)} Retry uses the same upload reservation.`);
    } finally { setBusy(false); }
  }
  return <Card><label>Upload file<input type="file" disabled={busy} onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (file) void upload({ attachmentId: crypto.randomUUID(), file, contentType: file.type || "application/octet-stream" }); }} /></label>{busy ? <p role="status">Uploading…</p> : null}{error ? <p role="alert">{error}</p> : null}{retry.current && !busy ? <button type="button" onClick={() => void upload(retry.current!)}>Retry upload</button> : null}</Card>;
}
function CommentCollection({ items, onChanged }: { readonly items: readonly Readonly<Record<string, unknown>>[]; readonly onChanged: () => void }) {
  const client = useApiClient(), identity = useSessionIdentity(), [busy, setBusy] = useState<string>(), [error, setError] = useState<string>();
  if (!items.length) return <EmptySectionState title="No comments to display" detail="There are no comments on this record yet." />;
  async function remove(id: string) { setBusy(id); setError(undefined); try { await client.request(commentDelete(id), {}); onChanged(); } catch (cause) { setError(message(cause)); } finally { setBusy(undefined); } }
  async function edit(item: Readonly<Record<string, unknown>>) { const id = String(item.id), current = typeof item.text === "string" ? item.text : "", text = window.prompt("Edit comment", current); if (text === null || text.trim() === current) return; setBusy(id); setError(undefined); try { await client.request(commentEdit(id), { body: { text: text.trim(), ...(typeof item.updatedAt === "string" ? { expectedUpdatedAt: item.updatedAt } : {}) } }); onChanged(); } catch (cause) { setError(message(cause)); } finally { setBusy(undefined); } }
  return <><div className="a-record-detail-collection">{items.map((item) => <Card key={String(item.id)}><dl className="a-record-detail-fields">{commentFields.map((field) => <div key={field.key}><dt>{field.label.defaultText}</dt><dd>{display(item[field.key])}</dd></div>)}</dl>{item.authorId === identity.scope?.principalId ? <><button type="button" disabled={busy === item.id} onClick={() => void edit(item)}>Edit</button><button type="button" disabled={busy === item.id} onClick={() => void remove(String(item.id))}>Delete</button></> : null}</Card>)}</div>{error ? <p role="alert">{error}</p> : null}</>;
}
function AttachmentCollection({ items }: { readonly items: readonly Readonly<Record<string, unknown>>[] }) {
  const client = useApiClient(), [busy, setBusy] = useState<string>();
  if (!items.length) return <EmptySectionState title="No files to display" detail="There are no files attached to this record yet." />;
  async function download(id: string) { setBusy(id); try { const result = await client.request(attachmentDownload(id), { body: { expirySeconds: 120 } }); window.location.assign(result.url); } finally { setBusy(undefined); } }
  return <div className="a-record-detail-collection">{items.map((item) => <Card key={String(item.id)}><dl className="a-record-detail-fields">{attachmentFields.map((field) => <div key={field.key}><dt>{field.label.defaultText}</dt><dd>{display(item[field.key])}</dd></div>)}</dl><button type="button" disabled={busy === item.id} onClick={() => void download(String(item.id))}>Download</button></Card>)}</div>;
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

function EmptySectionState({ title, detail }: { readonly title: string; readonly detail: string }) {
  return <Card className="a-runtime-section-empty" role="status">
    <span className="a-runtime-section-empty__icon" aria-hidden="true"><FileTextIcon size={22} /></span>
    <div><h3>{title}</h3><p>{detail}</p></div>
  </Card>;
}

function collectionItems(value: unknown): readonly Readonly<Record<string, unknown>>[] {
  const root = valueRecord(value), data = valueRecord(root?.data) ?? root;
  const items = data?.items;
  return Array.isArray(items) ? items.filter(valueRecord) : [];
}
function valueRecord(value: unknown): Readonly<Record<string, unknown>> | undefined { return value && typeof value === "object" && !Array.isArray(value) ? value as Readonly<Record<string, unknown>> : undefined; }
function hasMore(value: unknown): boolean { return typeof valueRecord(value)?.nextCursor === "string"; }
function display(value: unknown): string { if (value === null || value === undefined || value === "") return "—"; if (typeof value === "boolean") return value ? "Yes" : "No"; if (Array.isArray(value)) return value.map(display).join(", "); if (typeof value === "object") return "Available"; return String(value); }
function humanize(value: string): string { return value.replace(/[_.-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function message(cause: unknown): string { return cause instanceof Error && cause.message ? cause.message : "This action could not be completed."; }
