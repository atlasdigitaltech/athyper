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
  "PUSH_FCM_SERVICE_ACCOUNT_KEY",
  "VAPID_SUBJECT",
  "VAPID_PUBLIC_KEY",
  "VAPID_PRIVATE_KEY",
  "CLAMD_HOST",
  "CLAMD_ON_UNAVAILABLE",
  "GLITCHTIP_DSN",
  "CRONWATCH_BASE_URL",
  "DOCRENDER_BASE_URL",
  "SEARCHCORE_URL",
  "SEARCHCORE_MASTER_KEY",
  "OPENAI_PROVIDER_ENABLED",
  "OPENAI_PROJECT_ID",
  "OPENAI_TIMEOUT_MS",
  "ATLAS_AGENT_OPENAI_EVAL_MODEL",
  "GEMINI_PROVIDER_ENABLED",
  "GEMINI_API_KEY",
  "GEMINI_PROJECT_ID",
  "GEMINI_EVAL_MODEL",
  "GEMINI_TIMEOUT_MS",
  "GEMINI_ACCOUNT_CLASS",
  "GEMINI_PROVIDER_REGION",
  "ATLAS_CONVERSATION_PERSISTENCE_ENABLED",
  "ATLAS_CONVERSATION_MAINTENANCE_DATABASE_URL",
  "ATLAS_CONVERSATION_CONTENT_PROTECTION_MODE",
  "ATLAS_CONVERSATION_RETENTION_DAYS",
  "ATLAS_CONVERSATION_MIN_RETENTION_DAYS",
  "ATLAS_CONVERSATION_MAX_RETENTION_DAYS",
  "ATLAS_CONVERSATION_CONTEXT_MAX_MESSAGES",
  "ATLAS_CONVERSATION_CONTEXT_MAX_CHARACTERS",
  "ATLAS_CONVERSATION_STALE_RUN_TIMEOUT_MS",
  "ATLAS_CONVERSATION_PURGE_BATCH_SIZE",
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

  it("treats blank CREDENTIAL_MASTER_KEY as absent in local env", () => {
    stubEnv({ ATHYPER_ENV: "local", CREDENTIAL_MASTER_KEY: "" });
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

  it("coerces SMTP_SECURE from env string to boolean", () => {
    stubEnv({
      ATHYPER_ENV: "local",
      SMTP_HOST: "smtp.example.test",
      SMTP_SECURE: "true",
    });

    const cfg = loadConfig();
    expect(cfg.email?.secure).toBe(true);
  });

  it("rejects partial VAPID Web Push configuration", () => {
    const publicKey = Buffer.concat([Buffer.from([0x04]), Buffer.alloc(64, 1)]).toString("base64url");
    stubEnv({
      ATHYPER_ENV: "local",
      VAPID_PUBLIC_KEY: publicKey,
    });

    expect(() => loadConfig()).toThrow(/VAPID_SUBJECT is required/);
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

describe("Atlas agent configuration", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_TLS_REJECT_UNAUTHORIZED", "1");
    vi.stubEnv("AUTH_DEBUG_EXPOSE_TOKENS", undefined);
    vi.stubEnv("NODE_ENV", "development");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses one validated public-model and provider-binding configuration", () => {
    stubEnv({
      ATHYPER_ENV: "local",
      ATLAS_AGENT_ENABLED: "true",
      ATLAS_AGENT_CREDENTIAL_FINGERPRINT_KEY: "f".repeat(48),
      ATLAS_AGENT_DEFAULT_PUBLIC_MODEL: "atlas-balanced",
      ATLAS_AGENT_PROVIDER_TIMEOUT_MS: "90000",
      ATLAS_AGENT_STREAM_IDLE_TIMEOUT_MS: "45000",
      ATLAS_AGENT_MAX_OUTPUT_TOKENS: "4096",
      ATLAS_AGENT_MAX_OUTPUT_BYTES: "262144",
      ATLAS_AGENT_USER_RUNS_PER_MINUTE: "12",
      ATLAS_AGENT_TENANT_RUNS_PER_MINUTE: "120",
      ATLAS_AGENT_TOOLS_ENABLED: "true",
      ATLAS_AGENT_TOOL_MAX_ROUNDS: "4",
      ATLAS_AGENT_TOOL_MAX_CALLS: "6",
      ATLAS_AGENT_TOOL_MAX_ELAPSED_MS: "180000",
      ATLAS_AGENT_TOOL_MAX_TOTAL_TOKENS: "65536",
      ATLAS_AGENT_TOOL_TIMEOUT_MS: "15000",
      ATLAS_AGENT_TOOL_MAX_INPUT_BYTES: "49152",
      ATLAS_AGENT_TOOL_MAX_RESULT_BYTES: "65536",
      ATLAS_CONVERSATION_PERSISTENCE_ENABLED: "true",
      ATLAS_CONVERSATION_MAINTENANCE_DATABASE_URL:
        "postgresql://atlas-maintenance:secret@localhost/athyper",
      ATLAS_CONVERSATION_CONTENT_PROTECTION_MODE: "tenant_protected_store",
      ATLAS_CONVERSATION_RETENTION_DAYS: "45",
      ATLAS_CONVERSATION_MIN_RETENTION_DAYS: "7",
      ATLAS_CONVERSATION_MAX_RETENTION_DAYS: "730",
      ATLAS_CONVERSATION_CONTEXT_MAX_MESSAGES: "32",
      ATLAS_CONVERSATION_CONTEXT_MAX_CHARACTERS: "131072",
      ATLAS_CONVERSATION_STALE_RUN_TIMEOUT_MS: "600000",
      ATLAS_CONVERSATION_PURGE_BATCH_SIZE: "250",
      ATLAS_AGENT_ANTHROPIC_FAST_MODEL: "claude-haiku-4-5-20251001",
      ATLAS_AGENT_ANTHROPIC_BALANCED_MODEL: "claude-sonnet-4-6",
      ATLAS_AGENT_ANTHROPIC_BEST_MODEL: "claude-opus-4-8",
      OPENAI_PROVIDER_ENABLED: "true",
      ATLAS_AGENT_OPENAI_EVAL_MODEL: "gpt-5.6-sol",
      OPENAI_PROJECT_ID: "  proj_atlas_eval  ",
      OPENAI_TIMEOUT_MS: "75000",
    });

    const cfg = loadConfig();

    expect(cfg.atlasAgent).toEqual({
      enabled: true,
      credentialFingerprintKey: "f".repeat(48),
      defaultPublicModelId: "atlas-balanced",
      providerTimeoutMs: 90_000,
      streamIdleTimeoutMs: 45_000,
      maxOutputTokens: 4_096,
      maxOutputBytes: 262_144,
      userRunsPerMinute: 12,
      tenantRunsPerMinute: 120,
      tools: {
        enabled: true,
        maxRounds: 4,
        maxCalls: 6,
        maxElapsedMs: 180_000,
        maxTotalTokens: 65_536,
        timeoutMs: 15_000,
        maxInputBytes: 49_152,
        maxResultBytes: 65_536,
      },
      persistence: {
        enabled: true,
        maintenanceDatabaseUrl:
          "postgresql://atlas-maintenance:secret@localhost/athyper",
        contentProtectionMode: "tenant_protected_store",
        defaultRetentionDays: 45,
        minimumRetentionDays: 7,
        maximumRetentionDays: 730,
        contextMaxMessages: 32,
        contextMaxCharacters: 131_072,
        staleRunTimeoutMs: 600_000,
        purgeBatchSize: 250,
      },
      anthropic: {
        fastModelId: "claude-haiku-4-5-20251001",
        balancedModelId: "claude-sonnet-4-6",
        bestModelId: "claude-opus-4-8",
      },
      openai: {
        enabled: true,
        evalModelId: "gpt-5.6-sol",
        projectId: "proj_atlas_eval",
        timeoutMs: 75_000,
      },
      gemini: {
        enabled: false,
        evalModelId: "gemini-3.6-flash",
        timeoutMs: 60_000,
      },
    });
  });

  it("rejects an unreviewed upstream model id", () => {
    stubEnv({
      ATHYPER_ENV: "local",
      ATLAS_AGENT_ANTHROPIC_BEST_MODEL: "claude-future-unreviewed",
    });

    expect(() => loadConfig()).toThrow(/atlasAgent\.anthropic\.bestModelId/);
  });

  it("rejects the former upstream model id as a public default", () => {
    stubEnv({
      ATHYPER_ENV: "local",
      ATLAS_AGENT_DEFAULT_PUBLIC_MODEL: "claude-sonnet-4-6",
    });

    expect(() => loadConfig()).toThrow(/atlasAgent\.defaultPublicModelId/);
  });

  it("keeps the OpenAI evaluation provider disabled by default", () => {
    stubEnv({
      ATHYPER_ENV: "local",
    });

    expect(loadConfig().atlasAgent.openai).toEqual({
      enabled: false,
      evalModelId: "gpt-5.6-sol",
      timeoutMs: 60_000,
    });
  });

  it("keeps the Gemini evaluation provider disabled by default", () => {
    stubEnv({
      ATHYPER_ENV: "local",
    });

    expect(loadConfig().atlasAgent.gemini).toEqual({
      enabled: false,
      evalModelId: "gemini-3.6-flash",
      timeoutMs: 60_000,
    });
  });

  it("keeps conversation persistence disabled with bounded defaults", () => {
    stubEnv({
      ATHYPER_ENV: "local",
    });

    expect(loadConfig().atlasAgent.persistence).toEqual({
      enabled: false,
      contentProtectionMode: "database_at_rest_non_sensitive_only",
      defaultRetentionDays: 30,
      minimumRetentionDays: 1,
      maximumRetentionDays: 365,
      contextMaxMessages: 20,
      contextMaxCharacters: 98_304,
      staleRunTimeoutMs: 900_000,
      purgeBatchSize: 500,
    });
  });

  it("keeps governed tools disabled with bounded defaults", () => {
    stubEnv({
      ATHYPER_ENV: "local",
    });

    expect(loadConfig().atlasAgent.tools).toEqual({
      enabled: false,
      maxRounds: 3,
      maxCalls: 4,
      maxElapsedMs: 120_000,
      maxTotalTokens: 32_768,
      timeoutMs: 10_000,
      maxInputBytes: 32_768,
      maxResultBytes: 32_768,
    });
  });

  it("allows the overall governed tool deadline to tighten a provider call", () => {
    stubEnv({
      ATHYPER_ENV: "local",
      ATLAS_AGENT_TOOLS_ENABLED: "true",
      ATLAS_CONVERSATION_PERSISTENCE_ENABLED: "true",
      ATLAS_AGENT_PROVIDER_TIMEOUT_MS: "60000",
      ATLAS_AGENT_TOOL_MAX_ELAPSED_MS: "30000",
    });

    expect(loadConfig().atlasAgent.tools.maxElapsedMs).toBe(30_000);
  });

  it("requires durable conversation persistence before governed tools can start", () => {
    stubEnv({
      ATHYPER_ENV: "local",
      ATLAS_AGENT_TOOLS_ENABLED: "true",
      ATLAS_CONVERSATION_PERSISTENCE_ENABLED: "false",
    });

    expect(() => loadConfig()).toThrow(
      /ATLAS_AGENT_TOOLS_ENABLED requires ATLAS_CONVERSATION_PERSISTENCE_ENABLED/,
    );
  });

  it("keeps stale invocation recovery beyond the maximum tool loop deadline", () => {
    stubEnv({
      ATHYPER_ENV: "local",
      ATLAS_AGENT_TOOLS_ENABLED: "true",
      ATLAS_CONVERSATION_PERSISTENCE_ENABLED: "true",
      ATLAS_AGENT_TOOL_MAX_ELAPSED_MS: "120000",
      ATLAS_CONVERSATION_STALE_RUN_TIMEOUT_MS: "180000",
    });

    expect(() => loadConfig()).toThrow(
      /must exceed ATLAS_AGENT_TOOL_MAX_ELAPSED_MS by more than 60000ms/,
    );
  });

  it("rejects a default retention outside the platform bounds", () => {
    stubEnv({
      ATHYPER_ENV: "local",
      ATLAS_CONVERSATION_RETENTION_DAYS: "30",
      ATLAS_CONVERSATION_MIN_RETENTION_DAYS: "60",
      ATLAS_CONVERSATION_MAX_RETENTION_DAYS: "365",
    });

    expect(() => loadConfig()).toThrow(
      /ATLAS_CONVERSATION_RETENTION_DAYS must be within/,
    );
  });

  it("does not require the privileged maintenance secret in the API process", () => {
    stubEnv({
      ATHYPER_ENV: "local",
      ATLAS_CONVERSATION_PERSISTENCE_ENABLED: "true",
    });

    expect(loadConfig().atlasAgent.persistence).toMatchObject({
      enabled: true,
      maintenanceDatabaseUrl: undefined,
    });
  });

  it("requires stale-run recovery to outlive the provider deadline", () => {
    stubEnv({
      ATHYPER_ENV: "local",
      ATLAS_AGENT_ENABLED: "true",
      ATLAS_AGENT_CREDENTIAL_FINGERPRINT_KEY: "f".repeat(48),
      ATLAS_AGENT_PROVIDER_TIMEOUT_MS: "120000",
      ATLAS_CONVERSATION_PERSISTENCE_ENABLED: "true",
      ATLAS_CONVERSATION_MAINTENANCE_DATABASE_URL:
        "postgresql://atlas-maintenance:secret@localhost/athyper",
      ATLAS_CONVERSATION_STALE_RUN_TIMEOUT_MS: "120000",
    });

    expect(() => loadConfig()).toThrow(
      /ATLAS_CONVERSATION_STALE_RUN_TIMEOUT_MS must exceed/,
    );
  });

  it("rejects inverted conversation retention bounds", () => {
    stubEnv({
      ATHYPER_ENV: "local",
      ATLAS_CONVERSATION_MIN_RETENTION_DAYS: "365",
      ATLAS_CONVERSATION_MAX_RETENTION_DAYS: "30",
    });

    expect(() => loadConfig()).toThrow(
      /ATLAS_CONVERSATION_MIN_RETENTION_DAYS cannot exceed/,
    );
  });

  it("loads an explicit paid Gemini evaluation profile", () => {
    stubEnv({
      ATHYPER_ENV: "local",
      GEMINI_PROVIDER_ENABLED: "true",
      GEMINI_PROJECT_ID: "athyper-atlas-eval",
      GEMINI_EVAL_MODEL: "gemini-3.6-flash",
      GEMINI_TIMEOUT_MS: "70000",
      GEMINI_ACCOUNT_CLASS: "paid",
      GEMINI_PROVIDER_REGION: "global",
    });

    expect(loadConfig().atlasAgent.gemini).toEqual({
      enabled: true,
      evalModelId: "gemini-3.6-flash",
      projectId: "athyper-atlas-eval",
      timeoutMs: 70_000,
      accountClass: "paid",
      providerRegion: "global",
    });
  });

  it.each([
    ["GEMINI_PROJECT_ID", { GEMINI_ACCOUNT_CLASS: "paid", GEMINI_PROVIDER_REGION: "global" }],
    ["GEMINI_ACCOUNT_CLASS", { GEMINI_PROJECT_ID: "athyper-atlas-eval", GEMINI_PROVIDER_REGION: "global" }],
    ["GEMINI_PROVIDER_REGION", { GEMINI_PROJECT_ID: "athyper-atlas-eval", GEMINI_ACCOUNT_CLASS: "paid" }],
  ])("requires %s when Gemini is enabled", (missing, fields) => {
    stubEnv({
      ATHYPER_ENV: "local",
      GEMINI_PROVIDER_ENABLED: "true",
      ...fields,
    });

    expect(() => loadConfig()).toThrow(new RegExp(missing));
  });

  it("rejects a free Gemini account outside local development", () => {
    stubEnv({
      ATHYPER_ENV: "staging",
      CREDENTIAL_MASTER_KEY: "m".repeat(48),
      GEMINI_PROVIDER_ENABLED: "true",
      GEMINI_PROJECT_ID: "athyper-atlas-eval",
      GEMINI_ACCOUNT_CLASS: "free",
      GEMINI_PROVIDER_REGION: "global",
    });

    expect(() => loadConfig()).toThrow(
      /GEMINI_ACCOUNT_CLASS=free is allowed only in the local/,
    );
  });

  it("rejects an unreviewed Gemini evaluation model", () => {
    stubEnv({
      ATHYPER_ENV: "local",
      GEMINI_EVAL_MODEL: "gemini-future-unreviewed",
    });

    expect(() => loadConfig()).toThrow(/atlasAgent\.gemini\.evalModelId/);
  });

  it.each(["999", "300001"])(
    "rejects GEMINI_TIMEOUT_MS outside the reviewed range: %s",
    (timeoutMs) => {
      stubEnv({
        ATHYPER_ENV: "local",
        GEMINI_TIMEOUT_MS: timeoutMs,
      });

      expect(() => loadConfig()).toThrow(/atlasAgent\.gemini\.timeoutMs/);
    },
  );

  it.each([
    ["embedded whitespace", "athyper atlas"],
    ["control characters", "athyper\natlas"],
    ["more than 200 characters", "g".repeat(201)],
  ])("rejects GEMINI_PROJECT_ID with %s", (_case, projectId) => {
    stubEnv({
      ATHYPER_ENV: "local",
      GEMINI_PROJECT_ID: projectId,
    });

    expect(() => loadConfig()).toThrow(/atlasAgent\.gemini\.projectId/);
  });

  it("rejects unreviewed Gemini account classes and endpoint regions", () => {
    stubEnv({
      ATHYPER_ENV: "local",
      GEMINI_ACCOUNT_CLASS: "enterprise",
      GEMINI_PROVIDER_REGION: "tenant-supplied-region",
    });

    expect(() => loadConfig()).toThrow(/atlasAgent\.gemini\.(accountClass|providerRegion)/);
  });

  it("rejects an unreviewed OpenAI evaluation model id", () => {
    stubEnv({
      ATHYPER_ENV: "local",
      ATLAS_AGENT_OPENAI_EVAL_MODEL: "gpt-future-unreviewed",
    });

    expect(() => loadConfig()).toThrow(/atlasAgent\.openai\.evalModelId/);
  });

  it.each(["999", "300001"])(
    "rejects OPENAI_TIMEOUT_MS outside the reviewed range: %s",
    (timeoutMs) => {
      stubEnv({
        ATHYPER_ENV: "local",
        OPENAI_TIMEOUT_MS: timeoutMs,
      });

      expect(() => loadConfig()).toThrow(/atlasAgent\.openai\.timeoutMs/);
    },
  );

  it.each([
    ["embedded whitespace", "project atlas"],
    ["control characters", "project\ninjected"],
    ["more than 200 characters", "p".repeat(201)],
  ])("rejects OPENAI_PROJECT_ID with %s", (_case, projectId) => {
    stubEnv({
      ATHYPER_ENV: "local",
      OPENAI_PROJECT_ID: projectId,
    });

    expect(() => loadConfig()).toThrow(/atlasAgent\.openai\.projectId/);
  });

  it("requires a stable credential fingerprint key when Atlas is enabled", () => {
    stubEnv({
      ATHYPER_ENV: "local",
      ATLAS_AGENT_ENABLED: "true",
      ATLAS_AGENT_CREDENTIAL_FINGERPRINT_KEY: undefined,
    });

    expect(() => loadConfig()).toThrow(
      /ATLAS_AGENT_CREDENTIAL_FINGERPRINT_KEY is required/,
    );
  });

  it("rejects an idle timeout longer than the provider timeout", () => {
    stubEnv({
      ATHYPER_ENV: "local",
      ATLAS_AGENT_PROVIDER_TIMEOUT_MS: "10000",
      ATLAS_AGENT_STREAM_IDLE_TIMEOUT_MS: "20000",
    });

    expect(() => loadConfig()).toThrow(
      /ATLAS_AGENT_STREAM_IDLE_TIMEOUT_MS cannot exceed/,
    );
  });

  it("rejects a tenant rate limit lower than the user limit", () => {
    stubEnv({
      ATHYPER_ENV: "local",
      ATLAS_AGENT_USER_RUNS_PER_MINUTE: "20",
      ATLAS_AGENT_TENANT_RUNS_PER_MINUTE: "10",
    });

    expect(() => loadConfig()).toThrow(
      /ATLAS_AGENT_TENANT_RUNS_PER_MINUTE cannot be lower/,
    );
  });
});
