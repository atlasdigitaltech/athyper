import type { Kysely } from "kysely";
import type { PublicationPlane } from "@athyper/server-contract-publication";
import {
  KyselyLocalProjectionRepository,
  VerifiedPublicationArtifactLoader,
  type PublicationOrchestrator,
} from "@athyper/server-service-publication";
import { TenantPublicationOrchestrator } from "./tenant-orchestrator.js";

type Database = Kysely<Record<string, never>>;
export interface PublicationTargetOptions {
  readonly authorityDatabase: Database;
  readonly databases: Readonly<Partial<Record<PublicationPlane, Database>>>;
  readonly targetPlanes: readonly PublicationPlane[];
  readonly artifactLoader: ConstructorParameters<
    typeof VerifiedPublicationArtifactLoader
  >[0];
  readonly activationGuard?: ConstructorParameters<
    typeof TenantPublicationOrchestrator
  >[3];
  readonly coordinatedWorkload?: ConstructorParameters<typeof TenantPublicationOrchestrator>[4];
}

/** Only selected apply targets receive projection, verification and orchestration bindings. */
export function createPublicationTargets(options: PublicationTargetOptions) {
  const projections: Partial<
    Record<PublicationPlane, KyselyLocalProjectionRepository>
  > = {};
  const orchestrators: Partial<
    Record<PublicationPlane, PublicationOrchestrator>
  > = {};
  const loaders: Partial<
    Record<PublicationPlane, VerifiedPublicationArtifactLoader>
  > = {};
  for (const plane of options.targetPlanes) {
    const database = options.databases[plane];
    if (!database)
      throw new Error(`Publication target database is unavailable: ${plane}`);
    projections[plane] = new KyselyLocalProjectionRepository(database);
    const loader = new VerifiedPublicationArtifactLoader(
      options.artifactLoader,
    );
    loaders[plane] = loader;
    orchestrators[plane] = new TenantPublicationOrchestrator(
      options.authorityDatabase,
      database,
      loader,
      options.activationGuard,
      options.coordinatedWorkload,
    );
  }
  return { projections, orchestrators, loaders };
}
