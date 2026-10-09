import type { PublicationArtifactLoader } from "@athyper/server-contract-publication";
import { tryGetRequestContext } from "@athyper/server-foundation/context";
import {
  KyselyPublicationAuthorityRepository,
  KyselyLocalProjectionRepository,
  PublicationOrchestrator,
  classifyPublicationFailure,
} from "@athyper/server-service-publication";
import { sql, type Kysely } from "kysely";
import { deployHumanPublicationGroup } from "./human-publication-activation.js";
import type { PublicationWorkloadConfiguration } from "./workload-configuration.js";
type Database = Record<string, never>;
type ActivationGuard = NonNullable<
  ConstructorParameters<typeof PublicationOrchestrator>[3]
>;

/** Preserve tenant RLS on both sides of the existing resumable apply protocol. */
export class TenantPublicationOrchestrator extends PublicationOrchestrator {
  constructor(
    private readonly authorityDatabase: Kysely<Database>,
    private readonly localDatabase: Kysely<Database>,
    private readonly artifactLoader: PublicationArtifactLoader,
    private readonly activationGuard?: (
      ...args: [...Parameters<ActivationGuard>, Kysely<Database>]
    ) => ReturnType<ActivationGuard>,
    private readonly coordinatedWorkload?: PublicationWorkloadConfiguration,
    private readonly componentInstaller?: ConstructorParameters<
      typeof KyselyLocalProjectionRepository
    >[2],
    private readonly nativeSource?: Parameters<
      typeof deployHumanPublicationGroup
    >[0]["nativeSource"],
  ) {
    super(
      new KyselyPublicationAuthorityRepository(authorityDatabase),
      new KyselyLocalProjectionRepository(
        localDatabase,
        false,
        componentInstaller,
      ),
      artifactLoader,
    );
  }
  override async deploy(deploymentId: string) {
    const context = tryGetRequestContext();
    if (!context?.tenantId)
      throw new Error("PUBLICATION_APPLIER_TENANT_REQUIRED");
    const stamp = (database: Kysely<Database>) =>
      sql`SELECT set_config('app.current_tenant_id',${context.tenantId!},true),set_config('app.current_principal_id',${context.principalId ?? ""},true)`.execute(
        database,
      );
    try {
      return await this.authorityDatabase
        .transaction()
        .execute(async (authority) => {
          await stamp(authority);
          const apply = async (local: Kysely<Database>) => {
            await stamp(local);
            const coordinated = await deployHumanPublicationGroup({
              deploymentId,
              authority,
              local,
              loader: this.artifactLoader,
              workload: this.coordinatedWorkload,
              activationGuard: this.activationGuard,
              nativeSource: this.nativeSource,
            });
            if (coordinated) return coordinated;
            return new PublicationOrchestrator(
              new KyselyPublicationAuthorityRepository(authority),
              new KyselyLocalProjectionRepository(
                local,
                false,
                this.componentInstaller,
              ),
              this.artifactLoader,
              this.activationGuard
                ? (deployment, loaded) =>
                    this.activationGuard!(deployment, loaded, authority)
                : undefined,
              "after_rollback",
            ).deploy(deploymentId);
          };
          // Studio is both authority and target. Keep its projection and
          // authority updates atomic without borrowing another connection.
          return this.localDatabase === this.authorityDatabase
            ? apply(authority)
            : this.localDatabase.transaction().execute(apply);
        });
    } catch (error) {
      const failure = classifyPublicationFailure(error, "stage");
      if (failure.category === "permanent") {
        // The apply transaction has rolled back. Persist failure evidence in a
        // separate tenant-scoped transaction so the DLQ can see it.
        try {
          await this.authorityDatabase
            .transaction()
            .execute(async (authority) => {
              await stamp(authority);
              const visible =
                await sql`SELECT d.id FROM publication.deployment d
              JOIN publication.artifact a ON a.id=d.artifact_id
              JOIN publication.release r ON r.id=a.publication_release_id
              WHERE d.id=${deploymentId}::uuid AND r.tenant_id=${context.tenantId!}::uuid`.execute(
                  authority,
                );
              if (!visible.rows.length) return;
              // fn_transition_deployment locks and validates the row atomically.
              // A direct FOR UPDATE requires table UPDATE rights that this role
              // deliberately does not have. A concurrent activation wins safely:
              // the function rejects activated -> failed rather than overwriting it.
              const repository = new KyselyPublicationAuthorityRepository(
                authority,
              );
              const deployment = await repository.getDeployment(deploymentId);
              if (
                deployment &&
                [
                  "pending",
                  "dispatched",
                  "received",
                  "staged",
                  "verified",
                ].includes(deployment.deploymentStatus)
              )
                await repository.transitionDeployment({
                  deploymentId,
                  status: "failed",
                  evidence: { ...failure.evidence() },
                });
            });
        } catch (recordingError) {
          // Keep the apply rejection as the job/DLQ failure. A second failure in
          // persistence must not replace its category, code or retry semantics.
          Object.assign(failure, {
            failureRecordingEvidence: classifyPublicationFailure(
              recordingError,
              "stage",
            ).evidence(),
          });
        }
      }
      throw failure;
    }
  }
}
