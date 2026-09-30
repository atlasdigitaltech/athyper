import { qualifyLearning } from "./learning-qualification.mts";
/** Disposable PostgreSQL qualification. No deployed target or credentials accepted. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import pg from "pg";
import { Kysely, PostgresDialect, sql } from "kysely";
import { KyselyAtlasRunRepository } from "@athyper/server-platform-ai/kysely-run-repository";
import { KyselyAtlasThreadRepository } from "@athyper/server-platform-ai/kysely-thread-repository";
import { KyselyAtlasResponseFeedbackStore } from "@athyper/server-platform-ai/response-feedback";
import { atlasGuidance, parseAtlasIntent } from "@athyper/server-contract-ai";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
const dbRoot = resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "../../../../../../../db",
);
const token = randomUUID(),
  container = `athyper-atlas-f4-${token.slice(0, 8)}`;
const selectedPlane = process.argv[2]?.match(
  /^--plane=(neon|mesh|studio)$/,
)?.[1];
if (process.argv.length > 3 || (process.argv[2] && !selectedPlane))
  throw Error(
    "This test accepts only a disposable --plane=neon|mesh|studio selector",
  );
async function command(program: string, args: string[]) {
  return new Promise<string>((ok, fail) => {
    const child = spawn(program, args, {
      cwd: dbRoot,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "",
      err = "";
    child.stdout.on("data", (v) => (out += v));
    child.stderr.on("data", (v) => (err += v));
    child.on("error", fail);
    child.on("close", (code) =>
      code === 0
        ? ok(out.trim())
        : fail(Error(`${program} failed: ${err.slice(-5000)}`)),
    );
  });
}
const docker = (...args: string[]) => command("docker", args);
let created = false;
try {
  await docker(
    "run",
    "-d",
    "--name",
    container,
    "--label",
    `athyper.atlas-f4=${token}`,
    "--tmpfs",
    "/var/lib/postgresql/data",
    "-p",
    "127.0.0.1::5432",
    "-e",
    "POSTGRES_HOST_AUTH_METHOD=trust",
    "postgres:16.13-bookworm",
  );
  created = true;
  for (let i = 0; ; i++) {
    try {
      await docker("exec", container, "pg_isready", "-U", "postgres");
      break;
    } catch (e) {
      if (i === 40) throw e;
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  const [inspection] = JSON.parse(await docker("inspect", container));
  assert.equal(inspection.Config.Labels["athyper.atlas-f4"], token);
  await docker(
    "exec",
    container,
    "psql",
    "-U",
    "postgres",
    "-c",
    "CREATE ROLE athyper_runtime NOLOGIN NOBYPASSRLS",
  );
  const port = Number(inspection.NetworkSettings.Ports["5432/tcp"][0].HostPort);
  for (const plane of ["neon", "mesh", "studio"] as const) {
    if (selectedPlane && selectedPlane !== plane) continue;
    await command("pnpm", [
      "exec",
      "tsx",
      "scripts/provisioning/foundation-runner.ts",
      `--plane=${plane}`,
      `--container=${container}`,
    ]);
    console.log(`PASS ${plane}: fresh canonical foundation`);
    const db = new Kysely<Record<string, never>>({
      dialect: new PostgresDialect({
        pool: new pg.Pool({
          host: "127.0.0.1",
          port,
          user: "postgres",
          database: `athyper_${plane}`,
          max: 2,
        }),
      }),
    });
    try {
      await sql`GRANT athyperapp TO athyper_runtime`.execute(db);
      await sql`DROP TABLE ai.atlas_learning_candidate`.execute(db);
      await sql`ALTER TABLE ai.ai_feedback_log DROP CONSTRAINT atlas_learning_feedback_coordinate_uq`.execute(
        db,
      );
      await sql
        .raw(
          readFileSync(
            resolve(dbRoot, "scripts/operations/upgrades/legacy-baseline-20260914/20260910_atlas_learning_common.sql"),
            "utf8",
          ),
        )
        .execute(db);
      if (plane === "studio") {
        await sql`DROP TABLE ai.atlas_learning_candidate_event,ai.atlas_learning_inbox`.execute(
          db,
        );
        await sql
          .raw(
            readFileSync(
              resolve(dbRoot, "scripts/operations/upgrades/legacy-baseline-20260914/20260910_atlas_learning_studio.sql"),
              "utf8",
            ),
          )
          .execute(db);
      }
      console.log(`PASS ${plane}: forward F4 migration`);
      const tenantId = randomUUID(),
        principalId = randomUUID(),
        otherPrincipal = randomUUID();
      await sql`INSERT INTO master.tenant(id,code,name,display_name,realm_key,status,created_by) VALUES(${tenantId}::uuid,'atlas_f4','Atlas F4','Atlas F4',${plane},'active',${principalId}::uuid)`.execute(
        db,
      );
      for (const [id, code] of [
        [principalId, "f4_owner"],
        [otherPrincipal, "f4_other"],
      ])
        await sql`INSERT INTO master.principal(id,tenant_id,code,name,principal_type,created_by) VALUES(${id}::uuid,${tenantId}::uuid,${code},${code},'user',${principalId}::uuid)`.execute(
          db,
        );
      const context: VerifiedRequestContext = {
        planeKey: plane,
        realmKey: plane,
        tenantId,
        principalId,
        authEpoch: 1,
        requestId: randomUUID(),
        profileHash: "test",
        permissions: {
          planeKey: plane,
          tenantId,
          principalId,
          principalFingerprint: "test",
          profileHash: "test",
          schemaHash: "test",
          resolvedAt: 1,
          allowed: [`${plane}.ai.agent.use`],
          denied: [],
          planLocked: [],
          planeExcluded: [],
          entries: [],
          authorizationScopes: [],
        },
      };
      const transactions = {
        async run<T>(
          selected: string,
          actor: { tenantId: string; principalId: string },
          work: (tx: any) => Promise<T>,
        ) {
          assert.equal(selected, plane);
          return db.transaction().execute(async (tx) => {
            await sql`SET LOCAL ROLE athyper_runtime`.execute(tx);
            await sql`SELECT set_config('app.current_tenant_id',${actor.tenantId},true),set_config('app.current_principal_id',${actor.principalId},true),set_config('app.database_plane',${plane},true)`.execute(
              tx,
            );
            return work(tx);
          });
        },
      };
      await qualifyLearning(db, context, otherPrincipal, transactions);
    } finally {
      await db.destroy();
    }
  }
} finally {
  if (created) await docker("rm", "-f", container);
}
