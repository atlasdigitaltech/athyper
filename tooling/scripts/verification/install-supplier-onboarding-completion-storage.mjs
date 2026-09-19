/** Direct DEV local build from canonical P6 definitions. */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const read = (p) => readFileSync(`server/db/ddl/${p}`, "utf8");
const extract = (p, schema, name) => {
  const s = read(p),
    start = s.indexOf(`CREATE OR REPLACE FUNCTION ${schema}.${name}(`);
  if (start < 0) throw Error(name);
  return s.slice(start, s.indexOf("$$;", start) + 3);
};
const table = read("common/control/03_tables.sql")
  .slice(
    read("common/control/03_tables.sql").indexOf(
      "CREATE TABLE control.supplier_activation_policy",
    ),
  )
  .replace("CREATE TABLE", "CREATE TABLE IF NOT EXISTS");
const ddl = [
  "SELECT set_config('app.database_plane','neon',true);",
  read("common/audit/12_reference_seed.sql"),
  extract("planes/neon/master/07_functions.sql","master","command_materialize_business_partner_company_case"),
  extract(
    "planes/neon/governance/07_functions.sql",
    "governance",
    "trg_supplier_onboarding_completion",
  ),
  "DROP TRIGGER IF EXISTS supplier_onboarding_completion ON governance.cycle_run; CREATE TRIGGER supplier_onboarding_completion BEFORE UPDATE ON governance.cycle_run FOR EACH ROW WHEN (OLD.data->>'schema'='athyper.process-run/1') EXECUTE FUNCTION governance.trg_supplier_onboarding_completion();",
  table,
  extract(
    "common/governance/07_functions.sql",
    "governance",
    "trg_cycle_completion_structure",
  ),
  "DROP TRIGGER IF EXISTS cycle_completion_structure ON governance.cycle_run; CREATE TRIGGER cycle_completion_structure BEFORE UPDATE OF status ON governance.cycle_run FOR EACH ROW EXECUTE FUNCTION governance.trg_cycle_completion_structure();",
  extract(
    "planes/neon/governance/07_functions.sql",
    "governance",
    "command_link_supplier_onboarding_work",
  ),
  "REVOKE ALL ON FUNCTION governance.command_link_supplier_onboarding_work(uuid,uuid,uuid,uuid) FROM PUBLIC; GRANT EXECUTE ON FUNCTION governance.command_link_supplier_onboarding_work(uuid,uuid,uuid,uuid) TO athyperapp,athyperadmin;",
  extract(
    "common/governance/07_functions.sql",
    "governance",
    "evaluate_cycle_completion",
  ),
  extract(
    "planes/neon/document/07_functions.sql",
    "document",
    "trg_guard_entity_case_mutation",
  ),
  extract(
    "planes/neon/document/07_functions.sql",
    "document",
    "command_materialize_supplier_activation_case",
  ),
  "ALTER TABLE control.supplier_activation_policy ENABLE ROW LEVEL SECURITY; DROP POLICY IF EXISTS supplier_activation_policy_tenant ON control.supplier_activation_policy; CREATE POLICY supplier_activation_policy_tenant ON control.supplier_activation_policy USING(tenant_id=shared.current_tenant_id());",
  "DROP TRIGGER IF EXISTS supplier_activation_policy_immutable ON control.supplier_activation_policy; CREATE TRIGGER supplier_activation_policy_immutable BEFORE UPDATE OR DELETE ON control.supplier_activation_policy FOR EACH ROW EXECUTE FUNCTION control.trg_reject_process_publication_mutation();",
  "REVOKE ALL ON control.supplier_activation_policy FROM PUBLIC; GRANT SELECT ON control.supplier_activation_policy TO athyperapp,athyperadmin;",
  "REVOKE ALL ON FUNCTION governance.evaluate_cycle_completion(uuid,uuid),document.command_materialize_supplier_activation_case(uuid,uuid,bigint,uuid,uuid,text,text,uuid,uuid) FROM PUBLIC; GRANT EXECUTE ON FUNCTION governance.evaluate_cycle_completion(uuid,uuid),document.command_materialize_supplier_activation_case(uuid,uuid,bigint,uuid,uuid,text,text,uuid,uuid) TO athyperapp,athyperadmin;",
  read("planes/neon/control/12_reference_seed.sql").slice(
    read("planes/neon/control/12_reference_seed.sql").indexOf(
      "-- Local Increment A purchasing activation policy",
    ),
  ),
];
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
  { input: ["BEGIN;", ...ddl, "COMMIT;"].join("\n"), encoding: "utf8" },
);
writeFileSync(
  "governance/policy/reports/supplier-onboarding-completion-storage.dev.json",
  JSON.stringify(
    { at: new Date().toISOString(), source: "canonical DDL", passed: true },
    null,
    2,
  ) + "\n",
);
console.log("P6 canonical completion and activation definitions installed.");
