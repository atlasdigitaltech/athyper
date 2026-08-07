/**
 * HttpConnectorClient — Phase 5.3
 *
 * Executes outbound HTTP requests to registered event.endpoint targets.
 * Handles auth strategies (none, api_key, bearer_token, oauth2_client_credentials)
 * with OAuth2 token caching in Redis.
 *
 * Per PLATFORM_MIGRATION.md §5.3:
 *   - event.endpoint.config.auth JSONB is encrypted at rest via CredentialEncryptionService.
 *     Decrypted here before constructing the auth strategy.
 *   - OAuth2 access tokens cached in Redis (key: oauth2:token:{tenantId}:{endpointId},
 *     TTL = token.expires_in − 60s). Never fetch a new token on every request.
 *   - Uses circuit breaker (injected) and retry (withRetry).
 *
 * Auth strategy resolution:
 *   none                     → bare request
 *   api_key                  → config.auth.header + config.auth.value
 *   bearer_token             → Authorization: Bearer {config.auth.token}
 *   oauth2_client_credentials→ OAuth2 CC flow → Redis cache → Bearer token
 *   hmac_sha256              → X-Signature: sha256=HMAC(body, secret)
 */

import type { CredentialEncryptionService } from "@athyper/foundation-crypto";
import type { CircuitBreaker } from "@athyper/foundation-kernel/resilience";
import { withRetry } from "@athyper/foundation-kernel/resilience";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface EndpointConfig {
  id:          string;
  tenantId:    string;
  baseUrl:     string;
  authType:    "none" | "api_key" | "bearer_token" | "oauth2_client_credentials" | "hmac_sha256";
  /** Encrypted at rest — decrypted by HttpConnectorClient before use */
  configAuth:  unknown;
}

export interface HttpRequestOptions {
  method:      "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path:        string;
  headers?:    Record<string, string>;
  body?:       unknown;
  timeoutMs?:  number;
}

export interface HttpResponse {
  status:   number;
  headers:  Record<string, string>;
  body:     string;
  ok:       boolean;
}

// ── OAuth2 token cache ────────────────────────────────────────────────────────

interface TokenCacheEntry {
  accessToken: string;
  expiresAt:   number;  // ms since epoch
}

export class OAuth2TokenCache {
  private readonly redis: {
    get(key: string): Promise<string | null>;
    setex(key: string, ttl: number, value: string): Promise<unknown>;
  };

  constructor(redis: { get(key: string): Promise<string | null>; setex(key: string, ttl: number, value: string): Promise<unknown> }) {
    this.redis = redis;
  }

  private key(tenantId: string, endpointId: string): string {
    return `oauth2:token:${tenantId}:${endpointId}`;
  }

  async get(tenantId: string, endpointId: string): Promise<string | null> {
    const cached = await this.redis.get(this.key(tenantId, endpointId));
    if (!cached) return null;
    const entry = JSON.parse(cached) as TokenCacheEntry;
    // Return null if token expires in less than 30s
    if (entry.expiresAt - Date.now() < 30_000) return null;
    return entry.accessToken;
  }

  async set(
    tenantId:    string,
    endpointId:  string,
    accessToken: string,
    expiresIn:   number, // seconds
  ): Promise<void> {
    const entry: TokenCacheEntry = {
      accessToken,
      expiresAt: Date.now() + expiresIn * 1000,
    };
    // TTL = expiresIn - 60s (safe margin)
    const ttl = Math.max(1, expiresIn - 60);
    await this.redis.setex(this.key(tenantId, endpointId), ttl, JSON.stringify(entry));
  }

  async invalidate(tenantId: string, endpointId: string): Promise<void> {
    // Redis setex with TTL=1 effectively evicts immediately
    await this.redis.setex(this.key(tenantId, endpointId), 1, "{}");
  }
}

// ── HttpConnectorClient ───────────────────────────────────────────────────────

export class HttpConnectorClient {
  private readonly encryption?: CredentialEncryptionService;
  private readonly tokenCache?: OAuth2TokenCache;
  private readonly breaker?:   CircuitBreaker;
  private readonly defaultTimeoutMs = 30_000;

  constructor(config: {
    encryption?: CredentialEncryptionService;
    tokenCache?: OAuth2TokenCache;
    breaker?:    CircuitBreaker;
  }) {
    this.encryption = config.encryption;
    this.tokenCache = config.tokenCache;
    this.breaker    = config.breaker;
  }

