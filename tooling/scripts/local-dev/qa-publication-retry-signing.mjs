/** Run inside the QA worker: retry only failed signing jobs for an approved release. */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(`${process.cwd()}/package.json`);
const { Queue } = createRequire(
  require.resolve("@athyper/server-runtime-jobs"),
)("bullmq");
if (
  process.env.INFISICAL_ENVIRONMENT !== "qa" ||
  process.env.ATHYPER_DOMAIN_SUFFIX !== "qa.athyper.test"
)
  throw Error("QA signing worker required");
const releaseId = process.argv[2];
if (!/^[0-9a-f-]{36}$/.test(releaseId ?? ""))
  throw Error("Release UUID required");
const { createAthyperDatabaseAdapter } = await import(
  require.resolve("@athyper/server-adapter-db-athyper")
);
const { sql } = require("kysely");
const adapter = createAthyperDatabaseAdapter({
  connectionString: `postgresql://athyper_worker:${encodeURIComponent(readFileSync("/run/secrets/worker-db-password", "utf8").trim())}@dbpool-session:5432/athyper_studio`,
  max: 1,
});
const compilationIds = await adapter.database
  .transaction()
  .execute(async (db) => {
    await sql`SELECT set_config('app.current_tenant_id','44444444-4444-4444-8444-444444444444',true)`.execute(
      db,
    );
    return (
      await sql`SELECT c.id FROM publication.artifact_compilation c JOIN publication.release r ON r.id=c.publication_release_id WHERE r.id=${releaseId}::uuid AND r.status='approved' AND r.approved_by='5cd6cf93-3fe4-500c-8066-3ebf14a9eb5d'::uuid`.execute(
        db,
      )
    ).rows.map((r) => r.id);
  });
const queue = new Queue("publication.authority", {
  connection: {
    host: "memorycache",
    port: 6379,
    password: readFileSync("/run/secrets/redis-password", "utf8").trim(),
  },
});
try {
  const failed = await queue.getFailed(0, 99);
  let count = 0;
  for (const job of failed) {
    if (
      job.name === "publication.sign-artifact" &&
      compilationIds.includes(job.data.data?.compilationId)
    ) {
      await job.retry();
      count++;
    }
  }
  console.log(
    JSON.stringify({ releaseId, retried: count, approvalsChanged: false }),
  );
} finally {
  await queue.close();
  await adapter.close();
}
