import type { EntityListDescriptorV1 } from "@athyper/contract-platform-entity-list";
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
  readonly viewCatalog?: (context: VerifiedRequestContext, descriptor: EntityListDescriptorV1, surface: string) => Promise<unknown>;
  readonly authenticate: RequestHandler;
  readonly readContext: (response: Response) => VerifiedRequestContext;
  readonly lists: EntityListService;
  /** Optional per-entity compatibility projection for a migrated compiled runtime. */ readonly applicationDescriptor?: EntityListService["applicationDescriptor"];
  /** Reports a placed entity the directory left out for a reason other than access (for operators). */
  readonly onEntityUnavailable?: (entityCode: string, error: unknown) => void;
}

export function registerEntityListRoutes(
  application: Application,
  options: EntityListRouteOptions,
): void {
  registerReadRoute(application, options, contracts.directory, (request, context) =>
    entityDirectory(options.lists, context, directoryCodes(request.query["entity"]), options.onEntityUnavailable));
  registerReadRoute(application, options, contracts.references, (request, context) => {
    const invalid = () => new RecordServiceError(400, "INVALID_REFERENCE_QUERY", "Invalid reference lookup parameters");
    const bounded = (value: unknown, max: number) => {
      if (value === undefined) return undefined;
      if (typeof value !== "string" || !value.trim() || value.length > max) throw invalid();
      return value;
    };
    const raw = bounded(request.query["dependencies"], 2048);
    let dependencies: Record<string, string> | undefined;
    if (raw !== undefined) {
      let parsed: unknown;
      try { parsed = JSON.parse(raw); } catch { throw invalid(); }
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)
        || Object.keys(parsed).length > 7
        || Object.entries(parsed).some(([key, value]) => !/^[a-z][a-z0-9_]{0,62}$/.test(key) || typeof value !== "string" || !value.length || value.length > 256)) throw invalid();
      dependencies = parsed as Record<string, string>;
    }
    const field = bounded(request.params["fieldKey"], 63);
    if (!field || !/^[a-z][a-z0-9_]{0,62}$/.test(field)) throw invalid();
    return options.lists.referenceChoices(context, entityCodeParameter(request.params["entityCode"]), {
      field, query: bounded(request.query["query"], 120), cursor: bounded(request.query["cursor"], 4096), value: bounded(request.query["value"], 256),
      recordId: request.query["recordId"] === undefined ? undefined : recordId(request.query["recordId"]), dependencies,
    });
  });
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
    async (request, context, timing) => {
      const started = performance.now();
      const descriptor = await options.lists.descriptor(
        context,
        entityCodeParameter(request.params["entityCode"]),
        parseEntityListScopeCoordinate(request.query),
        typeof request.query["filterChoiceField"] === "string"
          ? request.query["filterChoiceField"] : undefined,
      );
      timing("descriptor", performance.now() - started);
      if (request.query["includeViews"] !== "true" || !options.viewCatalog ||
          !descriptor.serverViews || descriptor.scope.status !== "ready") return descriptor;
      const surface = request.query["surface"] ?? descriptor.surface.key;
      if (typeof surface !== "string" || !/^[a-z][a-z0-9_.-]{0,126}$/.test(surface))
        throw new TypeError("Invalid collection identifier");
      const viewsStarted = performance.now();
      const viewCatalog = await options.viewCatalog(context, descriptor, surface);
      timing("views", performance.now() - viewsStarted);
      return { ...descriptor, viewCatalog };
    },
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
  registerReadRoute(application, options, contracts.ownRecord, (request, context) =>
    options.lists.ownRecord(context, entityCodeParameter(request.params["entityCode"])));
  registerReadRoute(application, options, contracts.detailRead, (request, context, timing) =>
    options.lists.detailRead(context, entityCodeParameter(request.params["entityCode"]), recordId(request.params["recordId"]), timing, parseEntityListScopeCoordinate(request.query)));
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
        if (options.diagnostics === true) response.setHeader("Server-Timing", stages.join(", "));
      };
      try {
        response.setHeader("Cache-Control", "private, no-store");
        const result = await withReadEvidence(() => read(request, options.readContext(response), timing));
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
  parentDescriptorHash: { type: "string", pattern: "^[a-f0-9]{64}$" },
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
    includeViews: { type: "string", enum: ["true", "false"] },
    surface: { type: "string", pattern: "^[a-z][a-z0-9_.-]{0,126}$" },
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
    groupsOnly: { type: "string", enum: ["true"] },
    hierarchy: { type: "string", enum: ["nodes", "orphans", "matches"] },
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
    recordIds: { oneOf: [{ type: "string" }, { type: "array", minItems: 1, maxItems: 100, items: { type: "string" } }] },
    countMode: {
      type: "string",
      enum: ["none", "cached", "approximate", "exact"],
    },
    ...scopeProperties,
  },
} as const;
const contracts = {
  directory: defineRouteContract({
    method: "get",
    path: "/api/entity-runtime/directory",
    operationId: "entityRuntime.directory",
    summary: "List the requested entities the caller may open, with their authorized primary actions",
    tags: ["Entity runtime"],
    authenticated: true,
    request: {
      query: {
        type: "object",
        additionalProperties: false,
        required: ["entity"],
        properties: {
          entity: {
            anyOf: [
              { type: "string", pattern: "^[a-z][a-z0-9_]{0,126}$" },
              { type: "array", maxItems: 50, items: { type: "string", pattern: "^[a-z][a-z0-9_]{0,126}$" } },
            ],
          },
        },
      },
    },
    responses: {
      200: { description: "Entities the caller may list, in request order", body },
      400: { description: "Invalid entity codes" },
    },
  }),
  references: defineRouteContract({method:"get",path:"/api/entity-runtime/:entityCode/references/:fieldKey",operationId:"entityRuntime.referenceChoices",summary:"Search a published Entity key reference under source and target authorization",tags:["Entity runtime"],authenticated:true,request:{query:{type:"object",additionalProperties:false,properties:{query:{type:"string",maxLength:120},cursor:{type:"string",maxLength:4096},value:{type:"string",maxLength:256},recordId:{type:"string",format:"uuid"},dependencies:{type:"string",maxLength:2048}}}},responses:{200:{description:"Authorized reference choices",body:{type:"object",required:["options"],additionalProperties:false,properties:{options:{type:"array",maxItems:25,items:{type:"object",additionalProperties:false,required:["value","label","recordId","entityCode"],properties:{value:{type:"string",maxLength:256},label:{type:"string",maxLength:500},recordId:{type:"string"},entityCode:{type:"string"}}}},nextCursor:{type:"string",maxLength:4096}}}},400:{description:"Invalid lookup"},401:{description:"Authentication required"},403:{description:"Reference forbidden"},409:{description:"Reference context required or ambiguous"}}}),
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
        properties: { mode: { enum: ["create", "edit"] }, recordId: { type: "string", format: "uuid" } },
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
  ownRecord: defineRouteContract({
    method: "get",
    path: "/api/entity-runtime/:entityCode/own-record",
    operationId: "entityRecord.own",
    summary: "Resolve the caller's own record of an owner-scoped entity",
    tags: ["Entity runtime"],
    authenticated: true,
    request: {},
    responses: {
      200: { description: "The caller's own record", body: { type: "object", additionalProperties: false, required: ["recordId"], properties: { recordId: { type: "string", minLength: 1, maxLength: 128 } } } },
      403: { description: "Forbidden" },
      404: { description: "No single own record" },
    },
  }),
  detailRead: defineRouteContract({
    method: "get",
    path: "/api/entity-runtime/:entityCode/records/:recordId/detail",
    operationId: "entityDetail.read",
    summary: "Read an authorized detail descriptor and projected record together",
    tags: ["Entity runtime"],
    authenticated: true,
    request: { query: { type: "object", additionalProperties: false, properties: scopeProperties } },
    responses: {
      200: { description: "Authorized detail read", body: { type: "object", additionalProperties: false,
        required: ["descriptor", "record"], properties: { descriptor: body, record: body } } },
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

/** Entity codes for the directory: canonical, distinct, at most fifty. */
function directoryCodes(value: unknown): readonly string[] {
  const codes = Array.isArray(value) ? value : [value];
  if (!codes.length || codes.length > 50 || codes.some((code) => !isCanonicalEntityCode(code)))
    throw new RecordServiceError(400, "INVALID_ENTITY_CODES", "entity must list up to fifty catalog codes");
  return [...new Set(codes as string[])];
}

export interface EntityDirectoryItemV1 {
  readonly entityCode: string;
  readonly title: string;
  readonly description?: string;
  readonly iconKey?: string;
  /** Records the caller may see, when the list query could count them exactly. */
  readonly count?: number;
  readonly actions: readonly { readonly key: string; readonly label: string; readonly href: string }[];
}

/**
 * The requested entities the caller may open, each compiled through the same
 * authorized list descriptor as the entity list itself. Entities the caller may
 * not list, or that are not published here, are left out, never disclosed. An
 * entity that cannot be served (for example, an authorization profile this plane
 * cannot enforce) is also left out, so one entity never blanks a workspace, and
 * is reported to operators.
 */
export async function entityDirectory(
  lists: Pick<EntityListService, "descriptor"> & Partial<Pick<EntityListService, "list">>,
  context: VerifiedRequestContext,
  codes: readonly string[],
  onUnavailable?: (entityCode: string, error: unknown) => void,
): Promise<{ readonly items: readonly EntityDirectoryItemV1[] }> {
  const results = await Promise.allSettled(codes.map((code) => lists.descriptor(context, code, undefined, undefined)));
  const served = results.flatMap((result, index) => {
    if (result.status === "rejected") {
      const error = result.reason;
      if (!(error instanceof RecordServiceError && [403, 404, 409, 503].includes(error.statusCode)))
        onUnavailable?.(codes[index]!, error);
      return [];
    }
    return [{ code: codes[index]!, descriptor: result.value as EntityListDescriptorV1 }];
  });
  // Record counts go through the same authorized list query as the entity list.
  // A count that is denied, inexact or slow is left out, never shown as zero.
  const counts = await Promise.all(served.map(({ code }) => directoryCount(lists, context, code)));
  const items = served.map(({ code, descriptor }, index): EntityDirectoryItemV1 => {
    const header = descriptor.surface.header, count = counts[index];
    return {
      entityCode: code,
      title: descriptor.surface.title,
      ...(descriptor.surface.description ? { description: descriptor.surface.description } : {}),
      ...(header?.iconKey ? { iconKey: header.iconKey } : {}),
      ...(count === undefined ? {} : { count }),
      actions: descriptor.actions
        .filter((action) => action.placement === "primary" && action.state === "enabled" && action.execution === "navigate" && typeof action.href === "string")
        .map((action) => ({ key: action.key, label: action.label, href: action.href! })),
    };
  });
  return { items };
}

/** Longest a directory waits for one entity's count before leaving it out. */
const DIRECTORY_COUNT_TIMEOUT_MS = 1500;
async function directoryCount(lists: Partial<Pick<EntityListService, "list">>, context: VerifiedRequestContext, entityCode: string): Promise<number | undefined> {
  if (!lists.list) return undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      lists.list({ context, entityCode, limit: 1, fields: [], countMode: "exact" }),
      new Promise<undefined>((resolve) => { timer = setTimeout(() => resolve(undefined), DIRECTORY_COUNT_TIMEOUT_MS); }),
    ]);
    const pagination = result?.pagination;
    return pagination?.countMode === "exact" && typeof pagination.total === "number" ? pagination.total : undefined;
  } catch {
    return undefined;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