  /**
   * Execute an outbound HTTP request to an endpoint.
   * Decrypts auth config, builds auth headers, then calls the endpoint.
   */
  async execute(
    endpoint: EndpointConfig,
    request:  HttpRequestOptions,
  ): Promise<HttpResponse> {
    const authHeaders = await this.buildAuthHeaders(endpoint, request.body);
    const url = endpoint.baseUrl.replace(/\/$/, "") + request.path;

    const doRequest = async (): Promise<HttpResponse> => {
      const controller  = new AbortController();
      const timeoutMs   = request.timeoutMs ?? this.defaultTimeoutMs;
      const timer       = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          ...authHeaders,
          ...(request.headers ?? {}),
        };

        const body = request.body !== undefined ? JSON.stringify(request.body) : undefined;

        const response = await fetch(url, {
          method:  request.method,
          headers,
          body,
          signal:  controller.signal,
        });

        const responseBody = await response.text();
        const responseHeaders: Record<string, string> = {};
        response.headers.forEach((v, k) => { responseHeaders[k] = v; });

        return {
          status:  response.status,
          headers: responseHeaders,
          body:    responseBody,
          ok:      response.ok,
        };
      } finally {
        clearTimeout(timer);
      }
    };

    if (this.breaker) {
      return this.breaker.execute(() =>
        withRetry(doRequest, { maxAttempts: 3, initialDelayMs: 500 })
      );
    }

    return withRetry(doRequest, { maxAttempts: 3, initialDelayMs: 500 });
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private async buildAuthHeaders(
    endpoint: EndpointConfig,
    body?:    unknown,
  ): Promise<Record<string, string>> {
    // Decrypt auth config
    let authConfig: Record<string, unknown> = {};
    if (this.encryption && endpoint.configAuth) {
      const decrypted = await this.encryption.decrypt(
        endpoint.tenantId,
        typeof endpoint.configAuth === "string" ? endpoint.configAuth : JSON.stringify(endpoint.configAuth),
      ).catch(() => null);
      if (decrypted) {
        authConfig = JSON.parse(decrypted) as Record<string, unknown>;
      }
    } else if (typeof endpoint.configAuth === "object" && endpoint.configAuth !== null) {
      authConfig = endpoint.configAuth as Record<string, unknown>;
    }

    switch (endpoint.authType) {
      case "none":
        return {};

      case "api_key": {
        const header = String(authConfig["header"] ?? "X-API-Key");
        const value  = String(authConfig["value"] ?? "");
        return { [header]: value };
      }

      case "bearer_token": {
        const token = String(authConfig["token"] ?? "");
        return { Authorization: `Bearer ${token}` };
      }

      case "oauth2_client_credentials": {
        const accessToken = await this.getOAuth2Token(endpoint, authConfig);
        return { Authorization: `Bearer ${accessToken}` };
      }

      case "hmac_sha256": {
        if (body === undefined) return {};
        const { createHmac } = await import("crypto");
        const secret    = String(authConfig["secret"] ?? "");
        const bodyStr   = typeof body === "string" ? body : JSON.stringify(body);
        const signature = createHmac("sha256", secret).update(bodyStr).digest("hex");
        const header    = String(authConfig["header"] ?? "X-Signature");
        return { [header]: `sha256=${signature}` };
      }

      default:
        return {};
    }
  }

  private async getOAuth2Token(
    endpoint:   EndpointConfig,
    authConfig: Record<string, unknown>,
  ): Promise<string> {
    // Check cache first
    if (this.tokenCache) {
      const cached = await this.tokenCache.get(endpoint.tenantId, endpoint.id);
      if (cached) return cached;
    }

    // Fetch new token via client credentials flow
    const tokenUrl     = String(authConfig["tokenUrl"] ?? "");
    const clientId     = String(authConfig["clientId"] ?? "");
    const clientSecret = String(authConfig["clientSecret"] ?? "");
    const scope        = String(authConfig["scope"] ?? "");

    const params = new URLSearchParams({
      grant_type:    "client_credentials",
      client_id:     clientId,
      client_secret: clientSecret,
      ...(scope ? { scope } : {}),
    });

    const response = await fetch(tokenUrl, {
      method:  "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body:    params.toString(),
    });

    if (!response.ok) {
      const err = await response.text().catch(() => "");
      throw new Error(`OAuth2 token fetch failed: ${response.status} ${err}`);
    }

    const tokenData = await response.json() as {
      access_token: string;
      expires_in?:  number;
    };

    const accessToken = tokenData.access_token;
    const expiresIn   = tokenData.expires_in ?? 3600;

    // Cache for future requests
    await this.tokenCache?.set(endpoint.tenantId, endpoint.id, accessToken, expiresIn);

    return accessToken;
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function createHttpConnectorClient(config: {
  encryption?: CredentialEncryptionService;
  tokenCache?: OAuth2TokenCache;
  breaker?:    CircuitBreaker;
}): HttpConnectorClient {
  return new HttpConnectorClient(config);
}

export function createOAuth2TokenCache(redis: {
  get(key: string): Promise<string | null>;
  setex(key: string, ttl: number, value: string): Promise<unknown>;
}): OAuth2TokenCache {
  return new OAuth2TokenCache(redis);
}
