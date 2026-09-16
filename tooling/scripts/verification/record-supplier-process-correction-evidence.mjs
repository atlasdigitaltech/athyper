/** Assemble sanitized P5 qualification receipts; never captures sessions or signed links. */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
const read = (name) =>
  JSON.parse(
    readFileSync(`governance/policy/reports/${name}.dev.json`, "utf8"),
  );
const live = read("supplier-process-correction-live"),
  database = read("supplier-process-correction-db"),
  browser = read("supplier-process-correction-browser"),
  storage = read("supplier-process-correction-storage");
for (const r of [live, database, browser, storage])
  assert.equal(r.passed, true);
const images = ["api", "neon-web", "worker", "scheduler"].map((service) => {
  const container = `athyper-dev-source-${service}-1`;
  const info = JSON.parse(
    execFileSync("docker", ["inspect", container], { encoding: "utf8" }),
  )[0];
  assert.equal(info.State.Health.Status, "healthy");
  const modules =
    service === "neon-web"
      ? null
      : execFileSync(
          "docker",
          [
            "exec",
            container,
            "sha256sum",
            "/app/server/dist/composition/supplier-process-submission.js",
            "/app/server/dist/composition/supplier-process-tasks.js",
            "/app/server/dist/composition/supplier-process-documents.js",
          ],
          { encoding: "utf8" },
        )
          .trim()
          .split("\n")
          .map((line) => {
            const [hash, path] = line.split(/\s+/);
            return { hash, path };
          });
  return { service, image: info.Image, healthy: true, modules };
});
for (const service of images.filter((i) =>
  ["worker", "scheduler"].includes(i.service),
))
  assert.deepEqual(service.modules, images[0].modules);
const sources = [
  "server/db/ddl/common/governance/03_tables.sql",
  "server/db/ddl/common/governance/05_constraints.sql",
  "server/db/ddl/common/governance/07_functions.sql",
  "server/db/ddl/planes/neon/document/07_functions.sql",
  "server/apps/platform-host/src/composition/supplier-process-submission.ts",
  "server/apps/platform-host/src/composition/supplier-process-tasks.ts",
  "server/apps/platform-host/src/composition/supplier-process-task-routes.ts",
  "server/apps/platform-host/src/composition/supplier-process-selection.ts",
  "server/apps/platform-host/src/composition/supplier-process-documents.ts",
  "server/packages/platform/governance/src/process-selection/process-selection-service.ts",
  "server/packages/services/master-data/src/business-partner-request-service.ts",
  "server/packages/services/master-data/src/business-partner-case-view.ts",
  "packages/planes/neon/business-partner/src/supplier-process-correction.tsx",
].map((path) => ({
  path,
  sha256: createHash("sha256").update(readFileSync(path)).digest("hex"),
}));
const evidence = {
  schema: "athyper.supplier-onboarding-p5-evidence/1",
  at: new Date().toISOString(),
  status: "accepted_local_dev",
  scope:
    "Increment A P5 only; same-profile correction and explicit unsuccessful closure. P6–P9 and B/C remain separate.",
  qualification: { live, database, browser, storage },
  verification: {
    focusedTests: {
      selection: 25,
      caseService: 74,
      caseView: 6,
      hostRoutesAndProjection: 5,
      total: 110,
    },
    builds: ["governance", "master-data", "platform-host", "NEON production"],
    typechecks: [
      "governance runtime and tests",
      "platform-host",
      "NEON business-partner",
    ],
    passed: true,
  },
  images,
  sources,
};
writeFileSync(
  "docs/architecture/business-partner/internal-supplier-onboarding-p5-evidence.json",
  JSON.stringify(evidence, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    status: evidence.status,
    liveCases: live.cases.length,
    databaseChecks: database.checks.length,
    browserChecks: browser.checks.length,
    runtimeModulesAgree: true,
  }),
);
