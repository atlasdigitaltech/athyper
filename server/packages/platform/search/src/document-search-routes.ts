import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { DocumentSearchService } from "@athyper/server-contract-search";
import type { Application, RequestHandler, Response } from "express";
import { SearchError } from "./document-search-service.js";

export function registerDocumentSearchRoutes(application: Application, options: {
  readonly authenticate: RequestHandler;
  readonly readContext: (response: Response) => VerifiedRequestContext;
  readonly search: DocumentSearchService;
}) {
  application.get("/api/search/documents", options.authenticate, async (request, response, next) => {
    response.setHeader("Cache-Control", "no-store");
    try {
      const text = scalar(request.query["q"], "INVALID_SEARCH_QUERY", "q") ?? "";
      const types = scalar(request.query["entity_type"], "INVALID_ENTITY_TYPE", "entity_type");
      const result = await options.search.search({
        context: options.readContext(response),
        text,
        ...(types !== undefined ? { entityTypes: types.split(",") } : {}),
        page: pagination(request.query["page"], "page"),
        pageSize: pagination(request.query["page_size"], "page_size"),
      });
      response.status(200).json(result);
    } catch (error) {
      if (error instanceof SearchError) response.status(error.statusCode).json({ error: error.code, message: error.message });
      else next(error);
    }
  });
}

function scalar(value: unknown, code: string, name: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new SearchError(400, code, `${name} must be a single string`);
  return value;
}

function pagination(value: unknown, name: string): number | undefined {
  const raw = scalar(value, "INVALID_PAGINATION", name);
  if (raw === undefined) return undefined;
  if (!/^[0-9]+$/.test(raw) || !Number.isSafeInteger(Number(raw))) {
    throw new SearchError(400, "INVALID_PAGINATION", `${name} must be a decimal integer`);
  }
  return Number(raw);
}
