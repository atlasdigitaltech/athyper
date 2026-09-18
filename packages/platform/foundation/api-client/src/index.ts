import { parseApiProblem, type ApiProblem } from "@athyper/contract-platform-api";
export type { ApiProblem } from "@athyper/contract-platform-api";
export { parseApiProblem } from "@athyper/contract-platform-api";
export * from "./bootstrap";
export * from "./work-context";
export * from "./operating-organization";
export * from "./network-account";
export * from "./localization";
export * from "./entity-list";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export type RequestClass = "interactive" | "background" | "upload" | "download" | "stream";
export type TransportFailureKind = "authentication" | "authorization" | "not-found" | "validation" | "conflict" | "rate-limit" | "dependency" | "network" | "abort" | "timeout" | "parse";
export type ResponseParser<T> = (value: unknown) => T;

export interface Operation<TResponse, TBody = never> {
  readonly method: HttpMethod;
  readonly path: string | ((params: Readonly<Record<string, string | number>>) => string);
  readonly parse?: ResponseParser<TResponse>;
  readonly requestClass: RequestClass;
  readonly idempotency: "forbidden" | "required";
  readonly response: "json" | "void" | "blob" | "stream";
  readonly __body?: TBody;
}

export function createOperation<TResponse, TBody = never>(declaration: {
  readonly method: HttpMethod;
  readonly path: Operation<TResponse, TBody>["path"];
  readonly parse?: ResponseParser<TResponse>;
  readonly requestClass?: RequestClass;
  readonly idempotency?: "forbidden" | "required";
  readonly response?: Operation<TResponse, TBody>["response"];
}): Operation<TResponse, TBody> {
  if (declaration.idempotency === "required" && !["POST", "PUT", "PATCH", "DELETE"].includes(declaration.method)) throw new TypeError("Idempotency keys are declared only for mutation operations");
  return Object.freeze({ requestClass: "interactive", idempotency: "forbidden", response: "json", ...declaration });
}

export interface TransportDiagnostic {
  readonly method: HttpMethod;
  readonly path: string;
  readonly kind: TransportFailureKind;
  readonly status: number;
  readonly requestId?: string;
  readonly correlationId?: string;
}

export class ApiTransportError extends Error {
  constructor(
    readonly kind: TransportFailureKind,
    message: string,
    readonly status = 0,
    readonly problem?: ApiProblem,
    readonly requestId?: string,
    readonly correlationId?: string,
    readonly retryAfter?: string,
    options?: ErrorOptions,
  ) { super(message, options); this.name = "ApiTransportError"; }
  toDiagnostic(method: HttpMethod, path: string): TransportDiagnostic { return Object.freeze({ method, path, kind: this.kind, status: this.status, ...(this.requestId ? { requestId: this.requestId } : {}), ...(this.correlationId ? { correlationId: this.correlationId } : {}) }); }
}

export interface UploadProgressStrategy {
  upload(input: { readonly url: string; readonly method: HttpMethod; readonly headers: Headers; readonly body: BodyInit; readonly signal: AbortSignal; readonly onProgress: (loaded: number, total?: number) => void }): Promise<Response>;
}

export interface HttpClientOptions {
  readonly relayPrefix?: `/api/relay${string}`;
  readonly fetch?: typeof fetch;
  readonly csrfToken?: () => string | undefined | Promise<string | undefined>;
  readonly lifecycleSignal?: AbortSignal;
  readonly timeouts?: Partial<Record<RequestClass, number>>;
  readonly uploadProgressStrategy?: UploadProgressStrategy;
  readonly onDiagnostic?: (diagnostic: TransportDiagnostic) => void;
}

export type QueryScalar = string | number | boolean;
export interface RequestOptions<TBody = unknown> {
  readonly params?: Readonly<Record<string, string | number>>;
  readonly query?: Readonly<Record<string, QueryScalar | readonly QueryScalar[] | null | undefined>>;
  readonly body?: TBody | BodyInit;
  readonly headers?: HeadersInit;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
  readonly idempotencyKey?: string;
  readonly onUploadProgress?: (loaded: number, total?: number) => void;
}

export interface HttpClient {
  request<TResponse, TBody = never>(operation: Operation<TResponse, TBody>, options?: RequestOptions<TBody>): Promise<TResponse>;
  requestJson<T>(path: string, options?: RequestOptions & { readonly method?: HttpMethod; readonly parse?: ResponseParser<T> }): Promise<T>;
  requestVoid(path: string, options?: RequestOptions & { readonly method?: HttpMethod }): Promise<void>;
  requestBlob(path: string, options?: RequestOptions & { readonly method?: HttpMethod }): Promise<Blob>;
  requestStream(path: string, options?: RequestOptions & { readonly method?: HttpMethod }): Promise<ReadableStream<Uint8Array>>;
}

export interface RequestScope { readonly signal: AbortSignal; cancel(reason?: unknown): void; }
export function createRequestScope(): RequestScope { const controller = new AbortController(); return Object.freeze({ signal: controller.signal, cancel: (reason?: unknown) => controller.abort(reason) }); }

