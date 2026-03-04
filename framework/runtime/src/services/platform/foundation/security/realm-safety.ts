// framework/runtime/src/services/platform/foundation/security/realm-safety.ts
//
// Redirect URI validation, JWT issuer checks, and boot-time realm safety assertions.

import type { RuntimeConfig } from "../../../../kernel/config.schema.js";

// ─── Errors ──────────────────────────────────────────────────────

export class RealmSafetyError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly meta?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "RealmSafetyError";
  }
}

// ─── Redirect URI Validation ─────────────────────────────────────

/**
 * Validates a redirect URI against an allowlist.
 * In production, wildcards are forbidden.
 */
export function validateRedirectUri(
  uri: string,
  allowlist: string[],
  env: string,
): void {
  if (allowlist.length === 0) return; // no allowlist configured = skip check

  if (env === "production") {
    // No wildcards allowed in production
    for (const entry of allowlist) {
      if (entry.includes("*")) {
        throw new RealmSafetyError(
          "PROD_WILDCARD_REDIRECT",
          `Redirect URI allowlist contains wildcard in production: ${entry}`,
          { entry },
        );
      }
    }
  }

  const matches = allowlist.some((allowed) => {
    if (allowed.includes("*")) {
      // Simple wildcard matching for non-prod
      const pattern = new RegExp("^" + allowed.replace(/\*/g, ".*") + "$");
      return pattern.test(uri);
    }
    return uri === allowed;
  });

  if (!matches) {
    throw new RealmSafetyError(
      "REDIRECT_URI_NOT_ALLOWED",
      `Redirect URI not in allowlist: ${uri}`,
      { uri, allowlistCount: allowlist.length },
    );
  }
}

// ─── Issuer Validation ───────────────────────────────────────────

/**
 * Asserts that a JWT's issuer claim matches the configured issuer URL for the realm.
 * Normalizes trailing slashes before comparison.
 */
export function assertIssuerMatchesRealm(
  jwtIssuer: string,
  configuredIssuerUrl: string,
): void {
  const normalizedJwt = jwtIssuer.replace(/\/+$/, "");
  const normalizedConfig = configuredIssuerUrl.replace(/\/+$/, "");

  if (normalizedJwt !== normalizedConfig) {
    throw new RealmSafetyError(
      "ISSUER_REALM_MISMATCH",
      `JWT issuer "${normalizedJwt}" does not match configured realm "${normalizedConfig}"`,
      { jwtIssuer: normalizedJwt, configuredIssuer: normalizedConfig },
    );
  }
}

// ─── Boot-Time Realm Safety ──────────────────────────────────────

interface OidcDiscovery {
  issuer: string;
  authorization_endpoint?: string;
  token_endpoint?: string;
  jwks_uri?: string;
  end_session_endpoint?: string;
}

/**
 * At startup, fetches each realm's OpenID discovery document and verifies
 * the `issuer` field matches what's configured. Refuses boot on mismatch.
 *
 * Only runs for staging/production. Skipped in local.
 */
export async function assertBootRealmSafety(
  config: RuntimeConfig,
): Promise<void> {
  if (config.env === "local") return;

  const realms = config.iam.realms;
  const errors: string[] = [];

  for (const [realmKey, realmConfig] of Object.entries(realms)) {
    const issuerUrl = realmConfig.iam.issuerUrl.replace(/\/+$/, "");
    const discoveryUrl = `${issuerUrl}/.well-known/openid-configuration`;

    try {
      const res = await fetch(discoveryUrl, {
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        errors.push(
          `[${realmKey}] OIDC discovery HTTP ${res.status} from ${discoveryUrl}`,
        );
        continue;
      }

      const discovery = (await res.json()) as OidcDiscovery;
      const discoveredIssuer = discovery.issuer?.replace(/\/+$/, "");

      if (discoveredIssuer !== issuerUrl) {
        errors.push(
          `[${realmKey}] Issuer mismatch: config="${issuerUrl}", discovered="${discoveredIssuer}"`,
        );
      }
    } catch (err) {
      errors.push(
        `[${realmKey}] Failed to fetch OIDC discovery: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // Validate redirect URI allowlist in production
    if (config.env === "production") {
      const allowlist = (realmConfig as any).redirectUriAllowlist as
        | string[]
        | undefined;
      if (allowlist) {
        for (const entry of allowlist) {
          if (entry.includes("*")) {
            errors.push(
              `[${realmKey}] Wildcard in redirect URI allowlist is forbidden in production: ${entry}`,
            );
          }
        }
      }
    }
  }

  if (errors.length > 0) {
    throw new RealmSafetyError(
      "ISSUER_REALM_MISMATCH",
      `Boot realm safety check failed:\n${errors.join("\n")}`,
      { errors },
    );
  }
}

// ─── Environment Guardrails ──────────────────────────────────────

/**
 * Validates environment-specific security constraints at boot time.
 * Throws RealmSafetyError if production environment points to non-prod infrastructure.
 */
export function assertEnvironmentGuardrails(config: RuntimeConfig): void {
  if (config.env !== "production") return;

  const errors: string[] = [];

  for (const [realmKey, realmConfig] of Object.entries(config.iam.realms)) {
    const issuerUrl = realmConfig.iam.issuerUrl.toLowerCase();

    // Prod must not point to localhost/dev IdP
    if (
      issuerUrl.includes("localhost") ||
      issuerUrl.includes("127.0.0.1") ||
      issuerUrl.includes("0.0.0.0")
    ) {
      errors.push(
        `[${realmKey}] Production realm points to localhost IdP: ${realmConfig.iam.issuerUrl}`,
      );
    }

    if (
      issuerUrl.includes("-dev") ||
      issuerUrl.includes(".dev.") ||
      issuerUrl.includes("/dev/")
    ) {
      errors.push(
        `[${realmKey}] Production realm appears to point to dev IdP: ${realmConfig.iam.issuerUrl}`,
      );
    }
  }

  // publicBaseUrl should be set in production
  if (!config.publicBaseUrl) {
    errors.push("publicBaseUrl is required in production");
  }

  // ─── Platform-control realm guardrails ─────────────────────────
  if (config.platformControl.enabled) {
    const pcRealmKey = config.platformControl.realmKey;
    const pcRealm = config.iam.realms[pcRealmKey];

    if (!pcRealm) {
      errors.push(
        `Platform-control realm "${pcRealmKey}" is enabled but not found in iam.realms`,
      );
    } else {
      // Platform realm must be isolated — must not share issuerUrl with any tenant realm
      for (const [key, realm] of Object.entries(config.iam.realms)) {
        if (key !== pcRealmKey) {
          const pcIssuer = pcRealm.iam.issuerUrl
            .replace(/\/+$/, "")
            .toLowerCase();
          const tenantIssuer = realm.iam.issuerUrl
            .replace(/\/+$/, "")
            .toLowerCase();
          if (pcIssuer === tenantIssuer) {
            errors.push(
              `Platform-control realm "${pcRealmKey}" shares issuerUrl with tenant realm "${key}" — must be isolated`,
            );
          }
        }
      }
    }
  }

  if (errors.length > 0) {
    throw new RealmSafetyError(
      "PROD_NONPROD_IDP",
      `Environment guardrail violations:\n${errors.join("\n")}`,
      { errors },
    );
  }
}
