import { describe, expect, it } from "vitest";
import { parseRecordListParameters } from "../records-routes.js";
import { parseEntityListScopeCoordinate } from "../entity-list-routes.js";

describe("Records list query contract", () => {
  it("parses the complete bounded list query", () => {
    expect(parseRecordListParameters({
      limit: "50",
      cursor: "opaque-cursor",
      search: "acme",
      filter: [JSON.stringify({ field: "status", operator: "in", value: ["active", "draft"] }), JSON.stringify({ field: "name", operator: "contains", value: "supply" }), JSON.stringify({ field: "deleted_at", operator: "is_null" })],
      sort: ["updated_at:desc:last", JSON.stringify({ field: "code", direction: "asc" })],
      fields: ["code", "display_name"],
      group: "status",
      countMode: "cached",
      hydrateReferences: "false",
    })).toEqual({
      limit: 50,
      cursor: "opaque-cursor",
      search: "acme",
      filters: [{ field: "status", operator: "in", value: ["active", "draft"] }, { field: "name", operator: "contains", value: "supply" }, { field: "deleted_at", operator: "is_null" }],
      sort: [{ field: "updated_at", direction: "desc", nulls: "last" }, { field: "code", direction: "asc" }],
      fields: ["code", "display_name"],
      group: "status",
      countMode: "cached",
      hydrateReferences: false,
    });
  });

  it("rejects malformed, unbounded, and incomplete filters", () => {
    expect(() => parseRecordListParameters({ filter: "not-json" })).toThrow(/JSON object/);
    expect(() => parseRecordListParameters({ filter: JSON.stringify({ field: "status", operator: "eq" }) })).toThrow(/value is required/);
    expect(() => parseRecordListParameters({ filter: JSON.stringify({ field: "status", operator: "is_null", value: null }) })).toThrow(/must not contain a value/);
    expect(() => parseRecordListParameters({ filter: JSON.stringify({ field: "status", operator: "contains", value: 2 }) })).toThrow(/must be a string/);
    expect(() => parseRecordListParameters({ filter: JSON.stringify({ field: "updated_at", operator: "between", value: ["2026-01-01"] }) })).toThrow(/exactly two bounds/);
  });

  it("rejects unsupported count and hydration values", () => {
    expect(() => parseRecordListParameters({ countMode: "always" })).toThrow(/countMode is invalid/);
    expect(() => parseRecordListParameters({ hydrateReferences: "yes" })).toThrow(/hydrateReferences is invalid/);
  });

  it("parses an explicit work context independently from list presentation state", () => {
    expect(parseEntityListScopeCoordinate({ companyCodeId: "11111111-1111-4111-8111-111111111111", legalEntityId: "22222222-2222-4222-8222-222222222222", operatingOrganizationId: "33333333-3333-4333-8333-333333333333" })).toEqual({ companyCodeId: "11111111-1111-4111-8111-111111111111", legalEntityId: "22222222-2222-4222-8222-222222222222", operatingOrganizationId: "33333333-3333-4333-8333-333333333333" });
    expect(parseEntityListScopeCoordinate({ networkAccountId: "44444444-4444-4444-8444-444444444444" })).toEqual({ networkAccountId: "44444444-4444-4444-8444-444444444444" });
    expect(parseEntityListScopeCoordinate({})).toBeUndefined();
    expect(() => parseEntityListScopeCoordinate({ companyCodeId: "11111111-1111-4111-8111-111111111111" })).toThrow(/supplied together/);
    expect(() => parseEntityListScopeCoordinate({ operatingOrganizationId: "not-a-uuid" })).toThrow(/must be a UUID/);
    expect(() => parseEntityListScopeCoordinate({ networkAccountId: "not-a-uuid" })).toThrow(/must be a UUID/);
  });
});