const DEFAULT_TIMEOUTS: Readonly<Record<RequestClass, number>> = Object.freeze({ interactive: 15_000, background: 30_000, upload: 120_000, download: 120_000, stream: 15_000 });
const UNSAFE = new Set<HttpMethod>(["POST", "PUT", "PATCH", "DELETE"]);

export function createHttpClient(config: HttpClientOptions = {}): HttpClient {
  const relayPrefix = config.relayPrefix ?? "/api/relay";
  assertRelayPath(relayPrefix);
  const fetcher = config.fetch ?? globalThis.fetch;
  if (!fetcher) throw new TypeError("A Fetch implementation is required");

  const execute = async <T>(operation: Operation<T, unknown>, options: RequestOptions = {}): Promise<T> => {
    const operationPath = typeof operation.path === "function" ? operation.path(options.params ?? {}) : operation.path;
    const path = relayUrl(relayPrefix, operationPath, options.query);
    const headers = new Headers(options.headers);
    rejectSensitiveHeaders(headers);
    headers.set("Accept", operation.response === "json" ? "application/json, application/problem+json" : "*/*");
    if (operation.idempotency === "required") {
      if (!options.idempotencyKey?.trim()) throw transport("validation", "This operation requires an Idempotency-Key");
      const key = options.idempotencyKey.trim();
      if (key.length > 200 || !/^[A-Za-z0-9._:-]+$/.test(key)) throw transport("validation", "Idempotency-Key is invalid");
      headers.set("Idempotency-Key", key);
    } else if (options.idempotencyKey !== undefined) throw transport("validation", "This operation does not declare idempotency");
    if (UNSAFE.has(operation.method)) {
      const csrf = await config.csrfToken?.();
      if (!csrf?.trim()) throw transport("validation", "Unsafe BFF request requires a CSRF token");
      headers.set("X-CSRF-Token", csrf.trim());
    }
    const body = requestBody(options.body, headers);
    const timeoutMs = options.timeoutMs ?? config.timeouts?.[operation.requestClass] ?? DEFAULT_TIMEOUTS[operation.requestClass];
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) throw transport("validation", "Request timeout must be a positive integer");
    if (options.onUploadProgress && !config.uploadProgressStrategy) throw transport("validation", "Upload progress requires an explicit upload strategy");
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(new DOMException("Request timed out", "TimeoutError")), timeoutMs);
    const signal = combineSignals([options.signal, config.lifecycleSignal, timeout.signal]);
    let response: Response;
    try {
      response = options.onUploadProgress && config.uploadProgressStrategy && body !== undefined
        ? await config.uploadProgressStrategy.upload({ url: path, method: operation.method, headers, body, signal, onProgress: options.onUploadProgress })
        : await fetcher(path, { method: operation.method, headers, body, signal, credentials: "same-origin", redirect: "error" });
      if (operation.response === "stream") clearTimeout(timer);
      if (!response.ok) throw await responseError(response);
      const requestId = response.headers.get("x-request-id") ?? undefined;
      const correlationId = response.headers.get("x-correlation-id") ?? undefined;
      if (operation.response === "void" || response.status === 204 || response.headers.get("content-length") === "0") return undefined as T;
      if (operation.response === "stream") {
        if (!response.body) throw transport("parse", "Stream response did not contain a body", response.status, undefined, requestId, correlationId);
        return response.body as T;
      }
      if (operation.response === "blob") return await response.blob() as T;
      const text = await response.text();
      if (!text.trim()) throw transport("parse", "JSON response was empty", response.status, undefined, requestId, correlationId);
      let decoded: unknown;
      try { decoded = JSON.parse(text); } catch (cause) { throw transport("parse", "Response was not valid JSON", response.status, undefined, requestId, correlationId, undefined, cause); }
      try { return operation.parse ? operation.parse(decoded) : decoded as T; } catch (cause) { throw transport("parse", "Response failed its contract parser", response.status, undefined, requestId, correlationId, undefined, cause); }
    } catch (cause) {
      const error = classifyCaught(cause, timeout.signal.aborted, signal.aborted);
      config.onDiagnostic?.(error.toDiagnostic(operation.method, path));
      throw error;
    } finally { clearTimeout(timer); }
  };

  return Object.freeze({
    request: execute,
    requestJson: <T>(path: string, options: RequestOptions & { method?: HttpMethod; parse?: ResponseParser<T> } = {}) => execute(createOperation<T>({ method: options.method ?? "GET", path, parse: options.parse, response: "json" }), options),
    requestVoid: (path: string, options: RequestOptions & { method?: HttpMethod } = {}) => execute(createOperation<void>({ method: options.method ?? "GET", path, response: "void" }), options),
    requestBlob: (path: string, options: RequestOptions & { method?: HttpMethod } = {}) => execute(createOperation<Blob>({ method: options.method ?? "GET", path, response: "blob", requestClass: "download" }), options),
    requestStream: (path: string, options: RequestOptions & { method?: HttpMethod } = {}) => execute(createOperation<ReadableStream<Uint8Array>>({ method: options.method ?? "GET", path, response: "stream", requestClass: "stream" }), options),
  });
}

