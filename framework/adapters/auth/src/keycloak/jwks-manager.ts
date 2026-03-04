// framework/adapters/auth/src/keycloak/jwks-manager.ts
//
// Realm-scoped JWKS key set manager with caching, health tracking,
// and optional Redis warm-start for cold boot safety.

import * as jose from "jose";

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
    /** Optional Redis-like client for warm-start. Must support get/set with string values. */
    redisClient?: { get(key: string): Promise<string | null>; set(key: string, value: string, options?: { EX?: number }): Promise<unknown> };
    /** Redis key prefix (default "jwks:") */
    redisKeyPrefix?: string;
}

export class JwksManager {
    private readonly issuerUrl: string;
    private readonly jwksUri: string;
    private readonly remoteKeySet: ReturnType<typeof jose.createRemoteJWKSet>;
    private readonly options: Required<Pick<JwksManagerOptions, "cacheTtlMs" | "redisKeyPrefix">> & JwksManagerOptions;

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
        const wrapped = async (protectedHeader: jose.JWSHeaderParameters, token: jose.FlattenedJWSInput) => {
            try {
                const key = await this.remoteKeySet(protectedHeader, token);
                this._lastFetchAt = Date.now();
                this._keyCount++;
                return key;
            } catch (err) {
                this._lastFailureAt = Date.now();
                this._lastFailureReason = err instanceof Error ? err.message : String(err);
                throw err;
            }
        };
        return wrapped as ReturnType<typeof jose.createRemoteJWKSet>;
    }

    getHealth(): JwksHealthStatus {
        return {
            healthy: this._lastFailureAt === null || (this._lastFetchAt !== null && this._lastFetchAt > this._lastFailureAt),
            lastFetchAt: this._lastFetchAt,
            lastFailureAt: this._lastFailureAt,
            lastFailureReason: this._lastFailureReason,
            keyCount: this._keyCount,
        };
    }

    /** Warm-start: try to fetch JWKS eagerly (non-blocking, logs errors). */
    async warmUp(): Promise<void> {
        try {
            const res = await fetch(this.jwksUri);
            if (res.ok) {
                this._lastFetchAt = Date.now();
                const jwks = (await res.json()) as { keys?: unknown[] };
                this._keyCount = Array.isArray(jwks?.keys) ? jwks.keys.length : 0;

                // Persist to Redis if available
                if (this.options.redisClient) {
                    const key = `${this.options.redisKeyPrefix}${this.realmKeyFromIssuer()}`;
                    await this.options.redisClient.set(key, JSON.stringify(jwks), { EX: Math.floor(this.options.cacheTtlMs / 1000) * 6 });
                }
            }
        } catch (err) {
            this._lastFailureAt = Date.now();
            this._lastFailureReason = err instanceof Error ? err.message : String(err);
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
            }
        } catch {
            // Redis warm-start is best-effort
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
