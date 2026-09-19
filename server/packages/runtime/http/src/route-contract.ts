import type { Application, Request, RequestHandler, Response } from "express";
import Ajv2020, { type ValidateFunction } from "ajv/dist/2020.js";
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
  readonly responses: Readonly<Record<number, { readonly description: string; readonly body?: RuntimeSchema; readonly contentType?: string }>>;
}

export interface ContractIssue {
  readonly code: "DUPLICATE_OPERATION_ID" | "DUPLICATE_ROUTE" | "UNDOCUMENTED_ROUTE" | "MISSING_PERMISSION" | "UNINSPECTABLE_ROUTE";
  readonly message: string;
}

const ROUTES = Symbol.for("athyper.http.route-contracts");
const ROUTE_MIDDLEWARE = Symbol.for("athyper.http.contract-route-middleware");
const RESPONSE_ENFORCEMENT = Symbol.for("athyper.http.response-contract-enforcement");
const ajv = new Ajv2020({ allErrors: true, strict: false });
const compiledSchemas = new WeakMap<object, ValidateFunction>();

interface ContractRouteMiddleware {
  readonly authenticated?: RequestHandler;
  readonly unauthenticated?: RequestHandler;
}

export function defineRouteContract<const Contract extends RouteContract>(contract: Contract): Contract {
  if (!/^[A-Za-z][A-Za-z0-9._-]{2,127}$/.test(contract.operationId)) throw new TypeError(`Invalid HTTP operationId: ${contract.operationId}`);
  return Object.freeze(contract);
}

export function registerContractRoute(application: Application, contract: RouteContract, ...handlers: readonly RequestHandler[]): void {
  const issues = inspectContractAddition(routeContracts(application), contract);
  if (issues.length) throw new Error(issues[0]!.message);
  routeContracts(application).push(contract);
  const target = application as Application & { [ROUTE_MIDDLEWARE]?: ContractRouteMiddleware; [RESPONSE_ENFORCEMENT]?: boolean };
  const validation = [contractValidator(contract), ...(target[RESPONSE_ENFORCEMENT] ? [contractResponseValidator(contract)] : [])];
  const scoped = target[ROUTE_MIDDLEWARE];
  if (contract.authenticated && scoped?.authenticated && handlers.length > 0) {
    application[contract.method](contract.path, ...validation, handlers[0]!, scoped.authenticated, ...handlers.slice(1));
    return;
  }
  application[contract.method](contract.path, ...validation, ...(scoped?.unauthenticated ? [scoped.unauthenticated] : []), ...handlers);
}

/** Configures runtime middleware that must run inside a contract route (for example, after authentication). */
export function configureContractRouteMiddleware(application: Application, middleware: ContractRouteMiddleware): void {
  (application as Application & { [ROUTE_MIDDLEWARE]?: ContractRouteMiddleware })[ROUTE_MIDDLEWARE] = middleware;
}

