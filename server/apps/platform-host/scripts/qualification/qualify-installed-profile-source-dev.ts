import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import { qualifyInstalledProfileSource } from "@athyper/server-service-workforce";
import { qualifyInstalledPrincipalLink } from "@athyper/server-service-workforce";

/** Read-only DEV inventory through the actual publication qualification port. */
async function main() {
  const args = process.argv.slice(2);
  const isolated = args[0]?.startsWith("--isolated-database=")
    ? args[0].slice(20)
    : undefined;
  const requestedPlane = args[0]?.startsWith("--plane=")
    ? args[0].slice(8)
    : undefined;
  assert.ok(
    args.length === 0 ||
      (args.length === 1 &&
        ((isolated &&
          /^athyper_profile_source_[a-f0-9]{32}_(neon|studio|mesh)$/.test(
            isolated,
          )) ||
          (requestedPlane &&
            ["neon", "studio", "mesh"].includes(requestedPlane)))),
    "Only DEV planes or an isolated source-test database are accepted",
  );
  const plane = isolated?.split("_").at(-1) ?? requestedPlane ?? "neon";
  const container = JSON.parse(
    execFileSync("docker", ["inspect", "athyper-dev-db-1"], {
      encoding: "utf8",
    }),
  )[0];
  assert.equal(
    container.Config.Labels["com.docker.compose.project"],
    "athyper-dev",
  );
  assert.equal(container.State.Running, true);
  const env = Object.fromEntries(
    container.Config.Env.map((value: string) => {
      const index = value.indexOf("=");
      return [value.slice(0, index), value.slice(index + 1)];
    }),
  );
  const secret = container.Mounts.find(
    (mount: { Destination: string }) =>
      mount.Destination === env.POSTGRES_PASSWORD_FILE,
  )?.Source;
  assert.ok(
    typeof secret === "string" &&
      secret.includes("/.athyper/instances/dev/secrets/"),
  );
  const host = (
    Object.values(container.NetworkSettings.Networks)[0] as {
      IPAddress: string;
    }
  ).IPAddress;
  const database = new Kysely<Record<string, never>>({
    dialect: new PostgresDialect({
      pool: new Pool({
        host,
        database: isolated ?? `athyper_${plane}`,
        user: env.POSTGRES_USER,
        password: readFileSync(secret, "utf8").trim(),
        max: 1,
      }),
    }),
  });
  try {
    const qualified = await database
      .transaction()
      .setAccessMode("read only")
      .execute(async (transaction) => ({
        neon: await qualifyInstalledProfileSource("neon", transaction),
        studio: await qualifyInstalledProfileSource("studio", transaction),
        mesh: await qualifyInstalledProfileSource("mesh", transaction),
      }));
    assert.deepEqual(qualified, {
      neon: plane === "neon",
      studio: plane === "studio",
      mesh: plane === "mesh",
    });
    const linkQualified = await database
      .transaction()
      .setAccessMode("read only")
      .execute((tx) => qualifyInstalledPrincipalLink(plane, tx));
    const checks: string[] = [];
    if (isolated && plane === "neon")
      await database.transaction().execute(async (transaction) => {
        for (const [label, statement] of [
          [
            "replication-only source fence denied",
            "ALTER TABLE master.employee ENABLE REPLICA TRIGGER trg_profile_source_fence",
          ],
          [
            "disabled Profile guard denied",
            "ALTER TABLE master.principal_profile DISABLE TRIGGER trg_principal_profile_source_guard",
          ],
          [
            "publicly executable source reader denied",
            "GRANT EXECUTE ON FUNCTION master.entity_profile_source_v1(uuid,uuid) TO PUBLIC",
          ],
          [
            "RLS-incomplete source reader denied",
            "ALTER FUNCTION master.entity_profile_source_v1(uuid,uuid) SET row_security=on",
          ],
          [
            "direct application link writes denied",
            "GRANT INSERT ON master.principal_person_link TO athyperapp",
          ],
        ]) {
          await sql`SAVEPOINT negative_probe`.execute(transaction);
          await sql.raw(statement!).execute(transaction);
          assert.equal(
            await qualifyInstalledProfileSource("neon", transaction),
            false,
            label,
          );
          await sql`ROLLBACK TO SAVEPOINT negative_probe`.execute(transaction);
          assert.equal(
            await qualifyInstalledProfileSource("neon", transaction),
            true,
          );
          checks.push(label!);
        }
      });
    if (isolated && (plane === "studio" || plane === "mesh"))
      await database.transaction().execute(async (transaction) => {
        for (const [label, statement] of [
          [
            "replication-only projection fence denied",
            "ALTER TABLE master.principal_identity_binding ENABLE REPLICA TRIGGER trg_projected_profile_source_fence",
          ],
          [
            "disabled projected Profile guard denied",
            "ALTER TABLE master.principal_profile DISABLE TRIGGER trg_projected_profile_source_guard",
          ],
          [
            "publicly executable projected reader denied",
            "GRANT EXECUTE ON FUNCTION master.entity_projected_profile_source_v1(uuid,uuid) TO PUBLIC",
          ],
          [
            "RLS-incomplete projected reader denied",
            "ALTER FUNCTION master.entity_projected_profile_source_v1(uuid,uuid) SET row_security=on",
          ],
        ]) {
          await sql`SAVEPOINT negative_probe`.execute(transaction);
          await sql.raw(statement!).execute(transaction);
          assert.equal(
            await qualifyInstalledProfileSource(plane, transaction),
            false,
            label,
          );
          await sql`ROLLBACK TO SAVEPOINT negative_probe`.execute(transaction);
          assert.equal(
            await qualifyInstalledProfileSource(plane, transaction),
            true,
          );
          checks.push(label!);
        }
      });
    console.log(
      JSON.stringify({
        environment: "dev",
        readOnly: !isolated,
        ...(isolated ? { isolated: true, database: isolated } : {}),
        qualified,
        linkQualified,
        checks,
        passed: true,
        completedAt: new Date().toISOString(),
      }),
    );
  } finally {
    await database.destroy();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
