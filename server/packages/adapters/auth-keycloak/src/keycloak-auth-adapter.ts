import type {
  JwtClaims,
  TokenVerifier,
  VerifiedToken,
} from "@athyper/server-contract-auth";
import type { Logger } from "@athyper/server-foundation/observability";
import { jwtVerify } from "jose";

import {
  KeycloakJwksManager,
  normalizeIssuerUrl,
  type JwksHealthStatus,
} from "./keycloak-jwks-manager.js";

export interface KeycloakRealmConfig {
  readonly issuerUrl: string;
  readonly audience: string;
}

export interface KeycloakAuthAdapterConfig {
  readonly defaultRealm: KeycloakRealmConfig;
  readonly additionalRealms?: Readonly<Record<string, KeycloakRealmConfig>>;
  readonly algorithms?: readonly string[];
  readonly clockToleranceSeconds?: number;
  readonly jwksCacheTtlMs?: number;
  readonly jwksWarmUpTimeoutMs?: number;
  readonly logger?: Pick<Logger, "info" | "warn" | "error">;
  readonly fetcher?: typeof fetch;
}

export interface KeycloakAuthAdapter extends TokenVerifier {
  getIssuerUrl(realmKey?: string): string;
  getJwksHealth(realmKey?: string): Readonly<Record<string, JwksHealthStatus>>;
  warmUp(): Promise<void>;
}

interface RealmEntry {
  readonly issuerUrl: string;
  readonly audience: string;
  readonly jwks: KeycloakJwksManager;
}

const DEFAULT_REALM_KEY = "default";

export function createKeycloakAuthAdapter(
  config: KeycloakAuthAdapterConfig,
): KeycloakAuthAdapter {
  const algorithms = [...(config.algorithms ?? ["RS256"])];
  if (algorithms.length === 0) {
    throw new TypeError("At least one Keycloak JWT algorithm is required");
  }
  const clockTolerance = config.clockToleranceSeconds ?? 30;
  if (!Number.isFinite(clockTolerance) || clockTolerance < 0) {
    throw new TypeError("Keycloak clock tolerance must be non-negative");
  }

  const realms = new Map<string, RealmEntry>();
  realms.set(DEFAULT_REALM_KEY, createRealm(config.defaultRealm, config));

  for (const [realmKey, realmConfig] of Object.entries(
    config.additionalRealms ?? {},
  )) {
    if (!realmKey.trim() || realmKey === DEFAULT_REALM_KEY) {
      throw new TypeError(`Invalid additional Keycloak realm key: ${realmKey}`);
    }
    realms.set(realmKey, createRealm(realmConfig, config));
  }

  const getRealm = (realmKey = DEFAULT_REALM_KEY): RealmEntry => {
    const realm = realms.get(realmKey);
    if (!realm) throw new Error(`Unknown Keycloak realm: ${realmKey}`);
    return realm;
  };

  return {
    async verify(token, realmKey) {
      if (!token.trim()) throw new TypeError("JWT token must not be empty");
      const realm = getRealm(realmKey);
      const { payload } = await jwtVerify(token, realm.jwks.getKeySet(), {
        issuer: realm.issuerUrl,
        audience: realm.audience,
        algorithms,
        clockTolerance,
      });
      return toVerifiedToken(payload as JwtClaims);
    },

    getIssuerUrl(realmKey) {
      return getRealm(realmKey).issuerUrl;
    },

    getJwksHealth(realmKey) {
      if (realmKey) return { [realmKey]: getRealm(realmKey).jwks.getHealth() };
      return Object.fromEntries(
        [...realms].map(([key, realm]) => [key, realm.jwks.getHealth()]),
      );
    },

    async warmUp() {
      await Promise.all([...realms.values()].map((realm) => realm.jwks.warmUp()));
    },
  };
}

function createRealm(
  realmConfig: KeycloakRealmConfig,
  adapterConfig: KeycloakAuthAdapterConfig,
): RealmEntry {
  const issuerUrl = normalizeIssuerUrl(realmConfig.issuerUrl);
  const audience = realmConfig.audience.trim();
  if (!audience) throw new TypeError("Keycloak audience must not be empty");

  return {
    issuerUrl,
    audience,
    jwks: new KeycloakJwksManager(issuerUrl, {
      cacheTtlMs: adapterConfig.jwksCacheTtlMs,
      warmUpTimeoutMs: adapterConfig.jwksWarmUpTimeoutMs,
      logger: adapterConfig.logger,
      fetcher: adapterConfig.fetcher,
    }),
  };
}

function toVerifiedToken(claims: JwtClaims): VerifiedToken {
  const issuer = requireStringClaim(claims, "iss");
  const subject = requireStringClaim(claims, "sub");
  const rawAudience = claims["aud"];
  const audience =
    typeof rawAudience === "string"
      ? [rawAudience]
      : Array.isArray(rawAudience) &&
          rawAudience.every((value) => typeof value === "string")
        ? rawAudience
        : null;
  if (!audience || audience.length === 0) {
    throw new TypeError('Verified JWT must contain an "aud" claim');
  }

  return {
    claims,
    issuer,
    subject,
    audience,
    ...(typeof claims["iat"] === "number" ? { issuedAt: claims["iat"] } : {}),
    ...(typeof claims["exp"] === "number" ? { expiresAt: claims["exp"] } : {}),
  };
}

function requireStringClaim(claims: JwtClaims, name: string): string {
  const value = claims[name];
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`Verified JWT must contain a non-empty "${name}" claim`);
  }
  return value;
}
