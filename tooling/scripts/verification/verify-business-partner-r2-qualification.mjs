import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const manifestPath = resolve(
  root,
  "governance/config/governance/business-partner-r2-qualification.v1.json",
);

export function verifyBusinessPartnerR2Qualification() {
  const failures = [];
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const requiredScenarios = [
    "BP-SUP-002",
    "BP-SUP-003",
    "BP-CUS-002",
    "BP-CUS-003",
  ];
  if (manifest.$schema !== "athyper.business-partner-r2-qualification/1")
    failures.push("R2 qualification schema is invalid");
  if (
    manifest.productionQualified !== false ||
    manifest.productionQualification !== "blocked"
  )
    failures.push("R2 local evidence must not claim production qualification");
  if (JSON.stringify(manifest.scenarios) !== JSON.stringify(requiredScenarios))
    failures.push("R2 scenario set is incomplete or reordered");
  for (const [name, expected] of Object.entries({
    reuseTargetBusinessPartnerId: true,
    createBusinessPartnerCount: 0,
    createRequestedRoleCount: 1,
    preserveOppositeRole: true,
    preserveOppositeRoleStatus: true,
    preserveOppositeRoleDecisions: true,
    automaticRoleActivation: false,
  })) {
    if (manifest.invariants?.[name] !== expected)
      failures.push(`R2 invariant is invalid: ${name}`);
  }
  for (const path of manifest.evidence ?? [])
    if (!existsSync(resolve(root, path)))
      failures.push(`Missing R2 evidence: ${path}`);

  const browser = (manifest.commands ?? []).find(
    (item) => item.command === "pnpm test:e2e:bp-r2",
  );
  if (
    !browser ||
    browser.optionalSkip !== false ||
    browser.result !== "environment_required" ||
    browser.tests !== 4
  )
    failures.push(
      "R2 browser evidence must contain four mandatory environment tests",
    );

  const repository = read(
    "server/packages/services/master-data/src/kysely-business-partner-case-repository.ts",
  );
  for (const token of [
    "BUSINESS_PARTNER_ROLE_EXTENSION_TARGET_INELIGIBLE",
    "BUSINESS_PARTNER_ROLE_ALREADY_EXISTS",
    "immutableTargetIdentity",
    "FOR SHARE",
  ])
    if (!repository.includes(token))
      failures.push(`R2 repository is missing ${token}`);

  const materializer = read(
    "server/db/ddl/planes/neon/master/07_functions.sql",
  );
  for (const token of [
    "IF requested_role='supplier' THEN",
    "'onboarding',p_actor_id",
    "'prospect',p_actor_id",
    "authority_evidence_id",
  ])
    if (!materializer.includes(token))
      failures.push(`R2 materializer is missing ${token}`);
  if (materializer.includes("INTO role_lifecycle"))
    failures.push("R2 materializer must not automatically activate a new role");

  const ui = read(
    "packages/planes/neon/business-partner/src/role-extension-experience.tsx",
  );
  for (const token of [
    "availableRoleExtensions",
    "Identity and existing authority",
    "Existing roles are retained unchanged",
  ])
    if (!ui.includes(token)) failures.push(`R2 experience is missing ${token}`);

  const spec = read("tests/e2e/business-partner/bp-r2.spec.ts");
  const fixture = read("tests/e2e/business-partner/bp-r2.fixture.ts");
  const config = read("tooling/config/playwright.config.ts");
  if (/test\.skip|\.skip\(/.test(spec))
    failures.push("R2 browser tests may not skip");
  for (const scenario of requiredScenarios)
    if (!spec.includes(scenario))
      failures.push(`R2 browser test is missing ${scenario}`);
  for (const token of [
    "PLAYWRIGHT_BP_R2_SUPPLIER_EXTENSION_TARGET_ID",
    "PLAYWRIGHT_BP_R2_CUSTOMER_TO_DUAL_TARGET_ID",
    "PLAYWRIGHT_BP_R2_CUSTOMER_EXTENSION_TARGET_ID",
    "PLAYWRIGHT_BP_R2_SUPPLIER_TO_DUAL_TARGET_ID",
  ])
    if (!fixture.includes(token))
      failures.push(`R2 fixture is missing ${token}`);
  if (!config.includes('name: "bp-r2"'))
    failures.push("R2 Playwright project is missing");

  if (failures.length)
    throw new Error(
      `Business Partner R2 qualification verification failed:\n- ${failures.join("\n- ")}`,
    );
  return {
    scenarios: requiredScenarios.length,
    commands: manifest.commands.length,
    productionQualified: false,
  };
}

function read(path) {
  return readFileSync(resolve(root, path), "utf8");
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const result = verifyBusinessPartnerR2Qualification();
  process.stdout.write(
    `Business Partner R2 local qualification verified: ${result.scenarios} scenarios, ${result.commands} retained commands; production qualification blocked.\n`,
  );
}
