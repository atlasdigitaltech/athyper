import { describe, expect, it, vi } from "vitest";
import { ExperienceAccessError } from "@athyper/server-platform-experience";
import { MasterDataError } from "@athyper/server-service-master-data";
import { businessPartnerContextAdmission } from "./business-partner-context-admission.js";
import type { CreateBusinessPartnerRequestCommand } from "@athyper/server-contract-master-data";

const command = { context: {}, companyCodeId: "company", operatingOrganizationId: "organization" } as CreateBusinessPartnerRequestCommand;
describe("BP company context admission", () => {
  it("uses catalog permission without substituting it for case action authority", async () => {
    const validateNeonBusinessContext = vi.fn().mockResolvedValue({});
    await businessPartnerContextAdmission({ validateNeonBusinessContext })(command);
    expect(validateNeonBusinessContext).toHaveBeenCalledWith(command.context, "neon.context.catalog.read", {
      companyCodeId: "company", operatingOrganizationId: "organization",
    });
  });
  it("preserves context denial as a domain HTTP error", async () => {
    const validateNeonBusinessContext = vi.fn().mockRejectedValue(new ExperienceAccessError(403, "EXPERIENCE_CONTEXT_INCOMPATIBLE", "Denied"));
    await expect(businessPartnerContextAdmission({ validateNeonBusinessContext })(command))
      .rejects.toMatchObject({ status: 403, code: "EXPERIENCE_CONTEXT_INCOMPATIBLE" });
    await expect(businessPartnerContextAdmission({ validateNeonBusinessContext })(command)).rejects.toBeInstanceOf(MasterDataError);
  });
  it("does not require company selection for organization-only drafts", async () => {
    const validateNeonBusinessContext = vi.fn();
    await businessPartnerContextAdmission({ validateNeonBusinessContext })({ ...command, companyCodeId: undefined });
    expect(validateNeonBusinessContext).not.toHaveBeenCalled();
  });
});
