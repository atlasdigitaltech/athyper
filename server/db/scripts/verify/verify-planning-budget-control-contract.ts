import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const repoRoot = resolve(fileURLToPath(new URL("../../../../", import.meta.url)));
const read = (path: string) => readFile(resolve(repoRoot, path), "utf8");
const checks: Array<{ name: string; ok: boolean }> = [];
const expect = (name: string, ok: boolean): void => { checks.push({ name, ok }); };

const [controlDomains, controlTables, controlConstraints, controlFunctions,
  controlRls, controlGrants, documentDomains, documentTables, documentConstraints,
  documentFunctions, documentTriggers, documentRls, documentGrants,
  ledgerTables, ledgerConstraints, ledgerFunctions, ledgerTriggers,
  neonManifest, athyperManifest, meshManifest, neonPrisma, meshPrisma,
  dispositionPolicy, dispositionInventory] = await Promise.all([
  read("server/db/ddl/planes/neon/control/02_budget_control_domains.sql"),
  read("server/db/ddl/planes/neon/control/03_budget_control_tables.sql"),
  read("server/db/ddl/planes/neon/control/05_budget_control_constraints.sql"),
  read("server/db/ddl/planes/neon/control/07_budget_control_functions.sql"),
  read("server/db/ddl/planes/neon/control/10_budget_control_rls.sql"),
  read("server/db/ddl/planes/neon/control/11_budget_control_grants.sql"),
  read("server/db/ddl/planes/neon/document/02_planning_scenario_domains.sql"),
  read("server/db/ddl/planes/neon/document/03_planning_scenario_tables.sql"),
  read("server/db/ddl/planes/neon/document/05_planning_scenario_constraints.sql"),
  read("server/db/ddl/planes/neon/document/07_planning_scenario_functions.sql"),
  read("server/db/ddl/planes/neon/document/08_planning_scenario_triggers.sql"),
  read("server/db/ddl/planes/neon/document/10_planning_scenario_rls.sql"),
  read("server/db/ddl/planes/neon/document/11_planning_scenario_grants.sql"),
  read("server/db/ddl/planes/neon/ledger/03_planning_budget_tables.sql"),
  read("server/db/ddl/planes/neon/ledger/05_planning_budget_constraints.sql"),
  read("server/db/ddl/planes/neon/ledger/07_planning_budget_functions.sql"),
  read("server/db/ddl/planes/neon/ledger/08_planning_budget_triggers.sql"),
  read("server/db/ddl/planes/neon/_manifest.txt"),
  read("server/db/ddl/planes/athyper/_manifest.txt"),
  read("server/db/ddl/planes/mesh/_manifest.txt"),
  read("server/packages/adapters/db/src/prisma/schema.prisma"),
  read("server/packages/adapters/db/src/prisma/schema.mesh.prisma"),
  read("config/governance/authorization-data-disposition-policy.v1.json"),
  read("config/governance/authorization-data-disposition-inventory.v1.json"),
]);

expect("budget-control domains are sealed",
  controlDomains.includes("control.budget_period_scope_d")
  && controlDomains.includes("control.budget_consumption_basis_d"));
expect("budget control is a Neon control policy",
  controlTables.includes("CREATE TABLE control.budget_control_policy"));
expect("budget control stores evaluation policy but no balances",
  controlTables.includes("consumption_basis")
  && controlTables.includes("warn_at_percent")
  && !/available_amount|consumed_amount|reserved_amount/.test(controlTables));
expect("budget policy scope and actors are tenant safe",
  controlConstraints.includes("FOREIGN KEY (tenant_id, company_code_id)")
  && controlConstraints.includes("FOREIGN KEY (tenant_id, ledger_book_id)")
  && controlConstraints.includes("FOREIGN KEY (tenant_id, created_by)"));
expect("active budget policy ranges cannot overlap",
  controlConstraints.includes("budget_control_policy_active_period_excl"));
expect("budget policy lineage, immutability and resolver exist",
  controlFunctions.includes("trg_validate_budget_control_policy")
  && controlFunctions.includes("trg_guard_budget_control_policy")
  && controlFunctions.includes("resolve_budget_control_policy")
  && controlFunctions.includes("p_policy_code text")
  && controlFunctions.includes("policy.policy_code = p_policy_code"));
expect("budget policy has forced RLS and explicit grants",
  controlRls.includes("FORCE ROW LEVEL SECURITY")
  && controlGrants.includes("control.budget_control_policy"));

expect("planning scenario domains are sealed",
  documentDomains.includes("document.planning_scenario_status_d")
  && documentDomains.includes("document.planning_line_source_d"));
