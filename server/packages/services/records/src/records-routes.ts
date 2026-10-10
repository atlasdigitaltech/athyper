import { isEntityRecordId } from "@athyper/contract-platform-entity-runtime";
import { parseEntityListScopeCoordinate } from "./list-scope-coordinate.js";
import { ENTITY_LIST_RELATIVE_DATE_VALUES } from "@athyper/contract-platform-entity-list";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { ListRecordsQuery, RecordFilter, RecordFilterOperator, RecordMutationResult, RecordMutationService, RecordQueryService, RecordSort } from "@athyper/server-contract-records";
import { HttpError, defineRouteContract, registerContractRoute } from "@athyper/server-runtime-http";
import type { Application, Request, RequestHandler, Response } from "express";
import { RecordServiceError } from "./errors.js";
import { MAX_LIST_FIELDS, MAX_LIST_FILTERS, MAX_LIST_SORT_LEVELS } from "./list-limits.js";

export interface RecordsRouteOptions {
  readonly authenticate: RequestHandler;
  readonly readContext: (response: Response) => VerifiedRequestContext;
  readonly queries: RecordQueryService;
  readonly mutations: RecordMutationService;
}

export function registerRecordsRoutes(application: Application, options: RecordsRouteOptions): void {
  registerContractRoute(application, contracts.list, options.authenticate, async (request, response, next) => { try { response.json(await options.queries.list({ context: options.readContext(response), entityCode: param(request.params["entityCode"], "entityCode"), ...parseRecordListParameters(request.query) })); } catch (error) { sendError(error, next); } });
  registerContractRoute(application, contracts.get, options.authenticate, async (request, response, next) => { try { const result = await options.queries.get({ scopeCoordinate: parseEntityListScopeCoordinate(request.query), context: options.readContext(response), entityCode: param(request.params["entityCode"], "entityCode"), recordId: param(request.params["recordId"], "recordId") }); response.status(result.data ? 200 : 404).json(result); } catch (error) { sendError(error, next); } });
  registerContractRoute(application, contracts.create, options.authenticate, async (request, response, next) => { try { sendMutation(await options.mutations.create({ scopeCoordinate: parseEntityListScopeCoordinate(request.query), context: options.readContext(response), entityCode: param(request.params["entityCode"], "entityCode"), input: body(request.body), origin: "classic", validationMode: "strict", idempotencyKey: header(request.headers["idempotency-key"]) }), request, response, next); } catch (error) { sendError(error, next); } });
  registerContractRoute(application, contracts.patch, options.authenticate, async (request, response, next) => { try { sendMutation(await options.mutations.patch({ context: options.readContext(response), entityCode: param(request.params["entityCode"], "entityCode"), recordId: param(request.params["recordId"], "recordId"), input: body(request.body), origin: "classic", validationMode: "strict", expectedVersion: integerHeader(request.headers["if-match"]), idempotencyKey: header(request.headers["idempotency-key"]) }), request, response, next); } catch (error) { sendError(error, next); } });
  registerContractRoute(application, contracts.delete, options.authenticate, async (request, response, next) => { try { sendMutation(await options.mutations.delete({ context: options.readContext(response), entityCode: param(request.params["entityCode"], "entityCode"), recordId: param(request.params["recordId"], "recordId"), origin: "classic", validationMode: "strict", expectedVersion: integerHeader(request.headers["if-match"]), idempotencyKey: header(request.headers["idempotency-key"]) }), request, response, next); } catch (error) { sendError(error, next); } });
  registerContractRoute(application, contracts.transition, options.authenticate, async (request, response, next) => { try { sendMutation(await options.mutations.transition({ context: options.readContext(response), entityCode: param(request.params["entityCode"], "entityCode"), recordId: param(request.params["recordId"], "recordId"), transitionCode: param(request.params["transitionCode"], "transitionCode"), input: body(request.body), origin: "classic", validationMode: "strict", expectedVersion: integerHeader(request.headers["if-match"]), idempotencyKey: header(request.headers["idempotency-key"]) }), request, response, next); } catch (error) { sendError(error, next); } });
}

