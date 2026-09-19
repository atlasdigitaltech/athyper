import {
  RICH_TEXT_SCHEMA,
  type RichTextDocument,
  type RichTextMark,
  type RichTextNode,
} from "@athyper/server-contract-collaboration";
import { CollaborationError } from "./errors.js";

const CONTAINERS = new Set([
  "doc",
  "paragraph",
  "heading",
  "blockquote",
  "bulletList",
  "orderedList",
  "listItem",
  "table",
  "tableRow",
  "tableHeader",
  "tableCell",
]);
const LEAVES = new Set(["text", "hardBreak", "mention", "attachmentImage"]);
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_PROTOCOL = /^(https?:|mailto:)/i;

export interface RichTextProjection {
  readonly document: RichTextDocument;
  readonly text: string;
  readonly html: string;
  readonly mentionIds: readonly string[];
  readonly attachmentIds: readonly string[];
  readonly contentSchema: typeof RICH_TEXT_SCHEMA;
}

export function projectRichText(
  value: Readonly<Record<string, unknown>>,
): RichTextProjection {
  const root = value as unknown as RichTextNode;
  const state = {
    nodes: 0,
    cells: 0,
    rows: 0,
    depth: 0,
    mentions: new Set<string>(),
    attachments: new Set<string>(),
  };
  validateNode(root, state, 0, true);
  const document = value as RichTextDocument;
  const text = plain(document).trim();
  if (!text && state.attachments.size === 0)
    invalid("Rich text must contain text or an attachment image");
  if (text.length > 50_000)
    invalid("Rich text exceeds 50000 projected characters");
  return {
    document,
    text,
    html: render(document),
    mentionIds: [...state.mentions],
    attachmentIds: [...state.attachments],
    contentSchema: RICH_TEXT_SCHEMA,
  };
}

