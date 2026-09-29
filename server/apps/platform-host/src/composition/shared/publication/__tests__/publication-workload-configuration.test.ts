import { describe, expect, it } from "vitest";
import { parsePublicationWorkloadConfiguration, loadPublicationWorkloadConfiguration } from "../workload-configuration.js";

const tenantId = "11111111-1111-4111-8111-111111111111";
const env = { ATHYPER_ENV: "local", ATHYPER_DOMAIN_SUFFIX: "dev.athyper.test", ATHYPER_DEV_PRESET: "devfull", PLATFORM_AUTHORITY_TENANT_ID: tenantId };
const config = { schemaVersion: 1, instance: "dev", tenantId, realmKey: "platform-control",
  author: { principalId: "22222222-2222-4222-8222-222222222222", code: "dev.metadata.author", authEpoch: 0, credentialSha256: "a".repeat(64) },
  publisher: { principalId: "33333333-3333-4333-8333-333333333333", code: "dev.metadata.publisher", authEpoch: 0, credentialSha256: "b".repeat(64) } };
describe("dedicated publication workload configuration", () => {
  it("is opt-in and never falls back to legacy publication credentials", () => {
    expect(loadPublicationWorkloadConfiguration({ ...env, ATHYPER_DEV_PUBLICATION_CONFIG: "/not-read" }, "local")).toBeUndefined();
  });
  it("loads only authority coordinates, not entity or target authority", () => {
    const result = parsePublicationWorkloadConfiguration(config, env, "local");
    expect(result).toMatchObject({ tenantId, environment: "local", author: config.author });
    expect(result.author).not.toBe(config.author);
  });
  it.each(["qa", "staging", "production"])("rejects %s environment", environment => {
    expect(() => parsePublicationWorkloadConfiguration(config, env, environment)).toThrow("DEV_ONLY");
  });
  it.each(["ATHYPER_ENV", "ATHYPER_DOMAIN_SUFFIX", "ATHYPER_DEV_PRESET", "PLATFORM_AUTHORITY_TENANT_ID"])("requires exact %s", key => {
    expect(() => parsePublicationWorkloadConfiguration(config, { ...env, [key]: undefined }, "local")).toThrow();
  });
  it.each(["entityCode", "targets", "policy", "runtimeApproval"])("rejects caller/config supplied %s authority", key => {
    expect(() => parsePublicationWorkloadConfiguration({ ...config, [key]: "unexpected" }, env, "local")).toThrow("AUTHORITY_INVALID");
  });
  it("rejects tenant substitution and identical workload identities or credentials", () => {
    expect(() => parsePublicationWorkloadConfiguration({ ...config, tenantId: config.author.principalId }, env, "local")).toThrow();
    for (const patch of [{ principalId: config.author.principalId }, { credentialSha256: config.author.credentialSha256 }])
      expect(() => parsePublicationWorkloadConfiguration({ ...config, publisher: { ...config.publisher, ...patch } }, env, "local")).toThrow("DISTINCT_IDENTITIES");
  });
});
