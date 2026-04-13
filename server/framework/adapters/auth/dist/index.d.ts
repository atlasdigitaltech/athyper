import * as jose from 'jose';

interface AdapterLogger {
    info(event: string, fields?: Record<string, unknown>): void;
    warn(event: string, fields?: Record<string, unknown>): void;
    error(event: string, fields?: Record<string, unknown>): void;
}
interface JwksHealthStatus {
    healthy: boolean;
    lastFetchAt: number | null;
    lastFailureAt: number | null;
    lastFailureReason: string | null;
    keyCount: number;
}
interface JwksManagerOptions {
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
declare class JwksManager {
    private readonly issuerUrl;
    private readonly jwksUri;
    private readonly remoteKeySet;
    private readonly options;
    private readonly logger?;
    private _lastFetchAt;
    private _lastFailureAt;
    private _lastFailureReason;
    private _keyCount;
    constructor(issuerUrl: string, options?: JwksManagerOptions);
    /**
     * Returns the jose remote key set function, suitable for jwtVerify().
     * Tracks fetch success/failure for health reporting.
     */
    getKeySet(): ReturnType<typeof jose.createRemoteJWKSet>;
    getHealth(): JwksHealthStatus;
    /** Warm-start: try to fetch JWKS eagerly (non-blocking, logs errors). */
    warmUp(): Promise<void>;
    /** Attempt to load cached JWKS from Redis (cold boot). */
    warmFromRedis(): Promise<void>;
    getIssuerUrl(): string;
    getJwksUri(): string;
    private realmKeyFromIssuer;
}

interface AuthAdapterConfig {
    issuerUrl: string;
    clientId: string;
    clientSecret: string;
    /** Additional realm configs for multi-realm setups. Map of realmKey → { issuerUrl, clientId }. */
    additionalRealms?: Record<string, {
        issuerUrl: string;
        clientId: string;
    }>;
    /** Optional Redis-like client for JWKS warm-start (ioredis-compatible: get/setex). */
    redisClient?: {
        get(key: string): Promise<string | null>;
        setex(key: string, seconds: number, value: string): Promise<unknown>;
    };
    /** JWKS cache TTL in ms (default 600_000). */
    jwksCacheTtlMs?: number;
    /**
     * Optional structured logger for JWKS lifecycle events (warm-up failures,
     * Redis warm-start failures). Passed to each realm's JwksManager.
     */
    logger?: AdapterLogger;
}
interface JwtVerifier {
    verifyJwt(token: string): Promise<{
        claims: Record<string, unknown>;
    }>;
}
interface AuthAdapter {
    /** Verify a JWT token using the default realm's JWKS. */
    verifyToken(token: string): Promise<Record<string, unknown>>;
    /** Get the default realm's issuer URL. */
    getIssuerUrl(): string;
    /** Get a realm-scoped JWT verifier. */
    getVerifier(realmKey: string): Promise<JwtVerifier>;
    /** Get JWKS health status for a specific realm or all realms. */
    getJwksHealth(realmKey?: string): Record<string, JwksHealthStatus>;
    /** Warm up JWKS caches (call at startup). */
    warmUp(): Promise<void>;
}
declare function createAuthAdapter(config: AuthAdapterConfig): AuthAdapter;

export { type AuthAdapter, type AuthAdapterConfig, type JwksHealthStatus, JwksManager, type JwksManagerOptions, type JwtVerifier, createAuthAdapter };
