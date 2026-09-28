#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { assertDevContainer } from "./setup-dev-test-admin.mjs";

const source = "dev:publication-authority:v1";
const codes = ["studio.metadata.publication_policy.create", "studio.metadata.publication_policy.activate", "studio.metadata.contract.publish_automated"];
export function buildAuthoritySql(tenantCode, commit = false, workloadsOnly = false) {
  if (!["athyper", "cirrusatlantic"].includes(tenantCode)) throw Error("Explicit DEV authority tenant required");
  const catalog = readFileSync(new URL("../../../ddl/planes/studio/authz/18_publication_policy_permissions.sql", import.meta.url), "utf8");
  const fingerprint = createHash("sha256").update(JSON.stringify({ source, tenantCode, codes, catalog, ...(workloadsOnly ? { workloadsOnly: true } : {}) })).digest("hex");
  return `BEGIN;
SET LOCAL app.database_plane='studio';
SET LOCAL app.current_plane_key='studio';
DO $$ BEGIN IF current_database()<>'athyper_studio' THEN RAISE EXCEPTION 'Wrong database'; END IF; END $$;
${catalog}
INSERT INTO master.audit_event_contract(code,event_code_pattern,priority,allowed_operations,default_severity,allowed_actor_types,allowed_scope,reason_required,capture_mode,max_payload_bytes,schema_version,metadata,status)
VALUES('metadata_publication_policy','^metadata\\.publication\\.policy\\.(proposed|activated)$',24,ARRAY['execute']::audit.operation_d[],'critical',ARRAY['user']::audit.actor_type_d[],'tenant',false,'metadata',16384,1,'{"owner":"publication","purpose":"independent_machine_policy_enrollment"}'::jsonb,'active')
ON CONFLICT(code) DO NOTHING;
DO $grants$
DECLARE t record; r record; actor uuid; role_uuid uuid; group_uuid uuid; principal_uuid uuid; scope_uuid uuid; owned text; state text; expected uuid[]; actual uuid[];
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('${source}',0));
  -- Previously approved test-admin groups only; no new human memberships.
  FOR t IN SELECT id,code FROM master.tenant WHERE code IN ('athyper','cirrusatlantic') AND status='active' ${workloadsOnly ? "AND false /* workload-only mode never modifies human roles */" : ""} LOOP
    SELECT id INTO STRICT actor FROM master.principal WHERE tenant_id=t.id AND code='seed.three-plane-provisioner' AND status='active';
    PERFORM set_config('app.current_tenant_id',t.id::text,true);
    PERFORM set_config('app.current_principal_id',actor::text,true);
    SELECT id INTO STRICT role_uuid FROM authz.role WHERE tenant_id=t.id AND code='test.full_admin' AND source_ref='dev:test-full-admin:v1' AND status='active';
    UPDATE authz.role SET status='suspended',updated_by=actor WHERE id=role_uuid AND tenant_id=t.id;
    INSERT INTO authz.role_permission(tenant_id,role_id,permission_id,created_by)
    SELECT t.id,role_uuid,id,actor FROM authz.permission WHERE canonical_code IN ('${codes.join("','")}') AND status='published'
    ON CONFLICT(tenant_id,role_id,permission_id) DO NOTHING;
    UPDATE authz.role SET status='active',updated_by=actor WHERE id=role_uuid AND tenant_id=t.id;
  END LOOP;
  SELECT id INTO STRICT t FROM master.tenant WHERE code='${tenantCode}' AND status='active';
  SELECT id INTO STRICT actor FROM master.principal WHERE tenant_id=t.id AND code='seed.three-plane-provisioner' AND status='active';
  PERFORM set_config('app.current_tenant_id',t.id::text,true);
  PERFORM set_config('app.current_principal_id',actor::text,true);
  SELECT id INTO STRICT scope_uuid FROM authz.scope_target WHERE tenant_id=t.id AND scope_kind='tenant' AND target_id=t.id AND status='active';
  FOR r IN SELECT * FROM (VALUES
    ('author',ARRAY['studio.metadata.contract.edit','studio.metadata.contract.submit']),
    ('publisher',ARRAY['studio.metadata.contract.review','studio.metadata.contract.publish_automated'])
  ) AS workload(kind,permissions) LOOP
    SELECT id INTO STRICT principal_uuid FROM master.principal WHERE tenant_id=t.id AND code='dev.metadata.'||r.kind
      AND principal_type='service_account' AND provisioning_source='internal' AND status='active';
    INSERT INTO authz.plane_membership(tenant_id,principal_id,membership_kind,source_type,source_ref,status,metadata,created_by)
    SELECT t.id,principal_uuid,'service','manual','${source}','active','{"environment":"dev"}',actor
    WHERE NOT EXISTS(SELECT 1 FROM authz.plane_membership WHERE tenant_id=t.id AND principal_id=principal_uuid);
    IF NOT EXISTS(SELECT 1 FROM authz.plane_membership WHERE tenant_id=t.id AND principal_id=principal_uuid
      AND membership_kind='service' AND status='active' AND effective_from<=now() AND effective_until IS NULL)
      THEN RAISE EXCEPTION 'Workload plane admission unavailable'; END IF;
    SELECT array_agg(id ORDER BY id) INTO expected FROM authz.permission WHERE canonical_code=ANY(r.permissions) AND status='published';
    IF cardinality(expected) IS DISTINCT FROM cardinality(r.permissions) THEN RAISE EXCEPTION 'Workload permission missing'; END IF;
    INSERT INTO authz.role(tenant_id,code,name,description,role_kind,source_type,source_ref,metadata,status,created_by)
    VALUES(t.id,'dev.publication.'||r.kind,'DEV publication '||r.kind,'Exact DEV machine policy required','custom','manual','${source}','{"environment":"dev"}','draft',actor)
    ON CONFLICT(tenant_id,code) DO NOTHING;
    SELECT id,source_ref,status INTO STRICT role_uuid,owned,state FROM authz.role WHERE tenant_id=t.id AND code='dev.publication.'||r.kind;
    IF owned IS DISTINCT FROM '${source}' OR state NOT IN ('draft','active') THEN RAISE EXCEPTION 'Unmanaged workload role'; END IF;
    IF state='draft' THEN
      INSERT INTO authz.role_permission(tenant_id,role_id,permission_id,created_by) SELECT t.id,role_uuid,unnest(expected),actor;
      UPDATE authz.role SET status='active',updated_by=actor WHERE id=role_uuid AND tenant_id=t.id;
    END IF;
    SELECT array_agg(permission_id ORDER BY permission_id) INTO actual FROM authz.role_permission WHERE role_id=role_uuid AND tenant_id=t.id;
    IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Workload role permission drift'; END IF;
    INSERT INTO authz.principal_group(tenant_id,code,name,group_kind,source_type,source_ref,metadata,status,created_by)
    VALUES(t.id,'dev.publication.'||r.kind,'DEV publication '||r.kind,'custom','manual','${source}','{"environment":"dev"}','active',actor)
    ON CONFLICT(tenant_id,code) DO NOTHING;
    SELECT id,source_ref INTO STRICT group_uuid,owned FROM authz.principal_group WHERE tenant_id=t.id AND code='dev.publication.'||r.kind AND status='active';
    IF owned IS DISTINCT FROM '${source}' THEN RAISE EXCEPTION 'Unmanaged workload group'; END IF;
    INSERT INTO authz.group_member(tenant_id,group_id,principal_id,source_type,source_ref,status,created_by)
    SELECT t.id,group_uuid,principal_uuid,'manual','${source}','active',actor
    WHERE NOT EXISTS(SELECT 1 FROM authz.group_member WHERE tenant_id=t.id AND group_id=group_uuid AND principal_id=principal_uuid);
    IF (SELECT count(*) FROM authz.group_member WHERE tenant_id=t.id AND group_id=group_uuid)<>1
      OR NOT EXISTS(SELECT 1 FROM authz.group_member WHERE tenant_id=t.id AND group_id=group_uuid AND principal_id=principal_uuid
        AND status='active' AND source_ref='${source}' AND effective_from<=now() AND effective_until IS NULL) THEN RAISE EXCEPTION 'Workload group membership drift'; END IF;
    INSERT INTO authz.group_role(tenant_id,group_id,role_id,scope_target_id,propagation_mode,source_type,source_ref,status,created_by)
    SELECT t.id,group_uuid,role_uuid,scope_uuid,'exact','manual','${source}','active',actor
    WHERE NOT EXISTS(SELECT 1 FROM authz.group_role WHERE tenant_id=t.id AND group_id=group_uuid);
    IF (SELECT count(*) FROM authz.group_role WHERE tenant_id=t.id AND group_id=group_uuid)<>1
      OR NOT EXISTS(SELECT 1 FROM authz.group_role WHERE tenant_id=t.id AND group_id=group_uuid AND role_id=role_uuid AND scope_target_id=scope_uuid
        AND propagation_mode='exact' AND status='active' AND source_ref='${source}' AND effective_from<=now() AND effective_until IS NULL) THEN RAISE EXCEPTION 'Workload group assignment drift'; END IF;
  END LOOP;
  INSERT INTO event.command_execution(tenant_id,command_code,idempotency_key,request_fingerprint,status,actor_principal_id,source_service,result_payload,started_at,completed_at,created_by)
  SELECT t.id,'studio.publication_authority.provision','${fingerprint}','${fingerprint}','succeeded',actor,'dev-maintenance',
    '{"catalogPermissions":3,"workloadRoles":2,"humanGrantGroups":${workloadsOnly ? 0 : 2},"policyEnrollment":false,"releaseActivation":false}',now(),now(),actor
  WHERE NOT EXISTS(SELECT 1 FROM event.command_execution WHERE tenant_id=t.id AND command_code='studio.publication_authority.provision' AND idempotency_key='${fingerprint}');
END $grants$;
SET CONSTRAINTS ALL IMMEDIATE;
SELECT json_build_object('mode','${commit ? "committed" : "rolled_back"}','authorityTenant','${tenantCode}','catalogPermissions',3,'workloadRoles',2,'humanGrantGroups',${workloadsOnly ? 0 : 2},'policyEnrollment',false,'activation',false);
${commit ? "COMMIT" : "ROLLBACK"};`;
}
export function main(args = process.argv.slice(2)) {
  const tenant = args.find(value => value.startsWith("--tenant="))?.slice(9);
  const commit = args.includes("--confirm=DEV-PUBLICATION-AUTHORITY");
  if (args.some(value => !value.startsWith("--tenant=") && value !== "--check" && value !== "--workloads-only" && value !== "--confirm=DEV-PUBLICATION-AUTHORITY")) throw Error("Unknown argument");
  const container = JSON.parse(execFileSync("docker", ["inspect", "athyper-dev-db-1"], { encoding: "utf8" }))[0];
  assertDevContainer(container);
  const output = execFileSync("docker", ["exec", "-i", "athyper-dev-db-1", "sh", "-c", 'exec psql -X -qAt -U "$POSTGRES_USER" -d athyper_studio -v ON_ERROR_STOP=1'],
    { input: buildAuthoritySql(tenant, commit, args.includes("--workloads-only")), encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
  console.log(output.trim());
}
if (process.argv[1] && fileURLToPath(import.meta.url) === fileURLToPath(pathToFileURL(process.argv[1])))
  try { main(); } catch (error) { console.error(error.stderr?.toString() || error.message); process.exitCode = 1; }
