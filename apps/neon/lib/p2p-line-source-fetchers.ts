/**
 * Default fetchers for the four P2P line-source pickers.
 *
 * Each fetcher targets the server-side guarded endpoint in
 *   server/packages/services/records/routes/line-source.route.ts
 * via the neon BFF relay at /api/relay/p2p/*. The server enforces tenant
 * isolation, lifecycle gates (parent status allowlist + terminal_status
 * filter), and the remaining-quantity predicate — these fetchers do NOT
 * pass any of that as client-supplied filters. They only forward the
 * page+search+parent-context hints from the picker.
 *
 * Replaces the empty-page stubs noted in lib/source-adapters.ts.
 */

import type {
  CatalogItemSelection,
  OpenPoLineParentCtx,
  OpenPoLineSelection,
  OpenReceiptLineParentCtx,
  OpenReceiptLineSelection,
  OpenServiceSheetLineParentCtx,
  OpenServiceSheetLineSelection,
} from "@athyper/runtime-line-item";
import type { Page, SourceQuery } from "@athyper/runtime-add-item";

type AnyParentCtx = Partial<{
  supplierId:   string;
  commitmentId: string;
}> & Record<string, unknown>;

function paramsFromQuery(query: SourceQuery, ctx?: AnyParentCtx): URLSearchParams {
  const params = new URLSearchParams();
  if (query.q)              params.set("q",      query.q);
  if (query.limit  !== undefined) params.set("limit",  String(query.limit));
  if (query.cursor)         params.set("offset", query.cursor);
  if (ctx?.supplierId)      params.set("supplierId",   ctx.supplierId);
  if (ctx?.commitmentId)    params.set("commitmentId", ctx.commitmentId);
  return params;
}

async function relayGet<T>(endpoint: string, params: URLSearchParams): Promise<Page<T>> {
  const url = `/api/relay/p2p/${endpoint}${params.toString() ? `?${params.toString()}` : ""}`;
  const res = await fetch(url, {
    method:      "GET",
    credentials: "same-origin",
    headers:     { Accept: "application/json" },
  });
  if (!res.ok) {
    // Picker UIs surface fetch failures inline; resolve with an empty page
    // and an exception thrown so the picker shows the error state instead
    // of silently rendering nothing.
    throw new Error(`p2p-line-source fetch failed: ${res.status} ${endpoint}`);
  }
  const body = await res.json() as Page<T>;
  return body;
}

export async function fetchOpenPoLines(
  query: SourceQuery,
  ctx:   OpenPoLineParentCtx,
): Promise<Page<OpenPoLineSelection>> {
  return relayGet<OpenPoLineSelection>("open-po-lines", paramsFromQuery(query, ctx));
}

export async function fetchOpenReceiptLines(
  query: SourceQuery,
  ctx:   OpenReceiptLineParentCtx,
): Promise<Page<OpenReceiptLineSelection>> {
  return relayGet<OpenReceiptLineSelection>("open-receipt-lines", paramsFromQuery(query, ctx));
}

export async function fetchOpenServiceSheetLines(
  query: SourceQuery,
  ctx:   OpenServiceSheetLineParentCtx,
): Promise<Page<OpenServiceSheetLineSelection>> {
  return relayGet<OpenServiceSheetLineSelection>("open-service-sheet-lines", paramsFromQuery(query, ctx));
}

export async function fetchCatalogItems(
  query: SourceQuery,
): Promise<Page<CatalogItemSelection>> {
  // Server returns an empty page until master.catalog_item lands. Keeping
  // this fetcher live (vs. a stub in source-adapters.ts) means the swap is
  // a single-server change when the catalog tables ship.
  return relayGet<CatalogItemSelection>("catalog/items", paramsFromQuery(query));
}
