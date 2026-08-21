// server/packages/adapters/auth/src/keycloak/jwks-manager.ts
//
// Realm-scoped JWKS key set manager with caching, health tracking,
// and optional Redis warm-start for cold boot safety.

import * as jose from "jose";
import type { InfraLogger } from "@athyper/platform-core/logger";

export type { InfraLogger as AdapterLogger };

export interface JwksHealthStatus {
  healthy: boolean;
  lastFetchAt: number | null;
  lastFailureAt: number | null;
  lastFailureReason: string | null;
  keyCount: number;
}

export interface JwksManagerOptions {
  /** In-memory cache TTL in ms (default 600_000 = 10 min). Passed to jose cooldownDuration. */
  cacheTtlMs?: number;
  /** Optional Redis-like client for warm-start. Must support get/setex with string values (ioredis-compatible). */
  redisClient?: {
    get(key: string): Promise<string | null>;
    setex(key: string, seconds: number, value: string): Promise<unknown>;
  };
  /** Redis key prefix (default "jwks:") */
  redisKeyPrefix?: string;
  /**
   * Optional structured logger for JWKS lifecycle events (warm-up failures,
   * Redis warm-start failures). When omitted, failures only update health
   * state — no log is emitted.
   */
  logger?: AdapterLogger;
}

export class JwksManager {
  private readonly issuerUrl: string;
  private readonly jwksUri: string;
  private readonly remoteKeySet: ReturnType<typeof jose.createRemoteJWKSet>;
  private readonly options: Required<
    Pick<JwksManagerOptions, "cacheTtlMs" | "redisKeyPrefix">
  > &
    JwksManagerOptions;

  private readonly logger?: AdapterLogger;

  private _lastFetchAt: number | null = null;
  private _lastFailureAt: number | null = null;
  private _lastFailureReason: string | null = null;
  private _keyCount = 0;

  constructor(issuerUrl: string, options?: JwksManagerOptions) {
    this.issuerUrl = issuerUrl.replace(/\/+$/, "");
    this.jwksUri = `${this.issuerUrl}/protocol/openid-connect/certs`;
    this.options = {
      cacheTtlMs: options?.cacheTtlMs ?? 600_000,
      redisKeyPrefix: options?.redisKeyPrefix ?? "jwks:",
      redisClient: options?.redisClient,
    };
    this.logger = options?.logger;

    this.remoteKeySet = jose.createRemoteJWKSet(new URL(this.jwksUri), {
      cooldownDuration: this.options.cacheTtlMs,
    });
  }

  /**
   * Returns the jose remote key set function, suitable for jwtVerify().
   * Tracks fetch success/failure for health reporting.
   */
  getKeySet(): ReturnType<typeof jose.createRemoteJWKSet> {
    // Wrap the key set to track health
    const wrapped = async (
      protectedHeader: jose.JWSHeaderParameters,
      token: jose.FlattenedJWSInput,
    ) => {
      try {
        const key = await this.remoteKeySet(protectedHeader, token);
        this._lastFetchAt = Date.now();
        return key;
      } catch (err) {
        this._lastFailureAt = Date.now();
        this._lastFailureReason =
          err instanceof Error ? err.message : String(err);
        throw err;
      }
    };
    return wrapped as ReturnType<typeof jose.createRemoteJWKSet>;
  }

  getHealth(): JwksHealthStatus {
    return {
      healthy:
        this._lastFailureAt === null ||
        (this._lastFetchAt !== null && this._lastFetchAt > this._lastFailureAt),
      lastFetchAt: this._lastFetchAt,
      lastFailureAt: this._lastFailureAt,
      lastFailureReason: this._lastFailureReason,
      keyCount: this._keyCount,
    };
  }

  /** Warm-start: try to fetch JWKS eagerly (non-blocking, logs errors). */
  async warmUp(): Promise<void> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    try {
      const res = await fetch(this.jwksUri, { signal: controller.signal });
      if (res.ok) {
        this._lastFetchAt = Date.now();
        const jwks = (await res.json()) as { keys?: unknown[] };
        this._keyCount = Array.isArray(jwks?.keys) ? jwks.keys.length : 0;

        // Persist to Redis if available
        if (this.options.redisClient) {
          const key = `${this.options.redisKeyPrefix}${this.realmKeyFromIssuer()}`;
          const ttlSeconds = Math.floor(this.options.cacheTtlMs / 1000) * 6;
          await this.options.redisClient.setex(key, ttlSeconds, JSON.stringify(jwks));
        }
      }
    } catch (err) {
      this._lastFailureAt = Date.now();
      this._lastFailureReason =
        err instanceof Error ? err.message : String(err);
      this.logger?.error("jwks_warmup_failed", {
        issuerUrl: this.issuerUrl,
        error: this._lastFailureReason,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  /** Attempt to load cached JWKS from Redis (cold boot). */
  async warmFromRedis(): Promise<void> {
    if (!this.options.redisClient) return;
    try {
      const key = `${this.options.redisKeyPrefix}${this.realmKeyFromIssuer()}`;
      const cached = await this.options.redisClient.get(key);
      if (cached) {
        const jwks = JSON.parse(cached);
        this._keyCount = Array.isArray(jwks?.keys) ? jwks.keys.length : 0;
        this._lastFetchAt = Date.now();
        this.logger?.info("jwks_warm_from_redis", {
          issuerUrl: this.issuerUrl,
          keyCount: this._keyCount,
        });
      }
    } catch (err) {
      // Redis warm-start is best-effort — failure is non-fatal; live JWKS fetch
      // will be attempted on the first verifyToken() call.
      this.logger?.warn("jwks_redis_warmup_failed", {
        issuerUrl: this.issuerUrl,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  getIssuerUrl(): string {
    return this.issuerUrl;
  }

  getJwksUri(): string {
    return this.jwksUri;
  }

  private realmKeyFromIssuer(): string {
    // Extract a safe key from issuer URL for Redis storage
    return this.issuerUrl.replace(/[^a-zA-Z0-9]/g, "_");
  }
}
