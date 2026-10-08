/** Read-only native-source rehearsal against an explicitly restored local DB.
 * Uses the actual non-bypass control login and production component verifier.
 * Does not attest authenticated human review or publish anything. */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Kysely, sql } from "kysely";
import {
  createPostgresPool,
  createPostgresDialect,
} from "@athyper/server-adapter-db-core";
import {
  canonicalBytes,
  sha256,
} from "@athyper/server-adapter-publication-signing";
import { compileNativeRelease } from "@athyper/server-plane-studio-meta-entity-authoring";
import { readControlPlaneConfiguration } from "../../src/config/control-plane.js";
import { createNativeReviewSource } from "../../src/composition/control-plane/native-review-source.js";
import { createResourceVerifier } from "../../src/composition/control-plane/resource-verifier.js";
import { createDeployedComponentArtifactQualification } from "../../src/composition/shared/publication/component-qualification.js";

async function main() {
  const name = process.argv[2];
  if (!name || !/^athyper_native_review_rehearsal(?:_[a-z0-9]+)?$/.test(name))
    throw Error("RESTORED_REHEARSAL_DATABASE_REQUIRED");
  const config = readControlPlaneConfiguration(process.env);
  if (!config.nativeBootstrapConfigurationFile || !config.referenceTrustFile)
    throw Error("INSTALLED_NATIVE_CONFIGURATION_REQUIRED");
  const configuration = JSON.parse(
    await readFile(config.nativeBootstrapConfigurationFile, "utf8"),
  );
  const manifest = JSON.parse(
    await readFile(
      join(configuration.proposals.root, configuration.proposals.manifest),
      "utf8",
    ),
  );
  if (sha256(canonicalBytes(manifest)) !== configuration.proposals.manifestHash)
    throw Error("PROPOSAL_MANIFEST_CHANGED");
  const connection = new URL(
    (await readFile(config.databaseUrlFile, "utf8")).trim(),
  );
  connection.pathname = "/" + name;
  const database = new Kysely<Record<string, never>>({
    dialect: createPostgresDialect(
      createPostgresPool({ connectionString: connection.toString(), max: 1 }),
    ),
  });
  try {
    const resolver = createNativeReviewSource({
      configuration,
      loader: {
        canonicalizer: { canonicalBytes, sha256 },
        runtimeVersion: "1.0.0",
        verifier: createResourceVerifier(
          JSON.parse(await readFile(config.referenceTrustFile, "utf8")),
        ),
        store: {
          async get() {
            throw Error("LOCKED_BYTES_REQUIRED");
          },
          async putImmutable() {
            throw Error("READ_ONLY_REHEARSAL");
          },
        },
        uiComponents: createDeployedComponentArtifactQualification(
          process.env,
          { canonicalBytes, sha256 },
        ),
      },
    });
    const results = [];
    for (const proposal of manifest.proposals) {
      const result = await database.transaction().execute(async (tx) => {
        await sql`SELECT set_config('app.database_plane','studio',true),set_config('app.current_tenant_id',${config.authority.tenantId},true),set_config('app.current_principal_id',${proposal.authorId},true)`.execute(
          tx,
        );
        const role = (
          await sql<{
            login: string;
            role: string;
            safe: boolean;
            database: string;
          }>`SELECT session_user AS login,current_user AS role,current_database() AS database,NOT rolsuper AND NOT rolbypassrls AS safe FROM pg_roles WHERE rolname=current_user`.execute(
            tx,
          )
        ).rows[0]!;
        if (!role.safe || role.database !== name)
          throw Error("REHEARSAL_ROLE_INVALID");
        const source = await resolver(tx, proposal.changeSetId);
        const compiled = compileNativeRelease(
          source.graph,
          source.compiler,
          source.controls,
        );
        return {
          entity: source.graph.entity.entityCode,
          changeSetId: proposal.changeSetId,
          sourceHash: source.compiler.graphHash,
          contractHash: compiled.contractHash,
          descriptorHash: compiled.descriptorHash,
          fields: source.graph.fields.length,
          operations: source.controls.length,
          ...role,
        };
      });
      results.push(result);
    }
    console.log(
      JSON.stringify(
        {
          schema: "entity.native-review-source-rehearsal/1",
          humanApproval: false,
          mutations: false,
          results,
        },
        null,
        2,
      ),
    );
  } finally {
    await database.destroy();
  }
}
main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "NATIVE_REVIEW_REHEARSAL_FAILED",
  );
  process.exitCode = 1;
});
