/** Execute the canonical company admission guard in PostgreSQL using in-memory decision variants. */
import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
const source = readFileSync(
  "server/db/ddl/planes/neon/master/07_functions.sql",
  "utf8",
);
const start = source.indexOf(
    " SELECT requested_role='supplier' AND count(*)=1",
  ),
  end = source.indexOf("\n SELECT b.* INTO bp", start);
if (start < 0 || end < 0) throw Error("Canonical company guard missing");
const guard = source.slice(start, end);
const fixture = JSON.parse(
  readFileSync(
    "governance/policy/reports/supplier-process-submission-live.dev.json",
    "utf8",
  ),
).cases.find((c) => c.process);
const companyCaseId = randomUUID();
const scenarios = [
  {
    name: "Linked purchasing setup permits absent payment fields",
    reject: false,
    patch: "",
  },
  {
    name: "Unlinked company case retains payment requirements",
    reject: true,
    patch: "p_case_id:='00000000-0000-4000-8000-000000000000';",
  },
  {
    name: "Missing policy retains payment requirements",
    reject: true,
    patch: "org_id:='00000000-0000-4000-8000-000000000000';",
  },
  {
    name: "Purchasing currency remains required",
    reject: true,
    patch: "currency:=NULL;",
  },
  {
    name: "Purchasing currency must use three letters",
    reject: true,
    patch: "currency:='MY';",
  },
];
const literal = (x) => "'" + String(x).replaceAll("'", "''") + "'";
const checks = scenarios
  .map(
    (x) =>
      `DO $test$ DECLARE p_tenant_id uuid:='44444444-4444-4444-8444-444444444444'; p_case_id uuid:=${literal(companyCaseId)};requested_role text:='supplier';org_id uuid:='a478f9c0-8226-5d22-9599-b8fb27a45180';company_id uuid:='793b6cb3-3c61-57c0-9562-2cbc288bd4cf';currency text:='MYR';payment_term uuid;accounting_profile uuid;remittance_link uuid;purchasing_setup boolean;rejected boolean:=false;BEGIN ${x.patch} BEGIN ${guard} EXCEPTION WHEN check_violation THEN rejected:=true;END;IF rejected IS DISTINCT FROM ${x.reject} THEN RAISE EXCEPTION ${literal(x.name)};END IF;END $test$;`,
  )
  .join("\n");
const setup = `BEGIN;
SELECT set_config('app.database_plane','neon',true),set_config('app.current_tenant_id','44444444-4444-4444-8444-444444444444',true),set_config('app.current_principal_id','cca94907-7519-5871-8e3c-6b11aa545c93',true);
SET LOCAL ROLE athyperapp;
DO $fixture$ DECLARE c document.entity_case%ROWTYPE;p jsonb; BEGIN
 SELECT * INTO STRICT c FROM document.entity_case WHERE id=${literal(fixture.id)}::uuid;
 SELECT payload_json||'{"currencyCode":"MYR"}'::jsonb INTO p FROM snapshot.entity_snapshot WHERE tenant_id=c.tenant_id AND snapshot_id=c.current_snapshot_id;
 PERFORM document.command_entity_case_draft(c.tenant_id,${literal(companyCaseId)}::uuid,0::bigint,NULL::uuid,${literal("P6-" + companyCaseId.slice(0, 8).toUpperCase())},c.entity_code,'configure_company',c.target_entity_id,'p6-company-guard',c.entity_contract_id,c.entity_contract_hash,c.form_template_release_id,c.form_template_release_no,c.form_template_hash,p,${literal("p6-company:" + companyCaseId)},'cca94907-7519-5871-8e3c-6b11aa545c93'::uuid,NULL::uuid);
 PERFORM governance.command_link_supplier_onboarding_work(c.tenant_id,${literal(fixture.process.cycleRunId)}::uuid,${literal(companyCaseId)}::uuid,'cca94907-7519-5871-8e3c-6b11aa545c93'::uuid);
END $fixture$;`;
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
  { input: setup + checks + "\nROLLBACK;", encoding: "utf8" },
);
writeFileSync(
  "governance/policy/reports/supplier-onboarding-company-guard.dev.json",
  JSON.stringify(
    {
      at: new Date().toISOString(),
      boundary:
        "Canonical SQL admission guard, real selected run/policy; payload variants are in memory, no persisted business writes",
      checks: scenarios.map(({ name, reject }) => ({ name, reject })),
      passed: true,
    },
    null,
    2,
  ) + "\n",
);
console.log("Five canonical company admission guard checks passed");