export function encodePathSegment(value: string | number): string { const encoded = encodeURIComponent(String(value)); if (!encoded) throw new TypeError("Path segment cannot be empty"); return encoded; }
export const requestJson = <T>(client: HttpClient, path: string, options?: RequestOptions & { method?: HttpMethod; parse?: ResponseParser<T> }) => client.requestJson<T>(path, options);
export const requestVoid = (client: HttpClient, path: string, options?: RequestOptions & { method?: HttpMethod }) => client.requestVoid(path, options);
export const requestBlob = (client: HttpClient, path: string, options?: RequestOptions & { method?: HttpMethod }) => client.requestBlob(path, options);
export const requestStream = (client: HttpClient, path: string, options?: RequestOptions & { method?: HttpMethod }) => client.requestStream(path, options);

function relayUrl(prefix: string, path: string, query?: RequestOptions["query"]): string {
  if (/^[a-z][a-z\d+.-]*:/i.test(path) || path.startsWith("//")) throw new TypeError("API client accepts relay paths, not absolute URLs");
  const operationPath = path.replace(/^\/+/, "");
  // Relay catch-all routes restore the trusted upstream `/api` prefix. Keeping
  // it here would turn `/api/neon/...` into `/api/relay/api/neon/...`, which
  // the relay normalizes to the non-allowlisted `/api/api/neon/...` path.
  const relative = operationPath.startsWith("api/") ? operationPath.slice(4) : operationPath;
  if (!relative) throw new TypeError("API client operation path cannot be empty");
  const url = `${prefix.replace(/\/$/, "")}/${relative}`;
  assertRelayPath(url); const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) for (const item of value) params.append(key, String(item));
    else params.append(key, String(value));
  }
  return params.size ? `${url}?${params}` : url;
}
function assertRelayPath(path: string): void { if (!(path === "/api/relay" || path.startsWith("/api/relay/")) || path.includes("\\") || path.split("/").includes("..")) throw new TypeError("Browser transport must use a same-origin /api/relay path"); }
function rejectSensitiveHeaders(headers: Headers): void { for (const name of ["authorization", "proxy-authorization", "cookie", "x-tenant-id", "x-csrf-token", "idempotency-key"]) if (headers.has(name)) throw transport("validation", `${name} is managed by the same-origin BFF transport and cannot be supplied`); }
function requestBody(body: unknown, headers: Headers): BodyInit | undefined {
  if (body === undefined || body === null) return undefined;
  if (typeof body === "string" || body instanceof FormData || body instanceof Blob || body instanceof URLSearchParams || body instanceof ArrayBuffer || ArrayBuffer.isView(body) || body instanceof ReadableStream) return body as BodyInit;
  headers.set("Content-Type", "application/json"); return JSON.stringify(body);
}
function combineSignals(signals: readonly (AbortSignal | undefined)[]): AbortSignal { const active = signals.filter((value): value is AbortSignal => Boolean(value)); return active.length === 1 ? active[0]! : AbortSignal.any(active); }
async function responseError(response: Response): Promise<ApiTransportError> {
  const requestId = response.headers.get("x-request-id") ?? undefined; const correlationId = response.headers.get("x-correlation-id") ?? undefined;
  let problem: ApiProblem | undefined;
  if ((response.headers.get("content-type") ?? "").toLowerCase().includes("application/problem+json")) { try { problem = parseApiProblem(await response.json()); } catch { /* keep body redacted */ } }
  return transport(statusKind(response.status), problem?.detail ?? problem?.title ?? `Request failed with status ${response.status}`, response.status, problem, problem?.requestId ?? requestId, problem?.correlationId ?? correlationId, response.headers.get("retry-after") ?? undefined);
}
function statusKind(status: number): TransportFailureKind { if (status === 401) return "authentication"; if (status === 403) return "authorization"; if (status === 404) return "not-found"; if ([400, 422, 428].includes(status)) return "validation"; if ([409, 412, 423].includes(status)) return "conflict"; if (status === 429) return "rate-limit"; return status >= 500 ? "dependency" : "network"; }
function classifyCaught(cause: unknown, timedOut: boolean, aborted: boolean): ApiTransportError { if (cause instanceof ApiTransportError) return cause; if (timedOut) return transport("timeout", "Request timed out", 0, undefined, undefined, undefined, undefined, cause); if (aborted || (cause instanceof DOMException && cause.name === "AbortError")) return transport("abort", "Request was cancelled", 0, undefined, undefined, undefined, undefined, cause); return transport("network", "Network request failed", 0, undefined, undefined, undefined, undefined, cause); }
function transport(kind: TransportFailureKind, message: string, status = 0, problem?: ApiProblem, requestId?: string, correlationId?: string, retryAfter?: string, cause?: unknown): ApiTransportError { return new ApiTransportError(kind, message, status, problem, requestId, correlationId, retryAfter, cause === undefined ? undefined : { cause }); }

export { uploadSignedObject } from "./signed-upload";

export * from "./reference-history";
