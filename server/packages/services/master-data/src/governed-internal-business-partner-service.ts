import type {
  Authorizer,
  VerifiedRequestContext,
} from "@athyper/server-contract-auth";
import {
  businessPartnerRequestPermissions,
  type GovernedInternalBusinessPartnerCaseRepository,
  type GovernedInternalBusinessPartnerCaseService,
  type GovernedInternalBusinessPartnerCaseTransactionCoordinator,
} from "@athyper/server-contract-master-data";
import { MasterDataError } from "./errors.js";

export function createGovernedInternalBusinessPartnerCaseService<
  Transaction,
>(options: {
  readonly authorizer: Authorizer;
  readonly repository: GovernedInternalBusinessPartnerCaseRepository<Transaction>;
  readonly transactions: GovernedInternalBusinessPartnerCaseTransactionCoordinator<Transaction>;
}): GovernedInternalBusinessPartnerCaseService {
  return {
    async createDraft(command) {
      context(command.context);
      await authorize(
        options.authorizer,
        command.context,
        businessPartnerRequestPermissions.create,
        command.caseId,
      );
      return options.transactions.run(
        "neon",
        actor(command.context),
        (transaction) => options.repository.createDraft(command, transaction),
      );
    },
    async transition(command) {
      context(command.context);
      const permission =
        command.action === "submit"
          ? businessPartnerRequestPermissions.submit
          : businessPartnerRequestPermissions.decide;
      await authorize(
        options.authorizer,
        command.context,
        permission,
        command.caseId,
      );
      return options.transactions.run(
        "neon",
        actor(command.context),
        (transaction) => options.repository.transition(command, transaction),
      );
    },
    async materialize(command) {
      context(command.context);
      await authorize(
        options.authorizer,
        command.context,
        businessPartnerRequestPermissions.apply,
        command.caseId,
      );
      return options.transactions.run(
        "neon",
        actor(command.context),
        (transaction) => options.repository.materialize(command, transaction),
      );
    },
  };
}

function context(value: VerifiedRequestContext): void {
  if (value.planeKey !== "neon")
    throw new MasterDataError(
      400,
      "GOVERNED_CASE_NEON_REQUIRED",
      "Internal Business Partner cases execute only in NEON",
    );
}
function actor(value: VerifiedRequestContext) {
  return {
    tenantId: value.tenantId,
    principalId: value.principalId,
    correlationId: value.correlationId,
  };
}
async function authorize(
  authorizer: Authorizer,
  value: VerifiedRequestContext,
  permissionCode: string,
  caseId: string,
): Promise<void> {
  const decision = await authorizer.authorize({
    context: value,
    permissionCode,
    resource: {
      tenantId: value.tenantId,
      caseId,
      entityCode: "master.business_partner",
      ownershipClass: "internal",
    },
  });
  if (!decision.allowed)
    throw new MasterDataError(
      403,
      "FORBIDDEN",
      `Permission denied: ${permissionCode}`,
    );
}
