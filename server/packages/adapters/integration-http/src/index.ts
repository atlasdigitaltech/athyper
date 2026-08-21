import { lookup as nodeLookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { Readable } from "node:stream";
import type {
  ConnectorResponse,
  ConnectorTransport,
  InvocationPlan,
  TokenCache,
} from "@athyper/server-contract-integration";
import {
  AdapterCircuitBreaker,
  AdapterCircuitOpenError,
  type AdapterCircuitBreakerConfig,
  type AdapterCircuitState,
} from "./reliability.js";

const DEFAULT_MAX_RESPONSE_BYTES = 1_048_576;
const DEFAULT_MAX_CREDENTIAL_RESPONSE_BYTES = 65_536;

export type IntegrationFailureKind = "cancelled" | "permanent" | "transient";

export interface IntegrationDependencyTelemetry {
  readonly dependency: "integration-http";
  readonly connectorInstanceId: string;
  readonly endpointId: string;
  readonly credentialRevision: number;
  readonly outcome: "circuit_open" | "failure" | "success";
  readonly classification?: IntegrationFailureKind;
  readonly circuitState: AdapterCircuitState;
  readonly status?: number;
  readonly durationMs: number;
}

export interface IntegrationDependencyHealth {
  readonly status: "healthy" | "degraded" | "unhealthy";
  readonly openCircuits: number;
  readonly dependencyCount: number;
  readonly lastFailureAt?: string;
}

export interface ReliableConnectorTransport extends ConnectorTransport {
  health(): Promise<IntegrationDependencyHealth>;
}

export interface IntegrationHttpOptions {
  /** Test/advanced transport seam. The resolved address is already policy validated and must be pinned. */
  readonly pinnedFetch?: PinnedFetcher;
  readonly lookup?: (hostname: string) => Promise<readonly string[]>;
  readonly tokenCache?: TokenCache;
  readonly allowPrivateNetworks?: boolean;
  readonly allowedHosts?: readonly string[];
  readonly maxResponseBytes?: number;
  readonly maxCredentialResponseBytes?: number;
  readonly circuitBreaker?: Partial<AdapterCircuitBreakerConfig> | false;
  readonly telemetry?: (event: IntegrationDependencyTelemetry) => void;
  readonly now?: () => number;
}

type Credential = {
  type?: string;
  apiKey?: string;
  header?: string;
  token?: string;
  clientId?: string;
  clientSecret?: string;
  tokenUrl?: string;
  scope?: string;
  audience?: string;
};

interface ValidatedOutboundTarget {
  readonly url: URL;
  readonly address: string;
}

export type PinnedFetcher = (
  url: URL,
  init: RequestInit,
  address: string,
) => Promise<Response>;

class RetryableResponseError extends Error {
  constructor(readonly response: ConnectorResponse) {
    super(`INTEGRATION_HTTP_${response.status}`);
    this.name = "RetryableResponseError";
  }
}

export function createIntegrationHttpTransport(
  options: IntegrationHttpOptions = {},
): ReliableConnectorTransport {
  const fetcher: PinnedFetcher = options.pinnedFetch ?? pinnedFetch;
  const lookup = options.lookup ?? resolveAddresses;
  const now = options.now ?? Date.now;
  const breakers = new Map<string, AdapterCircuitBreaker>();
  let lastFailureAt: number | undefined;
  let lastSuccessAt: number | undefined;

  const breakerFor = (plan: InvocationPlan): AdapterCircuitBreaker | undefined => {
    if (options.circuitBreaker === false) return undefined;
    let breaker = breakers.get(plan.connectorInstanceId);
    if (!breaker) {
      breaker = new AdapterCircuitBreaker(`integration-http:${plan.connectorInstanceId}`, {
        failureThreshold: 5,
        failureWindowMs: 60_000,
        resetTimeoutMs: 30_000,
        successThreshold: 1,
        ...options.circuitBreaker,
        shouldTrigger: (error) => error instanceof RetryableResponseError ||
          classifyIntegrationFailure(error).kind === "transient",
      });
      breakers.set(plan.connectorInstanceId, breaker);
    }
    return breaker;
  };

  const invoke = async (
    plan: InvocationPlan,
    payload: Uint8Array | undefined,
    credentialBytes: Uint8Array | undefined,
    signal?: AbortSignal,
  ): Promise<ConnectorResponse> => {
    const startedAt = now();
    const breaker = breakerFor(plan);
    try {
      const execute = async () => {
        const response = await invokeOnce(
          plan,
          payload,
          credentialBytes,
          signal,
          options,
          fetcher,
          lookup,
        );
        if (classifyIntegrationFailure(undefined, response.status, plan.retryPolicy.retryStatuses).kind === "transient") {
          throw new RetryableResponseError(response);
        }
        return response;
      };
      const response = breaker ? await breaker.execute(execute) : await execute();
      lastSuccessAt = now();
      emitTelemetry(options, plan, "success", undefined, breaker?.getState() ?? "CLOSED", now() - startedAt, response.status);
      return response;
    } catch (error) {
      if (error instanceof RetryableResponseError) {
        lastFailureAt = now();
        emitTelemetry(options, plan, "failure", "transient", breaker?.getState() ?? "CLOSED", now() - startedAt, error.response.status);
        return error.response;
      }
      const classification = classifyIntegrationFailure(error);
      if (classification.kind !== "cancelled") lastFailureAt = now();
      emitTelemetry(
        options,
        plan,
        error instanceof AdapterCircuitOpenError ? "circuit_open" : "failure",
        classification.kind,
        breaker?.getState() ?? "CLOSED",
        now() - startedAt,
        classification.status,
      );
      throw error;
    }
  };

  return {
    invoke: (plan, body, credential, signal) => invoke(plan, body, credential, signal),
    probe: (plan, credential, signal) => {
      if (plan.method !== "GET" && plan.kind !== "health") {
        throw coded("INTEGRATION_PROBE_NOT_ALLOWED");
      }
      return invoke({ ...plan, method: "GET" }, undefined, credential, signal);
    },
    async health() {
      const openCircuits = [...breakers.values()].filter((breaker) => breaker.getState() === "OPEN").length;
      return {
        status: openCircuits > 0
          ? "unhealthy"
          : lastFailureAt !== undefined && (lastSuccessAt === undefined || lastFailureAt > lastSuccessAt)
          ? "degraded"
          : "healthy",
        openCircuits,
        dependencyCount: breakers.size,
        ...(lastFailureAt === undefined ? {} : { lastFailureAt: new Date(lastFailureAt).toISOString() }),
      };
    },
  };
}

async function invokeOnce(
  plan: InvocationPlan,
  payload: Uint8Array | undefined,
  credentialBytes: Uint8Array | undefined,
  signal: AbortSignal | undefined,
  options: IntegrationHttpOptions,
  fetcher: PinnedFetcher,
  lookup: (hostname: string) => Promise<readonly string[]>,
): Promise<ConnectorResponse> {
  const target = await resolveOutboundTarget(plan.url, lookup, options);
  const url = target.url;
  const credential = parseCredential(credentialBytes);
  const auth = await authHeaders(credential, plan, options, fetcher, lookup);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(coded("INTEGRATION_HTTP_TIMEOUT", true)), plan.timeoutMs);
  const abort = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", abort, { once: true });
  try {
    const response = await fetcher(url, {
      method: plan.method,
      headers: {
        "content-type": plan.requestContentType,
        ...withoutBlankIdempotencyKey(plan.headers),
        ...auth,
      },
      body: payload && plan.method !== "GET" ? Buffer.from(payload) : undefined,
      redirect: "manual",
      signal: controller.signal,
    }, target.address);
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel();
      throw coded("INTEGRATION_REDIRECT_DENIED");
    }
    const body = await boundedBody(response, positiveLimit(options.maxResponseBytes, DEFAULT_MAX_RESPONSE_BYTES));
    return { status: response.status, headers: Object.fromEntries(response.headers.entries()), body };
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}

