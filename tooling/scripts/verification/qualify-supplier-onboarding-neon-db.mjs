import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const fixture = JSON.parse(
  readFileSync(
    "governance/policy/reports/supplier-onboarding-neon-actions.dev.json",
    "utf8",
  ),
).cases[0];
if (!/^[0-9a-f-]{36}$/.test(fixture.id)) throw Error("Fixture id invalid");
const query = `BEGIN;
SET LOCAL app.current_tenant_id='44444444-4444-4444-8444-444444444444';
SET LOCAL app.current_principal_id='cca94907-7519-5871-8e3c-6b11aa545c93';
SET LOCAL app.database_plane='neon';
DO $$ DECLARE run_id uuid; original_data jsonb; case_version bigint; fixture_case_id uuid:='${fixture.id}'; BEGIN
 SELECT a.cycle_run_id,c.row_version INTO run_id,case_version FROM governance.process_attempt a JOIN document.entity_case c ON c.tenant_id=a.tenant_id AND c.id=a.case_id WHERE a.case_id=fixture_case_id ORDER BY a.attempt_number DESC LIMIT 1;
 SELECT data INTO original_data FROM governance.cycle_run WHERE id=run_id;
 BEGIN UPDATE governance.cycle_run SET data=data||'{"unsafeRetarget":true}'::jsonb WHERE id=run_id; RAISE EXCEPTION 'Expected immutable pin rejection'; EXCEPTION WHEN check_violation THEN IF SQLERRM<>'SUPPLIER_ONBOARDING_PIN_IMMUTABLE' THEN RAISE; END IF; END;
 PERFORM document.command_entity_case_lifecycle('44444444-4444-4444-8444-444444444444',fixture_case_id,'cancel',case_version,run_id,NULL,'P8 closure regression rollback','p8-closure-regression-rollback','cca94907-7519-5871-8e3c-6b11aa545c93',NULL);
 IF NOT EXISTS(SELECT 1 FROM governance.cycle_run WHERE id=run_id AND status='cancelled' AND data=original_data) THEN RAISE EXCEPTION 'Closure changed run pins'; END IF;
 IF NOT EXISTS(SELECT 1 FROM document.entity_case_command_evidence WHERE entity_case_id=fixture_case_id AND result_code='ENTITY_CASE_CANCELLED' AND result_evidence->>'reason'='P8 closure regression rollback') THEN RAISE EXCEPTION 'Closure evidence missing'; END IF;
END $$;
ROLLBACK;`;
execFileSync(
  "docker",
  [
    "exec",
    "-i",
    "athyper-dev-db-1",
    "psql",
    "-X",
    "-q",
    "-v",
    "ON_ERROR_STOP=1",
    "-U",
    "postgres",
    "-d",
    "athyper_neon",
  ],
  { input: query, stdio: ["pipe", "pipe", "pipe"] },
);
const report = {
  at: new Date().toISOString(),
  passed: true,
  caseId: fixture.id,
  checks: [
    "direct run-pin mutation rejected",
    "real lifecycle cancellation preserves run pins",
    "case command retains closure reason and snapshot",
  ],
  boundary:
    "PostgreSQL owner-command regression with rollback; live authorization is qualified by the NEON action script",
};
writeFileSync(
  "governance/policy/reports/supplier-onboarding-neon-db.dev.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report));
