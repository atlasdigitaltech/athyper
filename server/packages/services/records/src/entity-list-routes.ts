import {
  isCanonicalEntityCode,
  isEntityRecordId,
} from "@athyper/contract-platform-entity-runtime";
import { parseEntityListScopeCoordinate } from "./list-scope-coordinate.js";
export { parseEntityListScopeCoordinate } from "./list-scope-coordinate.js";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import {
  defineRouteContract,
  HttpError,
  registerContractRoute,
} from "@athyper/server-runtime-http";
import type { Application, RequestHandler, Response } from "express";
import { withReadEvidence } from "@athyper/server-foundation/context";
import type { EntityListService } from "./entity-list-service.js";
import { RecordServiceError } from "./errors.js";
import {
  MAX_LIST_FIELDS,
  MAX_LIST_FILTERS,
  MAX_LIST_SORT_LEVELS,
} from "./list-limits.js";
import { parseRecordListParameters } from "./records-routes.js";

export interface EntityListRouteOptions {
  readonly diagnostics?: boolean;
  readonly authenticate: RequestHandler;
  readonly readContext: (response: Response) => VerifiedRequestContext;
  readonly lists: EntityListService;
  /** Optional per-entity compatibility projection for a migrated compiled runtime. */ readonly applicationDescriptor?: EntityListService["applicationDescriptor"];
}

export function registerEntityListRoutes(
  application: Application,
  options: EntityListRouteOptions,
): void {
  registerReadRoute(
    application,
    options,
    contracts.application,
    (request, context) =>
      (
        options.applicationDescriptor ??
        options.lists.applicationDescriptor.bind(options.lists)
      )(
        context,
        entityCodeParameter(request.params["entityCode"]),
        parseEntityListScopeCoordinate(request.query),
      ),
  );
  registerReadRoute(
    application,
    options,
    contracts.descriptor,
    (request, context) =>
      options.lists.descriptor(
        context,
        entityCodeParameter(request.params["entityCode"]),
        parseEntityListScopeCoordinate(request.query),
        typeof request.query["filterChoiceField"] === "string"
          ? request.query["filterChoiceField"]
          : undefined,
      ),
  );
  registerReadRoute(
    application,
    options,
    contracts.formDescriptor,
    (request, context) =>
      options.lists.formDescriptor(
        context,
        entityCodeParameter(request.params["entityCode"]),
        formMode(request.query["mode"]),
        request.query["recordId"] === undefined
          ? undefined
          : recordId(request.query["recordId"]),
      ),
  );
  registerReadRoute(
    application,
    options,
    contracts.detailDescriptor,
    (request, context, timing) =>
      options.lists.detailDescriptor(
        context,
        entityCodeParameter(request.params["entityCode"]),
        request.query["recordId"] === undefined
          ? undefined
          : recordId(request.query["recordId"]),
        timing,
      ),
  );
  registerReadRoute(
    application,
    options,
    contracts.detailRead,
    (request, context, timing) =>
      options.lists.detailRead(
        context,
        entityCodeParameter(request.params["entityCode"]),
        recordId(request.params["recordId"]),
        timing,
      ),
  );
  registerReadRoute(
    application,
    options,
    contracts.record,
    (request, context) =>
      options.lists.record(
        context,
        entityCodeParameter(request.params["entityCode"]),
        recordId(request.params["recordId"]),
      ),
  );
  registerReadRoute(
    application,
    options,
    contracts.list,
    (request, context) => {
      const scopeCoordinate = parseEntityListScopeCoordinate(request.query);
      return options.lists.list({
        context,
        entityCode: entityCodeParameter(request.params["entityCode"]),
        ...parseRecordListParameters(request.query),
        ...(request.query["standardView"]
          ? {
              standardViewKey: standardViewParameter(
                request.query["standardView"] as string | string[],
              ),
            }
          : {}),
        ...(scopeCoordinate ? { scopeCoordinate } : {}),
      });
    },
  );
}

type ReadRouteHandler = Parameters<typeof registerContractRoute>[3];
type ReadRouteRequest = Parameters<ReadRouteHandler>[0];

/** Registers an authenticated, uncacheable JSON read: verifies the request
 * context, sends the service result, and maps service errors to HTTP errors. */
