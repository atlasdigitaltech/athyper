import { expect, it } from "vitest";
import { collaborationEntityCode, collaborationEntityTypes } from "../entity-coordinate.js";

it("joins only the explicitly supported BP comment coordinates", () => {
  for (const type of ["business_partner", "master.business_partner"]) {
    expect(collaborationEntityCode(type)).toBe("business_partner");
    expect(collaborationEntityTypes(type)).toEqual(["business_partner", "master.business_partner"]);
  }
  for (const type of ["other.business_partner", "content.item", "customer"]) {
    expect(collaborationEntityCode(type)).toBe(type);
    expect(collaborationEntityTypes(type)).toEqual([type]);
  }
});
