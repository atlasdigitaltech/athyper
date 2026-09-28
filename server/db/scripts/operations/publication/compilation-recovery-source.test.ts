import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseCompilationRecoveryPolicy } from "../../../../packages/contracts/publication/src/policy/compilation-recovery-policy.js";

test("DEV recovery evidence: scoped runtime/control reads, exact pins, empty boundary, no public grant; rollback", {
  skip: process.env.COMPILATION_RECOVERY_POSTGRES_TEST !== "1" || !process.env.COMPILATION_RECOVERY_POLICY,
}, () => {
  const p = parseCompilationRecoveryPolicy(JSON.parse(readFileSync(process.env.COMPILATION_RECOVERY_POLICY!, "utf8")));
  const c = JSON.parse(execFileSync("docker", ["inspect", "athyper-dev-db-1"], { encoding: "utf8" }))[0];
  assert.equal(c.Config.Labels["com.docker.compose.project"], "athyper-dev"); assert.equal(c.State.Running, true);
  const lit = (v: unknown) => `'${String(v).replaceAll("'", "''")}'`;
  const json = (value: unknown) => `${lit(JSON.stringify(value))}::jsonb`;
  const read = (value: unknown, empty = true) => `publication.fn_compilation_recovery_source(${json(value)},${empty})`;
  const expect = (expression: string, present: boolean) => `DO $$ BEGIN IF (${expression}) IS ${present ? "NULL" : "NOT NULL"} THEN RAISE EXCEPTION 'unexpected recovery evidence'; END IF; END $$;`;
  const context = `SELECT set_config('app.current_tenant_id',${lit(p.authorityTenantId)},true),set_config('app.current_principal_id',${lit(p.publisherPrincipalId)},true),set_config('app.database_plane','studio',true);`;
  const ddl = readFileSync(new URL("../../../ddl/planes/studio/publication/18_compilation_recovery.sql", import.meta.url), "utf8");
  const output = execFileSync("docker", ["exec", "-i", "athyper-dev-db-1", "sh", "-c", 'exec psql -X -qAt -U "$POSTGRES_USER" -d athyper_studio -v ON_ERROR_STOP=1'], {
    input: `BEGIN; ${ddl}
      DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_proc p, LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
        WHERE p.oid='publication.fn_compilation_recovery_source(jsonb,boolean)'::regprocedure AND a.grantee=0 AND a.privilege_type='EXECUTE') THEN RAISE EXCEPTION 'public execute granted'; END IF; END $$;
      SET LOCAL ROLE athyper_runtime; ${context} ${expect(read(p), true)}
      ${expect(read({ ...p, failedReleaseHash: "0".repeat(64) }), false)}
      ${expect(read({ ...p, originalCompilerHash: "0".repeat(64) }), false)}
      ${expect(read({ ...p, failedJobId: "00000000-0000-4000-8000-000000000001" }), false)}
      ${expect(read({ ...p, entityId: "00000000-0000-4000-8000-000000000001" }), false)}
      SELECT set_config('app.current_tenant_id','00000000-0000-4000-8000-000000000001',true);
      ${expect(read(p), false)} ${context}
      SELECT set_config('app.current_principal_id','00000000-0000-4000-8000-000000000001',true);
      ${expect(read(p), false)} RESET ROLE;
      SELECT set_config('app.current_tenant_id',${lit(p.authorityTenantId)},true),set_config('app.current_principal_id',
        (SELECT id::text FROM master.principal WHERE tenant_id=${lit(p.authorityTenantId)}::uuid AND code='platform.admin' AND status='active'),true);
      SET LOCAL ROLE athyper_control_api;
      ${expect(read(p), true)} RESET ROLE; ${context}
      INSERT INTO publication.artifact_compilation(publication_release_id,plane_code,artifact_kind,unsigned_document,unsigned_hash,compiler_name,compiler_version,created_by)
        VALUES(${lit(p.failedReleaseId)},'studio','compiled_entity_runtime','{}',repeat('0',64),'rollback.fixture','1',${lit(p.publisherPrincipalId)});
      SET LOCAL ROLE athyper_runtime; ${expect(read(p), false)} ${expect(read(p, false), true)}
      ROLLBACK; SELECT 'all recovery evidence checks rolled back';`, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
  });
  assert.match(output, /all recovery evidence checks rolled back/);
});
