import { expect, it } from "vitest";
import { parseReferenceResourceConfiguration } from "./reference-resource-configuration.js";
const value = {
  descriptorPin: {
    kind: "entity_authoring_descriptor",
    publicationKey: "fixture.descriptor",
    releaseId: "00000000-0000-4000-8000-000000000001",
    unsignedHash: "a".repeat(64),
    artifactHash: "b".repeat(64),
  },
  descriptorHash: "c".repeat(64),
  maximumBytes: 10000,
  maximumReleases: 20,
  supportedLocales: ["en"],
};
it("accepts detached exact pins without turning configuration into authority", () => {
  const parsed = parseReferenceResourceConfiguration(value);
  expect(parsed).toEqual(value);
  expect(parsed.descriptorPin).not.toBe(value.descriptorPin);
});
it("rejects approval claims, malformed pins and unbounded budgets", () => {
  for (const input of [
    { ...value, approved: true },
    {
      ...value,
      descriptorPin: { ...value.descriptorPin, releaseId: "latest" },
    },
    { ...value, maximumBytes: 4194305 },
    { ...value, supportedLocales: ["en", "en"] },
  ])
    expect(() => parseReferenceResourceConfiguration(input)).toThrow(
      "REFERENCE_RESOURCE_CONFIGURATION_INVALID",
    );
});
