#!/usr/bin/env node
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
function uuid(name,namespace="6ba7b810-9dad-11d1-80b4-00c04fd430c8"){const b=createHash("sha1").update(Buffer.from(namespace.replaceAll("-",""),"hex")).update(name).digest().subarray(0,16);b[6]=(b[6]&15)|80;b[8]=(b[8]&63)|128;const h=b.toString("hex");return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;}
const tenant="11111111-1111-4111-8111-111111111111",company="7e0e3d2c-c5fc-5960-b4c3-80153c1e95a7",actor="d4250b08-6e5e-5887-b4e1-6f3eb31d7c8c",source="local-workforce-stage1:v1",role=uuid(`${source}:role`),group=uuid(`${source}:group`);
const sql=`BEGIN;
SELECT set_config('app.database_plane','neon',true),set_config('app.current_tenant_id','${tenant}',true),set_config('app.current_principal_id','${actor}',true);
DO $$ BEGIN IF current_database()<>'athyper_neon' OR NOT EXISTS(SELECT 1 FROM master.tenant WHERE id='${tenant}' AND status='active') THEN RAISE EXCEPTION 'Local Workforce tenant mismatch'; END IF; END $$;
INSERT INTO authz.role(id,tenant_id,code,name,description,role_kind,source_type,source_ref,metadata,status,created_by) VALUES('${role}','${tenant}','local.workforce.reader','Local Workforce reader','Employee 360 Stage 1 local verification role','system','seed','${source}','{}','draft','${actor}') ON CONFLICT DO NOTHING;
INSERT INTO authz.role_permission(id,tenant_id,role_id,permission_id,created_by) SELECT '${uuid(`${source}:permission`)}','${tenant}','${role}',id,'${actor}' FROM authz.permission WHERE canonical_code='neon.workforce.read' AND status='published' ON CONFLICT DO NOTHING;
UPDATE authz.role SET status='active' WHERE id='${role}' AND status='draft';
INSERT INTO authz.principal_group(id,tenant_id,code,name,description,group_kind,source_type,source_ref,metadata,status,created_by) VALUES('${group}','${tenant}','local.workforce.readers','Local Workforce readers','Selected Stage 1 verification actors','system','seed','${source}','{}','active','${actor}') ON CONFLICT DO NOTHING;
INSERT INTO authz.group_member(id,tenant_id,group_id,principal_id,source_type,source_ref,metadata,status,created_by) SELECT '${uuid(`${source}:member:athyper.admin`)}','${tenant}','${group}',id,'seed','${source}','{}','active','${actor}' FROM master.principal WHERE tenant_id='${tenant}' AND code='athyper.admin' AND status='active' ON CONFLICT DO NOTHING;
INSERT INTO authz.group_role(id,tenant_id,group_id,role_id,scope_target_id,propagation_mode,source_type,source_ref,metadata,status,created_by) SELECT '${uuid(`${source}:grant`)}','${tenant}','${group}','${role}',id,'exact','seed','${source}','{}','active','${actor}' FROM authz.scope_target WHERE tenant_id='${tenant}' AND scope_kind='company_code' AND target_id='${company}' AND status='active' ON CONFLICT DO NOTHING;
DO $$ BEGIN IF (SELECT count(*) FROM authz.role_permission WHERE role_id='${role}')<>1 OR (SELECT count(*) FROM authz.group_member WHERE group_id='${group}' AND status='active')<>1 OR (SELECT count(*) FROM authz.group_role WHERE group_id='${group}' AND status='active')<>1 THEN RAISE EXCEPTION 'Local Workforce authority verification failed'; END IF; END $$;
COMMIT;`;
const result=spawnSync("docker",["exec","-i","athyper-dev-db-1","psql","-U","postgres","-d","athyper_neon","-X","-v","ON_ERROR_STOP=1"],{input:sql,encoding:"utf8"});
if(result.status!==0){process.stderr.write(result.stderr);process.exit(result.status??1);}
console.log(JSON.stringify({status:"applied",tenant,company,allowed:"athyper.admin",denied:"athyper.owner",permission:"neon.workforce.read"}));