function validateNode(
  node: RichTextNode,
  state: {
    nodes: number;
    cells: number;
    rows: number;
    depth: number;
    mentions: Set<string>;
    attachments: Set<string>;
  },
  depth: number,
  root = false,
): void {
  if (!node || typeof node !== "object" || typeof node.type !== "string")
    invalid("Every rich-text node needs a type");
  if (++state.nodes > 2_000 || depth > 20)
    invalid("Rich text is too large or deeply nested");
  if (
    root &&
    (node.type !== "doc" ||
      (node as unknown as { schema?: unknown }).schema !== RICH_TEXT_SCHEMA)
  )
    invalid(`Rich text schema must be ${RICH_TEXT_SCHEMA}`);
  if (!CONTAINERS.has(node.type) && !LEAVES.has(node.type))
    invalid(`Unsupported rich-text node: ${node.type}`);
  if (node.type === "text") {
    if (typeof node.text !== "string" || node.content)
      invalid("Invalid text node");
    validateMarks(node.marks);
  }
  if (node.type === "mention") {
    const id = attr(node, "principalId");
    if (!UUID.test(id)) invalid("Mention principalId must be a UUID");
    state.mentions.add(id);
  }
  if (node.type === "attachmentImage") {
    const id = attr(node, "attachmentId");
    if (!UUID.test(id)) invalid("Image attachmentId must be a UUID");
    state.attachments.add(id);
    safeDimension(node, "width");
    safeDimension(node, "height");
  }
  if (node.type === "tableRow" && ++state.rows > 100)
    invalid("A pasted table may contain at most 100 rows");
  if (node.type === "tableRow" && (node.content?.length ?? 0) > 30)
    invalid("A pasted table may contain at most 30 columns");
  if (
    (node.type === "tableCell" || node.type === "tableHeader") &&
    ++state.cells > 2_000
  )
    invalid("A pasted table may contain at most 2000 cells");
  if (CONTAINERS.has(node.type)) {
    if (!Array.isArray(node.content)) invalid(`${node.type} requires content`);
    validateChildren(node);
    for (const child of node.content ?? [])
      validateNode(child, state, depth + 1);
  } else if (node.content) invalid(`${node.type} cannot contain child nodes`);
}
function validateChildren(node: RichTextNode): void {
  const allowed: Record<string, readonly string[]> = {
    doc: [
      "paragraph",
      "heading",
      "blockquote",
      "bulletList",
      "orderedList",
      "table",
      "attachmentImage",
    ],
    paragraph: ["text", "hardBreak", "mention"],
    heading: ["text", "hardBreak", "mention"],
    blockquote: ["paragraph", "heading", "bulletList", "orderedList"],
    bulletList: ["listItem"],
    orderedList: ["listItem"],
    listItem: ["paragraph", "bulletList", "orderedList"],
    table: ["tableRow"],
    tableRow: ["tableHeader", "tableCell"],
    tableHeader: ["paragraph", "bulletList", "orderedList", "attachmentImage"],
    tableCell: ["paragraph", "bulletList", "orderedList", "attachmentImage"],
  };
  const types = allowed[node.type] ?? [];
  if (
    (node.content ?? []).some((child) => !child || !types.includes(child.type))
  )
    invalid(`Invalid child node in ${node.type}`);
}
function validateMarks(marks?: readonly RichTextMark[]): void {
  if (marks === undefined) return;
  if (!Array.isArray(marks)) invalid("Text marks must be an array");
  if (marks.length > 8) invalid("Too many text marks");
  for (const mark of marks) {
    if (
      !mark ||
      !["bold", "italic", "underline", "strike", "code", "link"].includes(
        mark.type,
      )
    )
      invalid(`Unsupported mark: ${mark?.type}`);
    if (mark.type === "link") {
      const href =
        typeof mark.attrs?.["href"] === "string" ? mark.attrs["href"] : "";
      if (!SAFE_PROTOCOL.test(href) || href.length > 2_048)
        invalid("Unsafe link URL");
    }
  }
}
function plain(node: RichTextNode): string {
  if (node.type === "text") return node.text ?? "";
  if (node.type === "hardBreak") return "\n";
  if (node.type === "mention")
    return `@${typeof node.attrs?.["label"] === "string" ? node.attrs["label"] : "mention"}`;
  if (node.type === "attachmentImage")
    return `[Image: ${typeof node.attrs?.["alt"] === "string" ? node.attrs["alt"] : "attachment"}]`;
  const separator =
    node.type === "tableRow"
      ? "\t"
      : [
            "doc",
            "blockquote",
            "bulletList",
            "orderedList",
            "listItem",
            "table",
          ].includes(node.type)
        ? "\n"
        : "";
  return (node.content ?? []).map(plain).join(separator);
}
function render(node: RichTextNode): string {
  if (node.type === "text")
    return applyMarks(escape(node.text ?? ""), node.marks);
  if (node.type === "hardBreak") return "<br>";
  if (node.type === "mention")
    return `<span data-mention-principal="${escape(attr(node, "principalId"))}">@${escape(optionalAttr(node, "label") ?? "mention")}</span>`;
  if (node.type === "attachmentImage") {
    const id = escape(attr(node, "attachmentId"));
    const alt = escape(optionalAttr(node, "alt") ?? "Image attachment");
    return `<img src="/api/attachments/${id}/content" data-attachment-id="${id}" alt="${alt}">`;
  }
  const tags: Record<string, string> = {
    doc: "div",
    paragraph: "p",
    heading: "h3",
    blockquote: "blockquote",
    bulletList: "ul",
    orderedList: "ol",
    listItem: "li",
    table: "table",
    tableRow: "tr",
    tableHeader: "th",
    tableCell: "td",
  };
  const tag = tags[node.type];
  if (!tag) invalid(`Cannot render node ${node.type}`);
  return `<${tag}>${(node.content ?? []).map(render).join("")}</${tag}>`;
}
function applyMarks(value: string, marks?: readonly RichTextMark[]): string {
  return (marks ?? []).reduce((result, mark) => {
    const tags: Record<string, string> = {
      bold: "strong",
      italic: "em",
      underline: "u",
      strike: "s",
      code: "code",
    };
    if (mark.type === "link")
      return `<a href="${escape(String(mark.attrs?.["href"] ?? ""))}" rel="noopener noreferrer nofollow">${result}</a>`;
    const tag = tags[mark.type];
    return tag ? `<${tag}>${result}</${tag}>` : result;
  }, value);
}
function attr(node: RichTextNode, key: string): string {
  const value = node.attrs?.[key];
  if (typeof value !== "string" || !value)
    invalid(`${node.type}.${key} is required`);
  return value;
}
function optionalAttr(node: RichTextNode, key: string): string | undefined {
  const value = node.attrs?.[key];
  return typeof value === "string" ? value.slice(0, 500) : undefined;
}
function safeDimension(node: RichTextNode, key: string): void {
  const value = node.attrs?.[key];
  if (
    value !== undefined &&
    (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 10_000)
  )
    invalid(`Invalid image ${key}`);
}
function escape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
function invalid(message: string): never {
  throw new CollaborationError(400, "INVALID_RICH_TEXT", message);
}
