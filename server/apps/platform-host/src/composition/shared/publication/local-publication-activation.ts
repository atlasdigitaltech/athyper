import { sql, type Kysely } from "kysely";
import {
  assertLocalPublicationEnvironment,
  type LocalPublicationRequest,
} from "@athyper/server-contract-publication";
import type { PublicationWorkloadConfiguration } from "./workload-configuration.js";
import { assertPublicationWorkloadActor } from "./deployment-recovery-authority.js";
/** Extra authority check for the local basis before the existing signed loader,
 * projection repository, target CAS, activation guard and acknowledgements run. */
export async function authorizeLocalPublicationActivation(options: {
  authority: Kysely<Record<string, never>>;
  target: Kysely<Record<string, never>>;
  deploymentId: string;
  configuration?: PublicationWorkloadConfiguration;
}): Promise<void> {
  const row = (
    await sql<{
      release_id: string;
      metadata: Record<string, unknown>;
      target_plane: string;
      target_environment: string;
      target_instance: string;
    }>`SELECT r.id release_id,r.metadata,d.target_plane,d.target_environment,d.target_instance
 FROM publication.deployment d JOIN publication.artifact a ON a.id=d.artifact_id JOIN publication.release r ON r.id=a.publication_release_id
 WHERE d.id=${options.deploymentId}::uuid`.execute(options.authority)
  ).rows[0];
  if (!row || row.metadata.approvalBasis !== "local_development_authority")
    return;
  const config = options.configuration;
  if (!config?.localAuthority)
    throw Error("LOCAL_PUBLICATION_AUTHORITY_NOT_CONFIGURED");
  assertLocalPublicationEnvironment(config);
  await assertPublicationWorkloadActor(options.authority, config, "publisher");
  await assertPublicationWorkloadActor(options.target, config, "publisher");
  const checked = (
    await sql<{
      value: { request: LocalPublicationRequest };
    }>`SELECT publication.local_publication_execution_context(${row.release_id}::uuid) value`.execute(
      options.authority,
    )
  ).rows[0]?.value;
  const request = checked?.request;
  if (
    !request ||
    row.target_environment !== config.environment ||
    row.target_instance !== config.instance ||
    request.authority.id !== config.localAuthority.id ||
    request.authority.version !== config.localAuthority.version ||
    request.authority.hash !== config.localAuthority.hash ||
    request.admission.publisherWorkloadId !== config.publisher.principalId ||
    request.admission.authorWorkloadId !== config.author.principalId ||
    !request.inputs.targets.some(
      (t) => t.plane === row.target_plane && t.instance === row.target_instance,
    )
  )
    throw Error("LOCAL_PUBLICATION_ACTIVATION_DENIED");
}
