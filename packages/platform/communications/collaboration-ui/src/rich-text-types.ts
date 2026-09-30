export const RICH_TEXT_SCHEMA = "athyper.rich-text/1.0" as const;
export const ATHYPER_RICH_TEXT_MIME =
  "application/x-athyper-rich-text+json" as const;

export interface RichTextMark {
  readonly type: "bold" | "italic" | "underline" | "strike" | "code" | "link";
  readonly attrs?: Readonly<Record<string, unknown>>;
}
export interface RichTextNode {
  readonly type: string;
  readonly attrs?: Readonly<Record<string, unknown>>;
  readonly marks?: readonly RichTextMark[];
  readonly text?: string;
  readonly content?: readonly RichTextNode[];
}
export interface RichTextDocument {
  readonly type: "doc";
  readonly schema: typeof RICH_TEXT_SCHEMA;
  readonly content: readonly RichTextNode[];
}

export function isAttachmentNode(node: RichTextNode): boolean {
  return node.type === "attachmentImage" || node.type === "attachmentFile";
}
/** Preorder traversal; return false to skip a node's descendants. */
export function visitRichText(
  node: RichTextNode,
  visit: (node: RichTextNode) => void | false,
): void {
  if (visit(node) === false) return;
  node.content?.forEach((child) => visitRichText(child, visit));
}
/** Immutable transformation, including attachment removal. */
export function mapRichText(
  node: RichTextNode,
  transform: (node: RichTextNode) => RichTextNode | null,
): RichTextNode | null {
  const next = transform(node);
  if (!next) return null;
  return next.content
    ? {
        ...next,
        content: next.content.flatMap((child) => {
          const result = mapRichText(child, transform);
          return result ? [result] : [];
        }),
      }
    : next;
}
export interface PendingClipboardImage {
  readonly token: string;
  readonly file: File;
}
export interface ClipboardConversion {
  readonly source: "internal" | "html" | "tsv" | "text" | "images";
  readonly document: RichTextDocument;
  readonly pendingImages: readonly PendingClipboardImage[];
}
