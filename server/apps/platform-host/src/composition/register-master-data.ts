import { createLocalContactChallenges, registerLocalContactChallengeRoutes, type ContactChallengeRepository, type LocalChallengeConfiguration } from "@athyper/server-service-master-data";
import type { MasterDataServiceOptions, MasterDataServices } from "@athyper/server-service-master-data";
import { createMasterDataServices, MasterDataError, registerMasterDataRoutes } from "@athyper/server-service-master-data";
import { createIamAuthenticationMiddleware, readVerifiedRequestContext } from "@athyper/server-platform-iam";
import type { Container } from "./create-container.js";

/** Mount the API even when its adapters are absent, with an authenticated 503. */
export function registerMasterData<Transaction>(container: Container, options?: MasterDataServiceOptions<Transaction>, local?: { config: LocalChallengeConfiguration; repository: ContactChallengeRepository<Transaction>; deliver: Parameters<typeof createLocalContactChallenges<Transaction>>[3] }): void {
  const iam = container.platform.iam;
  if (!iam) return;
  const unavailable = async (): Promise<never> => {
    throw new MasterDataError(503, "MASTER_DATA_UNAVAILABLE", "Master data persistence and verification dependencies are not configured");
  };
  const services: MasterDataServices = options ? createMasterDataServices(options) : {
    contacts: { create: unavailable, changeVerification: unavailable, deactivate: unavailable },
    addresses: { create: unavailable, deactivate: unavailable },
    ownerProfile: { get: unavailable },
  };
  if (options && local) {
    const challenges = createLocalContactChallenges(options, local.repository, local.config, local.deliver);
    container.platform.httpRegistrars.push(application => registerLocalContactChallengeRoutes(application, {
      authenticate: createIamAuthenticationMiddleware(iam), readContext: readVerifiedRequestContext,
    }, challenges));
  }
  container.services.masterData = services;
  container.platform.httpRegistrars.push((application) => registerMasterDataRoutes(application, {
    authenticate: createIamAuthenticationMiddleware(iam),
    readContext: readVerifiedRequestContext,
    services,
  }));
}
