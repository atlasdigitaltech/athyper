// Realm safety test — validates redirect URI allowlisting,
// issuer/realm matching, and environment guardrails.

import {
  validateRedirectUri,
  assertIssuerMatchesRealm,
  assertEnvironmentGuardrails,
  RealmSafetyError,
} from "../realm-safety.js";

import type { RuntimeConfig } from "../../../../../kernel/config.schema.js";

// ─── Helpers ────────────────────────────────────────────────────

/** Builds a minimal RuntimeConfig for guardrail testing. */
function makeConfig(overrides: {
  env?: RuntimeConfig["env"];
  publicBaseUrl?: string;
  realmIssuerUrl?: string;
}): RuntimeConfig {
  return {
    env: overrides.env ?? "local",
    mode: "api",
    serviceName: "athyper-test",
    port: 3000,
    logLevel: "info",
    shutdownTimeoutMs: 15000,
    publicBaseUrl: overrides.publicBaseUrl,
    db: { url: "postgresql://localhost/test", poolMax: 10 },
    iam: {
      strategy: "single_realm",
      defaultRealmKey: "main",
      requireTenantClaimsInProd: true,
      realms: {
        main: {
          defaults: {},
          iam: {
            issuerUrl:
              overrides.realmIssuerUrl ?? "https://idp.athyper.com/realms/main",
            clientId: "athyper-web",
          },
          redirectUriAllowlist: [],
          featureFlags: {
            bffSessions: false,
            refreshRotation: false,
            csrfProtection: false,
            strictIssuerCheck: false,
            pkceFlow: false,
          },
          platformMinimums: {
            passwordMinLength: 8,
            passwordHistory: 1,
            maxLoginFailures: 10,
            lockoutDurationMinutes: 5,
          },
          tenants: {},
        },
      },
    },
    redis: { url: "redis://localhost:6379" },
    s3: {
      endpoint: "http://localhost:9000",
      accessKey: "minioadmin",
      secretKey: "minioadmin",
      region: "us-east-1",
      bucket: "athyper",
      useSSL: false,
    },
    telemetry: {
      enabled: false,
      serviceName: "athyper-test",
      serviceVersion: "1.0.0",
    },
    platformControl: {
      enabled: false,
      realmKey: "platform-control",
      roles: {
        productAdmin: "PRODUCT_ADMIN",
        tenantManager: "TENANT_MANAGER",
        supportAdmin: "SUPPORT_ADMIN",
        readOnlySupport: "READ_ONLY_SUPPORT",
      },
      sessionNamespace: "platform",
      rolePermissions: {},
    },
  } as RuntimeConfig;
}

// ─── Tests ──────────────────────────────────────────────────────

describe("validateRedirectUri", () => {
  it("accepts matching URI", () => {
    expect(() =>
      validateRedirectUri(
        "https://app.athyper.com/callback",
        ["https://app.athyper.com/callback"],
        "production",
      ),
    ).not.toThrow();
  });

  it("rejects non-matching URI", () => {
    expect(() =>
      validateRedirectUri(
        "https://evil.example.com/callback",
        ["https://app.athyper.com/callback"],
        "production",
      ),
    ).toThrow(RealmSafetyError);
  });

  it("rejects wildcard in production", () => {
    expect(() =>
      validateRedirectUri(
        "https://app.athyper.com/callback",
        ["https://*.athyper.com/callback"],
        "production",
      ),
    ).toThrow(RealmSafetyError);

    // Verify the error code
    try {
      validateRedirectUri(
        "https://app.athyper.com/callback",
        ["https://*.athyper.com/callback"],
        "production",
      );
    } catch (e) {
      expect(e).toBeInstanceOf(RealmSafetyError);
      expect((e as RealmSafetyError).code).toBe("PROD_WILDCARD_REDIRECT");
    }
  });

  it("accepts wildcard in local", () => {
    expect(() =>
      validateRedirectUri(
        "https://app.athyper.com/callback",
        ["https://*.athyper.com/callback"],
        "local",
      ),
    ).not.toThrow();
  });

  it("accepts wildcard match in staging", () => {
    expect(() =>
      validateRedirectUri(
        "https://staging.athyper.com/callback",
        ["https://*.athyper.com/callback"],
        "staging",
      ),
    ).not.toThrow();
  });

  it("skips check when allowlist is empty", () => {
    expect(() =>
      validateRedirectUri("https://anything.example.com", [], "production"),
    ).not.toThrow();
  });
});

describe("assertIssuerMatchesRealm", () => {
  it("passes on match", () => {
    expect(() =>
      assertIssuerMatchesRealm(
        "https://idp.athyper.com/realms/main",
        "https://idp.athyper.com/realms/main",
      ),
    ).not.toThrow();
  });

  it("throws on mismatch", () => {
    expect(() =>
      assertIssuerMatchesRealm(
        "https://idp.athyper.com/realms/evil",
        "https://idp.athyper.com/realms/main",
      ),
    ).toThrow(RealmSafetyError);

    try {
      assertIssuerMatchesRealm(
        "https://idp.athyper.com/realms/evil",
        "https://idp.athyper.com/realms/main",
      );
    } catch (e) {
      expect((e as RealmSafetyError).code).toBe("ISSUER_REALM_MISMATCH");
    }
  });

  it("normalizes trailing slashes", () => {
    expect(() =>
      assertIssuerMatchesRealm(
        "https://idp.athyper.com/realms/main/",
        "https://idp.athyper.com/realms/main",
      ),
    ).not.toThrow();

    expect(() =>
      assertIssuerMatchesRealm(
        "https://idp.athyper.com/realms/main///",
        "https://idp.athyper.com/realms/main/",
      ),
    ).not.toThrow();
  });
});

describe("assertEnvironmentGuardrails", () => {
  it("passes for non-production", () => {
    expect(() =>
      assertEnvironmentGuardrails(makeConfig({ env: "local" })),
    ).not.toThrow();
  });

  it("passes for staging environment", () => {
    expect(() =>
      assertEnvironmentGuardrails(makeConfig({ env: "staging" })),
    ).not.toThrow();
  });

  it("rejects localhost IdP in production", () => {
    expect(() =>
      assertEnvironmentGuardrails(
        makeConfig({
          env: "production",
          publicBaseUrl: "https://app.athyper.com",
          realmIssuerUrl: "http://localhost:8080/realms/main",
        }),
      ),
    ).toThrow(RealmSafetyError);
  });
});
