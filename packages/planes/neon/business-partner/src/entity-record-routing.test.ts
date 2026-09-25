import { expect, it } from "vitest";
import { resolveEntityRecordAdapter } from "@athyper/product-neon-entity-extensions";
import { resolveEntityRecordContext, entityRecordAuthorizationPath } from "../../../../../apps/neon/lib/entity-route-context";
import { resolveNeonEntityApplicationInternalRoute, resolveNeonEntityApplicationPublicRoute } from "../../../../../apps/neon/lib/catalog-routes";

const id = "b4137225-4534-5469-8138-09d15a970271";
it("returns unavailable rather than throwing for malformed route segments",()=>{
 for(const segment of ["..","%2e%2e","%","../manage","%2fmanage"]) {
   expect(resolveNeonEntityApplicationInternalRoute("business_partner",[segment])).toBeUndefined();
   expect(resolveNeonEntityApplicationPublicRoute(`/app/entity/business_partner/${segment}`)).toBeUndefined();
 }
});
it("maps only registered record URLs to existing authorization paths", () => {
  expect(entityRecordAuthorizationPath(`/app/entity/business_partner/${id}`)).toBe(`/mdg/business-partner/${id}`);
  expect(entityRecordAuthorizationPath(`/app/entity/unknown/${id}`)).toBeUndefined();
  expect(entityRecordAuthorizationPath("/app/entity/business_partner/manage")).toBeUndefined();
});
it("resolves the registered record with catalog entitlement coordinates", () => {
  expect(resolveEntityRecordContext("business_partner", [id])).toEqual({
    entityCode: "business_partner", recordId: id, workspaceCode: "mdg", moduleCode: "bp",
  });
  expect(resolveEntityRecordAdapter("business_partner")?.recordHref(id)).toBe(
    `/app/entity/business_partner/${id}`,
  );
});
it("does not mistake list and workflow routes for record routes", () => {
  for (const segments of [[], ["manage"], ["new"], [id, "roles", "new"]]) {
    expect(resolveEntityRecordContext("business_partner", segments)).toBeUndefined();
  }
  expect(resolveNeonEntityApplicationInternalRoute("business_partner", ["manage"])?.surfaceKey).toBe("manage");
});
it("rejects unknown, inherited and unimplemented entity registrations", () => {
  for (const entity of ["unknown", "__proto__", "constructor", "business_partner_request"]) {
    expect(resolveEntityRecordAdapter(entity)).toBeUndefined();
    expect(resolveEntityRecordContext(entity, [id])).toBeUndefined();
  }
});
