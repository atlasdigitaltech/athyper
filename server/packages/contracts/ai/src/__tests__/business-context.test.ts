import { describe, expect, it } from "vitest";
import { parseAtlasBusinessContext } from "../business-context.js";
const id = "10000000-0000-4000-8000-000000000001";
const base = {
  schemaVersion: 1,
  entityCode: "business_partner",
  generationId: id,
  locale: "en",
};
const record = { ...base, kind: "record", recordId: id, dirty: false };
const manage = {
  ...base,
  kind: "manage",
  filters: [],
  sort: [],
  selectedIds: [],
  visibleIds: [],
  analysisTarget: "filtered_set",
  pageSize: 25,
  pageIndex: 0,
};
describe("Atlas context contract", () => {
  it("round trips Manage and record snapshots and freezes nested input", () => {
    expect(parseAtlasBusinessContext(manage)).toEqual(manage);
    expect(parseAtlasBusinessContext(record)).toEqual(record);
    const result = parseAtlasBusinessContext({
      ...record,
      workContext: { companyCodeId: id },
    });
    expect(Object.isFrozen(result.workContext)).toBe(true);
  });
  it.each([
    "principalId",
    "tenantId",
    "permissions",
    "profileHash",
    "authEpoch",
    "descriptorHash",
  ])("rejects browser authority %s", (key) => {
    expect(() =>
      parseAtlasBusinessContext({ ...record, [key]: "forged" }),
    ).toThrow();
  });
  it.each([
    { ...record, schemaVersion: 2 },
    { ...record, recordId: "forged" },
    { ...record, workContext: { companyCodeId: "forged" } },
    { ...record, workContext: { tenantId: id } },
    { ...record, selectedIds: [id] },
    { ...record, asOf: "yesterday" },
    { ...manage, analysisTarget: "selection" },
    { ...manage, selectedIds: [id, id] },
    { ...manage, filters: [{ field: "id", operator: "sql", value: "1=1" }] },
  ])("rejects invalid or mixed coordinates %#", (input) => {
    expect(() => parseAtlasBusinessContext(input)).toThrow();
  });
});
