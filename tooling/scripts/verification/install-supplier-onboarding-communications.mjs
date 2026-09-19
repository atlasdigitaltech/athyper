/** Direct canonical P7 DEV build. No migration scripts or external channel enablement. */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const read = (p) => readFileSync(`server/db/ddl/${p}`, "utf8");
const source = read("planes/neon/control/03_tables.sql");
const table = source
  .slice(source.indexOf("CREATE TABLE control.supplier_communication_policy"))
  .replace("CREATE TABLE", "CREATE TABLE IF NOT EXISTS");
if (!table.startsWith("CREATE TABLE"))
  throw Error("P7 canonical policy table missing");
const documentFunctions = read("planes/neon/document/07_functions.sql");
const taskGuard = documentFunctions.slice(
  documentFunctions.indexOf(
    "CREATE OR REPLACE FUNCTION document.trg_supplier_task_work_item_binding()",
  ),
  documentFunctions.indexOf(
    "CREATE OR REPLACE FUNCTION document.trg_supplier_task_completion_quorum()",
  ),
);
const sql = [
  "BEGIN; SELECT set_config('app.database_plane','neon',true);",
  table,
  taskGuard,
  documentFunctions.slice(
    documentFunctions.indexOf(
      "CREATE OR REPLACE FUNCTION document.command_process_document_job(",
    ),
    documentFunctions.indexOf(
      "CREATE OR REPLACE FUNCTION document.trg_process_document_domain_gates()",
    ),
  ),
  read("common/audit/12_reference_seed.sql")
    .split("-- P7 self-service channel consent.")[1]
    .split("-- End P7 consent audit contract.")[0]
    .replace(/^ Destination is represented only by its hash\./, ""),
  "ALTER TABLE control.supplier_communication_policy ENABLE ROW LEVEL SECURITY; DROP POLICY IF EXISTS supplier_communication_policy_tenant ON control.supplier_communication_policy; CREATE POLICY supplier_communication_policy_tenant ON control.supplier_communication_policy USING(tenant_id=shared.current_tenant_id()); GRANT SELECT ON control.supplier_communication_policy TO athyperapp,athyperadmin;",
  read("planes/neon/control/16_supplier_communications_reference_seed.sql"),
  "INSERT INTO control.supplier_communication_policy(tenant_id,public_origin,enabled,operational_owner_principal_id,created_by) VALUES('44444444-4444-4444-8444-444444444444','https://neon.dev.athyper.test',true,'cca94907-7519-5871-8e3c-6b11aa545c93','cca94907-7519-5871-8e3c-6b11aa545c93') ON CONFLICT(tenant_id) DO NOTHING;",
  "COMMIT;",
].join("\n");
execFileSync(
  "docker",
  [
    "exec",
    "-i",
    "athyper-dev-db-1",
    "psql",
    "-X",
    "-qAt",
    "-v",
    "ON_ERROR_STOP=1",
    "-U",
    "postgres",
    "-d",
    "athyper_neon",
  ],
  { input: sql, encoding: "utf8" },
);
writeFileSync(
  "governance/policy/reports/supplier-onboarding-communications-storage.dev.json",
  JSON.stringify(
    {
      at: new Date().toISOString(),
      passed: true,
      source:
        "Canonical P7 definitions; DEV pilot enabled from initial installation, no historical notification backfill",
    },
    null,
    2,
  ) + "\n",
);
console.log("P7 canonical templates, routing and scoped DEV policy installed.");
