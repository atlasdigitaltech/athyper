// framework/adapters/auth/src/keycloak/auth-adapter.ts
//
// Keycloak OIDC Auth Adapter — real jose-based JWT verification.
// Replaces the previous stub implementation.

import * as jose from "jose";

import { type JwksHealthStatus, JwksManager } from "./jwks-manager.js";

// ─── Public Interfaces ───────────────────────────────────────────

export interface AuthAdapterConfig {
    issuerUrl: string;
    clientId: string;
    clientSecret: string;
    /** Additional realm configs for multi-realm setups. Map of realmKey → { issuerUrl, clientId }. */
    additionalRealms?: Record<string, { issuerUrl: string; clientId: string }>;
    /** Optional Redis-like client for JWKS warm-start. */
    redisClient?: { get(key: string): Promise<string | null>; set(key: string, value: string, options?: { EX?: number }): Promise<unknown> };
    /** JWKS cache TTL in ms (default 600_000). */
    jwksCacheTtlMs?: number;
}

export interface JwtVerifier {
    verifyJwt(token: string): Promise<{ claims: Record<string, unknown> }>;
}

export interface AuthAdapter {
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

// ─── Implementation ──────────────────────────────────────────────

interface RealmEntry {
    issuerUrl: string;
    clientId: string;
    jwksManager: JwksManager;
}

export function createAuthAdapter(config: AuthAdapterConfig): AuthAdapter {
    const defaultRealmKey = "__default__";
    const realms = new Map<string, RealmEntry>();

    // Register default realm
    const defaultJwks = new JwksManager(config.issuerUrl, {
        cacheTtlMs: config.jwksCacheTtlMs,
        redisClient: config.redisClient,
    });
    realms.set(defaultRealmKey, {
        issuerUrl: config.issuerUrl.replace(/\/+$/, ""),
        clientId: config.clientId,
        jwksManager: defaultJwks,
    });

    // Register additional realms
    if (config.additionalRealms) {
        for (const [key, realmCfg] of Object.entries(config.additionalRealms)) {
            const jwks = new JwksManager(realmCfg.issuerUrl, {
                cacheTtlMs: config.jwksCacheTtlMs,
                redisClient: config.redisClient,
            });
            realms.set(key, {
                issuerUrl: realmCfg.issuerUrl.replace(/\/+$/, ""),
                clientId: realmCfg.clientId,
                jwksManager: jwks,
            });
        }
    }

    function getRealmEntry(realmKey: string): RealmEntry {
        const entry = realms.get(realmKey) ?? realms.get(defaultRealmKey);
        if (!entry) {
            throw new Error(`Unknown realm: ${realmKey}`);
        }
        return entry;
    }

    async function verifyWithRealm(token: string, realm: RealmEntry): Promise<Record<string, unknown>> {
        const keySet = realm.jwksManager.getKeySet();

        const { payload } = await jose.jwtVerify(token, keySet, {
            issuer: realm.issuerUrl,
            audience: realm.clientId,
            clockTolerance: 30, // 30s clock skew tolerance
        });

        return payload as Record<string, unknown>;
    }

    return {
        async verifyToken(token: string): Promise<Record<string, unknown>> {
            const realm = getRealmEntry(defaultRealmKey);
            return verifyWithRealm(token, realm);
        },

        getIssuerUrl(): string {
            return getRealmEntry(defaultRealmKey).issuerUrl;
        },

        async getVerifier(realmKey: string): Promise<JwtVerifier> {
            const realm = getRealmEntry(realmKey);
            return {
                async verifyJwt(token: string): Promise<{ claims: Record<string, unknown> }> {
                    const claims = await verifyWithRealm(token, realm);
                    return { claims };
                },
            };
        },

        getJwksHealth(realmKey?: string): Record<string, JwksHealthStatus> {
            const result: Record<string, JwksHealthStatus> = {};
            if (realmKey) {
                const entry = realms.get(realmKey);
                if (entry) {
                    result[realmKey] = entry.jwksManager.getHealth();
                }
            } else {
                for (const [key, entry] of realms) {
                    result[key === defaultRealmKey ? "default" : key] = entry.jwksManager.getHealth();
                }
            }
            return result;
        },

        async warmUp(): Promise<void> {
            const promises: Promise<void>[] = [];
            for (const entry of realms.values()) {
                promises.push(entry.jwksManager.warmFromRedis());
                promises.push(entry.jwksManager.warmUp());
            }
            await Promise.allSettled(promises);
        },
    };
}
