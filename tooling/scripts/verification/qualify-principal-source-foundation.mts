/** Canonical installation or forward upgrade in a private disposable PostgreSQL cluster. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  mkdtempSync,
  cpSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { applyFoundation } from "../../../server/db/scripts/provisioning/foundation-runner.js";
import { artifactDirectory } from "../artifact-paths.mjs";

const upgrade = process.argv[2] === "--upgrade";
assert.ok(
  process.argv.length === 2 || (upgrade && process.argv.length === 3),
  "Only --upgrade is accepted; no deployed target is accepted",
);
const root = resolve(import.meta.dirname, "../../..");
const container = `athyper-principal-foundation-${randomUUID()}`;
const output = artifactDirectory("principal-source-foundation");
const scratch = mkdtempSync(join(tmpdir(), "athyper-principal-foundation-"));
const report: {
  schema: string;
  passed: boolean;
  startedAt: string;
  completedAt?: string;
  planes: unknown[];
  imageId?: string;
  failure?: string;
  mode: string;
  toolingSource?: { path: string; sha256: string }[];
} = {
  schema: "principal-source-foundation-qualification/1",
  mode: upgrade ? "canonical-pre-source-forward-upgrade" : "fresh-canonical",
  passed: false,
  startedAt: new Date().toISOString(),
  planes: [],
};
let created = false;
const docker = (...args: string[]) =>
  execFileSync("docker", args, {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
const sql = (database: string, input: string) =>
  docker(
    "exec",
    container,
    "psql",
    "-X",
    "-h",
    "127.0.0.1",
    "-U",
    "postgres",
    "-d",
    database,
    "-v",
    "ON_ERROR_STOP=1",
    "-Atq",
    "-c",
    input,
  ).trim();
const rowSnapshot = (plane: string) =>
  sql(
    `athyper_${plane}`,
    `SELECT json_build_object(
  'principals',(SELECT md5(coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.id)::text,'[]')) FROM master.principal p),
  'profiles',(SELECT md5(coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.id)::text,'[]')) FROM master.principal_profile p),
  'bindings',(SELECT md5(coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.id)::text,'[]')) FROM master.principal_identity_binding p))::text`,
  );
mkdirSync(resolve(output, ".."), { recursive: true });
mkdirSync(output, { mode: 0o700 });
try {
  cpSync(join(root, "server/db/ddl"), join(output, "canonical-ddl"), {
    recursive: true,
  });
  const toolingPaths = [
    "tooling/scripts/verification/qualify-principal-source-foundation.mts",
    "server/db/scripts/provisioning/foundation-runner.ts",
    "server/db/runtime/run-forward-migrations.sh",
    "server/db/migrations/inventory.json",
    "server/db/migrations/20261001_principal_person_source_authority.sql",
    "server/db/migrations/20261002_principal_person_link_target.sql",
    "server/db/migrations/20261002_projected_profile_source_authority.sql",
  ];
  report.toolingSource = toolingPaths.map((path) => {
    const bytes = readFileSync(join(root, path));
    const captured = join(output, "tooling-source", path);
    mkdirSync(resolve(captured, ".."), { recursive: true });
    writeFileSync(captured, bytes);
    return { path, sha256: createHash("sha256").update(bytes).digest("hex") };
  });
  mkdirSync(join(scratch, "migrations/manifests"), { recursive: true });
  writeFileSync(join(scratch, "migrations/password"), "disposable-test-only\n");
  writeFileSync(
    join(scratch, "migrations/manifests/runner-transactions.sha256"),
    "",
  );
  const names = [
    "20261001_principal_person_source_authority.sql",
    "20261002_principal_person_link_target.sql",
    "20261002_projected_profile_source_authority.sql",
  ];
  for (const name of names)
    cpSync(
      join(root, "server/db/migrations", name),
      join(scratch, "migrations", name),
    );
  if (upgrade) {
    cpSync(join(root, "server/db/ddl"), join(scratch, "db/ddl"), {
      recursive: true,
    });
    for (const plane of ["studio", "neon", "mesh"]) {
      const manifestPath = join(
        scratch,
        `db/ddl/planes/${plane}/_manifest.txt`,
      );
      const baseline = readFileSync(manifestPath, "utf8")
        .split(/\r?\n/)
        .filter(
          (line) =>
            ![
              "planes/neon/master/36_principal_person_link.sql",
              "planes/neon/master/37_principal_person_link_target.sql",
              "common/master/23_projected_profile_source.sql",
            ].includes(line.trim()),
        )
        .join("\n");
      writeFileSync(manifestPath, baseline);
      writeFileSync(join(output, `${plane}-baseline-manifest.txt`), baseline);
    }
  }
  for (const plane of ["studio", "neon", "mesh"])
    writeFileSync(
      join(scratch, `migrations/manifests/${plane}.txt`),
      (plane === "neon" ? names.slice(0, 2) : names.slice(2)).join("\n") + "\n",
    );
  docker(
    "run",
    "-d",
    "--name",
    container,
    "--network",
    "none",
    "--tmpfs",
    "/var/lib/postgresql/data",
    "--label",
    "athyper.purpose=principal-source-foundation",
    "-e",
    "POSTGRES_HOST_AUTH_METHOD=trust",
    "-v",
    `${join(scratch, "migrations")}:/app/migrations:ro`,
    "-v",
    `${join(root, "server/db/runtime/run-forward-migrations.sh")}:/runner.sh:ro`,
    "postgres:16.15-bookworm",
  );
  created = true;
  report.imageId = docker(
    "inspect",
    "--format",
    "{{.Image}}",
    container,
  ).trim();
  for (let attempt = 0; ; attempt++) {
    try {
      sql("postgres", "SELECT 1");
      break;
    } catch (error) {
      if (attempt >= 60) throw error;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  for (const plane of ["studio", "neon", "mesh"] as const) {
    console.log(`Qualifying ${report.mode} ${plane} foundation`);
    const applied = upgrade
      ? (JSON.parse(
          execFileSync(
            "pnpm",
            [
              "--filter",
              "@athyper/server-db",
              "exec",
              "tsx",
              "scripts/provisioning/foundation-runner.ts",
              `--plane=${plane}`,
              `--container=${container}`,
              `--ddl-root=${join(scratch, "db/ddl")}`,
            ],
            {
              cwd: root,
              encoding: "utf8",
              stdio: ["pipe", "pipe", "pipe"],
              maxBuffer: 16_000_000,
            },
          ),
        ).results[0] as Awaited<ReturnType<typeof applyFoundation>>)
      : await applyFoundation({ plane, dockerContainer: container });
    const source = applied.entries.map((entry) => {
      const bytes = readFileSync(
        join(
          root,
          "server/db",
          entry.path.startsWith("ddl/") ? entry.path : `ddl/${entry.path}`,
        ),
      );
      const path = join(output, "source", plane, entry.path);
      mkdirSync(resolve(path, ".."), { recursive: true });
      writeFileSync(path, bytes);
      return {
        path: entry.path,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      };
    });
    const before = rowSnapshot(plane);
    const probe = `SELECT json_build_object(
      'source',to_regprocedure('master.${plane === "neon" ? "entity_profile_source_v1" : "entity_projected_profile_source_v1"}(uuid,uuid)') IS NOT NULL,
      'target',to_regprocedure('master.entity_person_link_target_v1(uuid,uuid)') IS NOT NULL)::text`;
    if (upgrade) {
      assert.deepEqual(JSON.parse(sql(`athyper_${plane}`, probe)), {
        source: false,
        target: false,
      });
      if (plane === "mesh") {
        docker(
          "exec",
          "-e",
          "PGHOST=127.0.0.1",
          "-e",
          "ATHYPER_POSTGRES_PASSWORD_FILE=/app/migrations/password",
          container,
          "sh",
          "/runner.sh",
        );
        const ledgers = ["studio", "neon", "mesh"].map((targetPlane) =>
          sql(
            `athyper_${targetPlane}`,
            "SELECT json_agg(m ORDER BY migration_name) FROM public.athyper_schema_migration_v1 m",
          ),
        );
        docker(
          "exec",
          "-e",
          "PGHOST=127.0.0.1",
          "-e",
          "ATHYPER_POSTGRES_PASSWORD_FILE=/app/migrations/password",
          container,
          "sh",
          "/runner.sh",
        );
        for (const [index, targetPlane] of ["studio", "neon", "mesh"].entries())
          assert.equal(
            sql(
              `athyper_${targetPlane}`,
              "SELECT json_agg(m ORDER BY migration_name) FROM public.athyper_schema_migration_v1 m",
            ),
            ledgers[index],
          );
      }
    }
    const installed =
      upgrade && plane !== "mesh"
        ? undefined
        : JSON.parse(sql(`athyper_${plane}`, probe));
    if (installed)
      assert.deepEqual(installed, { source: true, target: plane === "neon" });
    report.planes.push({ ...applied, source, installed, before });
  }
  if (upgrade)
    for (const plane of ["studio", "neon", "mesh"]) {
      const row = report.planes.find(
        (item) => (item as { plane: string }).plane === plane,
      ) as { installed?: unknown; before: string; migrationReceipts?: unknown };
      row.installed = JSON.parse(
        sql(
          `athyper_${plane}`,
          `SELECT json_build_object('source',to_regprocedure('master.${plane === "neon" ? "entity_profile_source_v1" : "entity_projected_profile_source_v1"}(uuid,uuid)') IS NOT NULL,'target',to_regprocedure('master.entity_person_link_target_v1(uuid,uuid)') IS NOT NULL)::text`,
        ),
      );
      assert.deepEqual(row.installed, {
        source: true,
        target: plane === "neon",
      });
      assert.equal(rowSnapshot(plane), row.before);
      row.migrationReceipts = JSON.parse(
        sql(
          `athyper_${plane}`,
          "SELECT json_agg(m ORDER BY migration_name) FROM public.athyper_schema_migration_v1 m",
        ),
      );
    }
  report.passed = true;
} catch (error) {
  report.failure =
    error instanceof Error
      ? `${error.message}${error.cause instanceof Error ? `: ${error.cause.message}` : ""}`
      : "qualification failed";
  process.exitCode = 1;
} finally {
  if (created) docker("rm", "-f", container);
  rmSync(scratch, { recursive: true, force: true });
  report.completedAt = new Date().toISOString();
  writeFileSync(
    join(output, "qualification.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({ passed: report.passed, output, failure: report.failure }),
  );
}
