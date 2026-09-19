#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { packageDependencyCounts } from "./frontend-spine-governance.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const failures = [];
const read = (path) =>
  readFileSync(join(root, path), "utf8").replace(/^\uFEFF/, "");
const json = (path) => JSON.parse(read(path));
const baseline = json(
  "governance/config/governance/business-partner-phase0.v1.json",
);

if (baseline.$schema !== "athyper.business-partner-phase0/1")
  failures.push("Phase 0 baseline schema is invalid");
if (baseline.status !== "accepted")
  failures.push("Phase 0 architecture is not accepted");
if (baseline.baselineHealth?.phase0PoliciesGreen !== true)
  failures.push("Phase 0 policy health is not green");
if (baseline.baselineHealth?.aggregatePolicyGreen !== false)
  failures.push(
    "Repository aggregate policy status is not recorded accurately",
  );
if (baseline.baselineHealth?.neonAuthorizationInventoryCurrent !== true)
  failures.push("NEON authorization inventory is not current");

const decisionIds = new Set(baseline.decisions.map(({ id }) => id));
for (const id of [
  "BP-D010",
  "BP-D011",
  "BP-D012",
  "BP-D013",
  "BP-D014",
  "BP-D015",
])
  if (!decisionIds.has(id))
    failures.push(`Accepted decision is missing: ${id}`);
for (const decision of baseline.decisions)
  if (decision.status !== "accepted" || !decision.owner?.trim())
    failures.push(`Decision is not accepted and owned: ${decision.id}`);

const contractSource = read(
  "packages/contracts/platform/entity-runtime/src/governed-workflow.ts",
);
for (const contract of baseline.contracts) {
  for (const marker of [contract.schema, contract.type, contract.parser])
    if (!contractSource.includes(marker))
      failures.push(`Published contract marker is missing: ${marker}`);
}

const spine = json("governance/config/governance/frontend-spine-packages.json");
for (const expected of baseline.workflowPackages) {
  const entry = spine.packages.find(({ path }) => path === expected.path);
  if (!entry) {
    failures.push(
      `Workflow package is absent from the spine budget: ${expected.path}`,
    );
    continue;
  }
  if (entry.name !== expected.name || entry.owner !== expected.owner)
    failures.push(`Workflow package ownership drifted: ${expected.path}`);
  const manifest = json(`${expected.path}/package.json`);
  const counts = packageDependencyCounts(manifest);
  if (
    counts.runtime > expected.runtimeDependencyBudget ||
    counts.workspace > expected.workspaceDependencyBudget
  )
    failures.push(
      `Workflow package dependency budget exceeded: ${expected.path} (${counts.runtime}/${counts.workspace})`,
    );
}

const routeFiles = {
  "/mdg/business-partner":
    "apps/neon/app/(shell)/mdg/business-partner/page.tsx",
  "/mdg/business-partner/partners":
    "apps/neon/app/(shell)/mdg/business-partner/partners/page.tsx",
  "/mdg/business-partner/new":
    "apps/neon/app/(shell)/mdg/business-partner/new/page.tsx",
  "/mdg/business-partner/customer/new":
    "apps/neon/app/(shell)/mdg/business-partner/customer/new/page.tsx",
  "/mdg/business-partner/person/new":
    "apps/neon/app/(shell)/mdg/business-partner/person/new/page.tsx",
  "/mdg/business-partner/requests":
    "apps/neon/app/(shell)/mdg/business-partner/requests/page.tsx",
  "/mdg/business-partner/requests/:requestId":
    "apps/neon/app/(shell)/mdg/business-partner/requests/[requestId]/page.tsx",
  "/mdg/business-partner/requests/:requestId/edit":
    "apps/neon/app/(shell)/mdg/business-partner/requests/[requestId]/edit/page.tsx",
  "/mdg/business-partner/:recordId":
    "apps/neon/app/(shell)/mdg/business-partner/[recordId]/page.tsx",
  "/mdg/business-partner/:recordId/customer":
    "apps/neon/app/(shell)/mdg/business-partner/[recordId]/customer/page.tsx",
  "/mdg/business-partner/:recordId/roles/new":
    "apps/neon/app/(shell)/mdg/business-partner/[recordId]/roles/new/page.tsx",
  "/mdg/business-partner/:recordId/scope/new":
    "apps/neon/app/(shell)/mdg/business-partner/[recordId]/scope/new/page.tsx",
  "/mdg/business-partner/business-partners":
    "apps/neon/app/(shell)/[workspaceSlug]/[moduleSlug]/[[...segments]]/page.tsx",
};
if (new Set(baseline.frontendRoutes).size !== baseline.frontendRoutes.length)
  failures.push("Frontend route inventory contains duplicates");
