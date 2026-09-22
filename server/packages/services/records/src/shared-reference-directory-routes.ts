import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import { HttpError, defineRouteContract, registerContractRoute } from "@athyper/server-runtime-http";
import type { Application, RequestHandler, Response } from "express";
import { isSharedReferenceSourceKey, type SharedReferenceDirectory } from "./shared-reference-directory.js";
import type { SharedReferenceFilterName } from "@athyper/server-contract-master-data";

export function registerSharedReferenceDirectoryRoutes(
  application: Application,
  options: {
    readonly authenticate: RequestHandler;
    readonly readContext: (response: Response) => VerifiedRequestContext;
    readonly directory: (context: VerifiedRequestContext) => SharedReferenceDirectory;
  },
) {
  registerContractRoute(application, contract, options.authenticate, async (request, response, next) => {
    try {
      const sourceKey = String(request.params["sourceKey"] ?? "");
      if (!isSharedReferenceSourceKey(sourceKey))
        throw new HttpError(404, "REFERENCE_LOOKUP_SOURCE_UNREGISTERED", "Reference source is unavailable");
      const filters = readFilters(request.query["filter"]);
      const result = await options.directory(options.readContext(response)).lookup({
        sourceKey,
        ...(text(request.query["query"], "query", 120) ? { query: text(request.query["query"], "query", 120) } : {}),
        ...(text(request.query["cursor"], "cursor", 2048) ? { cursor: text(request.query["cursor"], "cursor", 2048) } : {}),
        ...(text(request.query["value"], "value", 256) ? { value: text(request.query["value"], "value", 256) } : {}),
        ...(request.query["limit"] !== undefined ? { limit: integer(request.query["limit"]) } : {}),
        ...(Object.keys(filters).length ? { filters } : {}),
      });
      response.setHeader("Cache-Control", "private, no-store");
      response.json(result);
    } catch (error) {
      if (error instanceof HttpError) next(error);
      else if (error instanceof Error && error.message.startsWith("REFERENCE_LOOKUP_"))
        next(new HttpError(400, error.message, "Reference lookup request is invalid"));
      else next(error);
    }
  });
}

function text(value: unknown, name: string, max: number): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw new HttpError(400, "REFERENCE_LOOKUP_REQUEST_INVALID", `${name} is invalid`);
  return value.trim();
}
function integer(value: unknown): number {
  if (typeof value !== "string" || !/^[0-9]{1,3}$/.test(value))
    throw new HttpError(400, "REFERENCE_LOOKUP_REQUEST_INVALID", "limit is invalid");
  return Number(value);
}
function readFilters(value: unknown): Partial<Record<SharedReferenceFilterName, string>> {
  if (value === undefined) return {};
  if (typeof value !== "string" || value.length > 1000)
    throw new HttpError(400, "REFERENCE_LOOKUP_FILTER_INVALID", "filter is invalid");
  try {
    const raw = JSON.parse(value);
    if (!raw || typeof raw !== "object" || Array.isArray(raw) || Object.keys(raw).length > 4)
      throw new Error();
    const entries = Object.entries(raw);
    if (entries.some(([key, item]) => !/^[a-z][a-zA-Z0-9]*$/.test(key) || typeof item !== "string" || !item.trim() || item.length > 128))
      throw new Error();
    return Object.fromEntries(entries.map(([key, item]) => [key, (item as string).trim()])) as Partial<Record<SharedReferenceFilterName, string>>;
  } catch {
    throw new HttpError(400, "REFERENCE_LOOKUP_FILTER_INVALID", "filter is invalid");
  }
}

const body = { type: "object", additionalProperties: true } as const;
const contract = defineRouteContract({
  method: "get",
  path: "/api/reference-directory/:sourceKey",
  operationId: "sharedReferenceDirectory.lookup",
  summary: "Search the bounded shared reference directory",
  tags: ["Shared references"],
  authenticated: true,
  request: {
    query: {
      type: "object",
      additionalProperties: false,
      properties: {
        query: { type: "string", maxLength: 120 },
        cursor: { type: "string", maxLength: 2048 },
        value: { type: "string", maxLength: 256 },
        limit: { type: "string", pattern: "^[0-9]{1,3}$" },
        filter: { type: "string", maxLength: 1000 },
      },
    },
  },
  responses: {
    200: { description: "Reference lookup page", body },
    400: { description: "Invalid lookup request" },
    401: { description: "Authentication required" },
    404: { description: "Reference source not found" },
  },
});
