import { expect, it } from "vitest";
import { collaborationEntityCode, collaborationEntityTypes, createCollaborationEntityCoordinates } from "../entity-coordinate.js";

it("leaves every unregistered coordinate exact", () => {
  for (const type of ["business_partner", "master.business_partner", "other.business_partner", "content.item", "customer"]) {
    expect(collaborationEntityCode(type)).toBe(type);
    expect(collaborationEntityTypes(type)).toEqual([type]);
  }
});

it("supports explicit domain bindings without prefix inference or alias collisions", () => {
  const coordinates = createCollaborationEntityCoordinates([{canonical:"record",aliases:["legacy.record"]}]);
  expect(coordinates.entityTypes("legacy.record")).toEqual(["record","legacy.record"]);
  expect(coordinates.entityCode("legacy.record")).toBe("record");
  expect(coordinates.entityTypes("other.record")).toEqual(["other.record"]);
  expect(() => createCollaborationEntityCoordinates([{canonical:"a1",aliases:["a2"]},{canonical:"a2",aliases:[]}])).toThrow("Ambiguous");
});
