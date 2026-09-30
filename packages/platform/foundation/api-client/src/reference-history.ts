import type { Operation } from "./index";
export interface ReferenceHistoryItem {
  readonly key: string;
  readonly selectedAt: string;
}
const path = (params: Readonly<Record<string, string | number>>) => {
  const entity = String(params.entityCode);
  if (!/^[a-z][a-z0-9_.-]{0,126}$/.test(entity))
    throw new TypeError("Invalid entity code");
  return `/api/entity-runtime/${entity}/reference-history`;
};
function parse(raw: unknown): { items: readonly ReferenceHistoryItem[] } {
  const items = (raw as { items?: unknown })?.items;
  if (
    !Array.isArray(items) ||
    items.length > 20 ||
    items.some(
      (item) =>
        !item ||
        typeof item.key !== "string" ||
        typeof item.selectedAt !== "string" ||
        !Number.isFinite(Date.parse(item.selectedAt)),
    )
  )
    throw new TypeError("Invalid reference history");
  return {
    items: items.map((item) => ({
      key: item.key,
      selectedAt: item.selectedAt,
    })),
  };
}
export const referenceHistoryOperation: Operation<{
  items: readonly ReferenceHistoryItem[];
}> = {
  method: "GET",
  path,
  parse,
  requestClass: "interactive",
  idempotency: "forbidden",
  response: "json",
};
export const updateReferenceHistoryOperation: Operation<{
  items: readonly ReferenceHistoryItem[];
}> = {
  method: "POST",
  path,
  parse,
  requestClass: "interactive",
  idempotency: "forbidden",
  response: "json",
};
