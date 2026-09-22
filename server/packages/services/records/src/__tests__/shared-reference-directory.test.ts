import { expect, it } from "vitest";
import {
  normalizeSharedReferenceLookup,
  sharedReferenceDefinitions,
  sharedReferenceSourceKeys,
  toSharedReferenceLookupPage,
} from "../shared-reference-directory";

const uuid = "11111111-1111-4111-8111-111111111111";

it("registers the complete shared-reference set with explicit identities", () => {
  expect(sharedReferenceSourceKeys).toHaveLength(17); // 15 tables plus country/currency compatibility aliases.
  expect(sharedReferenceDefinitions["shared.country"].storedValue).toBe("code");
  expect(sharedReferenceDefinitions["shared.timezone"].storedValue).toBe("code");
  expect(sharedReferenceDefinitions["shared.bank_institution"].storedValue).toBe("uuid");
  expect(sharedReferenceDefinitions["shared.bank_branch"].recordIdentity).toBe("uuid");
});

it("rejects forged, mismatched, and unscoped dependent lookups", () => {
  expect(() => normalizeSharedReferenceLookup({
    sourceKey: "shared.bank_institution",
    filters: { country: "MY" } as never,
  })).toThrow("REFERENCE_LOOKUP_FILTER_INVALID");
  expect(() => normalizeSharedReferenceLookup({
    sourceKey: "shared.bank_branch",
    value: "not-a-uuid",
  })).toThrow("REFERENCE_LOOKUP_VALUE_INVALID");
  expect(() => normalizeSharedReferenceLookup({
    sourceKey: "shared.country",
    value: uuid,
  })).toThrow("REFERENCE_LOOKUP_VALUE_INVALID");
  expect(() => normalizeSharedReferenceLookup({ sourceKey: "shared.state_region" }))
    .toThrow("REFERENCE_LOOKUP_DEPENDENCY_REQUIRED");
  expect(() => normalizeSharedReferenceLookup({ sourceKey: "shared.bank_branch" }))
    .toThrow("REFERENCE_LOOKUP_DEPENDENCY_REQUIRED");
  expect(() => normalizeSharedReferenceLookup({ sourceKey: "shared.commodity_code" }))
    .toThrow("REFERENCE_LOOKUP_DEPENDENCY_REQUIRED");
});

it("admits declared dependency scopes and exact historical UUID resolution", () => {
  expect(normalizeSharedReferenceLookup({
    sourceKey: "shared.state_region",
    filters: { countryCode: "MY" },
  }).filters).toEqual({ countryCode: "MY" });
  expect(normalizeSharedReferenceLookup({
    sourceKey: "shared.bank_branch",
    filters: { institutionId: uuid, countryCode: "MY" },
  }).filters).toEqual({ institutionId: uuid, countryCode: "MY" });
  expect(normalizeSharedReferenceLookup({
    sourceKey: "shared.bank_branch",
    value: uuid,
  }).value).toBe(uuid);
  expect(normalizeSharedReferenceLookup({
    sourceKey: "shared.industry_code",
    filters: { domainCode: "naics" },
  }).filters).toEqual({ domainCode: "naics" });
  expect(normalizeSharedReferenceLookup({
    sourceKey: "shared.industry_crosswalk",
    filters: { sourceDomainCode: "naics", targetDomainCode: "isic" },
  }).filters).toEqual({ sourceDomainCode: "naics", targetDomainCode: "isic" });
});

it("returns a bounded deterministic page with an opaque next cursor", () => {
  const page = toSharedReferenceLookupPage("shared.country", "[]", [
    { id: "a", value: "AA", label: "A", sort_1: "A", sort_2: "AA" },
    { id: "b", value: "BB", label: "B", sort_1: "B", sort_2: "BB" },
  ], 1);
  expect(page.items).toEqual([{ recordId: "a", value: "AA", label: "A" }]);
  expect(page.nextCursor).toBeTypeOf("string");
  expect(() => normalizeSharedReferenceLookup({
    sourceKey: "shared.country", cursor: page.nextCursor,
  })).not.toThrow();
  expect(() => normalizeSharedReferenceLookup({
    sourceKey: "shared.currency", cursor: page.nextCursor,
  })).toThrow("REFERENCE_LOOKUP_CURSOR_SCOPE_INVALID");
});
