// Environment guardrail tests — validates production safety checks
// reject non-prod infrastructure in production environments.

import {
    assertEnvironmentGuardrails,
    RealmSafetyError,
} from "../realm-safety.js";

import type { RuntimeConfig } from "../../../../../kernel/config.schema.js";

// ─── Helpers ────────────────────────────────────────────────────

function makeConfig(overrides: {
    env?: RuntimeConfig["env"];
    publicBaseUrl?: string;
    realmIssuerUrl?: string;
    redirectUriAllowlist?: string[];
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
                        issuerUrl: overrides.realmIssuerUrl ?? "https://idp.athyper.com/realms/main",
                        clientId: "athyper-web",
                    },
                    redirectUriAllowlist: overrides.redirectUriAllowlist ?? [],
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
        telemetry: { enabled: false, serviceName: "athyper-test", serviceVersion: "1.0.0" },
        platformControl: { enabled: false, realmKey: "platform-control", roles: { productAdmin: "PRODUCT_ADMIN", tenantManager: "TENANT_MANAGER", supportAdmin: "SUPPORT_ADMIN", readOnlySupport: "READ_ONLY_SUPPORT" }, sessionNamespace: "platform", rolePermissions: {} },
    } as RuntimeConfig;
}

// ─── Tests ──────────────────────────────────────────────────────

describe("assertEnvironmentGuardrails", () => {
    // ── Non-production: always pass ──

    it("passes for local environment (no restrictions)", () => {
        expect(() =>
            assertEnvironmentGuardrails(makeConfig({ env: "local" })),
        ).not.toThrow();
    });

    it("passes for staging environment (no restrictions)", () => {
        expect(() =>
            assertEnvironmentGuardrails(makeConfig({ env: "staging" })),
        ).not.toThrow();
    });

    it("passes for local environment with localhost IdP", () => {
        expect(() =>
            assertEnvironmentGuardrails(
                makeConfig({
                    env: "local",
                    realmIssuerUrl: "http://localhost:8080/realms/main",
                }),
            ),
        ).not.toThrow();
    });

    // ── Production: valid config passes ──

    it("passes for production with valid config", () => {
        expect(() =>
            assertEnvironmentGuardrails(
                makeConfig({
                    env: "production",
                    publicBaseUrl: "https://app.athyper.com",
                    realmIssuerUrl: "https://idp.athyper.com/realms/main",
                }),
            ),
        ).not.toThrow();
    });

    // ── Production: localhost IdP rejection ──

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

    it("rejects 127.0.0.1 IdP in production", () => {
        expect(() =>
            assertEnvironmentGuardrails(
                makeConfig({
                    env: "production",
                    publicBaseUrl: "https://app.athyper.com",
                    realmIssuerUrl: "http://127.0.0.1:8080/realms/main",
                }),
            ),
        ).toThrow(RealmSafetyError);
    });

    it("rejects 0.0.0.0 IdP in production", () => {
        expect(() =>
            assertEnvironmentGuardrails(
                makeConfig({
                    env: "production",
                    publicBaseUrl: "https://app.athyper.com",
                    realmIssuerUrl: "http://0.0.0.0:8080/realms/main",
                }),
            ),
        ).toThrow(RealmSafetyError);
    });

    // ── Production: dev IdP rejection ──

    it("rejects IdP with -dev suffix in production", () => {
        expect(() =>
            assertEnvironmentGuardrails(
                makeConfig({
                    env: "production",
                    publicBaseUrl: "https://app.athyper.com",
                    realmIssuerUrl: "https://idp-dev.athyper.com/realms/main",
                }),
            ),
        ).toThrow(RealmSafetyError);
    });

    it("rejects IdP with .dev. segment in production", () => {
        expect(() =>
            assertEnvironmentGuardrails(
                makeConfig({
                    env: "production",
                    publicBaseUrl: "https://app.athyper.com",
                    realmIssuerUrl: "https://idp.dev.athyper.com/realms/main",
                }),
            ),
        ).toThrow(RealmSafetyError);
    });

    // ── Production: missing publicBaseUrl ──

    it("rejects production without publicBaseUrl", () => {
        expect(() =>
            assertEnvironmentGuardrails(
                makeConfig({
                    env: "production",
                    realmIssuerUrl: "https://idp.athyper.com/realms/main",
                    // publicBaseUrl intentionally omitted
                }),
            ),
        ).toThrow(RealmSafetyError);
    });

    // ── Error details ──

    it("includes error code PROD_NONPROD_IDP", () => {
        try {
            assertEnvironmentGuardrails(
                makeConfig({
                    env: "production",
                    publicBaseUrl: "https://app.athyper.com",
                    realmIssuerUrl: "http://localhost:8080/realms/main",
                }),
            );
            expect.unreachable("Should have thrown");
        } catch (e) {
            expect(e).toBeInstanceOf(RealmSafetyError);
            expect((e as RealmSafetyError).code).toBe("PROD_NONPROD_IDP");
        }
    });

    it("aggregates multiple violations into one error", () => {
        try {
            assertEnvironmentGuardrails(
                makeConfig({
                    env: "production",
                    realmIssuerUrl: "http://localhost:8080/realms/main",
                    // Missing publicBaseUrl AND localhost IdP
                }),
            );
            expect.unreachable("Should have thrown");
        } catch (e) {
            expect(e).toBeInstanceOf(RealmSafetyError);
            const err = e as RealmSafetyError;
            const errors = err.meta?.errors as string[];
            expect(errors.length).toBeGreaterThanOrEqual(2);
        }
    });
});