export function sendMutation(result: RecordMutationResult, request: Request, response: Response, next: (error: unknown) => void): void {
  if (result.kind === "Committed") { response.status(result.action === "create" && !result.replayed ? 201 : 200).json(result); return; }
  const status: Record<string, number> = { NotFound: 404, CapabilityUnavailable: 409, IncompatibleAction: 409, Forbidden: 403, VersionRequired: 428, VersionConflict: 409, FieldsNotWritable: 422, ValidationFailed: 422, LockRequired: 423, InvalidTransition: 409 };
  const idempotencyStatus = result.kind === "IdempotencyConflict" ? (result.reason === "required" ? 428 : result.reason === "invalid" ? 400 : 409) : undefined;
  next(new HttpError(idempotencyStatus ?? status[result.kind] ?? 500, `RECORD_${result.kind.replace(/([a-z])([A-Z])/g, "$1_$2").toUpperCase()}`, mutationDetail(result), { result, method: request.method }));
}
function mutationDetail(result: Exclude<RecordMutationResult, { kind: "Committed" }>): string { if (result.kind === "IdempotencyConflict") return `Idempotency key is ${result.reason.replace("_", " ")}`; if (result.kind === "Forbidden") return "The verified principal is not allowed to perform this mutation"; if (result.kind === "NotFound") return "The requested record was not found"; return `Record mutation failed: ${result.kind}`; }
function sendError(error: unknown, next: (error: unknown) => void): void { next(error instanceof RecordServiceError ? new HttpError(error.statusCode, error.code, error.message, error.params ? { params: error.params } : undefined) : error); }
function body(value: unknown): Readonly<Record<string, unknown>> { if (!value || typeof value !== "object" || Array.isArray(value)) throw new RecordServiceError(400, "INVALID_BODY", "JSON object required"); return value as Readonly<Record<string, unknown>>; }
function header(value: string | string[] | undefined): string | undefined { const first = Array.isArray(value) ? value[0] : value; return first?.trim() || undefined; }
function integerHeader(value: string | string[] | undefined): number | undefined { const raw = header(value)?.replace(/^"|"$/g, ""); if (!raw) return undefined; const parsed = Number(raw); if (!Number.isInteger(parsed) || parsed < 0) throw new RecordServiceError(400, "INVALID_VERSION", "If-Match must contain a non-negative integer"); return parsed; }
function stringQuery(value: unknown): string | undefined { return typeof value === "string" && value.trim() ? value.trim() : undefined; }
function integerQuery(value: unknown): number | undefined { if (value === undefined) return undefined; const parsed = Number(value); if (!Number.isInteger(parsed)) throw new RecordServiceError(400, "INVALID_LIMIT", "limit must be an integer"); return parsed; }
function param(value: string | string[] | undefined, name: string): string { const result = Array.isArray(value) ? value[0] : value; if (!result) throw new RecordServiceError(400, "INVALID_ROUTE_PARAMETER", `${name} is required`); return result; }

