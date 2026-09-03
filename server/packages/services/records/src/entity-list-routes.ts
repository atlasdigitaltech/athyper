import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import { defineRouteContract, HttpError, registerContractRoute } from "@athyper/server-runtime-http";
import type { Application, RequestHandler, Response } from "express";
import type { EntityListService } from "./entity-list-service.js";
import { RecordServiceError } from "./errors.js";
import { MAX_LIST_FIELDS, MAX_LIST_FILTERS, MAX_LIST_SORT_LEVELS } from "./list-limits.js";
import { parseRecordListParameters } from "./records-routes.js";

export interface EntityListRouteOptions { readonly authenticate: RequestHandler; readonly readContext: (response: Response) => VerifiedRequestContext; readonly lists: EntityListService; }

export function registerEntityListRoutes(application: Application, options: EntityListRouteOptions): void {
  registerContractRoute(application, contracts.descriptor, options.authenticate, async (request, response, next) => { try { response.setHeader("Cache-Control", "private, no-store"); response.json(await options.lists.descriptor(options.readContext(response), parameter(request.params["entityCode"]), parseEntityListScopeCoordinate(request.query))); } catch (error) { next(asHttpError(error)); } });
  registerContractRoute(application, contracts.formDescriptor, options.authenticate, async (request, response, next) => { try { response.setHeader("Cache-Control", "private, no-store"); response.json(await options.lists.formDescriptor(options.readContext(response), parameter(request.params["entityCode"]), formMode(request.query["mode"]))); } catch (error) { next(asHttpError(error)); } });
  registerContractRoute(application, contracts.detailDescriptor, options.authenticate, async (request, response, next) => { try { response.setHeader("Cache-Control", "private, no-store"); response.json(await options.lists.detailDescriptor(options.readContext(response), parameter(request.params["entityCode"]))); } catch (error) { next(asHttpError(error)); } });
  registerContractRoute(application, contracts.record, options.authenticate, async (request, response, next) => { try { response.setHeader("Cache-Control", "private, no-store"); response.json(await options.lists.record(options.readContext(response), parameter(request.params["entityCode"]), recordId(request.params["recordId"]))); } catch (error) { next(asHttpError(error)); } });
  registerContractRoute(application, contracts.list, options.authenticate, async (request, response, next) => { try { const scopeCoordinate = parseEntityListScopeCoordinate(request.query); response.setHeader("Cache-Control", "private, no-store"); response.json(await options.lists.list({ context: options.readContext(response), entityCode: parameter(request.params["entityCode"]), ...parseRecordListParameters(request.query), ...(scopeCoordinate ? { scopeCoordinate } : {}) })); } catch (error) { next(asHttpError(error)); } });
}

