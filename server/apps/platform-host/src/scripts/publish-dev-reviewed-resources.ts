/** Bounded operator command: existing reviewed-resource compiler and applier only. */
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { sql, type Kysely } from "kysely";
import {
  canonicalBytes,
  sha256,
} from "@athyper/server-adapter-publication-signing";
import {
  KyselyPublicationAuthorityRepository,
  KyselyPublicationAuthorityWork,
} from "@athyper/server-service-publication";
import { runWithRequestContext } from "@athyper/server-foundation/context";
import { bootstrap } from "../kernel/bootstrap.js";
import {
  createResourcePublication,
  readResourcePublicationConfiguration,
} from "../composition/control-plane/resource-publication.js";
import { createDeployedComponentQualification } from "../composition/shared/publication/component-qualification.js";
if (
  process.env.ATHYPER_ENV !== "local" ||
  process.env.ATHYPER_DOMAIN_SUFFIX !== "dev.athyper.test"
)
  throw Error("RESOURCE_PUBLICATION_DEV_REQUIRED");
const path = process.env.PUBLICATION_RESOURCE_REQUEST_FILE;
if (!path) throw Error("RESOURCE_PUBLICATION_REQUEST_REQUIRED");
const bytes = await readFile(path);
if (bytes.length > 65536) throw Error("RESOURCE_PUBLICATION_REQUEST_TOO_LARGE");
const requests: unknown = JSON.parse(bytes.toString("utf8"));
if (!Array.isArray(requests) || !requests.length || requests.length > 16)
  throw Error("RESOURCE_PUBLICATION_REQUEST_INVALID");
for (const r of requests)
  if (
    !r ||
    typeof r !== "object" ||
    Object.keys(r).sort().join() !== "releaseId,sourceHash" ||
    !/^[a-f0-9-]{36}$/.test(r.releaseId) ||
    !/^[a-f0-9]{64}$/.test(r.sourceHash)
  )
    throw Error("RESOURCE_PUBLICATION_REQUEST_INVALID");
const host = await bootstrap("worker");
try {
  const { container, config } = host;
  const configuration = readResourcePublicationConfiguration(process.env);
  if (!configuration)
    throw Error("RESOURCE_PUBLICATION_CONFIGURATION_REQUIRED");
  const db = container.adapters.athyperDatabase?.database as
    Kysely<Record<string, never>> | undefined;
  const qualifier = createDeployedComponentQualification(process.env, {
    canonicalBytes,
    sha256,
  });
  if (
    !db ||
    !container.adapters.publicationSigner ||
    !container.adapters.publicationArtifactStore ||
    !container.services.publication?.orchestrators.studio
  )
    throw Error("RESOURCE_PUBLICATION_ADAPTERS_REQUIRED");
  const principal = await db.transaction().execute(async (tx) => {
    await sql`SELECT set_config('app.current_tenant_id',${configuration.authority.tenantId},true)`.execute(
      tx,
    );
    const rows = (
      await sql<{
        id: string;
      }>`SELECT id FROM master.principal WHERE tenant_id=${configuration.authority.tenantId}::uuid AND code=${process.env.PUBLICATION_APPLIER_PRINCIPAL_CODE ?? "publication.worker"} AND principal_type='service_account' AND status='active'`.execute(
        tx,
      )
    ).rows;
    if (rows.length !== 1) throw Error("RESOURCE_PUBLICATION_WORKER_REQUIRED");
    return rows[0]!.id;
  });
  const factory = (database: typeof db) =>
    createResourcePublication({
      database,
      configuration,
      canonical: { canonicalBytes, sha256 },
      componentQualifier: qualifier,
    });
  const work = new KyselyPublicationAuthorityWork({
    database: db,
    authority: new KyselyPublicationAuthorityRepository(db),
    store: container.adapters.publicationArtifactStore,
    signer: container.adapters.publicationSigner,
    canonicalizer: { canonicalBytes, sha256 },
    bucket: container.adapters.objectStorageArtifactsBucket!,
    signingKeyId: config.publication.signingKeyId!,
    targetEnvironment: config.env,
    targetInstance: process.env.ATHYPER_INSTANCE,
    targetPlanes: ["studio"],
    authoringResourcePublicationFactory: factory,
  });
  for (const request of requests) {
    await runWithRequestContext(
      {
        requestId: randomUUID(),
        planeKey: "studio",
        tenantId: configuration.authority.tenantId,
        principalId: principal,
      },
      async () => {
        const source = await factory(db).load(request.releaseId);
        if (sha256(canonicalBytes(source)) !== request.sourceHash)
          throw Error("RESOURCE_PUBLICATION_SOURCE_CHANGED");
        const compiled = await work.compile(request.releaseId);
        for (const compilationId of compiled.compilationIds) {
          const { deploymentId } = await work.sign(compilationId);
          await work.dispatch(deploymentId);
          const active =
            await container.services.publication!.orchestrators.studio!.deploy(
              deploymentId,
            );
          console.log(
            JSON.stringify({
              schema: "entity.reviewed-resource-delivery/1",
              releaseId: request.releaseId,
              compilationId,
              deploymentId,
              appliedReleaseId: active.id,
              status: active.status,
            }),
          );
        }
        await db.transaction().execute(async (tx) => {
          await sql`SELECT set_config('app.database_plane','studio',true),set_config('app.current_tenant_id',${configuration.authority.tenantId},true),set_config('app.current_principal_id',${principal},true)`.execute(
            tx,
          );
          await new KyselyPublicationAuthorityRepository(tx).transitionRelease({
            releaseId: request.releaseId,
            status: "published",
            actorId: principal,
            evidence: {
              sourceHash: request.sourceHash,
              delivery: "reviewed-resource-command",
            },
          });
        });
      },
    );
  }
} finally {
  await host.lifecycle.shutdown("reviewed_resource_delivery_complete");
}
