import { describe, expect, it } from "vitest";
import { clearBusinessPartnerTransactionContext } from "./business-partner-360";
describe("Business Partner transaction context recovery", () => {
 it("clears explicit scope without changing the record, date or unrelated state", () => {
   const url = new URL("https://neon.test/mdg/business-partner/partner?operatingOrganizationId=org&companyCodeId=company&legalEntityId=legal&roleLens=supplier&asOf=2026-09-08&section=identity");
   const next = clearBusinessPartnerTransactionContext(url);
   expect(next.pathname).toBe(url.pathname);
   expect([...next.searchParams.keys()]).toEqual(["asOf","section"]);
   expect(url.searchParams.get("companyCodeId")).toBe("company");
 });
});
