// Barrel — public surface of @athyper/svc-search.

// Route registration
export { createSearchRoute, type SearchRouteDeps } from "./routes/search.route.js";

// Client + service (consumed by bootstrap and the outbox handler)
export { MeilisearchClient, createMeilisearchClient } from "./client/meilisearch-client.js";
export type {
  MeilisearchIndexSettings,
  MeilisearchSearchRequest,
  MeilisearchSearchHit,
  MeilisearchSearchResponse,
  MeilisearchTaskResponse,
  MeilisearchKey,
  MeilisearchCreateKeyInput,
} from "./client/meilisearch-client.js";

export {
  SearchService,
  createSearchService,
  SearchNotReadyError,
} from "./client/search.service.js";
export type {
  SearchServiceOptions,
  SearchQuery,
  WarmUpState,
} from "./client/search.service.js";

export { mintMeilisearchTenantToken } from "./client/tenant-token.js";
export type { MintTenantTokenOptions } from "./client/tenant-token.js";

export {
  ensureTenantTokenSignerKey,
  TENANT_TOKEN_SIGNER_KEY_UID,
} from "./client/scoped-key.js";
export type { ResolvedSignerKey } from "./client/scoped-key.js";

export {
  SEARCH_INDEX_NAME,
  SEARCHABLE_ATTRIBUTES,
  FILTERABLE_ATTRIBUTES,
  SORTABLE_ATTRIBUTES,
  RANKING_RULES,
  STOP_WORDS,
  buildDocumentId,
} from "./client/index-schema.js";
export type { SearchDocument } from "./client/index-schema.js";

// Generic mapping layer
export { defaultRowToSearchDocument } from "./client/default-mapper.js";
export type { EntityDocumentOverride } from "./client/default-mapper.js";
export { createEntityMetaService } from "./client/entity-meta.js";
export type { EntityMeta, EntityMetaService } from "./client/entity-meta.js";

// Per-entity overrides
export { invoiceOverride, INVOICE_ENTITY_TYPE } from "./mappers/invoice.js";
export { journalEntryOverride, JOURNAL_ENTRY_ENTITY_TYPE } from "./mappers/journal-entry.js";

// Outbox handler — generic, metadata-driven
export { createSearchOutboxHandler } from "./handlers/search-outbox.handler.js";
export type { SearchOutboxHandlerDeps } from "./handlers/search-outbox.handler.js";

// Route registration helper mirroring svc-records / svc-platform pattern.
import type { Router } from "express";
import { createSearchRoute, type SearchRouteDeps } from "./routes/search.route.js";

export function registerSearchRoutes(router: Router, deps: SearchRouteDeps): Router {
  createSearchRoute(router, deps);
  return router;
}
