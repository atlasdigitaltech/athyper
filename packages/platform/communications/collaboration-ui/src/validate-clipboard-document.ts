import { RICH_TEXT_SCHEMA, type RichTextDocument } from "./rich-text-types";
import { safeRichTextHref } from "@athyper/contract-platform-rich-text";

const children: Record<string, readonly string[]> = {
  doc: [
    "paragraph",
    "heading",
    "blockquote",
    "bulletList",
    "orderedList",
    "table",
    "attachmentImage",
    "attachmentFile",
  ],
  paragraph: ["text", "hardBreak", "mention"],
  heading: ["text", "hardBreak", "mention"],
  blockquote: ["paragraph", "heading", "bulletList", "orderedList"],
  bulletList: ["listItem"],
  orderedList: ["listItem"],
  listItem: ["paragraph", "bulletList", "orderedList"],
  table: ["tableRow"],
  tableRow: ["tableHeader", "tableCell"],
  tableHeader: [
    "paragraph",
    "bulletList",
    "orderedList",
    "attachmentImage",
    "attachmentFile",
  ],
  tableCell: [
    "paragraph",
    "bulletList",
    "orderedList",
    "attachmentImage",
    "attachmentFile",
  ],
};
const leaves = new Set([
  "text",
  "hardBreak",
  "mention",
  "attachmentImage",
  "attachmentFile",
]);
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const invalid = (): never => {
  throw new TypeError("Invalid rich-text clipboard document");
};
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return invalid();
  return value as Record<string, unknown>;
}
/** Validate before recursion/HTML insertion; clipboard MIME does not imply trust. */
export function parseClipboardDocument(raw: string): RichTextDocument {
  if (raw.length > 1_000_000) invalid();
  const root = object(JSON.parse(raw));
  if (root.type !== "doc" || root.schema !== RICH_TEXT_SCHEMA) invalid();
  let nodes = 0,
    textLength = 0,
    rows = 0;
  function visit(value: unknown, depth: number) {
    const node = object(value);
    if (++nodes > 2000 || depth > 20 || typeof node.type !== "string")
      invalid();
    const type = node.type as string;
    if (!Object.hasOwn(children, type) && !leaves.has(type)) invalid();
    const attrs = node.attrs === undefined ? {} : object(node.attrs);
    for (const value of Object.values(attrs)) {
      if (!["string", "number", "boolean"].includes(typeof value)) invalid();
      if (typeof value === "string" && value.length > 2048) invalid();
    }
    if (type === "text") {
      if (typeof node.text !== "string") invalid();
      textLength += (node.text as string).length;
      if (textLength > 50000) invalid();
    }
    if (
      type === "mention" &&
      (typeof attrs.principalId !== "string" || !uuid.test(attrs.principalId))
    )
      invalid();
    if (
      type.startsWith("attachment") &&
      (typeof attrs.attachmentId !== "string" || !uuid.test(attrs.attachmentId))
    )
      invalid();
    if (node.marks !== undefined) {
      if (
        type !== "text" ||
        !Array.isArray(node.marks) ||
        node.marks.length > 6
      )
        invalid();
      for (const value of node.marks as unknown[]) {
        const mark = object(value);
        if (
          !["bold", "italic", "underline", "strike", "code", "link"].includes(
            String(mark.type),
          )
        )
          invalid();
        if (mark.type === "link") {
          const attrs = object(mark.attrs);
          if (typeof attrs.href !== "string" || attrs.href.length > 2048)
            invalid();
          if (!safeRichTextHref(attrs.href)) invalid();
        }
      }
    }
    if (Object.hasOwn(children, type)) {
      if (!Array.isArray(node.content)) invalid();
      const content = node.content as unknown[];
      if (type === "tableRow" && (++rows > 100 || content.length > 30))
        invalid();
      for (const child of content) {
        if (!children[type]!.includes(String(object(child).type))) invalid();
        visit(child, depth + 1);
      }
    } else if (node.content !== undefined) invalid();
  }
  visit(root, 0);
  return root as unknown as RichTextDocument;
}
