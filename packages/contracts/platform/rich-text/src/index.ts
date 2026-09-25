/** Browser/server shared rules; no UI, authentication, or storage dependencies. */
export interface RichTextNode {
  readonly type: string;
  readonly text?: string;
  readonly attrs?: Readonly<Record<string, unknown>>;
  readonly content?: readonly RichTextNode[];
}
export const MAX_COMMENT_THREAD_DEPTH = 5;
export function safeRichTextHref(
  value: unknown,
  base?: string,
): string | undefined {
  if (typeof value !== "string" || !value || value.length > 2048)
    return undefined;
  try {
    const url = new URL(value, base);
    return ["http:", "https:", "mailto:"].includes(url.protocol)
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}

/** Content existence is independent of its human-readable representation. */
export function hasRichTextContent(node: RichTextNode): boolean {
  if (node.type === "text") return Boolean(node.text?.trim());
  if (
    ["mention", "attachmentImage", "attachmentFile", "pendingImage"].includes(
      node.type,
    )
  )
    return true;
  return node.content?.some(hasRichTextContent) ?? false;
}

/** Matches the server projection, including mention labels and table separators. */
export function richTextPlain(node: RichTextNode): string {
  if (node.type === "text") return node.text ?? "";
  if (node.type === "hardBreak") return "\n";
  if (node.type === "mention")
    return `@${typeof node.attrs?.label === "string" ? node.attrs.label : "mention"}`;
  if (node.type === "attachmentImage" || node.type === "attachmentFile")
    return `[${node.type === "attachmentFile" ? "Attachment" : "Image"}: ${typeof node.attrs?.alt === "string" ? node.attrs.alt : "attachment"}]`;
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
  return (node.content ?? []).map(richTextPlain).join(separator);
}
