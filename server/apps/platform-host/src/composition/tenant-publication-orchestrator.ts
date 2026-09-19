import type { PublicationArtifactLoader } from "@athyper/server-contract-publication";
import { tryGetRequestContext } from "@athyper/server-foundation/context";
import { KyselyPublicationAuthorityRepository, KyselyLocalProjectionRepository, PublicationOrchestrator } from "@athyper/server-service-publication";
import { sql, type Kysely } from "kysely";
type Database = Record<string, never>;

/** Preserve tenant RLS on both sides of the existing resumable apply protocol. */
export class TenantPublicationOrchestrator extends PublicationOrchestrator {
  constructor(private readonly authorityDatabase: Kysely<Database>, private readonly localDatabase: Kysely<Database>, private readonly artifactLoader: PublicationArtifactLoader) {
    super(new KyselyPublicationAuthorityRepository(authorityDatabase), new KyselyLocalProjectionRepository(localDatabase), artifactLoader);
  }
  override async deploy(deploymentId: string) {
    const context = tryGetRequestContext();
    if (!context?.tenantId) return super.deploy(deploymentId);
    const stamp = (database: Kysely<Database>) => sql`SELECT set_config('app.current_tenant_id',${context.tenantId!},true),set_config('app.current_principal_id',${context.principalId ?? ""},true)`.execute(database);
    return this.authorityDatabase.transaction().execute(async authority => {
      await stamp(authority);
      return this.localDatabase.transaction().execute(async local => {
        await stamp(local);
        return new PublicationOrchestrator(new KyselyPublicationAuthorityRepository(authority), new KyselyLocalProjectionRepository(local), this.artifactLoader).deploy(deploymentId);
      });
    });
  }
}
