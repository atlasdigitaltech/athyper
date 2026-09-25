import { ExperienceAccessError } from "@athyper/server-platform-experience";
import { MasterDataError } from "@athyper/server-service-master-data";
import type { createExperienceService } from "@athyper/server-platform-experience";
import type { CreateBusinessPartnerRequestCommand } from "@athyper/server-contract-master-data";

/** Context catalog admission is independent of the case's organization-scoped action. */
export function businessPartnerContextAdmission(
  experience: Pick<ReturnType<typeof createExperienceService>, "validateNeonBusinessContext">,
) {
  return async (command: CreateBusinessPartnerRequestCommand): Promise<void> => {
    if (!command.operatingOrganizationId || !command.companyCodeId) return;
    try {
      await experience.validateNeonBusinessContext(command.context, "neon.context.catalog.read", {
        companyCodeId: command.companyCodeId,
        operatingOrganizationId: command.operatingOrganizationId,
      });
    } catch (error) {
      if (error instanceof ExperienceAccessError)
        throw new MasterDataError(error.status, error.code, error.message);
      throw error;
    }
  };
}
