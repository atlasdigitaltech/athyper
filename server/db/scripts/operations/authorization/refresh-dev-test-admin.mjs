#!/usr/bin/env node
// Additive permission reconciliation only. Never creates users, memberships or scopes.
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { assertDevContainer } from "./setup-dev-test-admin.mjs";

const container = "athyper-dev-db-1";
const planes = ["studio", "neon", "mesh"];
export function refreshSql(plane, commit = false) {
  if (!planes.includes(plane)) throw Error("Invalid DEV plane");
  return `BEGIN;
SET LOCAL app.database_plane='${plane}';
SET LOCAL app.current_plane_key='${plane}';
LOCK TABLE authz.permission, authz.permission_scope_kind IN SHARE MODE;
CREATE TEMP TABLE refresh_receipt(tenant text,role text,permission text,assigned boolean) ON COMMIT DROP;
DO $refresh$
DECLARE r record; p record; missing_ids uuid[]; target_count integer;
BEGIN
  IF current_database()<>'athyper_${plane}' THEN RAISE EXCEPTION 'Wrong database'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('dev:test-full-admin:v1',0));
  SELECT count(*) INTO target_count FROM authz.role role JOIN master.tenant t ON t.id=role.tenant_id
    WHERE role.code='test.full_admin' AND role.source_ref='dev:test-full-admin:v1' AND role.status='active'
      AND t.code IN ('athyper','cirrusatlantic') AND t.status='active';
  IF target_count<>2 THEN RAISE EXCEPTION 'Expected two existing DEV full-admin roles'; END IF;
  FOR r IN SELECT role.*,t.code tenant_code FROM authz.role role JOIN master.tenant t ON t.id=role.tenant_id
    WHERE role.source_ref='dev:test-full-admin:v1' AND t.code IN ('athyper','cirrusatlantic') AND t.status='active'
    ORDER BY role.tenant_id,role.code FOR UPDATE OF role LOOP
    IF r.status<>'active' THEN RAISE EXCEPTION 'Managed role is not active'; END IF;
    IF NOT EXISTS(SELECT 1 FROM master.principal WHERE tenant_id=r.tenant_id AND id=r.created_by AND status='active')
      THEN RAISE EXCEPTION 'Provisioning actor unavailable'; END IF;
    PERFORM set_config('app.current_tenant_id',r.tenant_id::text,true);
    PERFORM set_config('app.current_principal_id',r.created_by::text,true);
    missing_ids := ARRAY[]::uuid[];
    FOR p IN SELECT DISTINCT permission.id,permission.canonical_code FROM authz.permission permission
      JOIN authz.permission_scope_kind s ON s.permission_id=permission.id
      WHERE permission.status='published' AND s.status='active'
      AND r.code=CASE WHEN s.scope_kind='tenant' AND s.propagation_mode='exact' THEN 'test.full_admin'
        ELSE 'test.full_admin.'||s.scope_kind||'.'||s.propagation_mode END
      AND NOT EXISTS(SELECT 1 FROM authz.role_permission rp WHERE rp.tenant_id=r.tenant_id AND rp.role_id=r.id AND rp.permission_id=permission.id)
      ORDER BY permission.canonical_code LOOP
      IF EXISTS(SELECT 1 FROM authz.group_role gr WHERE gr.tenant_id=r.tenant_id AND gr.role_id=r.id AND gr.status='active'
        AND NOT authz.fn_internal_permission_is_assignable_at_scope(p.id,r.tenant_id,gr.scope_target_id,gr.propagation_mode))
        THEN RAISE EXCEPTION 'New permission incompatible with existing assignment: %',p.canonical_code; END IF;
      missing_ids := array_append(missing_ids,p.id);
      INSERT INTO refresh_receipt VALUES(r.tenant_code,r.code,p.canonical_code,
        EXISTS(SELECT 1 FROM authz.group_role gr WHERE gr.tenant_id=r.tenant_id AND gr.role_id=r.id AND gr.status='active'
          AND gr.effective_from<=now() AND (gr.effective_until IS NULL OR gr.effective_until>now())));
    END LOOP;
    IF cardinality(missing_ids)>0 THEN
      UPDATE authz.role SET status='suspended',updated_by=r.created_by WHERE tenant_id=r.tenant_id AND id=r.id;
      INSERT INTO authz.role_permission(tenant_id,role_id,permission_id,created_by)
        SELECT r.tenant_id,r.id,unnest(missing_ids),r.created_by;
      UPDATE authz.role SET status='active',updated_by=r.created_by WHERE tenant_id=r.tenant_id AND id=r.id;
    END IF;
  END LOOP;
END $refresh$;
SET CONSTRAINTS ALL IMMEDIATE;
SELECT json_build_object('plane','${plane}','added',count(*),'permissions',coalesce(json_agg(refresh_receipt ORDER BY tenant,role,permission),'[]'::json)) FROM refresh_receipt;
${commit ? "COMMIT" : "ROLLBACK"};`;
}
function query(plane, commit) {
  return JSON.parse(execFileSync("docker", ["exec", "-i", container, "sh", "-c",
    'exec psql -X -qAt -U "$POSTGRES_USER" -d "$1" -v ON_ERROR_STOP=1', "sh", `athyper_${plane}`],
  { input: refreshSql(plane, commit), encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }));
}
function main() {
  const args=process.argv.slice(2);
  if(args.length!==1 || !["--check","--confirm=DEV-REFRESH-TEST-ADMIN-PERMISSIONS"].includes(args[0])) throw Error("Use --check or --confirm=DEV-REFRESH-TEST-ADMIN-PERMISSIONS");
  assertDevContainer(JSON.parse(execFileSync("docker",["inspect",container],{encoding:"utf8"}))[0]);
  for(const plane of planes) console.log(JSON.stringify({stage:"rollback-check",...query(plane,false)}));
  if(args[0]==="--check")return;
  for(const plane of planes) console.log(JSON.stringify({stage:"committed",...query(plane,true)}));
  for(const plane of planes) {
    const result=query(plane,false);
    if(result.added!==0)throw Error(`Reconciliation not idempotent: ${plane}`);
    console.log(JSON.stringify({stage:"verified",...result}));
  }
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href)
  try{main();}catch(error){console.error(error.stderr?.toString()||error.message);process.exitCode=1;}
