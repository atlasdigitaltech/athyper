import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const repoRoot = resolve(fileURLToPath(new URL("../../../../", import.meta.url)));
const read = (path: string) => readFile(resolve(repoRoot, path), "utf8");
const checks: Array<{ name: string; ok: boolean }> = [];
const expect = (name: string, ok: boolean): void => { checks.push({ name, ok }); };

const base = "server/db/ddl/planes/neon/control";
const [domains, tables, constraints, indexes, functions, triggers, rls, grants,
  neonManifest, athyperManifest, meshManifest, masterDomains, masterTables,
  service, meshPrisma, dispositionPolicy, dispositionInventory] = await Promise.all([
  read(`${base}/02_fiscal_calendar_domains.sql`),
  read(`${base}/03_fiscal_calendar_tables.sql`),
  read(`${base}/05_fiscal_calendar_constraints.sql`),
  read(`${base}/06_fiscal_calendar_indexes.sql`),
  read(`${base}/07_fiscal_calendar_functions.sql`),
  read(`${base}/08_fiscal_calendar_triggers.sql`),
  read(`${base}/10_fiscal_calendar_rls.sql`),
  read(`${base}/11_fiscal_calendar_grants.sql`),
  read("server/db/ddl/planes/neon/_manifest.txt"),
  read("server/db/ddl/planes/athyper/_manifest.txt"),
  read("server/db/ddl/planes/mesh/_manifest.txt"),
  read("server/db/ddl/planes/neon/master/02_domains.sql"),
  read("server/db/ddl/planes/neon/master/03_tables.sql"),
  read("server/packages/services/finance/services/fiscal-calendar.service.ts"),
  read("server/packages/adapters/db/src/prisma/schema.mesh.prisma"),
  read("config/governance/authorization-data-disposition-policy.v1.json"),
  read("config/governance/authorization-data-disposition-inventory.v1.json"),
]);

const relationNames = [
  "fiscal_calendar_config",
  "fiscal_calendar_period_rule",
  "company_fiscal_calendar_assignment",
];
for (const table of relationNames) {
  expect(`${table} is Neon control owned`, tables.includes(`CREATE TABLE control.${table} (`));
  expect(`${table} has forced RLS`,
    rls.includes(`ALTER TABLE control.${table} ENABLE ROW LEVEL SECURITY`)
      && rls.includes(`ALTER TABLE control.${table} FORCE ROW LEVEL SECURITY`));
  expect(`${table} has explicit grants`, grants.includes(`control.${table}`));
}

for (const domain of [
  "fiscal_calendar_type_d", "fiscal_year_label_rule_d",
  "fiscal_year_start_rule_d", "fiscal_leap_week_rule_d",
  "fiscal_rule_duration_unit_d", "fiscal_rule_anchor_d",
  "fiscal_calendar_status_d", "fiscal_calendar_assignment_status_d",
]) expect(`${domain} is sealed`, domains.includes(`CREATE DOMAIN control.${domain}`));

expect("calendar applicability exists only on company assignment",
  !tables.slice(0, tables.indexOf("CREATE TABLE control.fiscal_calendar_period_rule"))
    .includes("effective_from")
  && tables.includes("effective_fiscal_year_from"));
expect("assignment priority ambiguity is removed", !tables.includes("priority"));
expect("period rules are parent-version composition without lifecycle status",
  !tables.slice(
    tables.indexOf("CREATE TABLE control.fiscal_calendar_period_rule"),
    tables.indexOf("CREATE TABLE control.company_fiscal_calendar_assignment"),
  ).match(/\bstatus\b|is_active|updated_at|updated_by/));
expect("all actor and business references are tenant composite",
  ["fiscal_calendar_config_created_by_fk", "fiscal_calendar_period_rule_created_by_fk",
    "company_fiscal_calendar_assignment_company_fk",
    "company_fiscal_calendar_assignment_created_by_fk"].every((name) => constraints.includes(name))
  && !constraints.includes("FOREIGN KEY (created_by)"));
expect("active company fiscal-year ranges cannot overlap",
  constraints.includes("company_fiscal_calendar_assignment_active_year_excl"));
expect("generated periods have calendar provenance FK",
  constraints.includes("fiscal_period_calendar_config_fk"));
expect("calendar lineage and assignment resolution indexes exist",
  indexes.includes("fiscal_calendar_config_lineage_idx")
  && indexes.includes("company_fiscal_calendar_assignment_resolution_idx"));
expect("activation, rule membership, and assignment history are guarded",
  ["trg_guard_fiscal_calendar_config", "trg_guard_fiscal_calendar_period_rule",
    "trg_guard_company_fiscal_calendar_assignment"].every((name) => functions.includes(name))
  && triggers.includes("trg_fiscal_calendar_config_20_guard")
  && triggers.includes("trg_fiscal_calendar_period_rule_10_guard")
  && triggers.includes("trg_company_fiscal_calendar_assignment_20_guard"));
expect("preview, assignment resolution, generation and posting-date resolution exist",
  ["control.fiscal_calendar_year_start", "control.preview_fiscal_calendar",
    "control.resolve_company_fiscal_calendar", "control.generate_fiscal_periods",
    "master.resolve_fiscal_period"].every((name) => functions.includes(name)));
expect("generator targets the new ledger book-period gate",
  functions.includes("ledger.book_period_status")
  && !functions.includes("governance.book_period_status"));
expect("master fiscal periods support semantic 13-period and closing calendars",
  masterDomains.includes("'closing'")
  && masterTables.includes("period_type = 'normal' AND period_number BETWEEN 1 AND 16")
  && masterTables.includes("UNIQUE (tenant_id, company_code_id, fiscal_year, period_number)"));
expect("runtime uses assignment authority and new ledger gate",
  !service.includes("fiscal_year_variant")
  && !service.includes("default_ledger_book_id")
  && !service.includes("governance.book_period_status")
  && !/\ba\.priority\b/.test(service)
  && service.includes("ledger.book_period_status"));

const phases = ["02_fiscal_calendar_domains.sql", "03_fiscal_calendar_tables.sql",
  "05_fiscal_calendar_constraints.sql", "06_fiscal_calendar_indexes.sql",
  "07_fiscal_calendar_functions.sql", "08_fiscal_calendar_triggers.sql",
  "10_fiscal_calendar_rls.sql", "11_fiscal_calendar_grants.sql"];
expect("Neon installs every fiscal-calendar phase exactly once",
  phases.every((phase) => neonManifest.split(`planes/neon/control/${phase}`).length === 2));
expect("Athyper and Mesh manifests do not install fiscal calendar",
  !/fiscal_calendar/.test(athyperManifest) && !/fiscal_calendar/.test(meshManifest));
expect("Mesh Prisma exposes no Neon fiscal-calendar models or relations",
  !/fiscal_calendar_config\s+fiscal_calendar_config|model fiscal_calendar_config|model fiscal_calendar_period_rule|model company_fiscal_calendar_assignment/.test(meshPrisma));

for (const table of relationNames.map((name) => `control.${name}`)) {
  expect(`${table} has a tenant-finance migration disposition`,
    dispositionPolicy.includes(`"${table}"`)
    && dispositionInventory.includes(`"id": "${table}"`));
}

for (const check of checks) console.log(`${check.ok ? "PASS" : "FAIL"} ${check.name}`);
const failures = checks.filter((check) => !check.ok);
if (failures.length) throw new Error(`${failures.length} fiscal-calendar contract check(s) failed.`);
console.log(`Fiscal-calendar contract verified (${checks.length} checks).`);
