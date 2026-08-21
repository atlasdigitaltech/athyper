import { describe, expect, it } from "vitest";
import { ownerAddressContactPermission } from "../routes/owner-address-contact.route";

describe("owner address/contact authorization", () => {
  it("keeps operational Company Code management separate from Legal Entity and Tenant authority", () => {
    expect(ownerAddressContactPermission("company_code")).toBe("ADDRESS_CONTACT.COMPANY_CODE.MANAGE");
    expect(ownerAddressContactPermission("legal_entity")).toBe("ADDRESS_CONTACT.LEGAL_ENTITY.MANAGE");
    expect(ownerAddressContactPermission("tenant")).toBe("ADDRESS_CONTACT.TENANT.MANAGE");
  });
});