for (const route of baseline.frontendRoutes) {
  const file = routeFiles[route];
  if (!file || !existsSync(join(root, file)))
    failures.push(`Frontend route evidence is missing: ${route}`);
}

const catalog = read("governance/catalog/platform-catalog.v1.json");
const catalogAdapters = read("apps/neon/lib/catalog-routes.ts");
for (const entry of baseline.catalogEntries) {
  const source = entry.kind === "entity" ? catalogAdapters : catalog;
  for (const marker of [entry.code, entry.routeSlug])
    if (!source.includes(`\"${marker}\"`) && !source.includes(`${marker}:`))
      failures.push(`Catalog ${entry.kind} marker is missing: ${marker}`);
}

const relay = read("packages/platform/gateway/bff-relay/src/index.ts");
const operationsBySource = new Map();
for (const operation of baseline.clientOperations) {
  if (!existsSync(join(root, operation.source)))
    failures.push(`Client operation source is missing: ${operation.source}`);
  if (
    !operation.relayStatus?.includes("allowlisted") &&
    !operation.relayStatus?.includes("resolved-phase0")
  )
    failures.push(
      `Client operation is not allowlisted: ${operation.declaration}`,
    );
  operationsBySource.set(
    operation.source,
    (operationsBySource.get(operation.source) ?? 0) + 1,
  );
}
for (const [source, expectedCount] of operationsBySource) {
  const actualCount = [...read(source).matchAll(/createOperation\s*</g)].length;
  if (actualCount !== expectedCount)
    failures.push(
      `Client operation inventory drifted: ${source} has ${actualCount}; expected ${expectedCount}`,
    );
}
for (const correction of baseline.relayCorrections) {
  if (correction.status !== "resolved")
    failures.push(`Relay correction is unresolved: ${correction.id}`);
  for (const marker of [
    correction.method,
    correction.path,
    correction.operation,
  ])
    if (!relay.includes(marker))
      failures.push(
        `Relay correction evidence is missing: ${correction.id} ${marker}`,
      );
}

for (const path of [
  "packages/planes/neon/business-partner/src",
  "packages/planes/mesh/business-partner/src",
  "packages/planes/studio/business-partner/src",
]) {
  const output = readSources(path);
  if (/\bfetch\s*\(/.test(output))
    failures.push(
      `Business Partner package contains an ad hoc fetch path: ${path}`,
    );
}
const neonClient = read("packages/planes/neon/business-partner/src/client.ts");
if (!neonClient.includes("createOperation"))
  failures.push("NEON Business Partner client has no typed operations");

for (const action of baseline.threatModelActions)
  if (action.status !== "owned" || !action.owner?.trim())
    failures.push(`Threat-model action is not owned: ${action.id}`);
if (baseline.releaseStatus.productionQualified !== false)
  failures.push("Phase 0 incorrectly claims production qualification");

const businessPartnerArchitecture =
  "docs/architecture/business-partner/README.md";
if (!existsSync(join(root, businessPartnerArchitecture)))
  failures.push(
    `Business Partner architecture is missing: ${businessPartnerArchitecture}`,
  );

const businessPartnerDocs = [read(businessPartnerArchitecture)];
if (/production[ -]certified/i.test(businessPartnerDocs.join("\n")))
  failures.push(
    "Business Partner documentation contains an ambiguous release claim",
  );

if (failures.length) {
  console.error(
    `Business Partner Phase 0 policy failed:\n- ${failures.join("\n- ")}`,
  );
  process.exit(1);
}
console.log(
  `Business Partner Phase 0 verified: ${baseline.decisions.length} accepted decisions, ${baseline.contracts.length} contracts, ${baseline.frontendRoutes.length} frontend routes, ${baseline.clientOperations.length} client operations, ${baseline.catalogEntries.length} catalog entries, ${baseline.relayCorrections.length} relay corrections, and ${baseline.threatModelActions.length} owned threat actions.`,
);

function readSources(path) {
  const walk = (directory) => {
    let result = "";
    for (const entry of readdirSync(join(root, directory), {
      withFileTypes: true,
    })) {
      if (["node_modules", ".turbo", "dist"].includes(entry.name)) continue;
      const child = join(directory, entry.name);
      if (entry.isDirectory()) result += walk(child);
      else if (/\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name))
        result += read(child);
    }
    return result;
  };
  return walk(path);
}