export function classifyIntegrationFailure(
  error?: unknown,
  status?: number,
  retryStatuses: readonly number[] = [],
): { readonly kind: IntegrationFailureKind; readonly status?: number } {
  if (status !== undefined) {
    const kind = retryStatuses.includes(status) || status === 408 || status === 425 || status === 429 || status >= 500
      ? "transient"
      : "permanent";
    return { kind, status };
  }
  if (error instanceof AdapterCircuitOpenError) return { kind: "transient" };
  if (error instanceof DOMException && error.name === "AbortError") return { kind: "cancelled" };
  if (error && typeof error === "object") {
    const retryable = Reflect.get(error, "retryable");
    const errorStatus = Reflect.get(error, "status");
    if (typeof errorStatus === "number") return classifyIntegrationFailure(undefined, errorStatus, retryStatuses);
    if (retryable === true) return { kind: "transient" };
    if (retryable === false) return { kind: "permanent" };
    const code = String(Reflect.get(error, "code") ?? "").toUpperCase();
    if (["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND", "EHOSTUNREACH", "EPIPE", "UND_ERR_CONNECT_TIMEOUT"].includes(code)) {
      return { kind: "transient" };
    }
  }
  return { kind: "permanent" };
}

export async function validateOutboundUrl(
  value: string,
  lookup: (hostname: string) => Promise<readonly string[]> = resolveAddresses,
  options: Pick<IntegrationHttpOptions, "allowPrivateNetworks" | "allowedHosts"> = {},
): Promise<URL> {
  return (await resolveOutboundTarget(value, lookup, options)).url;
}

