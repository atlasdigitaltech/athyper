import type { Authorizer } from "@athyper/server-contract-auth";
import type { DocumentSearchService, SearchDocumentsCommand, SearchHit, SearchIndex } from "@athyper/server-contract-search";

export class SearchError extends Error {
  constructor(readonly statusCode: number, readonly code: string, message: string) {
    super(message);
    this.name = "SearchError";
  }
}

export function createDocumentSearchService(options: {
  readonly authorizer: Authorizer;
  readonly index: SearchIndex;
}): DocumentSearchService {
  return {
    async search(command: SearchDocumentsCommand) {
      const authorization = await options.authorizer.authorize({ context: command.context, permissionCode: "documents.search" });
      if (!authorization.allowed) throw new SearchError(403, "FORBIDDEN", "Document search is not permitted");
      const text = command.text.trim();
      if (!text || text.length > 256) throw new SearchError(400, "INVALID_SEARCH_QUERY", "Search text must contain 1-256 characters");
      const entityTypes = command.entityTypes?.map((value) => value.trim());
      if (entityTypes && (!entityTypes.length || entityTypes.some((value) => !/^[a-z][a-z0-9_.-]{1,126}$/.test(value)))) {
        throw new SearchError(400, "INVALID_ENTITY_TYPE", "Invalid entity type filter");
      }
      const page = integer(command.page ?? 1, 1, 10_000, "page");
      const pageSize = integer(command.pageSize ?? 20, 1, 100, "pageSize");
      const start = (page - 1) * pageSize;
      const hits: SearchHit[] = [];
      let total = 0;
      let processingMs = 0;
      const batchSize = 500;
      // Page offsets and totals must refer to authorized hits, not raw index matches.
      // Scan the retrievable result set; estimated index totals include forbidden hits.
      for (let offset = 0; ; offset += batchSize) {
        const result = await options.index.search({
          planeKey: command.context.planeKey,
          tenantId: command.context.tenantId,
          text,
          ...(entityTypes ? { entityTypes: [...new Set(entityTypes)] } : {}),
          resourceTypes: ["attachment"],
          limit: batchSize,
          offset,
        });
        processingMs += result.processingMs;
        for (const hit of result.hits) {
          // Content items have a separate ACL service and search endpoint. Also
          // enforce the type here in case an index implementation ignores filters.
          if ((hit.resourceType !== undefined && hit.resourceType !== "attachment") || !hit.attachmentId) continue;
          const decision = await options.authorizer.authorize({
            context: command.context,
            permissionCode: "documents.read",
            resource: {
              tenantId: command.context.tenantId,
              resourceCode: hit.entityType,
              recordId: hit.entityId,
              resourceId: hit.attachmentId,
              attachmentId: hit.attachmentId,
              entityType: hit.entityType,
              entityId: hit.entityId,
            },
          });
          if (!decision.allowed) continue;
          if (total >= start && hits.length < pageSize) hits.push(hit);
          total++;
        }
        if (result.hits.length < batchSize) break;
      }
      return { hits, total, processingMs, page, pageSize };
    },
  };
}

function integer(value: number, min: number, max: number, name: string) {
  if (!Number.isInteger(value) || value < min || value > max) throw new SearchError(400, "INVALID_PAGINATION", `${name} must be between ${min} and ${max}`);
  return value;
}