function parameter(value: string | string[] | undefined): string { const result = Array.isArray(value) ? value[0] : value; if (!result || !/^[a-z][a-z0-9_.-]{0,126}$/.test(result)) throw new RecordServiceError(400, "INVALID_ENTITY_CODE", "entityCode must be a catalog code"); return result; }
function formMode(value: unknown): "create" | "edit" { if (value !== "create" && value !== "edit") throw new RecordServiceError(400, "INVALID_FORM_MODE", "mode must be create or edit"); return value; }
function recordId(value:string|string[]|undefined):string{const result=Array.isArray(value)?value[0]:value;if(!result||result.length>200)throw new RecordServiceError(400,"INVALID_RECORD_ID","recordId is invalid");return result;}
function asHttpError(error: unknown): unknown { return error instanceof RecordServiceError ? new HttpError(error.statusCode, error.code, error.message) : error; }
const body = { type: "object", additionalProperties: true } as const;
const scopeProperties = { companyCodeId: { type: "string", format: "uuid" }, legalEntityId: { type: "string", format: "uuid" }, operatingOrganizationId: { type: "string", format: "uuid" }, networkAccountId: { type: "string", format: "uuid" } } as const;
const descriptorQuery = { type: "object", additionalProperties: false, properties: scopeProperties } as const;
const query = { type: "object", additionalProperties: false, properties: { limit: { type: "string", pattern: "^[0-9]{1,3}$" }, cursor: { type: "string", minLength: 1, maxLength: 4096 }, search: { type: "string", minLength: 1, maxLength: 512 }, fields: { oneOf: [{ type: "string" }, { type: "array", maxItems: MAX_LIST_FIELDS, items: { type: "string" } }] }, group: { type: "string", minLength: 1, maxLength: 127 }, filter: { oneOf: [{ type: "string" }, { type: "array", maxItems: MAX_LIST_FILTERS, items: { type: "string" } }] }, sort: { oneOf: [{ type: "string" }, { type: "array", maxItems: MAX_LIST_SORT_LEVELS, items: { type: "string" } }] }, countMode: { type: "string", enum: ["none", "cached", "approximate", "exact"] }, ...scopeProperties } } as const;
const contracts = {
  descriptor: defineRouteContract({ method: "get", path: "/api/entity-runtime/:entityCode/list-descriptor", operationId: "entityList.descriptor", summary: "Compile an authorized browser-safe entity list descriptor", tags: ["Entity runtime"], authenticated: true, request: { query: descriptorQuery }, responses: { 200: { description: "Safe list descriptor", body }, 400: { description: "Invalid work-context coordinate" }, 403: { description: "Forbidden" }, 404: { description: "Descriptor not found" }, 409: { description: "List surface unavailable" } } }),
  formDescriptor: defineRouteContract({ method: "get", path: "/api/entity-runtime/:entityCode/form-descriptor", operationId: "entityForm.descriptor", summary: "Compile an authorized browser-safe entity form descriptor", tags: ["Entity runtime"], authenticated: true, request: { query: { type: "object", additionalProperties: false, required: ["mode"], properties: { mode: { enum: ["create", "edit"] } } } }, responses: { 200: { description: "Safe form descriptor", body }, 403: { description: "Forbidden" }, 404: { description: "Descriptor not found" }, 409: { description: "Form operation unavailable" } } }),
  detailDescriptor: defineRouteContract({ method: "get", path: "/api/entity-runtime/:entityCode/detail-descriptor", operationId: "entityDetail.descriptor", summary: "Compile an authorized browser-safe entity detail descriptor", tags: ["Entity runtime"], authenticated: true, request: {}, responses: { 200: { description: "Safe detail descriptor", body }, 403: { description: "Forbidden" }, 404: { description: "Descriptor not found" }, 409: { description: "Detail operation unavailable" } } }),
  record: defineRouteContract({ method: "get", path: "/api/entity-runtime/:entityCode/records/:recordId", operationId: "entityDetail.record", summary: "Read an authorized record in a storage-independent envelope", tags: ["Entity runtime"], authenticated: true, request: {}, responses: { 200: { description: "Normalized record", body }, 403: { description: "Forbidden" }, 404: { description: "Record not found" }, 503: { description: "Adapter unavailable" } } }),
  list: defineRouteContract({ method: "get", path: "/api/entity-runtime/:entityCode/list", operationId: "entityList.list", summary: "Query an authorized normalized entity list", tags: ["Entity runtime"], authenticated: true, request: { query }, responses: { 200: { description: "Normalized entity list page", body }, 400: { description: "Invalid list query or work-context coordinate" }, 403: { description: "Forbidden" }, 409: { description: "Validated work context required" } } }),
} as const;

export function parseEntityListScopeCoordinate(queryValue: Readonly<Record<string, unknown>>) {
  const companyCodeId = optionalUuid(queryValue["companyCodeId"], "companyCodeId");
  const legalEntityId = optionalUuid(queryValue["legalEntityId"], "legalEntityId");
  const operatingOrganizationId = optionalUuid(queryValue["operatingOrganizationId"], "operatingOrganizationId");
  const networkAccountId = optionalUuid(queryValue["networkAccountId"], "networkAccountId");
  if (Boolean(companyCodeId) !== Boolean(legalEntityId)) throw new RecordServiceError(400, "INVALID_WORK_CONTEXT", "companyCodeId and legalEntityId must be supplied together");
  if (!companyCodeId && !operatingOrganizationId && !networkAccountId) return undefined;
  return Object.freeze({ ...(companyCodeId ? { companyCodeId, legalEntityId: legalEntityId as string } : {}), ...(operatingOrganizationId ? { operatingOrganizationId } : {}), ...(networkAccountId ? { networkAccountId } : {}) });
}

function optionalUuid(value: unknown, name: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new RecordServiceError(400, "INVALID_WORK_CONTEXT", `${name} must be a UUID`);
  return value.toLowerCase();
}
