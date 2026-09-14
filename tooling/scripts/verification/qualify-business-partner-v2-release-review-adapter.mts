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
  const seal = JSON.parse(
    readFileSync(
      "governance/policy/reports/business-partner-release-20-review-seal.dev.json",
      "utf8",
    ),
  );
  const packet = JSON.parse(
    readFileSync(
      "governance/policy/reviews/business-partner-release-20-workflow.dev.json",
      "utf8",
    ),
  );
  const ports = createDeploymentEntityReleaseReview({
    root: seal.directory.slice(0, seal.directory.lastIndexOf("/")),
    manifestPins: { [seal.releaseId]: seal.manifestSha256 },
    evidenceRoot: process.cwd(),
    neon,
    studio,
  });
  const checks = [];
  for (const r of packet.reviewers)
    checks.push({
      check: "current_reviewer",
      account: r.id,
      passed: await ports.currentReviewer({
        reviewerId: r.id,
        principalId: r.principalId,
        tenantId: r.homeTenantId,
        domains: ["business", "security"],
        coordinate: packet.releaseReview.coordinate,
      }),
    });
  checks.push({
    check: "current_source",
    passed: await ports.sourceCurrent(
      packet.releaseReview.coordinate,
      packet.source.base,
    ),
  });
  const changedHead = {
    ...packet.source.base,
    headVersion: packet.source.base.headVersion + 1,
  };
  checks.push({
    check: "changed_predecessor_rejected",
    passed: !(await ports.sourceCurrent(
      packet.releaseReview.coordinate,
      changedHead,
    )),
  });
  const evidence = packet.rows[0].proposal.implementationEvidence[0];
  checks.push({
    check: "changed_evidence_rejected",
    passed: !(await ports.evidenceCurrent({
      ...evidence,
      sha256: "0".repeat(64),
    })),
  });
  checks.push({
    check: "path_escape_rejected",
    passed: !(await ports.evidenceCurrent({
      path: "../outside",
      sha256: "0".repeat(64),
    })),
  });
  const temporary = mkdtempSync(tmpdir() + "/bp-review-epoch-");
  try {
    const { createHash } = await import("node:crypto");
    const digest = (bytes: string) =>
      createHash("sha256").update(bytes).digest("hex");
    const changed = JSON.parse(
      readFileSync(seal.directory + "/state.json", "utf8"),
    );
    changed.receipts[0].actor.authEpoch++;
    const modifiedState = JSON.stringify(changed),
      originalManifest = JSON.parse(
        readFileSync(seal.directory + "/manifest.json", "utf8"),
      );
    const manifest = JSON.stringify({
      ...originalManifest,
      stateSha256: digest(modifiedState),
    });
    const directory = temporary + "/" + seal.releaseId;
    mkdirSync(directory, { mode: 0o700 });
    for (const name of ["packet.json", "nomination.json"])
      writeFileSync(
        directory + "/" + name,
        readFileSync(seal.directory + "/" + name),
        { mode: 0o600 },
      );
    writeFileSync(directory + "/state.json", modifiedState, { mode: 0o600 });
    writeFileSync(directory + "/manifest.json", manifest, { mode: 0o600 });
    const modified = createDeploymentEntityReleaseReview({
      root: temporary,
      manifestPins: { [seal.releaseId]: digest(manifest) },
      evidenceRoot: process.cwd(),
      neon,
      studio,
    });
    const actor = changed.receipts[0].actor;
    checks.push({
      check: "changed_reviewer_epoch_rejected",
      passed: !(await modified.currentReviewer({
        reviewerId: actor.reviewerId,
        principalId: actor.principalId,
        tenantId: actor.tenantId,
        domains: ["business", "security"],
        coordinate: packet.releaseReview.coordinate,
      })),
    });
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
  const report: any = {
    schemaVersion: 1,
    kind: "bp_release_review_adapter_qualification",
    capturedAt: new Date().toISOString(),
    releaseId: seal.releaseId,
    checks,
    passed: false,
    readOnly: true,
    signed: false,
    grantsChanged: false,
    activationAuthorized: false,
  };
  try {
    report.receipt = await createAuthenticatedEntityReleaseReview(
      ports,
    ).qualify(packet.releaseReview.coordinate);
    report.passed = checks.every((c) => c.passed);
  } catch (e) {
    report.error = e instanceof Error ? e.message : "Qualification failed";
  }
  writeFileSync(
    "governance/policy/reports/business-partner-release-20-adapter-qualification.dev.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(report);
  if (!report.passed) process.exitCode = 1;
} finally {
  await neon.destroy();
  await studio.destroy();
}