async function resolveOutboundTarget(
  value: string,
  lookup: (hostname: string) => Promise<readonly string[]>,
  options: Pick<IntegrationHttpOptions, "allowPrivateNetworks" | "allowedHosts">,
): Promise<ValidatedOutboundTarget> {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) {
    throw coded("INTEGRATION_URL_DENIED");
  }
  const host = url.hostname.toLowerCase();
  if (options.allowedHosts?.length && !options.allowedHosts.some((value) => value.toLowerCase() === host)) {
    throw coded("INTEGRATION_HOST_DENIED");
  }
  const addresses = isIP(host) ? [host] : await lookup(host);
  if (!addresses.length) throw coded("INTEGRATION_DNS_EMPTY", true);
  if (!options.allowPrivateNetworks && addresses.some(isPrivateAddress)) {
    throw coded("INTEGRATION_PRIVATE_NETWORK_DENIED");
  }
  return { url, address: addresses[0]! };
}

function isPrivateAddress(ip: string): boolean {
  const value = ip.toLowerCase();
  if (value.includes(":")) {
    if (value === "::" || value === "::1" || value.startsWith("fc") || value.startsWith("fd") || /^fe[89ab]/.test(value) || value.startsWith("ff")) return true;
    const mapped = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    return mapped ? isPrivateAddress(mapped[1]!) : false;
  }
  const parts = value.split(".").map(Number);
  const first = parts[0] ?? -1;
  const second = parts[1] ?? -1;
  return first === 10 || first === 127 || first === 0 || first === 169 && second === 254 ||
    first === 172 && second >= 16 && second <= 31 || first === 192 && second === 168 ||
    first === 100 && second >= 64 && second <= 127 || first === 198 && (second === 18 || second === 19) || first >= 224;
}

async function resolveAddresses(host: string): Promise<readonly string[]> {
  return (await nodeLookup(host, { all: true, verbatim: true })).map((entry) => entry.address);
}

function parseCredential(bytes: Uint8Array | undefined): Credential {
  if (!bytes) return {};
  try {
    return JSON.parse(Buffer.from(bytes).toString("utf8")) as Credential;
  } catch {
    throw coded("INTEGRATION_CREDENTIAL_INVALID");
  }
}

