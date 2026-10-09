/** Local bookkeeping repair through the existing publication service/worker role.
 * Does not create artifacts, deployments, approval or activation authority. */
import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import { reconcileSignedRelease } from "@athyper/server-service-publication";
import { loadPublicationWorkloadConfiguration } from "../composition/shared/publication/workload-configuration.js";
import { assertPublicationWorkloadActor } from "../composition/shared/publication/deployment-recovery-authority.js";
const releases = process.argv.slice(2);
if (
  !releases.length ||
  releases.length > 100 ||
  releases.some(
    (id) =>
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
        id,
      ),
  )
)
  throw Error("Explicit release UUIDs required (maximum 100)");
const config = loadPublicationWorkloadConfiguration(
  process.env,
  process.env.ATHYPER_ENV!,
);
if (!config?.localAuthority || !process.env.STUDIO_DATABASE_URL)
  throw Error("Installed local publication configuration required");
const db = new Kysely<Record<string, never>>({
  dialect: new PostgresDialect({
    pool: new Pool({
      connectionString: process.env.STUDIO_DATABASE_URL,
      max: 1,
    }),
  }),
});
try {
  for (const releaseId of new Set(releases)) {
    const result = await db.transaction().execute(async (tx) => {
      const role = (
        await sql<{ role: string }>`SELECT current_user AS role`.execute(tx)
      ).rows[0]!.role;
      if (role !== "athyper_worker")
        throw Error("Application worker role required");
      await sql`SELECT set_config('app.current_tenant_id',${config.tenantId},true),set_config('app.current_principal_id',${config.publisher.principalId},true)`.execute(
        tx,
      );
      await assertPublicationWorkloadActor(tx, config, "publisher");
      return { role, published: await reconcileSignedRelease(tx, releaseId) };
    });
    console.log(JSON.stringify({ releaseId, ...result }));
  }
} finally {
  await db.destroy();
}
