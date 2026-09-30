#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve, join } from "node:path";
import { sourceIdentity } from "./evidence.mjs";

const checkout = resolve(import.meta.dirname, "../../..");
const root = join(homedir(), ".athyper/qualification/bp", String(Date.now()));
mkdirSync(root, { recursive: true, mode: 0o700 });
const source = await sourceIdentity(checkout);
const groups = [
  {
    name: "publication",
    package: "@athyper/server-service-publication",
    tests: [
      "business-partner-company-case-contract.test.ts",
      "business-partner-case-contract.test.ts",
      "local-definition-preview.test.ts",
      "business-partner-definition.test.ts",
      "business-partner-definition-routes.test.ts",
      "entity-authorization-compiler.test.ts",
    ],
  },
  {
    name: "authorization",
    package: "@athyper/server-service-records",
    tests: [
      "entity-backend-authorizer.test.ts",
      "entity-backend-isolated-execution.test.ts",
      "collection-scope-sql.test.ts",
      "entity-scope-adapter.test.ts",
      "business-partner-export-privacy.test.ts",
    ],
  },
  {
    name: "commands-providers-import-atlas",
    package: "@athyper/server-service-master-data",
    tests: [
      "business-partner-case-service.test.ts",
      "business-partner-case-view.test.ts",
      "business-partner-provider-projection.test.ts",
      "business-partner-governed-import.test.ts",
      "business-partner-governed-import-routes.test.ts",
      "business-partner-company-relationships.test.ts",
      "business-partner-reveal-preflight.test.ts",
      "business-partner-reveal-revocation.test.ts",
      "business-partner-atlas-contacts.test.ts",
      "business-partner-atlas-addresses.test.ts",
      "business-partner-atlas-insights.test.ts",
    ],
  },
  {
    name: "runtime-bindings",
    package: "@athyper/server-platform-host",
    tests: [
      "business-partner-stored-scopes.test.ts",
      "business-partner-backend-intents.test.ts",
      "business-partner-action-runtime.test.ts",
      "business-partner-bound-import.test.ts",
      "business-partner-case-authority.test.ts",
      "business-partner-read-runtime.test.ts",
      "atlas-entity-records-vertical.test.ts",
      "business-partner-definition-authorizer.test.ts",
    ],
  },
  {
    name: "studio",
    package: "@athyper/product-studio-business-partner",
    tests: ["definition-client.test.ts"],
  },
  {
    name: "neon",
    package: "@athyper/product-neon-business-partner",
    tests: [
      "request-form-descriptor.test.ts",
      "client.test.ts",
      "workflow.test.ts",
    ],
  },
];
const results = [];
for (const group of groups) {
  const report = join(root, `${group.name}.json`);
  const result = spawnSync(
    "pnpm",
    [
      "--filter",
      group.package,
      "exec",
      "vitest",
      "run",
      ...group.tests,
      "--reporter=json",
      `--outputFile=${report}`,
    ],
    { cwd: checkout, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
  );
  writeFileSync(
    join(root, `${group.name}.log`),
    (result.stdout ?? "") + (result.stderr ?? ""),
    { mode: 0o600 },
  );
  let details;
  try {
    details = JSON.parse(readFileSync(report, "utf8"));
  } catch {}
  const passed =
    result.status === 0 &&
    details?.success === true &&
    details.numPassedTests > 0 &&
    details.numPendingTests === 0 &&
    details.numTodoTests === 0;
  results.push({
    name: group.name,
    passed,
    tests: details?.numTotalTests ?? 0,
    failed: details?.numFailedTests ?? 0,
    report,
  });
  console.log(
    `${group.name}: ${passed ? "passed" : "FAILED"} (${details?.numTotalTests ?? 0} tests)`,
  );
}
const sourceUnchanged =
  (await sourceIdentity(checkout)).treeSha256 === source.treeSha256;
const receipt = {
  schema: "athyper.bp-regression/1",
  sourceRevision: source.revision.trim(),
  sourceTreeSha256: source.treeSha256,
  sourceUnchanged,
  groups: results,
  passed: sourceUnchanged && results.every((group) => group.passed),
  scope: "source-service-route-and-ui-contract-tests",
  authenticatedBrowserJourney: false,
  humanApprovalPerformed: false,
  releaseQualified: false,
  createdAt: new Date().toISOString(),
};
writeFileSync(
  join(root, "receipt.json"),
  JSON.stringify(receipt, null, 2) + "\n",
  { mode: 0o600, flag: "wx" },
);
console.log(`BP regression receipt: ${join(root, "receipt.json")}`);
if (!receipt.passed) process.exitCode = 1;
