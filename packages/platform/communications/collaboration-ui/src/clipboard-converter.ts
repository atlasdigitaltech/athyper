import { ATHYPER_RICH_TEXT_MIME, RICH_TEXT_SCHEMA, type ClipboardConversion, type PendingClipboardImage, type RichTextDocument, type RichTextMark, type RichTextNode } from "./rich-text-types";

const LIMIT = { rows: 100, columns: 30, cells: 2_000, images: 10, text: 50_000 } as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface ClipboardDataLike {
  readonly files?: FileList | readonly File[];
  getData(type: string): string;
}
export interface ClipboardConverterOptions {
  readonly createUploadToken?: () => string;
  readonly domParser?: Pick<DOMParser, "parseFromString">;
}

/** Precedence: Athyper JSON, HTML, TSV/plain text, then image files. */
export function convertClipboard(data: ClipboardDataLike, options: ClipboardConverterOptions = {}): ClipboardConversion | null {
  const internal = data.getData(ATHYPER_RICH_TEXT_MIME);
  if (internal) return { source: "internal", document: parseInternal(internal), pendingImages: [] };
  const images = imageFiles(data.files);
  const html = data.getData("text/html");
  const parser = options.domParser ?? (typeof DOMParser === "undefined" ? undefined : new DOMParser());
  if (html && parser) return withImages("html", fromHtml(html, parser), images, options.createUploadToken);
  const text = normalize(data.getData("text/plain"));
  if (text) return withImages(text.includes("\t") ? "tsv" : "text", text.includes("\t") ? [tsvTable(text)] : paragraphs(text), images, options.createUploadToken);
  return images.length ? withImages("images", [], images, options.createUploadToken) : null;
}

export function convertPasteEvent(event: Pick<ClipboardEvent, "clipboardData" | "preventDefault">, options?: ClipboardConverterOptions): ClipboardConversion | null {
  if (!event.clipboardData) return null;
  const result = convertClipboard(event.clipboardData, options);
  if (result) event.preventDefault();
  return result;
}

/** Pending nodes cannot be submitted. Resolve them after attachment upload/finalization. */
export function resolveClipboardImages(document: RichTextDocument, attachmentIdsByToken: Readonly<Record<string, string>>): RichTextDocument {
  return doc(document.content.map((node) => resolveNode(node, attachmentIdsByToken)));
}

export interface ClipboardImageUploader {
  upload(file: File, input: { readonly token: string }): Promise<{ readonly attachmentId: string }>;
}

/** Upload every pasted blob through the attachment lifecycle, then return submit-safe JSON. */
export async function uploadClipboardImages(conversion: ClipboardConversion, uploader: ClipboardImageUploader): Promise<RichTextDocument> {
  if (!conversion.pendingImages.length) return conversion.document;
  const resolved: Record<string, string> = {};
  for (const image of conversion.pendingImages) {
    const result = await uploader.upload(image.file, { token: image.token });
    if (!UUID.test(result.attachmentId)) throw new TypeError("Attachment upload returned an invalid attachmentId");
    resolved[image.token] = result.attachmentId;
  }
  return resolveClipboardImages(conversion.document, resolved);
}

export function serializeForClipboard(document: RichTextDocument): Readonly<Record<string, string>> {
  return { [ATHYPER_RICH_TEXT_MIME]: JSON.stringify(document), "text/html": render(document), "text/plain": plain(document).trim() };
}

function withImages(source: ClipboardConversion["source"], content: readonly RichTextNode[], files: readonly File[], tokenFactory?: () => string): ClipboardConversion {
  const pendingImages = files.map((file, index) => ({ token: tokenFactory?.() ?? `${Date.now()}-${index}-${Math.random().toString(36).slice(2)}`, file }));
  return { source, document: doc([...content, ...pendingImages.map((image) => ({ type: "pendingImage", attrs: { uploadToken: image.token, alt: image.file.name || "Pasted image" } }))]), pendingImages };
}

function fromHtml(html: string, parser: Pick<DOMParser, "parseFromString">): RichTextNode[] {
  const parsed = parser.parseFromString(html, "text/html");
  const nodes = [...parsed.body.childNodes].flatMap((node) => fromDom(node, []));
  return nodes.length ? nodes : paragraphs(normalize(parsed.body.textContent ?? ""));
}

