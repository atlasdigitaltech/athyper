import { createOperation, encodePathSegment, type Operation } from "./index";

export interface SharedReferenceDirectoryItem {
  readonly value: string;
  readonly recordId: string;
  readonly label: string;
  readonly data?: Readonly<Record<string, string>>;
}
export interface SharedReferenceDirectoryPage {
  readonly sourceKey: string;
  readonly items: readonly SharedReferenceDirectoryItem[];
  readonly nextCursor?: string;
}

function parse(raw: unknown): SharedReferenceDirectoryPage {
  const value = raw as Record<string, unknown>;
  if (
    !value || typeof value.sourceKey !== "string" || !Array.isArray(value.items) ||
    value.items.length > 100 ||
    value.items.some((item) => {
      const row = item as Record<string, unknown>;
      return !row || typeof row.value !== "string" || !row.value ||
        typeof row.recordId !== "string" || !row.recordId ||
        typeof row.label !== "string" || !row.label ||
        (row.data !== undefined && (!row.data || typeof row.data !== "object" || Array.isArray(row.data) || Object.values(row.data).some((entry) => typeof entry !== "string")));
    }) ||
    (value.nextCursor !== undefined && (typeof value.nextCursor !== "string" || !value.nextCursor))
  ) throw new TypeError("Invalid shared reference directory response");
  return {
    sourceKey: value.sourceKey,
    items: value.items.map((item) => {
      const row = item as Record<string, unknown>;
      return {
        value: row.value as string,
        recordId: row.recordId as string,
        label: row.label as string,
        ...(row.data ? { data: row.data as Record<string, string> } : {}),
      };
    }),
    ...(value.nextCursor ? { nextCursor: value.nextCursor } : {}),
  };
}

export const sharedReferenceDirectoryOperation: Operation<SharedReferenceDirectoryPage> =
  createOperation({
    method: "GET",
    path: ({ sourceKey }) =>
      `/api/reference-directory/${encodePathSegment(String(sourceKey))}`,
    parse,
    requestClass: "interactive",
  });