function registerReadRoute(
  application: Application,
  options: EntityListRouteOptions,
  contract: Parameters<typeof registerContractRoute>[1],
  read: (
    request: ReadRouteRequest,
    context: VerifiedRequestContext,
    timing: (stage: string, durationMs: number) => void,
  ) => Promise<unknown> | unknown,
): void {
  registerContractRoute(
    application,
    contract,
    options.authenticate,
    async (request, response, next) => {
      const started = performance.now();
      const stages: string[] = [];
      const timing = (stage: string, durationMs: number) => {
        stages.push(`${stage};dur=${durationMs.toFixed(1)}`);
        if (options.diagnostics === true)
          response.setHeader("Server-Timing", stages.join(", "));
      };
      try {
        response.setHeader("Cache-Control", "private, no-store");
        const result = await withReadEvidence(() =>
          read(request, options.readContext(response), timing),
        );
        timing("total", performance.now() - started);
        response.json(result);
      } catch (error) {
        timing("total", performance.now() - started);
        next(asHttpError(error));
      }
    },
  );
}

function entityCodeParameter(value: string | string[] | undefined): string {
  const result = Array.isArray(value) ? value[0] : value;
  if (!isCanonicalEntityCode(result))
    throw new RecordServiceError(
      400,
      "INVALID_ENTITY_CODE",
      "entityCode must be a catalog code",
    );
  return result;
}
function standardViewParameter(value: string | string[] | undefined): string {
  const result = Array.isArray(value) ? value[0] : value;
  if (!result || !/^[a-z][a-z0-9_.-]{0,126}$/.test(result))
    throw new RecordServiceError(
      400,
      "INVALID_STANDARD_VIEW",
      "standardView must be a view key",
    );
  return result;
}
function formMode(value: unknown): "create" | "edit" {
  if (value !== "create" && value !== "edit")
    throw new RecordServiceError(
      400,
      "INVALID_FORM_MODE",
      "mode must be create or edit",
    );
  return value;
}
function recordId(value: unknown): string {
  const result = Array.isArray(value) ? value[0] : value;
  if (!isEntityRecordId(result))
    throw new RecordServiceError(
      400,
      "INVALID_RECORD_ID",
      "recordId is invalid",
    );
  return result;
}
function asHttpError(error: unknown): unknown {
  if (error instanceof RecordServiceError)
    return new HttpError(
      error.statusCode,
      error.code,
      error.message,
      error.params ? { params: error.params } : undefined,
    );
  // This compatibility reader predates typed service errors. Match only its
  // known missing-release condition; compilation/integrity failures remain 500s.
  if (
    error instanceof Error &&
    error.message === "COMPILED_ENTITY_APPLICATION_RELEASE_UNAVAILABLE"
  ) {
    return new HttpError(
      503,
      "ENTITY_APPLICATION_UNAVAILABLE",
      "This application has no active published configuration. Ask an administrator to publish and activate its configuration.",
    );
  }
  return error;
}
const body = { type: "object", additionalProperties: true } as const;
const scopeProperties = {
  parentEntityCode: { type: "string", pattern: "^[a-z][a-z0-9_]{1,62}$" },
  parentRecordId: { type: "string", format: "uuid" },
  relationshipKey: { type: "string", pattern: "^[a-z][a-z0-9_]{1,62}$" },
  companyCodeIds: { type: "string", maxLength: 3699 },
  operatingOrganizationIds: { type: "string", maxLength: 3699 },
  partnerRole: { type: "string", enum: ["supplier", "customer"] },
  eligibleOperation: { type: "string", enum: ["order", "invoice", "payment"] },
  companyCodeId: { type: "string", format: "uuid" },
  legalEntityId: { type: "string", format: "uuid" },
  operatingOrganizationId: { type: "string", format: "uuid" },
  networkAccountId: { type: "string", format: "uuid" },
} as const;
const descriptorQuery = {
  type: "object",
  additionalProperties: false,
  properties: {
    ...scopeProperties,
    filterChoiceField: {
      type: "string",
      pattern: "^[a-z][a-z0-9_]*$",
      maxLength: 128,
    },
  },
} as const;
const query = {
  type: "object",
  additionalProperties: false,
  properties: {
    standardView: { type: "string", pattern: "^[a-z][a-z0-9_.-]{0,126}$" },
    limit: { type: "string", pattern: "^[0-9]{1,3}$" },
    cursor: { type: "string", minLength: 1, maxLength: 4096 },
    search: { type: "string", minLength: 1, maxLength: 512 },
    fields: {
      oneOf: [
        { type: "string" },
        { type: "array", maxItems: MAX_LIST_FIELDS, items: { type: "string" } },
      ],
    },
    group: { type: "string", minLength: 1, maxLength: 127 },
    filter: {
      oneOf: [
        { type: "string" },
        {
          type: "array",
          maxItems: MAX_LIST_FILTERS,
          items: { type: "string" },
        },
      ],
    },
    sort: {
      oneOf: [
        { type: "string" },
        {
          type: "array",
          maxItems: MAX_LIST_SORT_LEVELS,
          items: { type: "string" },
        },
      ],
    },
    recordIds: {
      oneOf: [
        { type: "string" },
        {
          type: "array",
          minItems: 1,
          maxItems: 100,
          items: { type: "string" },
        },
      ],
    },
    countMode: {
      type: "string",
      enum: ["none", "cached", "approximate", "exact"],
    },
    ...scopeProperties,
  },
} as const;
const contracts = {
  application: defineRouteContract({
    method: "get",
    path: "/api/entity-runtime/:entityCode/application-descriptor",
    operationId: "entityApplication.descriptor",
    summary: "Resolve an authorized entity application header and sections",
    tags: ["Entity runtime"],
    authenticated: true,
    request: { query: descriptorQuery },
    responses: {
      200: { description: "Entity application descriptor", body },
      403: { description: "Forbidden" },
      404: { description: "Descriptor not found" },
      503: {
        description: "Application configuration not published or activated",
      },
    },
  }),
  descriptor: defineRouteContract({
    method: "get",
    path: "/api/entity-runtime/:entityCode/list-descriptor",
    operationId: "entityList.descriptor",
    summary: "Compile an authorized browser-safe entity list descriptor",
    tags: ["Entity runtime"],
    authenticated: true,
    request: { query: descriptorQuery },
    responses: {
      200: { description: "Safe list descriptor", body },
      400: { description: "Invalid work-context coordinate" },
      403: { description: "Forbidden" },
      404: { description: "Descriptor not found" },
      409: { description: "List surface unavailable" },
    },
  }),
  formDescriptor: defineRouteContract({
    method: "get",
    path: "/api/entity-runtime/:entityCode/form-descriptor",
    operationId: "entityForm.descriptor",
    summary: "Compile an authorized browser-safe entity form descriptor",
    tags: ["Entity runtime"],
    authenticated: true,
    request: {
      query: {
        type: "object",
        additionalProperties: false,
        required: ["mode"],
        properties: {
          mode: { enum: ["create", "edit"] },
          recordId: { type: "string", format: "uuid" },
        },
      },
    },
    responses: {
      200: { description: "Safe form descriptor", body },
      403: { description: "Forbidden" },
      404: { description: "Descriptor not found" },
      409: { description: "Form operation unavailable" },
    },
  }),
  detailDescriptor: defineRouteContract({
    method: "get",
    path: "/api/entity-runtime/:entityCode/detail-descriptor",
    operationId: "entityDetail.descriptor",
    summary: "Compile an authorized browser-safe entity detail descriptor",
    tags: ["Entity runtime"],
    authenticated: true,
    request: {
      query: {
        type: "object",
        additionalProperties: false,
        properties: {
          recordId: { type: "string", format: "uuid" },
        },
      },
    },
    responses: {
      200: { description: "Safe detail descriptor", body },
      403: { description: "Forbidden" },
      404: { description: "Descriptor not found" },
      409: { description: "Detail operation unavailable" },
    },
  }),
  detailRead: defineRouteContract({
    method: "get",
    path: "/api/entity-runtime/:entityCode/records/:recordId/detail",
    operationId: "entityDetail.read",
    summary:
      "Read an authorized detail descriptor and projected record together",
    tags: ["Entity runtime"],
    authenticated: true,
    request: {},
    responses: {
      200: {
        description: "Authorized detail read",
        body: {
          type: "object",
          additionalProperties: false,
          required: ["descriptor", "record"],
          properties: { descriptor: body, record: body },
        },
      },
      403: { description: "Forbidden" },
      404: { description: "Record not found" },
      409: { description: "Detail operation unavailable" },
      503: { description: "Adapter unavailable" },
    },
  }),
  record: defineRouteContract({
    method: "get",
    path: "/api/entity-runtime/:entityCode/records/:recordId",
    operationId: "entityDetail.record",
    summary: "Read an authorized record in a storage-independent envelope",
    tags: ["Entity runtime"],
    authenticated: true,
    request: {},
    responses: {
      200: { description: "Normalized record", body },
      403: { description: "Forbidden" },
      404: { description: "Record not found" },
      503: { description: "Adapter unavailable" },
    },
  }),
  list: defineRouteContract({
    method: "get",
    path: "/api/entity-runtime/:entityCode/list",
    operationId: "entityList.list",
    summary: "Query an authorized normalized entity list",
    tags: ["Entity runtime"],
    authenticated: true,
    request: { query },
    responses: {
      200: { description: "Normalized entity list page", body },
      400: { description: "Invalid list query or work-context coordinate" },
      403: { description: "Forbidden" },
      409: { description: "Validated work context required" },
    },
  }),
} as const;
