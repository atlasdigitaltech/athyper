import { describe, expect, it } from "vitest";
import { readAtlasByokConfig } from "../byok-config.js";

describe("Atlas BYOK B3.2 configuration", () => {
  it("is disabled by default", () => {
    expect(readAtlasByokConfig({})).toMatchObject({ enabled: false, backend: "disabled" });
  });

  it("fails closed when enabled without the encrypted backend or fingerprint key", () => {
    expect(() => readAtlasByokConfig({ ATLAS_BYOK_ENABLED: "true" })).toThrow();
    expect(() => readAtlasByokConfig({
      ATLAS_BYOK_ENABLED: "true",
      ATLAS_BYOK_BACKEND: "database_encrypted",
      ATLAS_BYOK_FINGERPRINT_KEY: "short",
    })).toThrow();
  });

  it("accepts only the bounded encrypted configuration", () => {
    expect(readAtlasByokConfig({
      ATLAS_BYOK_ENABLED: "true",
      ATLAS_BYOK_BACKEND: "database_encrypted",
      ATLAS_BYOK_FINGERPRINT_KEY: "a".repeat(32),
      ATLAS_BYOK_CACHE_TTL_MS: "10000",
    })).toEqual({
      enabled: true, backend: "database_encrypted", fingerprintKey: "a".repeat(32), cacheTtlMs: 10000,
    });
  });
});
