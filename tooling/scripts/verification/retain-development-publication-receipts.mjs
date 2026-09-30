import { readFileSync } from "node:fs";
import { createAthyperDatabaseAdapter } from "@athyper/server-adapter-db-athyper";
import { createS3ObjectStorageAdapter } from "@athyper/server-adapter-object-storage-s3";
import { createInfisicalSecretStore } from "@athyper/server-adapter-secretstore-infisical";
import {
  CachedPublicationKeyResolver,
  Ed25519PublicationVerifier,
  canonicalBytes,
  sha256,
} from "@athyper/server-adapter-publication-signing";
import {
  KyselyPublicationAuthorityRepository,
  KyselyLocalProjectionRepository,
  ImmutablePublicationArtifactStore,
  VerifiedPublicationArtifactLoader,
} from "@athyper/server-service-publication";
import { sql } from "kysely";
const e = process.env,
  tenantId = "44444444-4444-4444-8444-444444444444",
  releaseId = "e0abaddf-5319-4393-a0a9-a30a9507d4ac",
  revisionId = "4849ea52-4e91-4c09-b06a-22e511362050";
if (e.INFISICAL_ENVIRONMENT !== "dev") throw new Error("Development required");
const secret = (name) => readFileSync("/run/secrets/" + name, "utf8").trim();
const adapters = Object.fromEntries(
  ["studio", "neon", "mesh"].map((plane) => [
    plane,
    createAthyperDatabaseAdapter({
      connectionString: `postgresql://athyper_worker:${encodeURIComponent(secret("worker-db-password"))}@dbpool-session:5432/athyper_${plane}`,
      max: 1,
    }),
  ]),
);
const bucket = e.S3_BUCKET_ARTIFACTS?.trim();
if (!bucket) throw new Error("S3_BUCKET_ARTIFACTS required");
const storage = createS3ObjectStorageAdapter({
  endpoint: "http://objectstorage:9000",
  region: "us-east-1",
  bucket,
  accessKeyId: secret("objectstorage-app-access-key"),
  secretAccessKey: secret("objectstorage-app-secret-key"),
  forcePathStyle: true,
});
const keys = new CachedPublicationKeyResolver(
  createInfisicalSecretStore({
    endpoint: e.INFISICAL_URL,
    token: readFileSync(e.INFISICAL_TOKEN_FILE, "utf8").trim(),
    workspaceId: e.INFISICAL_WORKSPACE_ID,
    environment: e.INFISICAL_ENVIRONMENT,
    secretPath: e.INFISICAL_SECRET_PATH,
  }),
  [
    {
      keyId: e.PUBLICATION_SIGNING_KEY_ID,
      publicKeyReferences: [e.PUBLICATION_PUBLIC_KEY_REFERENCE],
    },
  ],
);
const loader = new VerifiedPublicationArtifactLoader({
  store: new ImmutablePublicationArtifactStore({
    storage,
    bucket,
    canonicalizer: { sha256 },
  }),
  verifier: new Ed25519PublicationVerifier(keys),
  canonicalizer: { canonicalBytes, sha256 },
  runtimeVersion: "1.0.0",
});
try {
  const receipt = await adapters.studio.database
    .transaction()
    .execute(async (database) => {
      await sql`SELECT set_config('app.current_tenant_id',${tenantId},true),set_config('app.current_principal_id','41f9d49a-35c6-55bd-8fb3-8074195b6c0f',true)`.execute(
        database,
      );
      const authority = new KyselyPublicationAuthorityRepository(database);
      const release = await authority.getRelease(releaseId);
      if (!release || !["approved", "published"].includes(release.status))
        throw new Error("Approved release required");
      const rows = (
        await sql`SELECT d.id,d.target_plane FROM publication.deployment d JOIN publication.artifact a ON a.id=d.artifact_id WHERE a.publication_release_id=${releaseId}::uuid AND a.status='signed' AND d.status='activated'`.execute(
          database,
        )
      ).rows;
      if (rows.length !== 2)
        throw new Error("Two signed and activated deployments required");
      const consumers = [];
      for (const row of rows) {
        const deployment = await authority.getDeployment(row.id);
        if (!deployment) throw new Error("Deployment missing");
        const loaded = await loader.load(deployment);
        const active = await new KyselyLocalProjectionRepository(
          adapters[row.target_plane].database,
        ).findActiveBusinessPartnerDefinition(release.publicationKey);
        if (
          !active ||
          active.tenantId !== tenantId ||
          active.releaseId !== releaseId ||
          active.revisionId !== revisionId ||
          active.bundleHash !== loaded.verification.definitionBundleHash
        )
          throw new Error("Consumer receipt mismatch");
        const acknowledgements = (
          await sql`SELECT id,deployment_id,target_instance,active_release_hash,local_applied_release_id,acknowledged_at,evidence FROM publication.deployment_acknowledgement WHERE deployment_id=${row.id}::uuid`.execute(
            database,
          )
        ).rows;
        if (
          acknowledgements.length !== 1 ||
          acknowledgements[0].active_release_hash !== deployment.artifactHash
        )
          throw new Error("Activation acknowledgement mismatch");
        consumers.push({
          plane: row.target_plane,
          deployment,
          verification: loaded.verification,
          active: {
            id: active.id,
            tenantId: active.tenantId,
            revisionId: active.revisionId,
            releaseId: active.releaseId,
            releaseNo: active.releaseNo,
            bundleCode: active.bundleCode,
            semanticVersion: active.semanticVersion,
            bundleHash: active.bundleHash,
            sourceBundleHash: active.sourceBundleHash,
          },
          acknowledgements,
        });
      }
      const finalRelease =
        release.status === "published"
          ? release
          : await authority.transitionRelease({
              releaseId,
              status: "published",
              actorId: "41f9d49a-35c6-55bd-8fb3-8074195b6c0f",
              evidence: {
                signedArtifactsVerified: true,
                consumerPlanes: consumers.map((c) => c.plane),
              },
            });
      return {
        schema:
          "athyper.development-signed-publication-and-activation-receipts/1",
        observedAt: new Date().toISOString(),
        environment: "dev",
        tenantId,
        revisionId,
        release: finalRelease,
        consumers,
        productionQualified: false,
      };
    });
  console.log(JSON.stringify(receipt));
} finally {
  await Promise.all(Object.values(adapters).map((adapter) => adapter.close()));
}