const objectSchema = { type: "object", additionalProperties: true } as const;
const problemResponses = { 404: { description: "Record not found" }, 423: { description: "Record lock required" }, 400: { description: "Invalid request" }, 401: { description: "Authentication required" }, 403: { description: "Forbidden" }, 409: { description: "Conflict" }, 422: { description: "Validation failed" }, 428: { description: "Precondition required" } } as const;
const contracts = {
  list: defineRouteContract({ method: "get", path: "/api/records/:entityCode", operationId: "records.list", summary: "List records", tags: ["Records"], authenticated: true, request: { query: { type: "object", additionalProperties: false, properties: { limit: { type: "string", pattern: "^[0-9]{1,3}$" }, cursor: { type: "string", minLength: 1, maxLength: 4096 }, search: { type: "string", minLength: 1, maxLength: 512 }, fields: { oneOf: [{ type: "string" }, { type: "array", maxItems: MAX_LIST_FIELDS, items: { type: "string" } }] }, group: { type: "string", minLength: 1, maxLength: 140 }, aggregate: { oneOf: [{ type: "string" }, { type: "array", maxItems: 5, items: { type: "string" } }] }, timeZone: { type: "string", minLength: 1, maxLength: 64 }, groupsOnly: { type: "string", enum: ["true"] }, totals: { type: "string", enum: ["true"] }, pivot: { type: "string", minLength: 1, maxLength: 140 }, pivotValue: { oneOf: [{ type: "string" }, { type: "array", maxItems: 12, items: { type: "string" } }] }, groupOrder: { type: "string", minLength: 1, maxLength: 140 }, groupLimit: { type: "string", enum: ["5", "10", "20", "50"] }, hierarchy: { type: "string", enum: ["nodes", "orphans", "matches"] }, rank: { type: "string", minLength: 1, maxLength: 127 }, matrixColumns: { oneOf: [{ type: "string" }, { type: "array", minItems: 1, maxItems: 100, items: { type: "string" } }] }, filter: { oneOf: [{ type: "string" }, { type: "array", maxItems: MAX_LIST_FILTERS, items: { type: "string" } }] }, sort: { oneOf: [{ type: "string" }, { type: "array", maxItems: MAX_LIST_SORT_LEVELS, items: { type: "string" } }] }, countMode: { type: "string", enum: ["none", "cached", "approximate", "exact"] }, hydrateReferences: { type: "string", enum: ["true", "false"] } } } }, responses: { 200: { description: "Record page", body: objectSchema }, 401: problemResponses[401], 403: problemResponses[403] } }),
  get: defineRouteContract({
    method: "get", path: "/api/records/:entityCode/:recordId", operationId: "records.get",
    summary: "Get a record", tags: ["Records"], authenticated: true,
    request: { query: { type: "object", additionalProperties: false, properties: {
      parentEntityCode: { type: "string", pattern: "^[a-z][a-z0-9_]{1,62}$" },
      parentRecordId: { type: "string", format: "uuid" },
      relationshipKey: { type: "string", pattern: "^[a-z][a-z0-9_]{1,62}$" },
      parentDescriptorHash: { type: "string", pattern: "^[a-f0-9]{64}$" },
    } } },
    responses: { 200: { description: "Record", body: objectSchema }, 404: { description: "Not found" } },
  }),
  create: defineRouteContract({ method: "post", path: "/api/records/:entityCode", operationId: "records.create", summary: "Create a record", tags: ["Records"], authenticated: true, request: { query: {type:"object",additionalProperties:false,properties:{parentEntityCode:{type:"string",pattern:"^[a-z][a-z0-9_]{1,62}$"},parentRecordId:{type:"string",format:"uuid"},relationshipKey:{type:"string",pattern:"^[a-z][a-z0-9_]{1,62}$"},parentDescriptorHash:{type:"string",pattern:"^[a-f0-9]{64}$"}}}, headers: { type: "object", properties: { "Idempotency-Key": { type: "string", minLength: 16, maxLength: 128 } }, required: ["Idempotency-Key"] }, body: objectSchema }, responses: { 200: { description: "Idempotent creation replay", body: objectSchema }, 201: { description: "Created", body: objectSchema }, ...problemResponses } }),
  patch: defineRouteContract({ method: "patch", path: "/api/records/:entityCode/:recordId", operationId: "records.patch", summary: "Patch a record", tags: ["Records"], authenticated: true, request: { headers: { type: "object", properties: { "Idempotency-Key": { type: "string", minLength: 16, maxLength: 128 }, "If-Match": { type: "integer", minimum: 0 } }, required: ["Idempotency-Key"] }, body: objectSchema }, responses: { 200: { description: "Patched", body: objectSchema }, ...problemResponses } }),
  delete: defineRouteContract({ method: "delete", path: "/api/records/:entityCode/:recordId", operationId: "records.delete", summary: "Delete a record", tags: ["Records"], authenticated: true, request: { headers: { type: "object", properties: { "Idempotency-Key": { type: "string", minLength: 16, maxLength: 128 }, "If-Match": { type: "integer", minimum: 0 } }, required: ["Idempotency-Key"] } }, responses: { 200: { description: "Deleted", body: objectSchema }, ...problemResponses } }),
  transition: defineRouteContract({ method: "post", path: "/api/records/:entityCode/:recordId/transitions/:transitionCode", operationId: "records.transition", summary: "Transition a record", tags: ["Records"], authenticated: true, request: { headers: { type: "object", properties: { "Idempotency-Key": { type: "string", minLength: 16, maxLength: 128 }, "If-Match": { type: "integer", minimum: 0 } }, required: ["Idempotency-Key"] }, body: objectSchema }, responses: { 200: { description: "Transitioned", body: objectSchema }, ...problemResponses } }),
} as const;

