// src/keycloak/auth-adapter.ts
import * as jose2 from "jose";

// src/keycloak/jwks-manager.ts
import * as jose from "jose";
var JwksManager = class {
  issuerUrl;
  jwksUri;
  remoteKeySet;
  options;
  logger;
  _lastFetchAt = null;
  _lastFailureAt = null;
  _lastFailureReason = null;
  _keyCount = 0;
  constructor(issuerUrl, options) {
    this.issuerUrl = issuerUrl.replace(/\/+$/, "");
    this.jwksUri = `${this.issuerUrl}/protocol/openid-connect/certs`;
    this.options = {
      cacheTtlMs: options?.cacheTtlMs ?? 6e5,
      redisKeyPrefix: options?.redisKeyPrefix ?? "jwks:",
      redisClient: options?.redisClient
    };
    this.logger = options?.logger;
    this.remoteKeySet = jose.createRemoteJWKSet(new URL(this.jwksUri), {
      cooldownDuration: this.options.cacheTtlMs
    });
  }
  /**
   * Returns the jose remote key set function, suitable for jwtVerify().
   * Tracks fetch success/failure for health reporting.
   */
  getKeySet() {
    const wrapped = async (protectedHeader, token) => {
      try {
        const key = await this.remoteKeySet(protectedHeader, token);
        this._lastFetchAt = Date.now();
        return key;
      } catch (err) {
        this._lastFailureAt = Date.now();
        this._lastFailureReason = err instanceof Error ? err.message : String(err);
        throw err;
      }
    };
    return wrapped;
  }
  getHealth() {
    return {
      healthy: this._lastFailureAt === null || this._lastFetchAt !== null && this._lastFetchAt > this._lastFailureAt,
      lastFetchAt: this._lastFetchAt,
      lastFailureAt: this._lastFailureAt,
      lastFailureReason: this._lastFailureReason,
      keyCount: this._keyCount
    };
  }
  /** Warm-start: try to fetch JWKS eagerly (non-blocking, logs errors). */
  async warmUp() {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8e3);
    try {
      const res = await fetch(this.jwksUri, { signal: controller.signal });
      if (res.ok) {
        this._lastFetchAt = Date.now();
        const jwks = await res.json();
        this._keyCount = Array.isArray(jwks?.keys) ? jwks.keys.length : 0;
        if (this.options.redisClient) {
          const key = `${this.options.redisKeyPrefix}${this.realmKeyFromIssuer()}`;
          const ttlSeconds = Math.floor(this.options.cacheTtlMs / 1e3) * 6;
          await this.options.redisClient.setex(key, ttlSeconds, JSON.stringify(jwks));
        }
      }
    } catch (err) {
      this._lastFailureAt = Date.now();
      this._lastFailureReason = err instanceof Error ? err.message : String(err);
      this.logger?.error("jwks_warmup_failed", {
        issuerUrl: this.issuerUrl,
        error: this._lastFailureReason
      });
    } finally {
      clearTimeout(timeout);
    }
  }
  /** Attempt to load cached JWKS from Redis (cold boot). */
  async warmFromRedis() {
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
          keyCount: this._keyCount
        });
      }
    } catch (err) {
      this.logger?.warn("jwks_redis_warmup_failed", {
        issuerUrl: this.issuerUrl,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }
  getIssuerUrl() {
    return this.issuerUrl;
  }
  getJwksUri() {
    return this.jwksUri;
  }
  realmKeyFromIssuer() {
    return this.issuerUrl.replace(/[^a-zA-Z0-9]/g, "_");
  }
};

// src/keycloak/auth-adapter.ts
function createAuthAdapter(config) {
  if (!config.issuerUrl) throw new Error("AuthAdapterConfig.issuerUrl is required");
  try {
    new URL(config.issuerUrl);
  } catch {
    throw new Error(`AuthAdapterConfig.issuerUrl is not a valid URL: "${config.issuerUrl}"`);
  }
  if (!config.clientId) throw new Error("AuthAdapterConfig.clientId is required");
  const defaultRealmKey = "__default__";
  const realms = /* @__PURE__ */ new Map();
  const defaultJwks = new JwksManager(config.issuerUrl, {
    cacheTtlMs: config.jwksCacheTtlMs,
    redisClient: config.redisClient,
    logger: config.logger
  });
  realms.set(defaultRealmKey, {
    issuerUrl: config.issuerUrl.replace(/\/+$/, ""),
    clientId: config.clientId,
    jwksManager: defaultJwks
  });
  if (config.additionalRealms) {
    for (const [key, realmCfg] of Object.entries(config.additionalRealms)) {
      const jwks = new JwksManager(realmCfg.issuerUrl, {
        cacheTtlMs: config.jwksCacheTtlMs,
        redisClient: config.redisClient,
        logger: config.logger
      });
      realms.set(key, {
        issuerUrl: realmCfg.issuerUrl.replace(/\/+$/, ""),
        clientId: realmCfg.clientId,
        jwksManager: jwks
      });
    }
  }
  function getRealmEntry(realmKey) {
    const entry = realms.get(realmKey) ?? realms.get(defaultRealmKey);
    if (!entry) {
      throw new Error(`Unknown realm: ${realmKey}`);
    }
    return entry;
  }
  async function verifyWithRealm(token, realm) {
    const keySet = realm.jwksManager.getKeySet();
    const { payload } = await jose2.jwtVerify(token, keySet, {
      issuer: realm.issuerUrl,
      audience: realm.clientId,
      clockTolerance: 30
      // 30s clock skew tolerance
    });
    return payload;
  }
  return {
    async verifyToken(token) {
      const realm = getRealmEntry(defaultRealmKey);
      return verifyWithRealm(token, realm);
    },
    getIssuerUrl() {
      return getRealmEntry(defaultRealmKey).issuerUrl;
    },
    async getVerifier(realmKey) {
      const realm = getRealmEntry(realmKey);
      return {
        async verifyJwt(token) {
          const claims = await verifyWithRealm(token, realm);
          return { claims };
        }
      };
    },
    getJwksHealth(realmKey) {
      const result = {};
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
    async warmUp() {
      const promises = [];
      for (const entry of realms.values()) {
        promises.push(entry.jwksManager.warmFromRedis());
        promises.push(entry.jwksManager.warmUp());
      }
      await Promise.allSettled(promises);
    }
  };
}
export {
  JwksManager,
  createAuthAdapter
};
//# sourceMappingURL=index.js.map