expect("scenario header and normalized period line are document owned",
  documentTables.includes("CREATE TABLE document.planning_scenario (")
  && documentTables.includes("CREATE TABLE document.planning_scenario_line ("));
expect("planning lines have no period JSON or independent lifecycle",
  !/\n\s+period_amounts\s/.test(documentTables)
  && !documentTables.slice(documentTables.indexOf("CREATE TABLE document.planning_scenario_line"))
    .match(/status_changed_at|is_active/));
expect("scenario business and actor references are tenant composite",
  documentConstraints.includes("planning_scenario_line_scenario_fk")
  && documentConstraints.includes("FOREIGN KEY (tenant_id, planning_model_id, planning_scenario_id)")
  && documentConstraints.includes("FOREIGN KEY (tenant_id, created_by)"));
expect("approved scenarios and their lines are immutable",
  documentFunctions.includes("trg_guard_planning_scenario")
  && documentFunctions.includes("trg_guard_planning_scenario_line")
  && documentTriggers.includes("trg_planning_scenario_line_20_guard"));
expect("scenario input hashing is canonical",
  documentFunctions.includes("planning_scenario_input_hash")
  && documentFunctions.includes("digest(")
  && documentFunctions.includes("ORDER BY line.line_no"));
expect("scenario tables have forced RLS and explicit grants",
  (documentRls.match(/FORCE ROW LEVEL SECURITY/g)?.length ?? 0) === 2
  && documentGrants.includes("document.planning_scenario_line"));

expect("planning runs reference approved scenario identity",
  ledgerTables.includes("planning_scenario_id uuid")
  && !ledgerTables.includes("scenario_code")
  && ledgerConstraints.includes("planning_run_scenario_fk"));
expect("planning run hash is validated and immutable",
  ledgerFunctions.includes("document.planning_scenario_input_hash")
  && ledgerFunctions.includes("Planning run input hash does not match")
  && ledgerFunctions.includes("trg_guard_planning_run")
  && ledgerTriggers.includes("trg_planning_run_05_validate"));

for (const legacy of ["budget_check_config", "forecast_budget_bridge", "forecast_line"]) {
  expect(`${legacy} is absent from new Prisma contracts`,
    !new RegExp(`model\\s+${legacy}\\b`).test(neonPrisma)
    && !new RegExp(`model\\s+${legacy}\\b`).test(meshPrisma));
  expect(`${legacy} has explicit legacy disposition`,
    dispositionPolicy.includes(`"control.${legacy}"`)
    && dispositionInventory.includes(`"id": "control.${legacy}"`));
}
expect("Neon Prisma exposes canonical policy and scenario models",
  /model\s+budget_control_policy\b/.test(neonPrisma)
  && /model\s+planning_scenario\b/.test(neonPrisma)
  && /model\s+planning_scenario_line\b/.test(neonPrisma));
expect("Mesh Prisma exposes no Neon planning/budget replacements",
  !/model\s+budget_control_policy\b/.test(meshPrisma)
  && !/model\s+planning_scenario\b/.test(meshPrisma)
  && !/model\s+planning_scenario_line\b/.test(meshPrisma));

const requiredFiles = [
  "control/02_budget_control_domains.sql", "control/03_budget_control_tables.sql",
  "control/05_budget_control_constraints.sql", "control/06_budget_control_indexes.sql",
  "control/07_budget_control_functions.sql", "control/08_budget_control_triggers.sql",
  "control/10_budget_control_rls.sql", "control/11_budget_control_grants.sql",
  "document/02_planning_scenario_domains.sql", "document/03_planning_scenario_tables.sql",
  "document/05_planning_scenario_constraints.sql", "document/06_planning_scenario_indexes.sql",
  "document/07_planning_scenario_functions.sql", "document/08_planning_scenario_triggers.sql",
  "document/10_planning_scenario_rls.sql", "document/11_planning_scenario_grants.sql",
];
expect("Neon installs every replacement phase exactly once",
  requiredFiles.every((path) => neonManifest.split(`planes/neon/${path}`).length === 2));
expect("Athyper and Mesh install no Neon planning/budget replacement tables",
  !/budget_control|planning_scenario/.test(athyperManifest)
  && !/budget_control|planning_scenario/.test(meshManifest));

for (const check of checks) console.log(`${check.ok ? "PASS" : "FAIL"} ${check.name}`);
const failures = checks.filter((check) => !check.ok);
if (failures.length) throw new Error(`${failures.length} planning/budget contract check(s) failed.`);
console.log(`Planning/budget-control contract verified (${checks.length} checks).`);
