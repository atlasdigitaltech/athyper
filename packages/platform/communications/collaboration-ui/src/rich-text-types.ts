export const RICH_TEXT_SCHEMA = "athyper.rich-text/1.0" as const;
export const ATHYPER_RICH_TEXT_MIME = "application/x-athyper-rich-text+json" as const;

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
export interface PendingClipboardImage { readonly token: string; readonly file: File; }
export interface ClipboardConversion {
  readonly source: "internal" | "html" | "tsv" | "text" | "images";
  readonly document: RichTextDocument;
  readonly pendingImages: readonly PendingClipboardImage[];
}