type RecordListParameters = Omit<ListRecordsQuery, "context" | "entityCode">;
const FILTER_OPERATORS = new Set<RecordFilterOperator>(["eq", "ne", "in", "contains", "starts_with", "gt", "gte", "lt", "lte", "between", "is_null", "is_not_null", "relative"]);
const RELATIVE_DATE_VALUES = new Set<string>(ENTITY_LIST_RELATIVE_DATE_VALUES);

export function parseRecordListParameters(query: Readonly<Record<string, unknown>>): RecordListParameters {
  const recordIds = query["recordIds"] === undefined ? undefined : queryValues(query["recordIds"], "recordIds", 100);
  if (recordIds && (!recordIds.length || recordIds.some(id => !isEntityRecordId(id)))) throw new RecordServiceError(400, "INVALID_RECORD_IDS", "recordIds must contain valid record identities");
  const limit = integerQuery(query["limit"]);
  const cursor = boundedQueryText(query["cursor"], "cursor", 4096);
  const search = boundedQueryText(query["search"], "search", 512);
  const fields = queryValues(query["fields"], "fields", MAX_LIST_FIELDS).map((value, index) => catalogQueryCode(value, `fields[${index}]`));
  // `field` or, for a date field, `field:month` / `field:quarter` (Tree blueprint A3).
  const groupSpec = query["group"] === undefined ? undefined : boundedQueryText(query["group"], "group", 140);
  const [groupKey, groupUnit, ...groupRest] = groupSpec?.split(":") ?? [];
  if (groupSpec !== undefined && (groupRest.length || (groupUnit !== undefined && groupUnit !== "month" && groupUnit !== "quarter")))
    throw new RecordServiceError(400, "LIST_GROUP_INVALID", "group must be a field, or a date field with :month or :quarter");
  const group = groupKey === undefined ? undefined : catalogQueryCode(groupKey, "group");
  const timeZone = boundedQueryText(query["timeZone"], "timeZone", 64);
  const groupBucket = groupUnit ? { unit: groupUnit as "month" | "quarter", ...(timeZone ? { timeZone } : {}) } : undefined;
  // Per-group aggregates (A2): repeated field:aggregate values.
  const groupAggregates = queryValues(query["aggregate"], "aggregate", 5).map((value) => {
    const [field, aggregate, ...rest] = value.split(":");
    if (rest.length || !field || !["countDistinct", "sum", "average", "minimum", "maximum"].includes(aggregate ?? ""))
      throw new RecordServiceError(400, "LIST_GROUP_AGGREGATE_INVALID", "aggregate must be field:countDistinct, field:sum, field:average, field:minimum or field:maximum");
    return Object.freeze({ field: catalogQueryCode(field, "aggregate"), aggregate: aggregate as "countDistinct" | "sum" | "average" | "minimum" | "maximum" });
  });
  const filters = queryValues(query["filter"], "filter", MAX_LIST_FILTERS).map(parseFilter);
  // Admission is capped here at the contract maximum; the Entity descriptor
  // applies its lower per-list maxSortLevels limit in the query service.
  const sort = queryValues(query["sort"], "sort", MAX_LIST_SORT_LEVELS).map(parseSort);
  const countMode = query["countMode"] === undefined ? undefined : oneOfQuery(query["countMode"], ["none", "cached", "approximate", "exact"] as const, "countMode");
  const groupsOnly = query["groupsOnly"] === undefined ? false : oneOfQuery(query["groupsOnly"], ["true"] as const, "groupsOnly") === "true";
  // Rejected, never silently ignored, so a caller cannot believe it received
  // counts it did not (Tree blueprint section 5.1).
  if (groupsOnly && (!group || countMode !== "exact" || cursor))
    throw new RecordServiceError(400, "LIST_GROUPS_ONLY_INVALID", "groupsOnly requires group and countMode=exact, without a cursor");
  // A Summary request (Entity list Aggregate blueprint 5.4): groups only, with
  // the total over every group; admitted against the declaration by the service.
  const groupTotals = query["totals"] === undefined ? false : oneOfQuery(query["totals"], ["true"] as const, "totals") === "true";
  if (groupTotals && !groupsOnly)
    throw new RecordServiceError(400, "LIST_AGGREGATE_INVALID", "totals requires groupsOnly");
  // A Summary's column dimension (Aggregate A2): `field` or `field:month|quarter`,
  // and an expansion's kept column values, each a JSON string or null.
  const pivotSpec = query["pivot"] === undefined ? undefined : boundedQueryText(query["pivot"], "pivot", 140);
  const [pivotKey, pivotUnit, ...pivotRest] = pivotSpec?.split(":") ?? [];
  if (pivotSpec !== undefined && (!groupTotals || pivotRest.length || (pivotUnit !== undefined && pivotUnit !== "month" && pivotUnit !== "quarter")))
    throw new RecordServiceError(400, "LIST_AGGREGATE_INVALID", "pivot is a Summary column: a field, or a date field with :month or :quarter, with totals");
  const pivot = pivotKey === undefined ? undefined : catalogQueryCode(pivotKey, "pivot");
  const pivotValues = queryValues(query["pivotValue"], "pivotValue", 12).map((raw) => {
    let value: unknown;
    try { value = JSON.parse(raw); } catch { throw new RecordServiceError(400, "LIST_AGGREGATE_INVALID", "pivotValue must be JSON"); }
    if (value !== null && typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean")
      throw new RecordServiceError(400, "LIST_AGGREGATE_INVALID", "pivotValue must be a scalar or null");
    return value === null ? null : String(value);
  });
  if (pivotValues.length && !pivot) throw new RecordServiceError(400, "LIST_AGGREGATE_INVALID", "pivotValue requires pivot");
  // Top / Bottom N (Aggregate A6): `count:desc` or `field:aggregate:asc`, with
  // a limit of 5, 10, 20 or 50; both or neither, and only on a Summary request.
  const groupOrderSpec = query["groupOrder"] === undefined ? undefined : boundedQueryText(query["groupOrder"], "groupOrder", 140);
  const groupLimitSpec = query["groupLimit"] === undefined ? undefined : oneOfQuery(query["groupLimit"], ["5", "10", "20", "50"] as const, "groupLimit");
  let groupOrder: RecordListParameters["groupOrder"];
  if (groupOrderSpec !== undefined || groupLimitSpec !== undefined) {
    const parts = groupOrderSpec?.split(":") ?? [];
    const direction = parts.pop();
    const key = parts.join(":");
    const measure = /^(count|[a-z][a-z0-9_]*:(countDistinct|sum|average|minimum|maximum))$/.test(key);
    if (!groupTotals || !groupLimitSpec || !measure || (direction !== "asc" && direction !== "desc"))
      throw new RecordServiceError(400, "LIST_AGGREGATE_INVALID", "groupOrder is count or field:aggregate with :asc or :desc, given with groupLimit, on a Summary request");
    groupOrder = Object.freeze({ key, direction, limit: Number(groupLimitSpec) as 5 | 10 | 20 | 50 });
  }
  const hierarchy = query["hierarchy"] === undefined ? undefined : oneOfQuery(query["hierarchy"], ["nodes", "orphans", "matches"] as const, "hierarchy");
  // A tree level is never also grouped.
  if (hierarchy && group) throw new RecordServiceError(400, "LIST_HIERARCHY_INVALID", "hierarchy cannot be combined with group");
  // Matches are one bounded response: no cursor and no record restriction.
  if (hierarchy === "matches" && (cursor || recordIds))
    throw new RecordServiceError(400, "LIST_HIERARCHY_INVALID", "hierarchy=matches cannot be combined with a cursor or recordIds");
  // Matrix rank (Matrix blueprint 5.4 point 3): a measure key and the
  // participant page; admitted against the published Matrix by the service.
  const rank = query["rank"] === undefined ? undefined : catalogQueryCode(query["rank"], "rank");
  const matrixColumns = query["matrixColumns"] === undefined ? undefined : queryValues(query["matrixColumns"], "matrixColumns", 100);
  if (matrixColumns && matrixColumns.some((id) => !isEntityRecordId(id))) throw new RecordServiceError(400, "INVALID_MATRIXCOLUMNS", "matrixColumns must contain valid record identities");
  const hydrateReferences = query["hydrateReferences"] === undefined ? undefined : oneOfQuery(query["hydrateReferences"], ["true", "false"] as const, "hydrateReferences") === "true";
  return {
    ...(recordIds ? { recordIds: Object.freeze([...new Set(recordIds)]) } : {}),
    ...(limit !== undefined ? { limit } : {}),
    ...(cursor ? { cursor } : {}),
    ...(search ? { search } : {}),
    ...(fields.length ? { fields: Object.freeze([...new Set(fields)]) } : {}),
    ...(group ? { group } : {}),
    ...(groupBucket ? { groupBucket } : {}),
    ...(groupAggregates.length ? { groupAggregates: Object.freeze(groupAggregates) } : {}),
    ...(groupsOnly ? { groupsOnly } : {}),
    ...(groupTotals ? { groupTotals } : {}),
    ...(pivot ? { pivot } : {}),
    ...(pivotUnit ? { pivotBucket: { unit: pivotUnit as "month" | "quarter", ...(timeZone ? { timeZone } : {}) } } : {}),
    ...(pivotValues.length ? { pivotValues: Object.freeze(pivotValues) } : {}),
    ...(groupOrder ? { groupOrder } : {}),
    ...(hierarchy ? { hierarchy } : {}),
    ...(filters.length ? { filters } : {}),
    ...(sort.length ? { sort } : {}),
    ...(countMode ? { countMode } : {}),
    ...(hydrateReferences !== undefined ? { hydrateReferences } : {}),
    ...(rank ? { rank } : {}),
    ...(matrixColumns ? { matrixColumns: Object.freeze([...new Set(matrixColumns)]) } : {}),
  };
}

function parseFilter(value: string, index: number): RecordFilter {
  const parsed = queryJson(value, `filter[${index}]`);
  const field = catalogQueryCode(parsed["field"], `filter[${index}].field`);
  const operator = parsed["operator"];
  if (typeof operator !== "string" || !FILTER_OPERATORS.has(operator as RecordFilterOperator)) throw new RecordServiceError(400, "INVALID_FILTER", `filter[${index}].operator is invalid`);
  const hasValue = Object.hasOwn(parsed, "value");
  const presence = operator === "is_null" || operator === "is_not_null";
  if (presence && hasValue) throw new RecordServiceError(400, "INVALID_FILTER", `filter[${index}] must not contain a value`);
  if (!presence && !hasValue) throw new RecordServiceError(400, "INVALID_FILTER", `filter[${index}].value is required`);
  if (operator === "in" && (!Array.isArray(parsed["value"]) || parsed["value"].length === 0 || parsed["value"].length > 100)) throw new RecordServiceError(400, "INVALID_FILTER", `filter[${index}].value must be a non-empty array of at most 100 values`);
  if (operator === "between" && (!Array.isArray(parsed["value"]) || parsed["value"].length !== 2)) throw new RecordServiceError(400, "INVALID_FILTER", `filter[${index}].value must contain exactly two bounds`);
  if ((operator === "contains" || operator === "starts_with") && typeof parsed["value"] !== "string") throw new RecordServiceError(400, "INVALID_FILTER", `filter[${index}].value must be a string`);
  if (operator === "relative" && (typeof parsed["value"] !== "string" || !RELATIVE_DATE_VALUES.has(parsed["value"]))) throw new RecordServiceError(400, "INVALID_FILTER", `filter[${index}].value is not a supported relative date`);
  return Object.freeze({ field, operator: operator as RecordFilterOperator, ...(hasValue ? { value: parsed["value"] } : {}) });
}

function parseSort(value: string, index: number): RecordSort {
  const parsed = value.trim().startsWith("{") ? queryJson(value, `sort[${index}]`) : compactSort(value, index);
  const nulls = parsed["nulls"] === undefined ? undefined : oneOfQuery(parsed["nulls"], ["first", "last"] as const, `sort[${index}].nulls`);
  return Object.freeze({ field: catalogQueryCode(parsed["field"], `sort[${index}].field`), direction: oneOfQuery(parsed["direction"], ["asc", "desc"] as const, `sort[${index}].direction`), ...(nulls ? { nulls } : {}) });
}

function compactSort(value: string, index: number): Record<string, unknown> { const [field, direction, nulls, extra] = value.split(":"); if (extra !== undefined) throw new RecordServiceError(400, "INVALID_SORT", `sort[${index}] is invalid`); return { field, direction, ...(nulls ? { nulls } : {}) }; }
function queryJson(value: string, name: string): Record<string, unknown> { try { const parsed: unknown = JSON.parse(value); if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(); return parsed as Record<string, unknown>; } catch { throw new RecordServiceError(400, name.startsWith("filter") ? "INVALID_FILTER" : "INVALID_SORT", `${name} must be a JSON object`); } }
function queryValues(value: unknown, name: string, maximum: number): string[] { if (value === undefined) return []; const values = Array.isArray(value) ? value : [value]; if (values.length > maximum || values.some((item) => typeof item !== "string" || !item.trim())) throw new RecordServiceError(400, `INVALID_${name.toUpperCase()}`, `${name} must contain at most ${maximum} non-empty values`); return values as string[]; }
function boundedQueryText(value: unknown, name: string, maximum: number): string | undefined { const result = stringQuery(value); if (result && result.length > maximum) throw new RecordServiceError(400, `INVALID_${name.toUpperCase()}`, `${name} must not exceed ${maximum} characters`); return result; }
function catalogQueryCode(value: unknown, name: string): string { if (typeof value !== "string" || !/^[a-z][a-z0-9_.-]{0,126}$/.test(value)) throw new RecordServiceError(400, queryCodeError(name), `${name} must be a catalog code`); return value; }
function queryCodeError(name: string): string { if (name.startsWith("filter")) return "INVALID_FILTER"; if (name.startsWith("sort")) return "INVALID_SORT"; if (name.startsWith("fields")) return "INVALID_FIELDS"; if (name === "rank") return "INVALID_RANK"; return "INVALID_GROUP"; }
function oneOfQuery<const T extends readonly string[]>(value: unknown, choices: T, name: string): T[number] { if (typeof value !== "string" || !choices.includes(value as T[number])) throw new RecordServiceError(400, `INVALID_${name.split(".")[0]!.split("[")[0]!.toUpperCase()}`, `${name} is invalid`); return value as T[number]; }