/** Enables runtime validation of declared response statuses and JSON response bodies. */
export function enforceContractResponses(application: Application): void {
  (application as Application & { [RESPONSE_ENFORCEMENT]?: boolean })[RESPONSE_ENFORCEMENT] = true;
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
  const registered = expressRoutes(application);
  issues.push(...registered.issues);
  for (const route of registered.routes) {
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

export function createOpenApiDocument(application: Application, info: { readonly title: string; readonly version: string; readonly authenticatedHeaders?: RuntimeSchema }): Readonly<Record<string, unknown>> {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const route of routeContracts(application)) {
    const path = route.path.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
    const operation: Record<string, unknown> = {
      operationId: route.operationId, summary: route.summary, tags: route.tags ?? [],
      ...(route.permission ? { "x-athyper-permission": route.permission } : {}),
      responses: Object.fromEntries(Object.entries(effectiveResponses(route)).map(([status, response]) => [status, {
        description: response.description,
        ...(response.body ? { content: { [response.contentType ?? "application/json"]: { schema: jsonSchema(response.body) } } } : {}),
      }])),
    };
    if (route.authenticated) operation["security"] = [{ bearerAuth: [] }];
    const parameters: Array<Record<string, unknown>> = [];
    const pathProperties = route.request?.params
      ? jsonSchema(route.request.params)["properties"] as Record<string, unknown> | undefined
      : undefined;
    for (const match of route.path.matchAll(/:([A-Za-z0-9_]+)/g)) parameters.push({ name: match[1], in: "path", required: true, schema: pathProperties?.[match[1]!] ?? { type: "string" } });
    if (route.authenticated) addSchemaParameters(parameters, "header", info.authenticatedHeaders);
    const routeParameters: Array<Record<string, unknown>> = [];
    addSchemaParameters(routeParameters, "header", route.request?.headers);
    for (const parameter of routeParameters) {
      const index = parameters.findIndex((item) => item["in"] === "header" && String(item["name"]).toLowerCase() === String(parameter["name"]).toLowerCase());
      if (index >= 0) parameters[index] = parameter; else parameters.push(parameter);
    }
    addSchemaParameters(parameters, "query", route.request?.query);
    if (parameters.length) operation["parameters"] = parameters;
    if (route.request?.body) operation["requestBody"] = { required: true, content: { "application/json": { schema: jsonSchema(route.request.body) } } };
    paths[path] ??= {};
    paths[path]![route.method] = operation;
  }
  return { openapi: "3.1.0", info: { title: info.title, version: info.version }, paths, components: { securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" } } } };
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

function expressRoutes(application: Application): { routes: Array<{ method: string; path: string }>; issues: ContractIssue[] } {
  type Layer = { route?: { path?: unknown; methods?: Record<string, boolean> }; handle?: { stack?: unknown[] } };
  const router = (application as unknown as { router?: { stack?: Layer[] } }).router;
  const routes: Array<{ method: string; path: string }> = [];
  const issues: ContractIssue[] = [];
  for (const layer of router?.stack ?? []) {
    if (layer.handle?.stack) {
      // Express 5 does not expose original mount paths. Silently skipping nested
      // routers would falsely report complete coverage. Register full paths on the host.
      issues.push({ code: "UNINSPECTABLE_ROUTE", message: "Mounted Express router cannot be audited; register full paths through registerContractRoute on the host" });
    }
    if (!layer.route) continue;
    const paths = Array.isArray(layer.route.path) ? layer.route.path : [layer.route.path];
    for (const path of paths) {
      if (typeof path !== "string") {
        issues.push({ code: "UNINSPECTABLE_ROUTE", message: "Non-literal Express route cannot be represented in OpenAPI" });
        continue;
      }
      for (const [method, enabled] of Object.entries(layer.route.methods ?? {})) {
        if (enabled) routes.push({ method, path });
      }
    }
  }
  return { routes, issues };
}

export function validateRuntimeSchema(schema: RuntimeSchema, value: unknown): unknown {
  if ("safeParse" in schema && typeof schema.safeParse === "function") {
    const result = schema.safeParse(value); if (!result.success) throw result.error ?? new TypeError("Schema validation failed"); return result.data;
  }
  if ("parse" in schema && typeof schema.parse === "function") return schema.parse(value);
  const json = schema as JsonSchema;
  let validate = compiledSchemas.get(json);
  if (!validate) {
    validate = ajv.compile(json);
    compiledSchemas.set(json, validate);
  }
  if (!validate(value)) {
    throw new TypeError(ajv.errorsText(validate.errors, { dataVar: "$" }));
  }
  return value;
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

function contractResponseValidator(contract: RouteContract): RequestHandler {
  return (_request, response, next) => {
    const original = response.json.bind(response);
    response.json = ((body: unknown) => {
      const declared = effectiveResponses(contract)[response.statusCode];
      if (!declared) {
        response.json = original;
        throw new HttpError(500, "RESPONSE_STATUS_UNDOCUMENTED", `Operation ${contract.operationId} returned undocumented status ${response.statusCode}`);
      }
      if (declared.body) {
        try { validateRuntimeSchema(declared.body, body); }
        catch {
          response.json = original;
          throw new HttpError(500, "RESPONSE_SCHEMA_INVALID", `Response does not match the operation contract: ${contract.operationId}`);
        }
      }
      return original(body);
    }) as Response["json"];
    next();
  };
}

// Middleware errors are part of the effective contract even when a handler
// only declares its own domain outcomes. Keep documentation and enforcement aligned.
function effectiveResponses(contract: RouteContract): RouteContract["responses"] {
  const authenticationResponses: Record<number, RouteContract["responses"][number]> = contract.authenticated ? {
    401: { description: "Authentication required", contentType: "application/problem+json" },
    403: { description: "Authentication or authorization rejected", contentType: "application/problem+json" },
    429: { description: "Rate limit exceeded", contentType: "application/problem+json" },
  } : {};
  return {
    400: { description: "Invalid request", contentType: "application/problem+json" },
    413: { description: "Request body exceeds the allowed size", contentType: "application/problem+json" },
    415: { description: "Unsupported request encoding", contentType: "application/problem+json" },
    500: { description: "Internal server error" },
    503: { description: "Service unavailable", contentType: "application/problem+json" },
    ...authenticationResponses,
    ...contract.responses,
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
