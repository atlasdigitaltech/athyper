import type { Logger } from "@athyper/server-foundation/observability";
import {
  createRemoteJWKSet,
  type FlattenedJWSInput,
  type JWSHeaderParameters,
} from "jose";

export interface JwksHealthStatus {
  readonly healthy: boolean;
  readonly lastSuccessAt: number | null;
  readonly lastFailureAt: number | null;
  readonly lastFailureReason: string | null;
  readonly keyCount: number;
}

export interface KeycloakJwksManagerOptions {
  readonly jwksUrl?: string;
  readonly cacheTtlMs?: number;
  readonly warmUpTimeoutMs?: number;
  readonly logger?: Pick<Logger, "info" | "warn" | "error">;
  readonly fetcher?: typeof fetch;
  readonly now?: () => number;
}

export class KeycloakJwksManager {
  readonly #issuerUrl: string;
  readonly #jwksUrl: URL;
  readonly #remoteKeySet: ReturnType<typeof createRemoteJWKSet>;
  readonly #keySet: ReturnType<typeof createRemoteJWKSet>;
  readonly #fetcher: typeof fetch;
  readonly #now: () => number;
  readonly #logger: KeycloakJwksManagerOptions["logger"];
  readonly #warmUpTimeoutMs: number;

  #lastSuccessAt: number | null = null;
  #lastFailureAt: number | null = null;
  #lastFailureReason: string | null = null;
  #keyCount = 0;

  constructor(issuerUrl: string, options: KeycloakJwksManagerOptions = {}) {
    this.#issuerUrl = normalizeIssuerUrl(issuerUrl);
    this.#jwksUrl = new URL(
      options.jwksUrl ?? `${this.#issuerUrl}/protocol/openid-connect/certs`,
    );
    this.#fetcher = options.fetcher ?? fetch;
    this.#now = options.now ?? Date.now;
    this.#logger = options.logger;
    this.#warmUpTimeoutMs = options.warmUpTimeoutMs ?? 8_000;
    this.#remoteKeySet = createRemoteJWKSet(this.#jwksUrl, {
      cooldownDuration: options.cacheTtlMs ?? 600_000,
    });
    this.#keySet = (async (
      protectedHeader: JWSHeaderParameters,
      token: FlattenedJWSInput,
    ) => {
      try {
        const key = await this.#remoteKeySet(protectedHeader, token);
        this.#recordSuccess();
        return key;
      } catch (error) {
        this.#recordFailure(error);
        throw error;
      }
    }) as ReturnType<typeof createRemoteJWKSet>;
  }

  getKeySet(): ReturnType<typeof createRemoteJWKSet> {
    return this.#keySet;
  }

  getHealth(): JwksHealthStatus {
    return {
      healthy:
        this.#lastFailureAt === null ||
        (this.#lastSuccessAt !== null &&
          this.#lastSuccessAt >= this.#lastFailureAt),
      lastSuccessAt: this.#lastSuccessAt,
      lastFailureAt: this.#lastFailureAt,
      lastFailureReason: this.#lastFailureReason,
      keyCount: this.#keyCount,
    };
  }

  async warmUp(): Promise<void> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.#warmUpTimeoutMs);
    try {
      const response = await this.#fetcher(this.#jwksUrl, {
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`JWKS endpoint returned HTTP ${response.status}`);
      }
      const body = (await response.json()) as { keys?: unknown };
      if (!Array.isArray(body.keys)) {
        throw new Error("JWKS endpoint returned an invalid key set");
      }
      this.#keyCount = body.keys.length;
      this.#recordSuccess();
      this.#logger?.info("keycloak_jwks_warmup_succeeded", {
        issuerUrl: this.#issuerUrl,
        keyCount: this.#keyCount,
      });
    } catch (error) {
      this.#recordFailure(error);
      this.#logger?.warn("keycloak_jwks_warmup_failed", {
        issuerUrl: this.#issuerUrl,
        error: this.#lastFailureReason,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  getIssuerUrl(): string {
    return this.#issuerUrl;
  }

  getJwksUrl(): URL {
    return new URL(this.#jwksUrl);
  }

  #recordSuccess(): void {
    this.#lastSuccessAt = this.#now();
    this.#lastFailureReason = null;
  }

  #recordFailure(error: unknown): void {
    this.#lastFailureAt = this.#now();
    this.#lastFailureReason =
      error instanceof Error ? error.message : String(error);
  }
}

export function normalizeIssuerUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) throw new TypeError("Keycloak issuer URL must not be empty");

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new TypeError(`Invalid Keycloak issuer URL: ${JSON.stringify(value)}`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new TypeError("Keycloak issuer URL must use HTTP or HTTPS");
  }
  return url.toString().replace(/\/$/, "");
}
