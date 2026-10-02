import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import { createKyselyPermissionResolver } from "@athyper/server-platform-iam";
import type { VerifiedIdentity } from "@athyper/server-contract-auth";
/** Read-only effective authority inventory, not an authenticated write journey.
 * No grants, roles, overrides, authentication tokens or Person rows are changed. */
async function main() {
  assert.equal(process.argv.length, 2);
  const c = JSON.parse(
    execFileSync("docker", ["inspect", "athyper-dev-db-1"], {
      encoding: "utf8",
    }),
  )[0];
  assert.equal(c.Config.Labels["com.docker.compose.project"], "athyper-dev");
  assert.equal(c.State.Running, true);
  const env = Object.fromEntries(
    c.Config.Env.map((v: string) => {
      const i = v.indexOf("=");
      return [v.slice(0, i), v.slice(i + 1)];
    }),
  );
  const secret = c.Mounts.find(
    (m: { Destination: string }) =>
      m.Destination === env.POSTGRES_PASSWORD_FILE,
  )?.Source;
  assert.ok(
    typeof secret === "string" &&
      secret.includes("/.athyper/instances/dev/secrets/"),
  );
  const db = new Kysely<Record<string, never>>({
    dialect: new PostgresDialect({
      pool: new Pool({
        host: (
          Object.values(c.NetworkSettings.Networks)[0] as { IPAddress: string }
        ).IPAddress,
        user: env.POSTGRES_USER,
        password: readFileSync(secret, "utf8").trim(),
        database: "athyper_neon",
        max: 1,
      }),
    }),
  });
  try {
    const results = [];
    for (const [actor, expectedId] of [
      ["catl.admin", "cca94907-7519-5871-8e3c-6b11aa545c93"],
      ["catl.finance", "d04198ac-53cf-5e94-969f-b6f75f176fa2"],
    ]) {
      const result = await db
        .transaction()
        .setIsolationLevel("repeatable read")
        .setAccessMode("read only")
        .execute(async (tx) => {
          const p = (
            await sql<{
              id: string;
              tenant_id: string;
              auth_epoch: number;
            }>`SELECT id,tenant_id,auth_epoch FROM master.principal WHERE code=${actor} AND tenant_id='44444444-4444-4444-8444-444444444444'::uuid AND status='active'`.execute(
              tx,
            )
          ).rows;
          assert.equal(p.length, 1);
          assert.equal(p[0]!.id, expectedId);
          const identity: VerifiedIdentity = {
            planeKey: "neon",
            realmKey: "neon",
            tenantId: p[0]!.tenant_id,
            principalId: p[0]!.id,
            authEpoch: p[0]!.auth_epoch,
          };
          await sql`SELECT set_config('app.current_tenant_id',${identity.tenantId},true),set_config('app.current_principal_id',${identity.principalId},true)`.execute(
            tx,
          );
          const snapshot = await createKyselyPermissionResolver({
            run: (_identity, work) => work(tx),
          }).resolve(identity);
          const code = "neon.workforce.profile.write";
          return {
            actor,
            writePermissionAllowed: snapshot.allowed.includes(code),
            explicitlyDenied: snapshot.denied.includes(code),
            planLocked: snapshot.planLocked.includes(code),
            scope:
              snapshot.authorizationScopes.find(
                (scope) => scope.permissionCode === code,
              ) ?? null,
            evidence:
              snapshot.evidence?.filter((e) => e.permissionCode === code) ?? [],
            requirements:
              snapshot.requirements?.find((r) => r.permissionCode === code) ??
              null,
            linkOperationBindings:
              snapshot.operationBindings?.filter(
                (b) =>
                  b.entityCode === "principal" &&
                  b.operationKey === "link_person",
              ) ?? [],
          };
        });
      results.push(result);
    }
    console.log(
      JSON.stringify(
        {
          environment: "dev",
          plane: "neon",
          readOnly: true,
          effectiveResolver: true,
          authenticatedJourney: false,
          results,
          completedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
  } finally {
    await db.destroy();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
