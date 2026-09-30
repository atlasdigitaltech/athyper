import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { controlPolicyRls } from "./control-policy-rls.mjs";
import { assertDevContainer } from "./setup-dev-test-admin.mjs";
const tenant = "11111111-1111-4111-8111-111111111111";
test("requires an exact authority UUID and never grants RLS bypass", () => {
  assert.throws(() => controlPolicyRls("all"));
  assert.throws(() => controlPolicyRls("'; COMMIT;"));
  const sql = controlPolicyRls(tenant);
  assert.doesNotMatch(sql, /BYPASSRLS|DISABLE ROW|TO PUBLIC|TO athyperadmin/);
  assert.match(sql, /entity_type='metadata.publication'/);
  assert.match(sql, /created_by<>master.current_principal_id_soft\(\)/);
  assert.match(sql, /executed_by=master.current_principal_id_soft\(\)/);
});
test("live DEV RLS permits scoped drafts and denies tenant, category and actor substitution", { skip: process.env.CONTROL_POLICY_POSTGRES_TEST !== "1" }, () => {
  assertDevContainer(JSON.parse(execFileSync("docker", ["inspect", "athyper-dev-db-1"], { encoding: "utf8" }))[0]);
  const admin = "df0159b0-2bdc-55e8-944b-efaa9ed9b8e5", owner = "41bf4855-6aa1-5e43-bc11-ee2cfa647693";
  const insert = (t, kind, actor) => `INSERT INTO control.policy_definition(tenant_id,entity_type,name,priority,evaluation_mode,effective_from,version_no,status,created_by) VALUES('${t}','${kind}','rls.rollback.probe',100,'first_match',CURRENT_DATE,1,'draft','${actor}');`;
  const rejected = [insert("44444444-4444-4444-8444-444444444444", "metadata.publication", admin), insert(tenant, "workflow.task_edit", admin), insert(tenant, "metadata.publication", owner)];
  const sql = `BEGIN;
SET LOCAL ROLE athyper_control_api;
SELECT set_config('app.current_tenant_id','${tenant}',true),set_config('app.current_principal_id','${admin}',true);
${insert(tenant, "metadata.publication", admin)}
${rejected.map(statement => `DO $$ BEGIN BEGIN ${statement} RAISE EXCEPTION 'RLS unexpectedly admitted invalid draft'; EXCEPTION WHEN insufficient_privilege THEN NULL; END; END $$;`).join("\n")}
SELECT 'three_negative_checks_and_one_positive_passed';
ROLLBACK;`;
  const result = execFileSync("docker", ["exec", "-i", "athyper-dev-db-1", "sh", "-c", 'exec psql -X -qAt -U "$POSTGRES_USER" -d athyper_studio -v ON_ERROR_STOP=1'], { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
  assert.match(result, /three_negative_checks_and_one_positive_passed/);
});
