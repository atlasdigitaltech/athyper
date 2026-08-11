import type { Application, Request, RequestHandler } from "express";
import { HttpError } from "./http-error.js";

export type HttpMethod = "get" | "post" | "put" | "patch" | "delete";
export type JsonSchema = Readonly<Record<string, unknown>>;

/** Supports JSON Schema and schema libraries such as Zod without coupling the runtime to one library. */
export type RuntimeSchema = JsonSchema | {
  readonly parse?: (value: unknown) => unknown;
  readonly safeParse?: (value: unknown) => { readonly success: boolean; readonly data?: unknown; readonly error?: unknown };
  readonly toJSONSchema?: () => JsonSchema;
};

export interface RouteContract {
  readonly method: HttpMethod;
  readonly path: string;
  readonly operationId: string;
  readonly summary: string;
  readonly tags?: readonly string[];
  readonly permission?: string;
  readonly authenticated?: boolean;
  readonly request?: {
    readonly headers?: RuntimeSchema;
    readonly params?: RuntimeSchema;
    readonly query?: RuntimeSchema;
    readonly body?: RuntimeSchema;
  };
  readonly responses: Readonly<Record<number, { readonly description: string; readonly body?: RuntimeSchema }>>;
}

export interface ContractIssue {
  readonly code: "DUPLICATE_OPERATION_ID" | "DUPLICATE_ROUTE" | "UNDOCUMENTED_ROUTE" | "MISSING_PERMISSION";
  readonly message: string;
}

const ROUTES = Symbol.for("athyper.http.route-contracts");

export function defineRouteContract<const Contract extends RouteContract>(contract: Contract): Contract {
  if (!/^[A-Za-z][A-Za-z0-9._-]{2,127}$/.test(contract.operationId)) throw new TypeError(`Invalid HTTP operationId: ${contract.operationId}`);
  return Object.freeze(contract);
}

export function registerContractRoute(application: Application, contract: RouteContract, ...handlers: readonly RequestHandler[]): void {
  const issues = inspectContractAddition(routeContracts(application), contract);
  if (issues.length) throw new Error(issues[0]!.message);
  routeContracts(application).push(contract);
  application[contract.method](contract.path, contractValidator(contract), ...handlers);
}

export function routeContracts(application: Application): RouteContract[] {
  const target = application as Application & { [ROUTES]?: RouteContract[] };
  return target[ROUTES] ??= [];
}

export function auditRouteContracts(application: Application, ignoredPaths: readonly string[] = []): readonly ContractIssue[] {
  const contracts = routeContracts(application);
  const issues: ContractIssue[] = [];
  const ids = new Set<string>();
  const routes = new Set<string>();
  for (const contract of contracts) {
    if (contract.authenticated && !contract.permission) issues.push({ code: "MISSING_PERMISSION", message: `Authenticated HTTP operation lacks permission metadata: ${contract.operationId}` });
    if (ids.has(contract.operationId)) issues.push({ code: "DUPLICATE_OPERATION_ID", message: `Duplicate HTTP operationId: ${contract.operationId}` });
    ids.add(contract.operationId);
    const key = `${contract.method} ${contract.path}`;
    if (routes.has(key)) issues.push({ code: "DUPLICATE_ROUTE", message: `Duplicate HTTP route contract: ${contract.method.toUpperCase()} ${contract.path}` });
    routes.add(key);
  }
  for (const route of expressRoutes(application)) {
    if (!routes.has(`${route.method} ${route.path}`) && !ignoredPaths.includes(route.path)) {
      issues.push({ code: "UNDOCUMENTED_ROUTE", message: `Undocumented HTTP route: ${route.method.toUpperCase()} ${route.path}` });
    }
  }
  return issues;
}

export function assertRouteContracts(application: Application, ignoredPaths: readonly string[] = []): void {
  const issues = auditRouteContracts(application, ignoredPaths);
  if (issues.length) throw new Error(issues.map((issue) => issue.message).join("\n"));
}