function fromDom(node: Node, marks: readonly RichTextMark[]): RichTextNode[] {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ? [{ type: "text", text: normalize(node.textContent), ...(marks.length ? { marks } : {}) }] : [];
  if (node.nodeType !== Node.ELEMENT_NODE) return [];
  const element = node as HTMLElement; const tag = element.tagName.toLowerCase();
  if (["script", "style", "meta", "link", "iframe", "object", "embed", "form", "input", "button", "svg", "img"].includes(tag)) return [];
  if (tag === "br") return [{ type: "hardBreak" }];
  if (tag === "table") return [tableFromDom(element)];
  if (tag === "span" && element.dataset["mentionPrincipal"] && UUID.test(element.dataset["mentionPrincipal"])) return [{ type: "mention", attrs: { principalId: element.dataset["mentionPrincipal"], label: normalize(element.textContent ?? "").replace(/^@/, "").slice(0, 200) } }];
  const mark = markFor(element); const children = [...element.childNodes].flatMap((child) => fromDom(child, mark ? [...marks, mark] : marks));
  if (tag === "p" || tag === "div") return [{ type: "paragraph", content: inline(children) }];
  if (/^h[1-6]$/.test(tag)) return [{ type: "heading", attrs: { level: Number(tag[1]) }, content: inline(children) }];
  if (tag === "blockquote") return [{ type: "blockquote", content: blocks(children) }];
  if (tag === "ul" || tag === "ol") return [{ type: tag === "ul" ? "bulletList" : "orderedList", content: [...element.children].filter((child) => child.tagName === "LI").slice(0, LIMIT.rows).map(listItem) }];
  if (tag === "li") return [listItem(element)];
  return children;
}

function tableFromDom(table: HTMLElement): RichTextNode {
  const rows = [...table.querySelectorAll("tr")].slice(0, LIMIT.rows); let count = 0;
  return { type: "table", content: rows.map((row) => ({ type: "tableRow", content: ([...row.children].filter((cell) => cell.tagName === "TD" || cell.tagName === "TH").slice(0, LIMIT.columns).map((cell) => { if (++count > LIMIT.cells) return null; const element = cell as HTMLElement; return { type: element.tagName === "TH" ? "tableHeader" : "tableCell", attrs: { colspan: span(element, "colspan"), rowspan: span(element, "rowspan") }, content: blocks([...element.childNodes].flatMap((child) => fromDom(child, []))) }; }) as (RichTextNode | null)[]).filter(isNode) })) };
}

function tsvTable(value: string): RichTextNode {
  let count = 0;
  return { type: "table", content: parseDelimited(value).slice(0, LIMIT.rows).map((row) => ({ type: "tableRow", content: (row.slice(0, LIMIT.columns).map((cell) => ++count <= LIMIT.cells ? { type: "tableCell", attrs: { colspan: 1, rowspan: 1 }, content: [{ type: "paragraph", content: textNode(cell) }] } : null) as (RichTextNode | null)[]).filter(isNode) })) };
}

