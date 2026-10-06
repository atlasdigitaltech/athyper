import { describe, expect, it } from "vitest";
import {
  validateNativeRoot,
  nativeRootSchema,
} from "./native-root-contract.js";
const id = "11111111-1111-4111-8111-111111111111";
const root = () => ({
  id,
  tenantId: null,
  baseReleaseId: null,
  nativeVersion: 2,
  sourceKind: "product",
  schemaVersion: 1,
  authoringSchemaHash: "a".repeat(64),
  entityLabelId: id,
  defaultLocale: "en",
  requiredLocales: ["en"],
  publicationResourceKey: "metadata.entity.reference",
  sourceUri: null,
  sourceHash: null,
  publicationOwner: "platform",
  sourcePredecessorReleaseId: null,
});
describe("native authoring root enrollment contract", () => {
  it("accepts explicit product and tenant ownership without inferring it", () => {
    expect(() => validateNativeRoot(root())).not.toThrow();
    expect(() =>
      validateNativeRoot({
        ...root(),
        tenantId: id,
        sourceKind: "tenant_entity",
        publicationOwner: "tenant",
      }),
    ).not.toThrow();
  });
  it("requires an extension baseline but does not attest its ownership", () => {
    expect(() =>
      validateNativeRoot({
        ...root(),
        tenantId: id,
        sourceKind: "tenant_extension",
        publicationOwner: "tenant",
      }),
    ).toThrow();
    expect(() =>
      validateNativeRoot({
        ...root(),
        tenantId: id,
        sourceKind: "tenant_extension",
        publicationOwner: "tenant",
        baseReleaseId: id,
      }),
    ).not.toThrow();
  });
  it.each([
    { sourceKind: undefined },
    { authoringSchemaHash: null },
    { authoringSchemaHash: "unregistered" },
    { schemaVersion: 0 },
    { nativeVersion: "2" },
    { nativeVersion: 3 },
    { publicationOwner: "tenant" },
    { tenantId: id },
    { entityLabelId: null },
    { requiredLocales: [] },
    { requiredLocales: ["en", "en"] },
    { requiresMfa: false },
  ])("rejects incomplete, inconsistent or unknown enrollment %j", (patch) => {
    expect(() => validateNativeRoot({ ...root(), ...patch })).toThrow();
  });
  it("emits a closed schema", () => {
    expect(nativeRootSchema()).toMatchObject({ additionalProperties: false });
  });
});
