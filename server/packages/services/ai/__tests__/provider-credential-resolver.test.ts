import { describe, expect, it, vi } from "vitest";
import {
  ProviderCredentialResolver,
  ProviderCredentialUnavailableError,
  type NamedSecretReader,
} from "../provider-credential-resolver.js";

const FINGERPRINT_KEY = "test-only-fingerprint-key-32-bytes-minimum";

function reader(values: Record<string, string>): NamedSecretReader {
  return {
    has: vi.fn((ref: string) => Boolean(values[ref])),
    resolve: vi.fn((ref: string) => values[ref] ?? ""),
  };
}

describe("ProviderCredentialResolver", () => {
  it("resolves an allow-listed reference and emits only keyed metadata", async () => {
    const secret = "sk-ant-this-value-must-never-appear-in-metadata";
    const resolver = new ProviderCredentialResolver(
      reader({ ANTHROPIC_API_KEY: secret }),
      { fingerprintKey: FINGERPRINT_KEY },
    );

    const result = await resolver.resolve({
      providerId: "Anthropic",
      secretRef: "ANTHROPIC_API_KEY",
    });

    expect(result.ready).toBe(true);
    if (!result.ready) return;
    expect(result.secret).toBe(secret);
    expect(result.metadata).toMatchObject({
      providerId: "anthropic",
      owner: "platform",
      source: "environment",
      readiness: "ready",
    });
    const serialisedMetadata = JSON.stringify(result.metadata);
    expect(serialisedMetadata).not.toContain(secret);
    expect(serialisedMetadata).not.toContain("ANTHROPIC_API_KEY");
    expect(result.metadata.credentialFingerprint).toMatch(
      /^credential:hmac-sha256:v1:[a-f0-9]{32}$/,
    );
    expect(result.metadata.referenceFingerprint).toMatch(
      /^ref:hmac-sha256:v1:[a-f0-9]{32}$/,
    );
  });

  it("scopes tenant credential fingerprints to the tenant", async () => {
    const resolver = new ProviderCredentialResolver(
      reader({ OPENAI_API_KEY: "same-upstream-key" }),
      { fingerprintKey: FINGERPRINT_KEY },
    );

    const first = await resolver.require({
      providerId: "openai",
      secretRef: "OPENAI_API_KEY",
      owner: "tenant",
      scopeId: "tenant-a",
    });
    const second = await resolver.require({
      providerId: "openai",
      secretRef: "OPENAI_API_KEY",
      owner: "tenant",
      scopeId: "tenant-b",
    });

    expect(first.metadata.credentialFingerprint)
      .not.toBe(second.metadata.credentialFingerprint);
  });

  it("observes platform credential rotation per resolution without exposing values", async () => {
    const values = {
      ANTHROPIC_API_KEY: "sk-ant-before-rotation",
    };
    const resolver = new ProviderCredentialResolver(reader(values), {
      fingerprintKey: FINGERPRINT_KEY,
    });

    const before = await resolver.require({
      providerId: "anthropic",
      secretRef: "ANTHROPIC_API_KEY",
      owner: "platform",
    });
    values.ANTHROPIC_API_KEY = "sk-ant-after-rotation";
    const after = await resolver.require({
      providerId: "anthropic",
      secretRef: "ANTHROPIC_API_KEY",
      owner: "platform",
    });

    expect(after.metadata.referenceFingerprint)
      .toBe(before.metadata.referenceFingerprint);
    expect(after.metadata.credentialFingerprint)
      .not.toBe(before.metadata.credentialFingerprint);
    const metadata = JSON.stringify([before.metadata, after.metadata]);
    expect(metadata).not.toContain("sk-ant-before-rotation");
    expect(metadata).not.toContain("sk-ant-after-rotation");
  });

  it.each([
    {
      name: "not configured",
      request: { providerId: "anthropic" },
      readiness: "not_configured",
      reasonCode: "CREDENTIAL_NOT_CONFIGURED",
    },
    {
      name: "arbitrary environment reference",
      request: { providerId: "anthropic", secretRef: "DATABASE_URL" },
      readiness: "invalid_reference",
      reasonCode: "CREDENTIAL_REFERENCE_INVALID",
    },
    {
      name: "tenant credential without tenant scope",
      request: {
        providerId: "openai",
        secretRef: "OPENAI_API_KEY",
        owner: "tenant" as const,
      },
      readiness: "invalid_reference",
      reasonCode: "CREDENTIAL_REFERENCE_INVALID",
    },
    {
      name: "missing allow-listed secret",
      request: { providerId: "gemini", secretRef: "GEMINI_API_KEY" },
      readiness: "missing",
      reasonCode: "CREDENTIAL_MISSING",
    },
    {
      name: "legacy Gemini credential alias",
      request: { providerId: "gemini", secretRef: "GOOGLE_API_KEY" },
      readiness: "invalid_reference",
      reasonCode: "CREDENTIAL_REFERENCE_INVALID",
    },
  ])("reports $name without exposing the reference", async ({
    request,
    readiness,
    reasonCode,
  }) => {
    const resolver = new ProviderCredentialResolver(reader({}), {
      fingerprintKey: FINGERPRINT_KEY,
    });

    const result = await resolver.resolve(request);

    expect(result).toMatchObject({
      ready: false,
      reasonCode,
      metadata: { readiness, credentialFingerprint: null },
    });
    expect(JSON.stringify(result.metadata)).not.toContain(
      request.secretRef ?? "not-present",
    );
  });

  it("converts backend exceptions into a safe unavailable state", async () => {
    const secrets: NamedSecretReader = {
      has: () => true,
      resolve: () => {
        throw new Error("vault failed while reading sk-sensitive-backend-detail");
      },
    };
    const resolver = new ProviderCredentialResolver(secrets, {
      fingerprintKey: FINGERPRINT_KEY,
    });

    const result = await resolver.resolve({
      providerId: "anthropic",
      secretRef: "ANTHROPIC_API_KEY",
    });

    expect(result).toMatchObject({
      ready: false,
      reasonCode: "CREDENTIAL_BACKEND_UNAVAILABLE",
      metadata: { readiness: "unavailable" },
    });
    expect(JSON.stringify(result)).not.toContain("sk-sensitive");
    await expect(
      resolver.require({
        providerId: "anthropic",
        secretRef: "ANTHROPIC_API_KEY",
      }),
    ).rejects.toBeInstanceOf(ProviderCredentialUnavailableError);
  });

  it("rejects a weak fingerprint key at construction", () => {
    expect(
      () => new ProviderCredentialResolver(reader({}), {
        fingerprintKey: "too-short",
      }),
    ).toThrow(/at least 32 characters/);
  });
});
