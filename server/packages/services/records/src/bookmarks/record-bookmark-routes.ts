import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import {
  defineRouteContract,
  HttpError,
  registerContractRoute,
} from "@athyper/server-runtime-http";
import type { Application, RequestHandler, Response } from "express";
import { RecordServiceError } from "../errors.js";
import { parseEntityListScopeCoordinate } from "../entity-list-routes.js";
import {
  validateEntityCode,
  type RecordBookmarkService,
} from "./record-bookmark-service.js";

export function registerRecordBookmarkRoutes(
  application: Application,
  options: {
    readonly authenticate: RequestHandler;
    readonly readContext: (response: Response) => VerifiedRequestContext;
    readonly bookmarks: RecordBookmarkService;
  },
): void {
  registerContractRoute(
    application,
    contracts.list,
    options.authenticate,
    async (request, response, next) => {
      try {
        noStore(response);
        response.json({
          items:
            request.query["entityCode"] === undefined
              ? await options.bookmarks.list(options.readContext(response))
              : await options.bookmarks.list(
                  options.readContext(response),
                  entityCode(request.query["entityCode"]),
                  parseEntityListScopeCoordinate(request.query),
                ),
        });
      } catch (error) {
        next(asHttpError(error));
      }
    },
  );
  registerContractRoute(
    application,
    contracts.membership,
    options.authenticate,
    async (request, response, next) => {
      try {
        noStore(response);
        const ids = queryIds(request.query["recordId"]);
        const bookmarked = await options.bookmarks.membership(
          options.readContext(response),
          entityCode(request.params["entityCode"]),
          ids,
        );
        response.json({
          entityCode: entityCode(request.params["entityCode"]),
          bookmarkedRecordIds: [...bookmarked],
        });
      } catch (error) {
        next(asHttpError(error));
      }
    },
  );
  registerContractRoute(
    application,
    contracts.add,
    options.authenticate,
    async (request, response, next) => {
      try {
        noStore(response);
        const body = request.body as Readonly<Record<string, unknown>>;
        const records = bodyRecords(body);
        const scope = parseEntityListScopeCoordinate(body);
        const changed = await options.bookmarks.add(
          options.readContext(response),
          entityCode(request.params["entityCode"]),
          records,
          scope,
        );
        response.json({ operation: "add", recordIds: [...changed] });
      } catch (error) {
        next(asHttpError(error));
      }
    },
  );
  registerContractRoute(
    application,
    contracts.remove,
    options.authenticate,
    async (request, response, next) => {
      try {
        noStore(response);
        const changed = await options.bookmarks.remove(
          options.readContext(response),
          entityCode(request.params["entityCode"]),
          bodyRecords(request.body as Readonly<Record<string, unknown>>).map(
            (record) => record.id,
          ),
        );
        response.json({ operation: "remove", recordIds: [...changed] });
      } catch (error) {
        next(asHttpError(error));
      }
    },
  );
}

