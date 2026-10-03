import { expect, it } from "vitest";
import { parseAtlasBusinessContext } from "./business-context.js";
const id = "10000000-0000-4000-8000-000000000001";
const page = { schemaVersion: 1, kind: "record", entityCode: "child", recordId: id, dirty: false, generationId: id, locale: "en" };
const parentScope = { parentEntityCode: "principal", parentRecordId: id, relationshipKey: "notifications" };
it("accepts only a complete bounded parent relationship selector and freezes it", () => {
  const parsed = parseAtlasBusinessContext({ ...page, parentScope });
  expect(parsed.parentScope).toEqual(parentScope);
  expect(Object.isFrozen(parsed.parentScope)).toBe(true);
  const pinned = { ...parentScope, parentDescriptorHash: "a".repeat(64) };
  expect(parseAtlasBusinessContext({ ...page, parentScope: pinned }).parentScope).toEqual(pinned);
  for (const value of [ {}, { parentEntityCode: "principal" }, { ...parentScope, parentRecordId: "invalid" },
    { ...parentScope, relationshipKey: "notifications;sql" }, { ...parentScope, tenantId: id },
    { ...parentScope, parentDescriptorHash: "invalid" }, { ...parentScope, predicates: [] } ])
    expect(() => parseAtlasBusinessContext({ ...page, parentScope: value })).toThrow();
});
