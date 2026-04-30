// server/src/__tests__/config.test.ts
//
// F3 (infra review April 2026): CREDENTIAL_MASTER_KEY enforcement.
// Verifies the Zod superRefine in config.ts requires the key in
// staging/production and enforces the ≥32-character minimum.
//
// The key is optional in local dev (encryption disabled) — that case is
// also covered so a regression cannot silently re-introduce the old
// warn-and-proceed behaviour across any environment.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { loadConfig } from "../config.js";

// Minimum env required to satisfy the rest of the config schema, so these
// tests isolate the credentialMasterKey assertion. DATABASE_URL, REDIS_URL,
// and IAM_ISSUER_URL are mandatory — anything else is optional.
const BASE_ENV = {
  DATABASE_URL:  "postgres://u:p@localhost/db",
  REDIS_URL:     "redis://localhost:6379",
  IAM_ISSUER_URL: "https://iam.example.com/realms/athyper",
} as const;

// Optional-block "gate" vars: each of these, when set, triggers a separate
// schema block that pulls in more required env. Empty them so a dev's local
// environment (e.g. S3_ENDPOINT from ~/.zshrc) cannot leak into assertions.
const OPTIONAL_GATE_VARS = [
  "S3_ENDPOINT",
  "SMTP_HOST",
  "TWILIO_ACCOUNT_SID",
  "PUSH_FCM_PROJECT_ID",
  "VAPID_PUBLIC_KEY",
  "CLAMD_HOST",
  "CLAMD_ON_UNAVAILABLE",
  "GLITCHTIP_DSN",
  "HEALTHCHECKS_BASE_URL",
  "GOTENBERG_BASE_URL",
  "MEILISEARCH_URL",
  "MEILISEARCH_MASTER_KEY",
] as const;

function stubEnv(overrides: Record<string, string | undefined>) {
  // Use undefined (not "") so the var is genuinely absent — required for the
  // "missing key in local" path, where "" would fail Zod's .min(32) rule
  // because empty string is present-but-invalid, not absent.
  for (const k of OPTIONAL_GATE_VARS) vi.stubEnv(k, undefined);
  for (const [k, v] of Object.entries({ ...BASE_ENV, ...overrides })) {
    vi.stubEnv(k, v);
  }
}

describe("F3 — CREDENTIAL_MASTER_KEY enforcement", () => {
  beforeEach(() => {
    // Neutralise the safety preflight (NODE_TLS_REJECT_UNAUTHORIZED,
    // AUTH_DEBUG_EXPOSE_TOKENS, CLAMD_ON_UNAVAILABLE) so these tests only
    // exercise the credentialMasterKey rule.
    vi.stubEnv("NODE_TLS_REJECT_UNAUTHORIZED", "1");
    vi.stubEnv("AUTH_DEBUG_EXPOSE_TOKENS", undefined);
    // NODE_ENV drives env detection alongside ATHYPER_ENV.
    vi.stubEnv("NODE_ENV", "development");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("allows missing CREDENTIAL_MASTER_KEY in local env", () => {
    stubEnv({ ATHYPER_ENV: "local", CREDENTIAL_MASTER_KEY: undefined });
    const cfg = loadConfig();
    expect(cfg.env).toBe("local");
    expect(cfg.credentialMasterKey).toBeUndefined();
  });

  it("throws when CREDENTIAL_MASTER_KEY is missing in staging", () => {
    stubEnv({ ATHYPER_ENV: "staging", CREDENTIAL_MASTER_KEY: undefined });
    expect(() => loadConfig()).toThrow(/CREDENTIAL_MASTER_KEY is required/);
  });

  it("throws when CREDENTIAL_MASTER_KEY is shorter than 32 chars in production", () => {
    stubEnv({
      ATHYPER_ENV:            "production",
      CREDENTIAL_MASTER_KEY: "too-short-key",
    });
    expect(() => loadConfig()).toThrow(/at least 32 characters/);
  });

  it("accepts a 32+ char CREDENTIAL_MASTER_KEY in production", () => {
    const key = "a".repeat(48);
    stubEnv({
      ATHYPER_ENV:            "production",
      CREDENTIAL_MASTER_KEY: key,
    });
    const cfg = loadConfig();
    expect(cfg.env).toBe("production");
    expect(cfg.credentialMasterKey).toBe(key);
  });

  it("resolves staging even when NODE_ENV=production (ENVIRONMENT wins)", () => {
    // Regression for the staging-identity-collapse bug: a container built with
    // NODE_ENV=production (standard for Next.js/Node builds) must NOT be treated
    // as production when ENVIRONMENT=staging is the authoritative signal.
    vi.stubEnv("NODE_ENV", "production");
    const key = "a".repeat(48);
    stubEnv({
      ATHYPER_ENV:            undefined,   // ATHYPER_ENV absent — fall to ENVIRONMENT
      ENVIRONMENT:            "staging",
      CREDENTIAL_MASTER_KEY: key,
    });
    const cfg = loadConfig();
    expect(cfg.env).toBe("staging");
  });
});
