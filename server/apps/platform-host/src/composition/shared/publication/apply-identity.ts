import {
  assertLocalPublicationEnvironment,
  type LocalPublicationRequest,
} from "@athyper/server-contract-publication";
import { sql, type Kysely } from "kysely";
import type { JobExecutionCoordinate } from "@athyper/server-contract-jobs";
import type { PublicationPlane } from "@athyper/server-contract-publication";
import { parseHumanReviewedExecutionPolicy } from "./human-publication-policy.js";
import { assertPublicationWorkloadActor } from "./deployment-recovery-authority.js";
import type { PublicationWorkloadConfiguration } from "./workload-configuration.js";

/** Resolve a coordinated job from persisted authority, never from a caller-chosen
 * code or a legacy seed identity. Legacy releases retain their existing resolver. */
export async function coordinatedApplyPrincipal(options: {
  authority: Kysely<Record<string, never>>;
  target: Kysely<Record<string, never>>;
  configuration?: PublicationWorkloadConfiguration;
  execution: JobExecutionCoordinate;
  plane: PublicationPlane;
  deploymentId: string;
}): Promise<string | undefined> {
  const { execution, configuration: config } = options;
  if (!execution.tenantId) throw Error("PUBLICATION_APPLIER_TENANT_REQUIRED");
  const coordinated = await options.authority
    .transaction()
    .execute(async (tx) => {
      await sql`SELECT set_config('app.current_tenant_id',${execution.tenantId!},true),set_config('app.current_principal_id',${execution.principalId},true)`.execute(
        tx,
      );
      const rows = (
        await sql<{
          metadata: Record<string, unknown>;
          created_by: string;
        }>`SELECT r.metadata,r.created_by
      FROM publication.deployment d JOIN publication.artifact a ON a.id=d.artifact_id JOIN publication.release r ON r.id=a.publication_release_id
      WHERE d.id=${options.deploymentId}::uuid AND r.tenant_id=${execution.tenantId!}::uuid AND d.target_plane=${options.plane}`.execute(
          tx,
        )
      ).rows;
      if (rows.length !== 1)
        throw Error("PUBLICATION_APPLIER_DEPLOYMENT_UNAVAILABLE");
      const source = rows[0]!;
      if (source.metadata.approvalBasis === "local_development_authority") {
        if (!config?.localAuthority)
          throw Error("LOCAL_PUBLICATION_AUTHORITY_NOT_CONFIGURED");
        assertLocalPublicationEnvironment(config);
        const request = source.metadata.localPublicationRequest as
          LocalPublicationRequest | undefined;
        if (
          !request ||
          config.tenantId !== execution.tenantId ||
          execution.principalId !== config.publisher.principalId ||
          source.created_by !== config.publisher.principalId ||
          request.admission.publisherWorkloadId !==
            config.publisher.principalId ||
          request.admission.authorWorkloadId !== config.author.principalId ||
          request.authority.id !== config.localAuthority.id ||
          request.authority.version !== config.localAuthority.version ||
          request.authority.hash !== config.localAuthority.hash
        )
          throw Error("LOCAL_PUBLICATION_APPLIER_MISMATCH");
        await assertPublicationWorkloadActor(tx, config, "publisher");
        return true;
      }
      if (!Object.hasOwn(source.metadata, "humanExecutionPolicy")) return false;
      const policy = parseHumanReviewedExecutionPolicy(
        source.metadata.humanExecutionPolicy,
      );
      if (
        !config ||
        config.tenantId !== execution.tenantId ||
        policy.authorityTenantId !== execution.tenantId ||
        policy.publisherPrincipalId !== config.publisher.principalId ||
        execution.principalId !== config.publisher.principalId ||
        source.created_by !== config.publisher.principalId
      )
        throw Error("PUBLICATION_APPLIER_PUBLISHER_MISMATCH");
      await assertPublicationWorkloadActor(tx, config, "publisher");
      return true;
    });
  if (!coordinated) return undefined;
  await options.target.transaction().execute(async (tx) => {
    await sql`SELECT set_config('app.current_tenant_id',${config!.tenantId},true),set_config('app.current_principal_id',${config!.publisher.principalId},true)`.execute(
      tx,
    );
    await assertPublicationWorkloadActor(tx, config!, "publisher");
  });
  return config!.publisher.principalId;
}
