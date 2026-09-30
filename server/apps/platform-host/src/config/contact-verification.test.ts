import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { loadContactVerificationConfiguration } from "./contact-verification.js";

describe("optional contact verification configuration", () => {
  it("defaults to disabled and ignores malformed settings when disabled", () => {
    expect(loadContactVerificationConfiguration({ MASTER_DATA_VERIFICATION_KEYS_JSON: "secret-invalid-json" }, "production", false)).toEqual({ status: "disabled", reason: "NOT_ENABLED" });
  });
  it.each(["not-json", "{}", '[{"publicKeyPem":"operator-sensitive-text"}]'])("contains invalid configuration without throwing or echoing it", value => {
    const result = loadContactVerificationConfiguration({ CONTACT_VERIFICATION_ENABLED: "true", CONTACT_VERIFICATION_KEYS_JSON: value }, "production", false);
    expect(result).toEqual({ status: "unavailable", reason: "INVALID_CONFIGURATION" });
    expect(JSON.stringify(result)).not.toContain(value);
  });
  it("loads real scoped Ed25519 provider keys only when enabled", () => {
    const publicKeyPem = generateKeyPairSync("ed25519").publicKey.export({type:"spki",format:"pem"}).toString();
    const key = { provider: "provider", keyId: "key", publicKeyPem, planeKeys: ["neon"], tenantIds: ["11111111-1111-4111-8111-111111111111"], notBefore: "2026-01-01T00:00:00.000Z", notAfter: "2027-01-01T00:00:00.000Z" };
    expect(loadContactVerificationConfiguration({ CONTACT_VERIFICATION_ENABLED: "true", CONTACT_VERIFICATION_KEYS_JSON: JSON.stringify([key]) }, "production", false)).toEqual({ status: "configured", keys: [key] });
  });
  it("invalid local configuration disables verification rather than core startup", () => {
    expect(loadContactVerificationConfiguration({ LOCAL_CONTACT_CHALLENGE_ENABLED: "true" }, "production", false)).toEqual({ status: "unavailable", reason: "INVALID_CONFIGURATION" });
  });
});
