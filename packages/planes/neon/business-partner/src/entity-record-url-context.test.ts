// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { writeRecordLocation } from "../../../../platform/entity/runtime/form-detail/src/record/write-record-location";
import { readResourceContext } from "../../../../platform/entity/runtime/form-detail/src/record/record-url-state";
afterEach(() => window.history.replaceState({}, "", "/"));
describe("Shared record transaction context URL updates", () => {
 it("clears explicit scope without changing the record, date or unrelated state", () => {
   window.history.replaceState({ router: "preserved" }, "", "/app/entity/business_partner/partner?operatingOrganizationId=org&companyCodeId=company&legalEntityId=legal&roleLens=supplier&asOf=2026-09-08&section=identity&tag=a&tag=b#details");
   const url = new URL(window.location.href);
   const next = new URL(url);
   for (const key of ["operatingOrganizationId", "companyCodeId", "legalEntityId", "roleLens"])
     next.searchParams.delete(key);
   expect(writeRecordLocation(next)).toBe(true);
   expect(next.pathname).toBe(url.pathname);
   expect([...next.searchParams.keys()]).toEqual(["asOf","section","tag","tag"]);
   expect(url.searchParams.get("companyCodeId")).toBe("company");
   expect(window.history.state).toEqual({ router: "preserved" });
   expect(window.location.hash).toBe("#details");
   expect(readResourceContext()).toEqual({ asOf: "2026-09-08" });
   expect(writeRecordLocation(next)).toBe(false);
 });
});
