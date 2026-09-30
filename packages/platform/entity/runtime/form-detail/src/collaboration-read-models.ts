export interface CommentRow extends Readonly<Record<string, unknown>> {
  readonly id: string;
  readonly text: string;
  readonly revision?: number;
  readonly pinnedFiles?: readonly PinnedFile[];
  readonly viewerReactions?: readonly string[];
  readonly reactions?: readonly { code: string; count: number }[];
}
export interface PinnedFile {
  readonly attachmentId: string;
  readonly fileName: string;
  readonly version?: number;
  readonly sizeBytes?: number;
}
export interface AttachmentRow extends Readonly<Record<string, unknown>> {
  readonly addedByDisplayName?: string;
  readonly addedAt?: string;
  readonly id: string;
  readonly fileName: string;
  readonly displayName?: string;
  readonly version?: number;
  readonly sizeBytes?: number;
}
function object(value: unknown): Readonly<Record<string, unknown>> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid collaboration row.");
  return value as Readonly<Record<string, unknown>>;
}
function requiredString(value: unknown): string {
  if (typeof value !== "string" || !value.trim())
    throw new Error("A collaboration identifier or file name is missing.");
  return value;
}
function optionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
    throw new Error("Invalid collaboration numeric value.");
  return value;
}
export function asComment(value: unknown): CommentRow {
  const row = object(value);
  if (row.text !== undefined && typeof row.text !== "string")
    throw new Error("Invalid comment text.");
  const pinnedFiles =
    row.pinnedFiles === undefined
      ? undefined
      : array(row.pinnedFiles).map((value) => {
          const pin = object(value);
          return {
            attachmentId: requiredString(pin.attachmentId),
            fileName: requiredString(pin.fileName),
            version: optionalNumber(pin.version),
            sizeBytes: optionalNumber(pin.sizeBytes),
          };
        });
  const viewerReactions =
    row.viewerReactions === undefined
      ? undefined
      : array(row.viewerReactions).map(requiredString);
  const reactions =
    row.reactions === undefined
      ? undefined
      : array(row.reactions).map((value) => {
          const reaction = object(value);
          return {
            code: requiredString(reaction.code),
            count: optionalNumber(reaction.count) ?? 0,
          };
        });
  return {
    ...row,
    id: requiredString(row.id),
    text: typeof row.text === "string" ? row.text : "",
    revision: optionalNumber(row.revision),
    pinnedFiles,
    viewerReactions,
    reactions,
  };
}
export function asAttachment(value: unknown): AttachmentRow {
  const row = object(value);
  return {
    ...row,
    id: requiredString(row.id),
    fileName: requiredString(row.fileName),
    displayName:
      row.displayName == null ? undefined : requiredString(row.displayName),
    version: optionalNumber(row.version),
    sizeBytes: optionalNumber(row.sizeBytes),
  };
}
function array(value: unknown): readonly unknown[] {
  if (!Array.isArray(value))
    throw new Error("Invalid collaboration collection.");
  return value;
}
export function fileLabel(value: Readonly<Record<string, unknown>>): string {
  return typeof value.displayName === "string" && value.displayName.trim()
    ? value.displayName
    : typeof value.fileName === "string"
      ? value.fileName
      : "File";
}