const uuid = {
  type: "string",
  format: "uuid",
  pattern:
    "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$",
} as const;
const ids = {
  type: "array",
  maxItems: 100,
  uniqueItems: true,
  items: uuid,
} as const;
const item = {
  type: "object",
  additionalProperties: false,
  required: ["id", "entityCode", "recordId", "createdAt"],
  properties: {
    id: uuid,
    entityCode: { type: "string" },
    recordId: uuid,
    label: { type: "string", maxLength: 240 },
    description: { type: "string", maxLength: 480 },
    createdAt: { type: "string", format: "date-time" },
  },
} as const;
const listBody = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: { items: { type: "array", maxItems: 200, items: item } },
} as const;
const membershipBody = {
  type: "object",
  additionalProperties: false,
  required: ["entityCode", "bookmarkedRecordIds"],
  properties: { entityCode: { type: "string" }, bookmarkedRecordIds: ids },
} as const;
const mutationResponse = (operation: "add" | "remove") => ({
  type: "object",
  additionalProperties: false,
  required: ["operation", "recordIds"],
  properties: { operation: { const: operation }, recordIds: ids },
});
const errors = {
  400: { description: "Invalid request" },
  401: { description: "Authentication required" },
  403: { description: "Forbidden" },
  404: { description: "Entity descriptor not found" },
  409: { description: "Work context required or operation unavailable" },
  429: { description: "Rate limited" },
  503: { description: "Service unavailable" },
} as const;
const record = {
  type: "object",
  additionalProperties: false,
  required: ["id"],
  properties: {
    id: uuid,
    label: { type: "string", minLength: 1, maxLength: 240 },
  },
} as const;
const scope = {
  companyCodeIds: { type: "string", maxLength: 3699 },
  operatingOrganizationIds: { type: "string", maxLength: 3699 },
  partnerRole: { type: "string", enum: ["supplier", "customer"] },
  eligibleOperation: { type: "string", enum: ["order", "invoice", "payment"] },
  companyCodeId: uuid,
  legalEntityId: uuid,
  operatingOrganizationId: uuid,
  networkAccountId: uuid,
} as const;
const params = {
  type: "object",
  required: ["entityCode"],
  properties: {
    entityCode: { type: "string", pattern: "^[a-z][a-z0-9_.-]{1,126}$" },
  },
} as const;
const mutationBody = {
  type: "object",
  additionalProperties: false,
  required: ["records"],
  properties: {
    records: { type: "array", minItems: 1, maxItems: 100, items: record },
    ...scope,
  },
} as const;
const contracts = {
  list: defineRouteContract({
    method: "get",
    path: "/api/record-bookmarks",
    operationId: "recordBookmarks.list",
    summary:
      "List the authenticated principal's 200 most recent record favourites",
    tags: ["Record favourites"],
    authenticated: true,
    request: {
      query: {
        type: "object",
        additionalProperties: false,
        properties: {
          entityCode: params.properties.entityCode,
          ...scope,
          companyCodeIds: { type: "string", maxLength: 3699 },
          operatingOrganizationIds: { type: "string", maxLength: 3699 },
          partnerRole: { type: "string", enum: ["supplier", "customer"] },
          eligibleOperation: {
            type: "string",
            enum: ["order", "invoice", "payment"],
          },
        },
      },
    },
    responses: {
      200: { description: "Record favourites", body: listBody },
      ...errors,
    },
  }),
  membership: defineRouteContract({
    method: "get",
    path: "/api/record-bookmarks/:entityCode/membership",
    operationId: "recordBookmarks.membership",
    summary: "Resolve favourite membership for a visible page",
    tags: ["Record favourites"],
    authenticated: true,
    request: {
      params,
      query: {
        type: "object",
        additionalProperties: false,
        required: ["recordId"],
        properties: {
          recordId: {
            oneOf: [
              uuid,
              { type: "array", minItems: 1, maxItems: 100, items: uuid },
            ],
          },
        },
      },
    },
    responses: {
      200: { description: "Membership", body: membershipBody },
      ...errors,
    },
  }),
  add: defineRouteContract({
    method: "put",
    path: "/api/record-bookmarks/:entityCode",
    operationId: "recordBookmarks.add",
    summary: "Idempotently add explicit record favourites",
    tags: ["Record favourites"],
    authenticated: true,
    request: { params, body: mutationBody },
    responses: {
      200: { description: "Added favourites", body: mutationResponse("add") },
      ...errors,
    },
  }),
  remove: defineRouteContract({
    method: "delete",
    path: "/api/record-bookmarks/:entityCode",
    operationId: "recordBookmarks.remove",
    summary: "Idempotently remove explicit record favourites",
    tags: ["Record favourites"],
    authenticated: true,
    request: { params, body: mutationBody },
    responses: {
      200: {
        description: "Removed favourites",
        body: mutationResponse("remove"),
      },
      ...errors,
    },
  }),
} as const;
function noStore(response: Response) {
  response.setHeader("Cache-Control", "private, no-store");
}
function entityCode(value: unknown): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  const code = typeof candidate === "string" ? candidate : undefined;
  validateEntityCode(code ?? "");
  return code!;
}
function queryIds(value: unknown): readonly string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value) && value.every((id) => typeof id === "string"))
    return value;
  throw new RecordServiceError(
    400,
    "INVALID_BOOKMARK_RECORDS",
    "recordId is required",
  );
}
function bodyRecords(
  body: Readonly<Record<string, unknown>>,
): readonly { readonly id: string; readonly label?: string }[] {
  if (!Array.isArray(body["records"]))
    throw new RecordServiceError(
      400,
      "INVALID_BOOKMARK_RECORDS",
      "records are required",
    );
  return body["records"].map((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new RecordServiceError(
        400,
        "INVALID_BOOKMARK_RECORDS",
        "records are invalid",
      );
    const item = value as Record<string, unknown>;
    if (typeof item["id"] !== "string")
      throw new RecordServiceError(
        400,
        "INVALID_BOOKMARK_RECORDS",
        "record id is required",
      );
    return {
      id: item["id"],
      ...(typeof item["label"] === "string" ? { label: item["label"] } : {}),
    };
  });
}
function asHttpError(error: unknown): unknown {
  return error instanceof RecordServiceError
    ? new HttpError(error.statusCode, error.code, error.message)
    : error;
}
