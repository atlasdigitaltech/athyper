import { strict as assert } from "node:assert";
import pg from "pg";
import { Kysely, PostgresDialect, sql } from "kysely";
const { KyselyPublicationAuthorityRepository } = await import(
  process.env.PUBLICATION_REPOSITORY_MODULE ?? "../../../../packages/services/publication/dist/index.js"
);

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

const pool = new pg.Pool({ connectionString, max: 4 });
const database = new Kysely({ dialect: new PostgresDialect({ pool }) });
const repository = new KyselyPublicationAuthorityRepository(database);

try {
  const coordinate = await sql`SELECT id FROM publication.deployment WHERE command_id='40000000-0000-4000-8000-000000000001'::uuid`.execute(database);
  assert(coordinate.rows[0]?.id);
  const deployment = await repository.getDeployment(coordinate.rows[0].id);
  assert(deployment);
  assert.equal(deployment.targetPlane, "neon");
  assert.equal(deployment.publicationKey, "metadata.entity.invoice");
  assert.equal(deployment.deploymentStatus, "activated");

  await repository.transitionDeployment({ deploymentId: deployment.deploymentId, status: "activated" });
  const acknowledgement = await repository.acknowledge({
    deploymentId: deployment.deploymentId,
    targetInstance: "neon-1",
    activeReleaseHash: "c".repeat(64),
    localAppliedReleaseId: "60000000-0000-4000-8000-000000000001",
  });
  assert.equal(acknowledgement.targetInstance, "neon-1");
  console.log("PUBLICATION_AUTHORITY_REPOSITORY_INTEGRATION_OK");
} finally {
  await database.destroy();
}
