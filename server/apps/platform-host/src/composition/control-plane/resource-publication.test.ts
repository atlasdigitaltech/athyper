import { describe, expect, it } from "vitest";
import { readResourcePublicationConfiguration } from "./resource-publication.js";
describe("resource worker configuration", () => {
  it("keeps the optional resource publisher disabled without explicit configuration", () => {
    expect(readResourcePublicationConfiguration({})).toBeUndefined();
  });
  it("rejects partial authority and invalid descriptor pins", () => {
    expect(() =>
      readResourcePublicationConfiguration({
        PUBLICATION_AUTHORING_DESCRIPTOR_HASH: "",
      }),
    ).toThrow("RESOURCE_DESCRIPTOR_HASH_REQUIRED");
    expect(() =>
      readResourcePublicationConfiguration({
        PUBLICATION_AUTHORING_DESCRIPTOR_HASH: "a".repeat(64),
      }),
    ).toThrow("PLATFORM_AUTHORITY_CONFIGURATION_INVALID");
  });
  it("requires explicit governed authority coordinates", () => {
    const result = readResourcePublicationConfiguration({
      PUBLICATION_AUTHORING_DESCRIPTOR_HASH: "a".repeat(64),
      PLATFORM_AUTHORITY_TENANT_ID: "11111111-1111-4111-8111-111111111111",
      PLATFORM_CONTROL_REALM: "platform-control",
      PLATFORM_CONTROL_ISSUER_URL:
        "https://iam.dev.athyper.test/realms/platform-control",
      PLATFORM_CONTROL_AUDIENCE: "athyper-platform-control-api",
    });
    expect(result?.descriptorHash).toBe("a".repeat(64));
  });
});
