import { lookup as nodeLookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { BlockList, isIP } from "node:net";
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
        now,
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
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(coded("INTEGRATION_HTTP_TIMEOUT", true)), plan.timeoutMs);
  const abort = () => controller.abort(signal?.reason);
  if (signal?.aborted) abort();
  else signal?.addEventListener("abort", abort, { once: true });
  let oauthKey: string | undefined;
  try {
    const target = await resolveOutboundTarget(plan.url, lookup, options);
    const url = target.url;
    const credential = parseCredential(credentialBytes);
    if (credential.type === "oauth2_client_credentials") oauthKey = oauthCacheKey(credential, plan);
    const auth = await authHeaders(credential, plan, options, fetcher, lookup, controller.signal);
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
    if (response.status === 401 && oauthKey) await options.tokenCache?.delete?.(oauthKey);
    return { status: response.status, headers: Object.fromEntries(response.headers.entries()), body };
  } catch (error) {
    if (controller.signal.aborted) {
      // node:http and fetch surface aborts as their own AbortError, losing the reason.
      const reason = controller.signal.reason as { code?: string } | undefined;
      if (reason?.code === "INTEGRATION_HTTP_TIMEOUT") throw reason;
      throw new DOMException("The integration request was cancelled", "AbortError");
    }
    throw error;
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
  if (error instanceof Error && error.name === "AbortError") return { kind: "cancelled" };
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

const PRIVATE_V4 = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15],
  ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 3],
] as const) PRIVATE_V4.addSubnet(network, prefix, "ipv4");
const PRIVATE_V6 = new BlockList();
for (const [network, prefix] of [
  ["::", 128], ["::1", 128], ["64:ff9b::", 96], ["64:ff9b:1::", 48], ["100::", 64], ["2001::", 32],
  ["2001:db8::", 32], ["2002::", 16], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8],
] as const) PRIVATE_V6.addSubnet(network, prefix, "ipv6");

function ipv6Bytes(ip: string): Uint8Array | undefined {
  let text = ip.toLowerCase().split("%")[0]!;
  const dotted = /(\d+\.\d+\.\d+\.\d+)$/.exec(text);
  if (dotted) {
    const octets = dotted[1]!.split(".").map(Number);
    text = text.slice(0, -dotted[1]!.length) + ((octets[0]! << 8) | octets[1]!).toString(16) + ":" + ((octets[2]! << 8) | octets[3]!).toString(16);
  }
  const [head, tail, extra] = text.split("::");
  if (extra !== undefined) return undefined;
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const missing = 8 - left.length - right.length;
  if (tail === undefined ? left.length !== 8 : missing < 1) return undefined;
  const groups = [...left, ...Array(tail === undefined ? 0 : missing).fill("0"), ...right];
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 8; i++) {
    const value = Number.parseInt(groups[i]!, 16);
    if (!Number.isInteger(value) || value < 0 || value > 0xffff) return undefined;
    bytes[i * 2] = value >> 8;
    bytes[i * 2 + 1] = value & 0xff;
  }
  return bytes;
}

/** Unparseable input, IPv4-mapped/compatible forms with a private IPv4, NAT64 and 6to4 are all denied. */
function isPrivateAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return PRIVATE_V4.check(ip, "ipv4");
  if (family !== 6) return true;
  const bytes = ipv6Bytes(ip);
  if (!bytes) return true;
  const leadingZero = bytes.subarray(0, 10).every((byte) => byte === 0);
  const embedded = bytes.subarray(12).join(".");
  if (leadingZero && bytes[10] === 0xff && bytes[11] === 0xff) return PRIVATE_V4.check(embedded, "ipv4");
  if (leadingZero && bytes[10] === 0 && bytes[11] === 0 && bytes.subarray(12).some((byte) => byte !== 0)) return true;
  return PRIVATE_V6.check(ip, "ipv6");
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

function oauthCacheKey(credential: Credential, plan: InvocationPlan): string {
  const audience = credential.audience || plan.audience;
  return `integration:oauth:${plan.tenantId}:${plan.credentialReference}:${plan.credentialRevision}:${audience}`;
}

async function authHeaders(
  credential: Credential,
  plan: InvocationPlan,
  options: IntegrationHttpOptions,
  fetcher: PinnedFetcher,
  lookup: (hostname: string) => Promise<readonly string[]>,
  signal: AbortSignal,
): Promise<Record<string, string>> {
  if (credential.type === "api_key") {
    if (!credential.apiKey) throw coded("INTEGRATION_CREDENTIAL_INVALID");
    return { [credential.header || "x-api-key"]: credential.apiKey };
  }
  if (credential.type === "bearer") {
    if (!credential.token) throw coded("INTEGRATION_CREDENTIAL_INVALID");
    return { authorization: `Bearer ${credential.token}` };
  }
  if (credential.type !== "oauth2_client_credentials") return {};
  if (!credential.clientId || !credential.clientSecret) throw coded("INTEGRATION_CREDENTIAL_INVALID");
  const audience = credential.audience || plan.audience;
  const key = oauthCacheKey(credential, plan);
  const cached = await options.tokenCache?.get(key);
  if (cached) return { authorization: `Bearer ${cached}` };
  if (!credential.tokenUrl) throw coded("INTEGRATION_OAUTH_CONFIG_INVALID");
  const target = await resolveOutboundTarget(credential.tokenUrl, lookup, options);
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: credential.clientId,
    client_secret: credential.clientSecret,
    ...(credential.scope ? { scope: credential.scope } : {}),
    ...(audience ? { audience } : {}),
  });
  const response = await fetcher(target.url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    redirect: "manual",
    signal,
  }, target.address);
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw coded("INTEGRATION_OAUTH_TOKEN_FAILED", response.status >= 500 || response.status === 429);
  }
  const bytes = await boundedBody(response, positiveLimit(options.maxCredentialResponseBytes, DEFAULT_MAX_CREDENTIAL_RESPONSE_BYTES));
  let token: { access_token?: string; expires_in?: number };
  try {
    token = JSON.parse(new TextDecoder().decode(bytes)) as typeof token;
  } catch {
    throw coded("INTEGRATION_OAUTH_TOKEN_INVALID");
  }
  if (!token.access_token) throw coded("INTEGRATION_OAUTH_TOKEN_INVALID");
  const expiresIn = Number(token.expires_in);
  await options.tokenCache?.set(key, token.access_token, Math.max(1, (Number.isFinite(expiresIn) ? expiresIn : 3_600) - 60));
  return { authorization: `Bearer ${token.access_token}` };
}

function withoutBlankIdempotencyKey(
  headers: Readonly<Record<string, string>>,
): Record<string, string> {
  return Object.fromEntries(Object.entries(headers).filter(([name, value]) =>
    name.toLowerCase() !== "idempotency-key" || value.trim().length > 0));
}

export function pinnedFetch(url: URL, init: RequestInit, address: string): Promise<Response> {
  return new Promise((resolve, reject) => {
    const request = httpsRequest(url, {
      method: init.method,
      headers: init.headers as Record<string, string>,
      signal: init.signal ?? undefined,
      // Node >= 20 calls lookup with { all: true } (autoSelectFamily) and expects an array.
      lookup: ((_hostname: string, lookupOptions: { all?: boolean }, callback: (...args: unknown[]) => void) => {
        const family = isIP(address);
        if (lookupOptions?.all) callback(null, [{ address, family }]);
        else callback(null, address, family);
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