async function authHeaders(
  credential: Credential,
  plan: InvocationPlan,
  options: IntegrationHttpOptions,
  fetcher: PinnedFetcher,
  lookup: (hostname: string) => Promise<readonly string[]>,
): Promise<Record<string, string>> {
  if (credential.type === "api_key") return { [credential.header || "x-api-key"]: credential.apiKey || "" };
  if (credential.type === "bearer") return { authorization: `Bearer ${credential.token || ""}` };
  if (credential.type !== "oauth2_client_credentials") return {};
  const audience = credential.audience || plan.audience;
  const key = `integration:oauth:${plan.tenantId}:${plan.credentialReference}:${plan.credentialRevision}:${audience}`;
  const cached = await options.tokenCache?.get(key);
  if (cached) return { authorization: `Bearer ${cached}` };
  if (!credential.tokenUrl) throw coded("INTEGRATION_OAUTH_CONFIG_INVALID");
  const target = await resolveOutboundTarget(credential.tokenUrl, lookup, options);
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: credential.clientId || "",
    client_secret: credential.clientSecret || "",
    ...(credential.scope ? { scope: credential.scope } : {}),
    ...(audience ? { audience } : {}),
  });
  const response = await fetcher(target.url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    redirect: "manual",
  }, target.address);
  if (!response.ok) throw coded("INTEGRATION_OAUTH_TOKEN_FAILED", response.status >= 500 || response.status === 429);
  const bytes = await boundedBody(response, positiveLimit(options.maxCredentialResponseBytes, DEFAULT_MAX_CREDENTIAL_RESPONSE_BYTES));
  let token: { access_token?: string; expires_in?: number };
  try {
    token = JSON.parse(new TextDecoder().decode(bytes)) as typeof token;
  } catch {
    throw coded("INTEGRATION_OAUTH_TOKEN_INVALID");
  }
  if (!token.access_token) throw coded("INTEGRATION_OAUTH_TOKEN_INVALID");
  await options.tokenCache?.set(key, token.access_token, Math.max(1, (token.expires_in ?? 3_600) - 60));
  return { authorization: `Bearer ${token.access_token}` };
}

function withoutBlankIdempotencyKey(
  headers: Readonly<Record<string, string>>,
): Record<string, string> {
  return Object.fromEntries(Object.entries(headers).filter(([name, value]) =>
    name.toLowerCase() !== "idempotency-key" || value.trim().length > 0));
}

function pinnedFetch(url: URL, init: RequestInit, address: string): Promise<Response> {
  return new Promise((resolve, reject) => {
    const request = httpsRequest(url, {
      method: init.method,
      headers: init.headers as Record<string, string>,
      signal: init.signal ?? undefined,
      lookup: ((_hostname: string, _options: unknown, callback: (error: Error | null, address: string, family: number) => void) => {
        callback(null, address, isIP(address));
      }) as never,
    }, (incoming) => {
      const headers = new Headers();
      for (const [name, value] of Object.entries(incoming.headers)) {
        if (Array.isArray(value)) value.forEach((item) => headers.append(name, item));
        else if (value !== undefined) headers.set(name, String(value));
      }
      const status = incoming.statusCode ?? 500;
      const hasBody = ![101, 204, 205, 304].includes(status);
      resolve(new Response(
        hasBody ? Readable.toWeb(incoming) as ReadableStream<Uint8Array> : null,
        { status, statusText: incoming.statusMessage, headers },
      ));
    });
    request.once("error", reject);
    if (init.body !== undefined && init.body !== null) {
      if (typeof init.body === "string" || init.body instanceof Uint8Array) request.write(init.body);
      else if (init.body instanceof URLSearchParams) request.write(init.body.toString());
      else {
        request.destroy(new TypeError("Unsupported integration HTTP request body"));
        return;
      }
    }
    request.end();
  });
}

async function boundedBody(response: Response, maxBytes: number): Promise<Uint8Array> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    await response.body?.cancel();
    throw coded("INTEGRATION_RESPONSE_TOO_LARGE");
  }
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw coded("INTEGRATION_RESPONSE_TOO_LARGE");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

function positiveLimit(value: number | undefined, fallback: number): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved < 1) throw new RangeError("Integration response limit must be a positive safe integer");
  return resolved;
}

function emitTelemetry(
  options: IntegrationHttpOptions,
  plan: InvocationPlan,
  outcome: IntegrationDependencyTelemetry["outcome"],
  classification: IntegrationFailureKind | undefined,
  circuitState: AdapterCircuitState,
  durationMs: number,
  status?: number,
): void {
  options.telemetry?.({
    dependency: "integration-http",
    connectorInstanceId: plan.connectorInstanceId,
    endpointId: plan.endpointId,
    credentialRevision: plan.credentialRevision,
    outcome,
    ...(classification === undefined ? {} : { classification }),
    circuitState,
    ...(status === undefined ? {} : { status }),
    durationMs: Math.max(0, durationMs),
  });
}

function coded(code: string, retryable = false): Error {
  return Object.assign(new Error(code), { code, retryable });
}