/** Handles quoted cells, embedded newlines, CRLF, and escaped quotes from spreadsheet clipboards. */
export function parseDelimited(value: string): readonly (readonly string[])[] {
  const rows: string[][] = [[]]; let cell = ""; let quoted = false;
  for (let i = 0; i < value.length; i++) { const char = value[i]; if (char === '"') { if (quoted && value[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted; } else if (char === "\t" && !quoted) { rows.at(-1)?.push(cell); cell = ""; } else if ((char === "\r" || char === "\n") && !quoted) { if (char === "\r" && value[i + 1] === "\n") i++; rows.at(-1)?.push(cell); cell = ""; rows.push([]); } else cell += char; }
  rows.at(-1)?.push(cell); if (rows.at(-1)?.length === 1 && rows.at(-1)?.[0] === "") rows.pop(); return rows;
}

function parseInternal(value: string): RichTextDocument { const parsed = JSON.parse(value) as Partial<RichTextDocument>; if (parsed.type !== "doc" || parsed.schema !== RICH_TEXT_SCHEMA || !Array.isArray(parsed.content)) throw new TypeError("Unsupported Athyper rich-text clipboard payload"); return parsed as RichTextDocument; }
function doc(content: readonly RichTextNode[]): RichTextDocument { return { type: "doc", schema: RICH_TEXT_SCHEMA, content }; }
function paragraphs(text: string): RichTextNode[] { return text.split(/\n{2,}/).map((value) => ({ type: "paragraph", content: textNode(value) })); }
function textNode(text: string): RichTextNode[] { return text ? [{ type: "text", text: text.slice(0, LIMIT.text) }] : []; }
function inline(nodes: readonly RichTextNode[]): RichTextNode[] { return nodes.flatMap((node) => ["text", "hardBreak", "mention"].includes(node.type) ? [node] : node.content ? inline(node.content) : []); }
function blocks(nodes: readonly RichTextNode[]): RichTextNode[] { const result: RichTextNode[] = []; let pending: RichTextNode[] = []; const flush = () => { if (pending.length) { result.push({ type: "paragraph", content: pending }); pending = []; } }; for (const node of nodes) { if (["text", "hardBreak", "mention"].includes(node.type)) pending.push(node); else { flush(); result.push(node); } } flush(); return result.length ? result : [{ type: "paragraph", content: [] }]; }
function listItem(element: Element): RichTextNode { return { type: "listItem", content: blocks([...element.childNodes].flatMap((node) => fromDom(node, []))) }; }
function markFor(element: HTMLElement): RichTextMark | undefined { const tag = element.tagName.toLowerCase(); if (tag === "strong" || tag === "b") return { type: "bold" }; if (tag === "em" || tag === "i") return { type: "italic" }; if (tag === "u") return { type: "underline" }; if (tag === "s" || tag === "del") return { type: "strike" }; if (tag === "code") return { type: "code" }; if (tag === "a") { const href = safeHref(element.getAttribute("href")); return href ? { type: "link", attrs: { href } } : undefined; } return undefined; }
function safeHref(value: string | null): string | undefined { if (!value || value.length > 2_048) return undefined; try { const url = new URL(value, globalThis.location?.origin ?? "https://invalid.local"); return ["http:", "https:", "mailto:"].includes(url.protocol) ? value : undefined; } catch { return undefined; } }
function imageFiles(files?: FileList | readonly File[]): File[] { return files ? Array.from(files).filter((file) => file.type.startsWith("image/")).slice(0, LIMIT.images) : []; }
function resolveNode(node: RichTextNode, ids: Readonly<Record<string, string>>): RichTextNode { if (node.type === "pendingImage") { const token = String(node.attrs?.["uploadToken"] ?? ""); const id = ids[token]; if (!id || !UUID.test(id)) throw new TypeError(`Clipboard image upload is unresolved: ${token || "missing token"}`); return { type: "attachmentImage", attrs: { attachmentId: id, alt: node.attrs?.["alt"] } }; } return node.content ? { ...node, content: node.content.map((child) => resolveNode(child, ids)) } : node; }
function span(element: HTMLElement, name: string): number { const value = Number(element.getAttribute(name) ?? 1); return Number.isInteger(value) && value >= 1 && value <= LIMIT.columns ? value : 1; }
function normalize(value: string): string { return value.replaceAll("\u0000", "").replace(/\r\n?/g, "\n").slice(0, LIMIT.text); }
function isNode(value: RichTextNode | null): value is RichTextNode { return value !== null; }

function plain(node: RichTextNode): string { if (node.type === "text") return node.text ?? ""; if (node.type === "hardBreak") return "\n"; if (node.type === "mention") return `@${String(node.attrs?.["label"] ?? "mention")}`; if (node.type === "attachmentImage") return `[Image: ${String(node.attrs?.["alt"] ?? "attachment")}]`; const separator = node.type === "tableRow" ? "\t" : ["doc", "table", "listItem", "bulletList", "orderedList", "blockquote"].includes(node.type) ? "\n" : ""; return (node.content ?? []).map(plain).join(separator); }
function render(node: RichTextNode): string { if (node.type === "text") return applyMarks(escape(node.text ?? ""), node.marks); if (node.type === "hardBreak") return "<br>"; if (node.type === "mention") return `<span data-mention-principal="${escape(String(node.attrs?.["principalId"] ?? ""))}">@${escape(String(node.attrs?.["label"] ?? "mention"))}</span>`; if (node.type === "attachmentImage") { const id = escape(String(node.attrs?.["attachmentId"] ?? "")); return `<img src="/api/attachments/${id}/content" data-attachment-id="${id}" alt="${escape(String(node.attrs?.["alt"] ?? "Image attachment"))}">`; } const tags: Record<string, string> = { doc: "div", paragraph: "p", heading: "h3", blockquote: "blockquote", bulletList: "ul", orderedList: "ol", listItem: "li", table: "table", tableRow: "tr", tableHeader: "th", tableCell: "td" }; const tag = tags[node.type] ?? "span"; return `<${tag}>${(node.content ?? []).map(render).join("")}</${tag}>`; }
function applyMarks(value: string, marks?: readonly RichTextMark[]): string { return (marks ?? []).reduce((result, mark) => { if (mark.type === "link") return `<a href="${escape(String(mark.attrs?.["href"] ?? ""))}" rel="noopener noreferrer nofollow">${result}</a>`; const tags = { bold: "strong", italic: "em", underline: "u", strike: "s", code: "code" } as const; const tag = tags[mark.type]; return `<${tag}>${result}</${tag}>`; }, value); }
function escape(value: string): string { return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;"); }
