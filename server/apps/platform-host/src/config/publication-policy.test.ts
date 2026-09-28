import { describe, expect, it } from "vitest";
import { loadPublicationTrustConfiguration, loadPublicationSecretStore } from "./publication-policy.js";

it("isolates publication credentials without falling back on partial configuration", () => {
  const env = { ATHYPER_INSTANCE: "dev", PUBLICATION_TRUST_DOMAIN: "dev",
    PUBLICATION_INFISICAL_URL: "https://secrets.dev.test", PUBLICATION_INFISICAL_PROJECT_ID: "dedicated",
    PUBLICATION_INFISICAL_ENVIRONMENT: "dev", PUBLICATION_INFISICAL_TOKEN_FILE: "/run/publication/token" };
  expect(loadPublicationSecretStore(env)).toEqual({ endpoint: env.PUBLICATION_INFISICAL_URL, workspaceId: "dedicated", environment: "dev", tokenFile: "/run/publication/token" });
  expect(loadPublicationSecretStore({})).toBeUndefined();
  for (const key of Object.keys(env).filter(key => key.startsWith("PUBLICATION_")))
    expect(() => loadPublicationSecretStore({ ...env, [key]: undefined })).toThrow();
  expect(() => loadPublicationSecretStore({ ...env, ATHYPER_INSTANCE: "qa" })).toThrow("ENVIRONMENT_MISMATCH");
  expect(() => loadPublicationTrustConfiguration({ PUBLICATION_TRUST_MANIFEST_FILE: "/missing", PUBLICATION_TRUST_MANIFEST_JSON: "{}" }, true)).toThrow("AMBIGUOUS");
});
const manifest = JSON.stringify({ schema: "athyper.publication-trust/1", keys: [
  { keyId: "dev-1", domain: "dev", publicKeyFingerprint: `sha256:${"a".repeat(64)}` },
  { keyId: "prod-1", domain: "production", publicKeyFingerprint: `sha256:${"b".repeat(64)}` },
] });
describe("publication trust configuration", () => {
  it("accepts a DEV-only manifest locally and rejects it in staging/production", () => {
    const local = JSON.stringify({ schema: "athyper.dev-publication-trust/1", keys: [JSON.parse(manifest).keys[0]] });
    expect(loadPublicationTrustConfiguration({ ATHYPER_ENV: "local", PUBLICATION_TRUST_DOMAIN: "dev", PUBLICATION_TRUST_MANIFEST_JSON: local }, true)?.manifest.schema).toBe("athyper.dev-publication-trust/1");
    for (const ATHYPER_ENV of ["staging", "production"]) {
      for (const PUBLICATION_TRUST_DOMAIN of ["dev", "production"]) {
        expect(() => loadPublicationTrustConfiguration({ ATHYPER_ENV, PUBLICATION_TRUST_DOMAIN, PUBLICATION_TRUST_MANIFEST_JSON: local }, true)).toThrow("ENVIRONMENT_MISMATCH");
      }
    }
  });
  it("preserves transitional local startup without enabling strict trust", () => {
    expect(loadPublicationTrustConfiguration({ ATHYPER_ENV: "local" }, true)).toBeUndefined();
  });
  it.each(["staging", "production"])("requires strict trust for %s publication", ATHYPER_ENV => {
    expect(() => loadPublicationTrustConfiguration({ ATHYPER_ENV }, true)).toThrow("CONFIGURATION_REQUIRED");
    expect(loadPublicationTrustConfiguration({ ATHYPER_ENV, PUBLICATION_TRUST_DOMAIN: "production", PUBLICATION_TRUST_MANIFEST_JSON: manifest }, true)?.domain).toBe("production");
    expect(() => loadPublicationTrustConfiguration({ ATHYPER_ENV, PUBLICATION_TRUST_DOMAIN: "dev", PUBLICATION_TRUST_MANIFEST_JSON: manifest }, true)).toThrow("ENVIRONMENT_MISMATCH");
  });
  it("never falls back after invalid explicit configuration", () => {
    expect(() => loadPublicationTrustConfiguration({ ATHYPER_ENV: "prod" }, true)).toThrow("ENVIRONMENT_REQUIRED");
    expect(() => loadPublicationTrustConfiguration({}, true)).toThrow("ENVIRONMENT_REQUIRED");
    expect(() => loadPublicationTrustConfiguration({ ATHYPER_ENV: "local", PUBLICATION_TRUST_DOMAIN: "dev" }, true)).toThrow();
    expect(() => loadPublicationTrustConfiguration({ ATHYPER_ENV: "local", PUBLICATION_TRUST_DOMAIN: "production", PUBLICATION_TRUST_MANIFEST_JSON: manifest }, true)).toThrow();
    expect(() => loadPublicationTrustConfiguration({ ATHYPER_ENV: "local", PUBLICATION_TRUST_DOMAIN: "dev", PUBLICATION_TRUST_MANIFEST_JSON: "invalid" }, true)).toThrow();
  });
});
