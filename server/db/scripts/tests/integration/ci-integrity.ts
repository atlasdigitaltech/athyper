import { artifactDirectory } from "../../../../../tooling/scripts/artifact-paths.mjs";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { Client, Pool } from "pg";
import { Kysely, PostgresDialect, sql } from "kysely";
import { applyFoundation } from "../../provisioning/foundation-runner.js";
import { sourceBinding } from "../../../../../tooling/scripts/verification/ci-integrity-binding.mjs";
import { verifyTestEvidence } from "../../../../../tooling/scripts/verification/verify-ci-integrity-evidence.mjs";
import { KyselyTransactionRunner } from "@athyper/server-adapter-db-core/transaction";

// This runner owns its targets. It never accepts a database URL or an existing
// container and never reads deployed credentials. All changes die with tmpfs.
const root = resolve(import.meta.dirname, "../../../../..");
const id = `athyper-ci-integrity-${randomUUID().slice(0, 8)}`;
const password = randomUUID();
const planes = ["studio", "neon", "mesh"] as const;
const output = resolve(
  process.argv.find((arg) => arg.startsWith("--output="))?.slice(9) ??
    resolve(artifactDirectory("ci-integrity"), "database.json"),
);
const report: {
  schemaVersion: number;
  commit: string;
  source: { fileCount: number; sha256: string };
  qualified: boolean;
  checks: Array<{ name: string; status: string; evidence?: unknown }>;
  error?: string;
} = {
  schemaVersion: 1,
  commit: command("git", ["rev-parse", "HEAD"]).trim(),
  source: sourceBinding(root),
  qualified: false,
  checks: [],
};
function command(
  name: string,
  args: string[],
  environment = process.env,
  input?: string,
) {
  const result = spawnSync(name, args, {
    cwd: root,
    env: environment,
    input,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error || result.status !== 0)
    throw new Error(
      `${name} exited ${result.status}: ${result.error?.message ?? result.stderr ?? ""}\n${result.stdout ?? ""}`.replaceAll(
        password,
        "[test-password]",
      ),
    );
  return result.stdout;
}
const docker = (...args: string[]) => command("docker", args);
function pass(name: string, evidence?: unknown) {
  report.checks.push({ name, status: "pass", evidence });
  console.log(`PASS ${name}`);
}
async function client(url: string) {
  const connection = new Client({ connectionString: url });
  await connection.connect();
  return connection;
}
async function waitFor(url: string) {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const connection = await client(url);
      await connection.end();
      return;
    } catch (error) {
      if (attempt === 59) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
}
function port(container: string) {
  return JSON.parse(docker("inspect", container))[0].NetworkSettings.Ports[
    "5432/tcp"
  ][0].HostPort;
}
const adminUrls: Record<string, string> = {};
const runtimeUrls: Record<string, string> = {};
const fixture = {
  tenant: "11111111-1111-4111-8111-111111111111",
  principal: "22222222-2222-4222-8222-222222222222",
  otherTenant: "55555555-5555-4555-8555-555555555555",
  otherPrincipal: "66666666-6666-4666-8666-666666666666",
};
// Optional service suites must never inherit a developer's live DB opt-ins.
const cleanEnvironment = Object.fromEntries(
  Object.entries(process.env).filter(
    ([key]) => !/DATABASE|^PG|REDIS|^ATHYPER_.*(?:TEST|DB)/.test(key),
  ),
);
const environment: NodeJS.ProcessEnv = {
  ...cleanEnvironment,
  ATHYPER_SERVICE_DB_TESTS: "true",
  ATHYPER_POSTGRES_LOCAL_SKIP: "false",
  ATHYPER_SERVICE_TEST_TENANT_ID: fixture.tenant,
  ATHYPER_SERVICE_TEST_PRINCIPAL_ID: fixture.principal,
  ATHYPER_SERVICE_TEST_OTHER_TENANT_ID: fixture.otherTenant,
  ATHYPER_SERVICE_TEST_OTHER_PRINCIPAL_ID: fixture.otherPrincipal,
};
try {
  docker("network", "create", id);
  docker(
    "run",
    "-d",
    "--name",
    id,
    "--network",
    id,
    "--label",
    "athyper.purpose=ci-integrity",
    "--tmpfs",
    "/var/lib/postgresql/data",
    "-p",
    "127.0.0.1::5432",
    "-e",
    `POSTGRES_PASSWORD=${password}`,
    "postgres:16.13-bookworm",
  );
  const base = `127.0.0.1:${port(id)}`;
  await waitFor(`postgresql://postgres:${password}@${base}/postgres`);
  const bootstrap = await client(
    `postgresql://postgres:${password}@${base}/postgres`,
  );
  try {
    await bootstrap.query(`CREATE ROLE athyperapp LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
      CREATE ROLE athyperadmin NOLOGIN NOSUPERUSER NOBYPASSRLS;
      CREATE ROLE athyperadmin_atlas_maintenance NOLOGIN NOSUPERUSER NOBYPASSRLS;`);
    for (const plane of planes)
      await bootstrap.query(
        `CREATE DATABASE athyper_${plane} TEMPLATE template0`,
      );
  } finally {
    await bootstrap.end();
  }
  for (const plane of planes) {
    adminUrls[plane] =
      `postgresql://postgres:${password}@${base}/athyper_${plane}`;
    runtimeUrls[plane] =
      `postgresql://athyperapp:${password}@${base}/athyper_${plane}`;
    console.log(`Applying ${plane} canonical foundation`);
    const receipt = await applyFoundation({
      plane,
      databaseUrl: adminUrls[plane],
    });
    assert.ok(receipt.receiptCount > 0);
    pass(`${plane}: canonical DDL`, {
      manifestSha256: receipt.manifestSha256,
      receiptCount: receipt.receiptCount,
    });
    const admin = await client(adminUrls[plane]!);
    try {
      await admin.query(
        `ALTER DATABASE athyper_${plane} SET app.database_plane='${plane}'`,
      );
    } finally {
      await admin.end();
    }
    const seeds = await client(adminUrls[plane]!);
    try {
      await seeds.query("BEGIN");
      const paths = [
        "common/audit/12_reference_seed.sql",
        "common/control/12_parameter_runtime_seed.sql",
        ...(plane === "studio"
          ? []
          : [`planes/${plane}/control/12_reference_seed.sql`]),
      ];
      const tables = [
        "master.audit_event_contract",
        "control.parameter_definition",
        ...(plane === "studio"
          ? []
          : [
              "control.owner_type",
              "control.owner_type_purpose",
              "control.lookup_domain",
              "control.lookup_value",
              "authz.permission",
              "authz.permission_scope_kind",
            ]),
      ];
      const snapshot = async () => {
        const rows: Record<string, unknown> = {};
        for (const table of tables)
          rows[table] = (
            await seeds.query(
              `SELECT coalesce(jsonb_agg(row_data ORDER BY row_data::text),'[]') AS evidence FROM (SELECT to_jsonb(t) row_data FROM ${table} t) data`,
            )
          ).rows[0].evidence;
        return rows;
      };
      const before = await snapshot();
      for (const path of paths)
        await seeds.query(
          readFileSync(resolve(root, "server/db/ddl", path), "utf8"),
        );
      assert.deepEqual(
        await snapshot(),
        before,
        "seed replay changed converged rows or creation/update evidence",
      );
      await seeds.query(
        "UPDATE master.audit_event_contract SET priority=999 WHERE code='control_parameter_value'",
      );
      await seeds.query(
        "UPDATE control.parameter_definition SET name='controlled drift' WHERE code='experience.profile.default_density'",
      );
      if (plane !== "studio")
        await seeds.query(
          "UPDATE control.owner_type SET name='controlled drift' WHERE tenant_id IS NULL AND code='tenant'",
        );
      for (const path of paths)
        await seeds.query(
          readFileSync(resolve(root, "server/db/ddl", path), "utf8"),
        );
      assert.equal(
        (
          await seeds.query(
            "SELECT priority FROM master.audit_event_contract WHERE code='control_parameter_value'",
          )
        ).rows[0]?.priority,
        10,
      );
      assert.equal(
        (
          await seeds.query(
            "SELECT name FROM control.parameter_definition WHERE code='experience.profile.default_density'",
          )
        ).rows[0]?.name,
        "Default experience density",
      );
      if (plane !== "studio")
        assert.equal(
          (
            await seeds.query(
              "SELECT name FROM control.owner_type WHERE tenant_id IS NULL AND code='tenant'",
            )
          ).rows[0]?.name,
          "Tenant",
        );
      await seeds.query("SAVEPOINT wrong_plane");
      await seeds.query(
        "SELECT set_config('app.database_plane','invalid',true)",
      );
      await assert.rejects(
        seeds.query(
          readFileSync(resolve(root, "server/db/ddl", paths[0]!), "utf8"),
        ),
        /app.database_plane is missing or invalid/,
      );
      await seeds.query("ROLLBACK TO SAVEPOINT wrong_plane");
      await seeds.query("ROLLBACK");
      pass(
        `${plane}: seed replay, drift convergence and wrong-plane rejection`,
        { files: paths, tables: tables.length },
      );
    } finally {
      await seeds.end();
    }
    command(
      "docker",
      [
        "exec",
        "-i",
        id,
        "psql",
        "-X",
        "-U",
        "postgres",
        "-d",
        `athyper_${plane}`,
        "-v",
        "ON_ERROR_STOP=1",
        "-v",
        `fixture_tenant_id=${fixture.tenant}`,
        "-v",
        `fixture_principal_id=${fixture.principal}`,
        "-v",
        `fixture_other_tenant_id=${fixture.otherTenant}`,
        "-v",
        `fixture_other_principal_id=${fixture.otherPrincipal}`,
      ],
      process.env,
      readFileSync(
        resolve(root, "server/packages/test-utils/fixtures/rls-actors.sql"),
        "utf8",
      ),
    );
    const actorSetup = await client(adminUrls[plane]!);
    await actorSetup.query(
      "INSERT INTO master.principal(id,tenant_id,code,name,principal_type,status,created_by) VALUES('33333333-3333-4333-8333-333333333333',$1,'postgres.qualification.second','Second actor','service_account','active',$2)",
      [fixture.tenant, fixture.principal],
    );
    await actorSetup.end();
    const prefix = `ATHYPER_${plane.toUpperCase()}_TEST_DATABASE`;
    Object.assign(environment, {
      [`${prefix}_URL`]: runtimeUrls[plane],
      [`${prefix}_ROLE`]: "athyperapp",
    });
    for (const script of ["db:verify:rls", "db:verify:security-definer"]) {
      const log = command(
        "pnpm",
        ["--fail-if-no-match", "--filter", "@athyper/server-db", "run", script],
        {
          ...environment,
          ATHYPER_PLATFORM_DATABASE_ADMIN_URL: adminUrls[plane],
          RLS_APP_ROLE: "athyperapp",
        },
      );
      assert.match(log, /PASS:/);
      pass(`${plane}: ${script}`, {
        logSha256: createHash("sha256").update(log).digest("hex"),
        summary: log.split("\n").filter((line) => /catalog:|PASS:/.test(line)),
      });
    }
    // Deliberately damage the real catalog, prove the production checker rejects
    // the damage, then restore before behavioral tests. Only our tmpfs is touched.
    const connection = await client(adminUrls[plane]!);
    try {
      for (const [name, damage, restore, script, expected] of [
        [
          "RLS disabled",
          "ALTER TABLE master.principal DISABLE ROW LEVEL SECURITY",
          "ALTER TABLE master.principal ENABLE ROW LEVEL SECURITY",
          "db:verify:rls",
          "fail the RLS catalog contract",
        ],
        [
          "PUBLIC function execution",
          "CREATE FUNCTION public.ci_insecure() RETURNS int LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$SELECT 1$$",
          "DROP FUNCTION public.ci_insecure()",
          "db:verify:security-definer",
          "PUBLIC has EXECUTE",
        ],
      ]) {
        await connection.query(damage!);
        try {
          assert.throws(
            () =>
              command(
                "pnpm",
                [
                  "--fail-if-no-match",
                  "--filter",
                  "@athyper/server-db",
                  "run",
                  script!,
                ],
                {
                  ...environment,
                  ATHYPER_PLATFORM_DATABASE_ADMIN_URL: adminUrls[plane],
                },
              ),
            (error) =>
              error instanceof Error && error.message.includes(expected!),
            `${name} must fail for the intended reason`,
          );
          pass(`${plane}: negative ${name}`);
        } finally {
          await connection.query(restore!);
        }
      }
    } finally {
      await connection.end();
    }
  }
  // Existing SQL fixtures establish real publication and projection behavior;
  // fixture success is required and no absent-fixture skip is accepted.
  for (const plane of planes) {
    const connection = await client(adminUrls[plane]!);
    try {
      await connection.query(
        readFileSync(
          resolve(
            root,
            "server/db/scripts/tests/integration/ci-permission-contract.sql",
          ),
          "utf8",
        ),
      );
      pass(
        `${plane}: permission FK, runtime writer denial and tenant role isolation`,
      );
    } finally {
      await connection.end();
    }
  }
  for (const [plane, file] of [
    ["studio", "fixtures/publication-authority.sql"],
    ["studio", "ci-entity-release-contract.sql"],
    ["neon", "fixtures/runtime-entity-projection.sql"],
    ["neon", "business-partner-profile-projection.sql"],
  ]) {
    const connection = await client(adminUrls[plane!]!);
    try {
      if (file === "business-partner-profile-projection.sql") {
        await connection.query(
          "INSERT INTO master.principal(id,tenant_id,code,name,principal_type,status,created_by) VALUES('34ce3386-ed20-5933-91d1-699d38b197fe',$1,'ci.profile.recipient','CI Profile Recipient','service_account','active',$2)",
          [fixture.tenant, fixture.principal],
        );
      }
      const source = readFileSync(
        resolve(root, "server/db/scripts/tests/integration", file!),
        "utf8",
      ).replace(/^\\(?:set|echo)[^\n]*$/gm, "");
      await connection.query(source);
      pass(`${plane}: ${file}`);
    } finally {
      await connection.end();
    }
  }
  // Current stamper, real transaction-pool proxy, forced backend reuse.
  docker(
    "run",
    "-d",
    "--name",
    `${id}-pool`,
    "--network",
    id,
    "-p",
    "127.0.0.1::5432",
    "-e",
    `DB_HOST=${id}`,
    "-e",
    "DB_USER=athyperapp",
    "-e",
    `DB_PASSWORD=${password}`,
    "-e",
    "DB_NAME=athyper_neon",
    "-e",
    "AUTH_TYPE=plain",
    "-e",
    "POOL_MODE=transaction",
    "-e",
    "DEFAULT_POOL_SIZE=1",
    "edoburu/pgbouncer:v1.25.1-p0",
  );
  const pooledUrl = `postgresql://athyperapp:${password}@127.0.0.1:${port(`${id}-pool`)}/athyper_neon`;
  await waitFor(pooledUrl);
  const database = new Kysely({
    dialect: new PostgresDialect({
      pool: new Pool({ connectionString: pooledUrl, max: 2 }),
    }),
  });
  try {
    assert.match(
      docker("exec", `${id}-pool`, "cat", "/etc/pgbouncer/pgbouncer.ini"),
      /pool_mode\s*=\s*transaction/,
    );
    const runner = new KyselyTransactionRunner(database);
    const actor = { tenantId: fixture.tenant, principalId: fixture.principal };
    await runner.run(async (tx) => {
      const row = (
        await sql<{
          tenant: string;
          principal: string;
        }>`SELECT current_setting('app.current_tenant_id') tenant, current_setting('app.current_principal_id') principal`.execute(
          tx,
        )
      ).rows[0];
      assert.deepEqual(row, {
        tenant: actor.tenantId,
        principal: actor.principalId,
      });
      assert.equal(
        (
          await sql`SELECT 1 FROM master.tenant WHERE id=${fixture.otherTenant}::uuid`.execute(
            tx,
          )
        ).rows.length,
        0,
      );
    }, actor);
    await assert.rejects(
      runner.run(async () => {
        throw new Error("intentional rollback");
      }, actor),
      /intentional rollback/,
    );
    await runner.run(async (tx) => {
      const row = (
        await sql<{
          tenant: string | null;
          principal: string | null;
        }>`SELECT nullif(current_setting('app.current_tenant_id',true),'') tenant, nullif(current_setting('app.current_principal_id',true),'') principal`.execute(
          tx,
        )
      ).rows[0];
      assert.deepEqual(row, { tenant: null, principal: null });
      assert.equal(
        (await sql`SELECT 1 FROM master.tenant`.execute(tx)).rows.length,
        0,
      );
    });
    await runner.run(
      async (tx) => {
        assert.equal(
          (
            await sql`SELECT 1 FROM master.tenant WHERE id=${fixture.otherTenant}::uuid`.execute(
              tx,
            )
          ).rows.length,
          1,
        );
      },
      { tenantId: fixture.otherTenant, principalId: fixture.otherPrincipal },
    );
    const broken = new KyselyTransactionRunner(database, async () => {});
    await assert.rejects(
      broken.run(async (tx) => {
        const row = (
          await sql<{
            tenant: string | null;
          }>`SELECT nullif(current_setting('app.current_tenant_id',true),'') tenant`.execute(
            tx,
          )
        ).rows[0];
        assert.equal(row?.tenant, fixture.tenant, "missing stamp detected");
      }, actor),
      (error) =>
        error instanceof assert.AssertionError &&
        error.message.includes("missing stamp detected"),
    );
    pass(
      "PgBouncer transaction stamping: commit, rollback, no-context denial and tenant switch",
    );
  } finally {
    await database.destroy();
  }
  // Every discovered suite gets an explicit fixture disposition. Unknown suites
  // fail closed until their owner declares the required database/role contract.
  const fixtureContracts: Record<string, [string, string?]> = {
    "authorization-writers": ["full", "ATHYPER_AUTH_WRITER_DATABASE_URL"],
    "control-repositories": ["full", "ATHYPER_CONTROL_REPO_DATABASE_URL"],
    "authz-epoch": ["canonical"],
    "governance-plane-isolation": ["canonical"],
    "postgres-service-harness": ["canonical"],
    experience: ["canonical"],
    "localization-all-plane": ["catalog-inspection"],
    "snapshot-concurrency": ["canonical"],
    "kysely-command-repository": ["canonical"],
    "parameter-validation": ["empty", "ATHYPER_PARAMETER_TEST_DATABASE_URL"],
    "parameter-versions": ["empty", "ATHYPER_PARAMETER_TEST_DATABASE_URL"],
    "kysely-entitlement-repository": [
      "empty",
      "ATHYPER_ENTITLEMENT_TEST_DATABASE_URL",
    ],
    "runtime-command": ["empty", "ATHYPER_RUNTIME_COMMAND_TEST_DATABASE_URL"],
    "cycle-review": ["empty", "ATHYPER_CYCLE_REVIEW_DATABASE_URL"],
    "authorization-governance": ["empty", "ATHYPER_CYCLE_REVIEW_DATABASE_URL"],
    "master-data-repository": [
      "empty",
      "ATHYPER_MASTER_DATA_TEST_DATABASE_URL",
    ],
    localization: ["empty", "ATHYPER_LOCALIZATION_TEST_DATABASE_URL"],
    "standard-views": ["container"],
  };
  const flags = {
    ATHYPER_PARAMETER_DB_TESTS: "true",
    ATHYPER_ENTITLEMENT_DB_TESTS: "true",
    ATHYPER_RUNTIME_COMMAND_DB_TESTS: "true",
    ATHYPER_CYCLE_REVIEW_DB_TESTS: "true",
    ATHYPER_MASTER_DATA_DB_TESTS: "true",
    ATHYPER_AUTH_WRITER_DB_TESTS: "true",
    ATHYPER_CONTROL_REPO_DB_TESTS: "true",
    ENTITY_VIEW_POSTGRES_TEST: "1",
    ATHYPER_ENTITY_VIEW_TEST_CONTAINER: id,
  };
  const setup = await client(adminUrls.neon!);
  await setup.query(
    `CREATE ROLE ci_authorization_writer LOGIN PASSWORD '${password}' NOSUPERUSER NOBYPASSRLS; GRANT athyperapp,athyper_authorization_writer TO ci_authorization_writer`,
  );
  await setup.end();
  for (const plane of planes)
    environment[
      `ATHYPER_${plane.toUpperCase()}_AUTHORIZATION_TEST_DATABASE_URL`
    ] =
      `postgresql://ci_authorization_writer:${password}@${base}/athyper_${plane}`;
  const files = readdirSync(resolve(root, "server/packages"), {
    recursive: true,
  })
    .filter(
      (name): name is string =>
        typeof name === "string" &&
        name.endsWith(".postgres.test.ts") &&
        !name.includes("node_modules/"),
    )
    .sort();
  assert.ok(files.length > 0);
  mkdirSync(dirname(output), { recursive: true });
  const combined = {
    success: true,
    numTotalTests: 0,
    numPassedTests: 0,
    numFailedTests: 0,
    numPendingTests: 0,
    numTodoTests: 0,
    testResults: [] as unknown[],
  };
  const failures: string[] = [];
  for (const [index, file] of files.entries()) {
    for (const suitePlane of file.endsWith(
      "control-repositories.postgres.test.ts",
    ) || file.endsWith("authorization-writers.postgres.test.ts")
      ? planes
      : (["neon"] as const)) {
      const name = file.split("/").at(-1)!.replace(".postgres.test.ts", "");
      const contract = fixtureContracts[name];
      assert.ok(contract, `Missing fixture contract for ${file}`);
      const suiteEnvironment: NodeJS.ProcessEnv = {
        ...environment,
        ...flags,
        ATHYPER_CONTROL_REPO_PLANE: suitePlane,
        ATHYPER_AUTH_WRITER_PLANE: suitePlane,
      };
      if (contract[0] === "empty") {
        const provisioner = await client(adminUrls.neon!);
        const databaseName = `ci_suite_${index}`;
        await provisioner.query(
          `CREATE DATABASE ${databaseName} TEMPLATE template0`,
        );
        await provisioner.end();
        suiteEnvironment[contract[1]!] =
          `postgresql://postgres:${password}@${base}/${databaseName}`;
      } else if (contract[0] === "full")
        suiteEnvironment[contract[1]!] = adminUrls[suitePlane];
      else if (contract[0] === "catalog-inspection")
        for (const plane of planes)
          suiteEnvironment[`ATHYPER_${plane.toUpperCase()}_TEST_DATABASE_URL`] =
            adminUrls[plane];
      const suiteOutput = resolve(
        dirname(output),
        `postgres-${name}-${suitePlane}.json`,
      );
      console.log(`Running ${name} (${contract[0]})`);
      try {
        command(
          "pnpm",
          [
            "--fail-if-no-match",
            "--filter",
            "@athyper/server-test-utils",
            "run",
            "test:postgres",
            `server/packages/${file}`,
          ],
          { ...suiteEnvironment, ATHYPER_POSTGRES_JSON_REPORT: suiteOutput },
        );
      } catch (error) {
        failures.push(`${name}: ${String(error)}`);
      }
      const result = JSON.parse(readFileSync(suiteOutput, "utf8"));
      for (const field of [
        "numTotalTests",
        "numPassedTests",
        "numFailedTests",
        "numPendingTests",
        "numTodoTests",
      ] as const)
        combined[field] += result[field] ?? 0;
      combined.success &&= result.success;
      combined.testResults.push(...result.testResults);
    }
  }
  writeFileSync(
    resolve(dirname(output), "postgres-tests.json"),
    JSON.stringify(combined, null, 2),
  );
  if (failures.length) throw new Error(failures.join("\n"));
  verifyTestEvidence(combined);
  pass("required service PostgreSQL suites", combined);
  assert.deepEqual(
    sourceBinding(root),
    report.source,
    "qualification source changed during execution",
  );
  report.qualified = true;
} catch (error) {
  report.error =
    error instanceof Error
      ? `${error.stack}\n${String(error.cause ?? "")}`.replaceAll(
          password,
          "[test-password]",
        )
      : String(error);
  console.error(report.error);
  process.exitCode = 1;
} finally {
  for (const container of [`${id}-pool`, id])
    spawnSync("docker", ["rm", "-f", container], { stdio: "ignore" });
  spawnSync("docker", ["network", "rm", id], { stdio: "ignore" });
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
}
