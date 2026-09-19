import { generateKeyPairSync } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "./index.js";
afterEach(() => vi.unstubAllEnvs());
describe("master data verifier configuration", () => {
  it("loads scoped public keys from operator configuration", () => {
    const publicKeyPem = generateKeyPairSync("ed25519").publicKey.export({type:"spki",format:"pem"}).toString();
    const key = {provider:"provider",keyId:"key",publicKeyPem,planeKeys:["neon"],tenantIds:["11111111-1111-4111-8111-111111111111"],notBefore:"2026-01-01T00:00:00.000Z",notAfter:"2027-01-01T00:00:00.000Z"};
    vi.stubEnv("MASTER_DATA_VERIFICATION_KEYS_JSON",JSON.stringify([key]));
    expect(loadConfig().masterDataVerificationKeys).toEqual([key]);
  });
  it("defaults to no trusted providers", () => {
    vi.stubEnv("MASTER_DATA_VERIFICATION_KEYS_JSON",undefined);
    expect(loadConfig().masterDataVerificationKeys).toEqual([]);
  });
  it.each(["not-json", "{}", '[{"publicKeyPem":"operator-sensitive-text"}]'])("rejects malformed configuration without echoing it", value => {
    vi.stubEnv("MASTER_DATA_VERIFICATION_KEYS_JSON",value);
    expect(()=>loadConfig()).toThrow("Invalid MASTER_DATA_VERIFICATION_KEYS_JSON");
    try { loadConfig(); } catch(error) { expect((error as Error).message).not.toContain("operator-sensitive-text"); }
  });
});
