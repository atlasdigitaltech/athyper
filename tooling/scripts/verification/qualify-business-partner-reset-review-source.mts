/** Real read-only database qualification of the sealed signing-review adapter. */
import {
  readFileSync,
  writeFileSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createDeploymentEntityReleaseReview } from "../../../server/apps/platform-host/src/composition/entity-release-review-deployment.js";
import { createAuthenticatedEntityReleaseReview } from "../../../server/packages/services/publication/src/authenticated-entity-release-review.js";
const require = createRequire(
  new URL("../../../server/apps/platform-host/package.json", import.meta.url),
);
const { Kysely, PostgresDialect } = require("kysely"),
  { Pool } = require("pg");
const host = (
  Object.values(
    JSON.parse(
      execFileSync("docker", ["inspect", "athyper-dev-db-1"], {
        encoding: "utf8",
      }),
    )[0].NetworkSettings.Networks,
  )[0] as any
).IPAddress;
const password = readFileSync(
  homedir() + "/.athyper/instances/dev/secrets/runtime-db-password",
  "utf8",
).trim();
const db = (database: string) =>
  new Kysely({
    dialect: new PostgresDialect({
      pool: new Pool({
        host,
        user: "athyper_runtime",
        password,
        database,
        ssl: false,
        connectionTimeoutMillis: 4000,
      }),
    }),
  });
const neon = db("athyper_neon"),
  studio = db("athyper_studio");
try {
  const exact = JSON.parse(
    readFileSync(
      "governance/policy/reports/business-partner-enter-correction-exact-release.dev.json",
      "utf8",
    ),
  );
  const c = exact.coordinate,
    base = { ...exact.source.imported_baseline, planeKey: "neon" };
  const ports = createDeploymentEntityReleaseReview({
    root: "/tmp/bp-review-read-only",
    manifestPins: {},
    evidenceRoot: process.cwd(),
    neon,
    studio,
  });
  const cases = [
    ["exact", c, base, true],
    ["wrong_descriptor", c, { ...base, descriptorHash: "0".repeat(64) }, false],
    [
      "wrong_key",
      c,
      { ...base, publicationKey: base.publicationKey + ".other" },
      false,
    ],
    ["wrong_contract", { ...c, contractHash: "0".repeat(64) }, base, false],
    [
      "wrong_release",
      { ...c, releaseId: "1b1c3f09-ea2b-4c38-82ac-14fff1d7e3e0" },
      base,
      false,
    ],
    ["wrong_version", c, { ...base, schemaVersion: 2 }, false],
    ["extra_coordinate", c, { ...base, headVersion: 1 }, false],
  ] as const;
  const checks = [];
  for (const [name, coordinate, b, expected] of cases) {
    const actual = await ports.sourceCurrent(coordinate, b);
    checks.push({ name, expected, actual, passed: actual === expected });
  }
  const report = {
    schemaVersion: 1,
    releaseId: c.releaseId,
    checks,
    passed: checks.every((c) => c.passed),
    readOnly: true,
    authenticatedReview: false,
    deployed: false,
  };
  writeFileSync(
    "governance/policy/reports/business-partner-reset-review-source-qualification.dev.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(report);
  if (!report.passed) process.exitCode = 1;
} finally {
  await neon.destroy();
  await studio.destroy();
}