export function createOpenApiDocument(application: Application, info: { readonly title: string; readonly version: string }): Readonly<Record<string, unknown>> {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const route of routeContracts(application)) {
    const path = route.path.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
    const operation: Record<string, unknown> = {
      operationId: route.operationId, summary: route.summary, tags: route.tags ?? [],
      ...(route.permission ? { "x-athyper-permission": route.permission } : {}),
      responses: Object.fromEntries(Object.entries(route.responses).map(([status, response]) => [status, {
        description: response.description,
        ...(response.body ? { content: { "application/json": { schema: jsonSchema(response.body) } } } : {}),
      }])),
    };
    if (route.authenticated) operation["security"] = [{ bearerAuth: [] }];
    const parameters: Array<Record<string, unknown>> = [];
    for (const match of route.path.matchAll(/:([A-Za-z0-9_]+)/g)) parameters.push({ name: match[1], in: "path", required: true, schema: { type: "string" } });
    addSchemaParameters(parameters, "header", route.request?.headers);
    addSchemaParameters(parameters, "query", route.request?.query);
    if (parameters.length) operation["parameters"] = parameters;
    if (route.request?.body) operation["requestBody"] = { required: true, content: { "application/json": { schema: jsonSchema(route.request.body) } } };
    paths[path] ??= {};
    paths[path]![route.method] = operation;
  }
  return { openapi: "3.1.0", info, paths, components: { securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" } } } };
}

export function createTypescriptClientContracts(document: Readonly<Record<string, unknown>>): string {
  const paths = document["paths"] as Record<string, Record<string, { operationId?: string }>> | undefined;
  const operations = Object.entries(paths ?? {}).flatMap(([path, methods]) => Object.entries(methods).map(([method, operation]) => ({ path, method, operationId: operation.operationId }))).filter((item): item is { path: string; method: string; operationId: string } => Boolean(item.operationId)).sort((a, b) => a.operationId.localeCompare(b.operationId));
  return `// Generated from OpenAPI. Do not edit.\nexport const operations = ${JSON.stringify(Object.fromEntries(operations.map((item) => [item.operationId, { method: item.method.toUpperCase(), path: item.path }])), null, 2)} as const;\nexport type OperationId = keyof typeof operations;\n`;
}

function inspectContractAddition(contracts: readonly RouteContract[], contract: RouteContract): ContractIssue[] {
  if (contracts.some((item) => item.operationId === contract.operationId)) return [{ code: "DUPLICATE_OPERATION_ID", message: `Duplicate HTTP operationId: ${contract.operationId}` }];
  if (contracts.some((item) => item.method === contract.method && item.path === contract.path)) return [{ code: "DUPLICATE_ROUTE", message: `Duplicate HTTP route contract: ${contract.method.toUpperCase()} ${contract.path}` }];
  return [];
}

function jsonSchema(schema: RuntimeSchema): JsonSchema {
  if ("toJSONSchema" in schema && typeof schema.toJSONSchema === "function") return schema.toJSONSchema();
  return schema as JsonSchema;
}

function addSchemaParameters(target: Array<Record<string, unknown>>, location: "header" | "query", runtimeSchema: RuntimeSchema | undefined): void {
  if (!runtimeSchema) return;
  const schema = jsonSchema(runtimeSchema);
  const properties = schema["properties"] && typeof schema["properties"] === "object" ? schema["properties"] as Record<string, unknown> : {};
  const required = Array.isArray(schema["required"]) ? schema["required"].filter((item): item is string => typeof item === "string") : [];
  for (const name of new Set([...Object.keys(properties), ...required])) target.push({ name, in: location, required: required.includes(name), schema: properties[name] ?? { type: "string" } });
}

function expressRoutes(application: Application): Array<{ method: HttpMethod; path: string }> {
  const router = (application as unknown as { router?: { stack?: Array<{ route?: { path?: unknown; methods?: Record<string, boolean> } }> } }).router;
  return (router?.stack ?? []).flatMap((layer) => {
    if (!layer.route || typeof layer.route.path !== "string") return [];
    return Object.entries(layer.route.methods ?? {}).filter(([, enabled]) => enabled).map(([method]) => ({ method: method as HttpMethod, path: layer.route!.path as string })).filter((item) => ["get", "post", "put", "patch", "delete"].includes(item.method));
  });
}

export function validateRuntimeSchema(schema: RuntimeSchema, value: unknown): unknown {
  if ("safeParse" in schema && typeof schema.safeParse === "function") {
    const result = schema.safeParse(value); if (!result.success) throw result.error ?? new TypeError("Schema validation failed"); return result.data;
  }
  if ("parse" in schema && typeof schema.parse === "function") return schema.parse(value);
  validateJsonSchema(schema as JsonSchema, value, "$" );
  return value;
}

function validateJsonSchema(schema: JsonSchema, value: unknown, path: string): void {
  const type = schema["type"];
  if (type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${path} must be an object`);
    const record = value as Record<string, unknown>;
    for (const name of Array.isArray(schema["required"]) ? schema["required"] : []) if (typeof name === "string" && record[name] === undefined) throw new TypeError(`${path}.${name} is required`);
    const properties = schema["properties"] as Record<string, JsonSchema> | undefined;
    for (const [name, child] of Object.entries(properties ?? {})) if (record[name] !== undefined) validateJsonSchema(child, record[name], `${path}.${name}`);
  } else if (type === "array") {
    if (!Array.isArray(value)) throw new TypeError(`${path} must be an array`);
    const items = schema["items"] as JsonSchema | undefined; if (items) value.forEach((item, index) => validateJsonSchema(items, item, `${path}[${index}]`));
  } else if (type === "string" && typeof value !== "string") throw new TypeError(`${path} must be a string`);
  else if (type === "number" && typeof value !== "number") throw new TypeError(`${path} must be a number`);
  else if (type === "integer" && (!Number.isInteger(value))) throw new TypeError(`${path} must be an integer`);
  else if (type === "boolean" && typeof value !== "boolean") throw new TypeError(`${path} must be a boolean`);
  const values = schema["enum"]; if (Array.isArray(values) && !values.includes(value)) throw new TypeError(`${path} is not an allowed value`);
}

function contractValidator(contract: RouteContract): RequestHandler {
  return (request, _response, next) => {
    try {
      if (contract.request?.headers) validateRuntimeSchema(contract.request.headers, contractHeaders(contract.request.headers, request.headers));
      if (contract.request?.params) request.params = validateRuntimeSchema(contract.request.params, request.params) as typeof request.params;
      if (contract.request?.query) validateRuntimeSchema(contract.request.query, request.query);
      if (contract.request?.body) request.body = validateRuntimeSchema(contract.request.body, request.body);
      next();
    } catch { next(new HttpError(400, "REQUEST_SCHEMA_INVALID", "Request does not match the operation contract")); }
  };
}

function contractHeaders(schema: RuntimeSchema, headers: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  const json = jsonSchema(schema);
  const propertySchemas = json["properties"] && typeof json["properties"] === "object"
    ? json["properties"] as Record<string, JsonSchema>
    : {};
  const properties = Object.keys(propertySchemas);
  const required = Array.isArray(json["required"])
    ? json["required"].filter((name): name is string => typeof name === "string")
    : [];
  const normalized: Record<string, unknown> = { ...headers };
  for (const name of new Set([...properties, ...required])) {
    const raw = normalized[name] ?? headers[name.toLowerCase()];
    if (raw !== undefined) normalized[name] = coerceHeaderValue(raw, propertySchemas[name]);
  }
  return normalized;
}

function coerceHeaderValue(value: unknown, schema: JsonSchema | undefined): unknown {
  if (typeof value !== "string") return value;
  if (schema?.["type"] === "integer" && /^-?\d+$/.test(value)) return Number(value);
  if (schema?.["type"] === "number" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  if (schema?.["type"] === "boolean" && ["true", "false"].includes(value.toLowerCase())) return value.toLowerCase() === "true";
  return value;
}
