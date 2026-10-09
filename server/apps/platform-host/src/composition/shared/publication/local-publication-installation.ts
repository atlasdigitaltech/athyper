import { sql, type Transaction } from "kysely";
import { assertLocalPublicationEnvironment } from "@athyper/server-contract-publication";
import { resolveLocalPublicationAuthority } from "./local-publication-policy.js";
import { assertPublicationWorkloadActor } from "./deployment-recovery-authority.js";
import type { PublicationWorkloadConfiguration } from "./workload-configuration.js";

/** Installer-only configuration, never enrollment or approval. The caller must
 * use the schema installer connection; application roles cannot write this row. */
export async function installLocalPublicationConfiguration(
  tx: Transaction<Record<string, never>>,
  configuration: PublicationWorkloadConfiguration,
) {
  assertLocalPublicationEnvironment(configuration);
  if (!configuration.localAuthority || !tx.isTransaction)
    throw Error("LOCAL_PUBLICATION_AUTHORITY_PIN_REQUIRED");
  await sql`SELECT pg_advisory_xact_lock(hashtextextended('local-publication-installation',0))`.execute(
    tx,
  );
  await sql`SELECT set_config('app.database_plane','studio',true), set_config('app.current_tenant_id',${configuration.tenantId},true),
    set_config('app.current_principal_id',${configuration.publisher.principalId},true)`.execute(
    tx,
  );
  await assertPublicationWorkloadActor(tx, configuration, "author");
  await assertPublicationWorkloadActor(tx, configuration, "publisher");
  const authority = await resolveLocalPublicationAuthority({
    transaction: tx,
    context: {
      tenantId: configuration.tenantId,
      principalId: configuration.publisher.principalId,
      planeKey: "studio",
    },
    pin: configuration.localAuthority,
  });
  const identity = {
    environment: configuration.environment,
    instance: configuration.instance,
    domainSuffix: configuration.domainSuffix,
  };
  if (
    authority.authorWorkloadId !== configuration.author.principalId ||
    authority.publisherWorkloadId !== configuration.publisher.principalId ||
    Object.entries(identity).some(
      ([key, value]) => authority.host[key as keyof typeof identity] !== value,
    )
  )
    throw Error("LOCAL_PUBLICATION_INSTALLATION_SCOPE_MISMATCH");
  const existing = (
    await sql<{
      identity: typeof identity;
    }>`SELECT identity FROM publication.local_publication_host WHERE singleton FOR UPDATE`.execute(
      tx,
    )
  ).rows[0];
  if (
    existing &&
    (Object.keys(existing.identity).length !== 3 ||
      Object.entries(identity).some(
        ([key, value]) =>
          existing.identity[key as keyof typeof identity] !== value,
      ))
  )
    throw Error("LOCAL_PUBLICATION_INSTALLED_HOST_MISMATCH");
  if (!existing)
    await sql`INSERT INTO publication.local_publication_host(singleton,identity) VALUES(true,${JSON.stringify(identity)}::jsonb)`.execute(
      tx,
    );
  return {
    host: identity,
    authority: configuration.localAuthority,
    reused: !!existing,
  };
}
