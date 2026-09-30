import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const apply=process.argv.includes('--apply');if(process.argv.slice(2).some(x=>x!=='--apply'))throw Error('Use --apply or no arguments for rollback rehearsal');
const packet=JSON.parse(readFileSync('docs/examples/atlas-f5/cirrus-role-assignments.json','utf8'));
if(packet.environment!=='dev'||packet.tenantId!=='44444444-4444-4444-8444-444444444444'||Date.parse(packet.expiresAt)<=Date.now())throw Error('Invalid or expired assignment scope');
const hash=createHash('sha256').update(JSON.stringify(packet)).digest('hex');const lit=x=>"'"+String(x).replaceAll("'","''")+"'";
const receipts=[];const path=`docs/examples/atlas-f5/cirrus-role-assignments.${apply?'applied':'rehearsal'}.json`;
const save=complete=>writeFileSync(path,JSON.stringify({observedAt:new Date().toISOString(),applied:apply,complete,packetSha256:hash,receipts},null,2)+'\n');
for(const plane of ['studio','neon']){
 const assignments=packet.assignments.filter(a=>a.plane===plane);
 const actor=execFileSync('docker',['exec','athyper-dev-db-1','psql','-X','-U','postgres','-d','athyper_'+plane,'-At','-c',`SELECT id FROM master.principal WHERE tenant_id='${packet.tenantId}' AND code='seed.three-plane-provisioner' AND principal_type='service_account'`],{encoding:'utf8'}).trim();
 if(!/^[0-9a-f-]{36}$/.test(actor))throw Error('Tenant bootstrap service principal missing');
 let sql=`BEGIN;SELECT set_config('application_name','atlas-enablement-operator-bootstrap',true),set_config('app.current_tenant_id',${lit(packet.tenantId)},true),set_config('app.current_principal_id',${lit(actor)},true),set_config('app.current_actor_type','service_account',true);
CREATE TEMP TABLE prior_rows(table_name text,id uuid,row_data jsonb) ON COMMIT DROP;
DO $capture$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['role','role_permission','principal_group','group_member','group_role','scope_target','deny_rule','delegation','delegation_grant','override','record_acl'] LOOP EXECUTE format('INSERT INTO prior_rows SELECT %L,id,to_jsonb(r) FROM authz.%I r',t,t); END LOOP; END $capture$;
`;
 for(const a of assignments){const tenant=lit(packet.tenantId),role=lit(a.roleId),group=lit(a.groupId),principal=lit(a.principalId),scope=lit(a.scopeId),expires=lit(packet.expiresAt),code=lit(a.code),codes=a.permissions.map(lit).join(',');
 sql+=`DO $assign$ DECLARE existing_hash text; p_count int; root_id uuid; BEGIN
IF NOT EXISTS(SELECT 1 FROM master.principal p JOIN authz.plane_membership pm ON pm.principal_id=p.id AND pm.tenant_id=p.tenant_id WHERE p.id=${principal}::uuid AND p.tenant_id=${tenant}::uuid AND p.code=${lit(a.user)} AND pm.status='active' AND (pm.effective_until IS NULL OR pm.effective_until>now())) THEN RAISE EXCEPTION 'Expected active named principal admission missing'; END IF;
SELECT count(*) INTO p_count FROM authz.permission WHERE canonical_code IN (${codes}) AND status='published';IF p_count<>${a.permissions.length} THEN RAISE EXCEPTION 'Published permission missing';END IF;
SELECT metadata->>'atlasAssignmentSha256' INTO existing_hash FROM authz.role WHERE id=${role}::uuid;
IF FOUND THEN IF existing_hash IS DISTINCT FROM ${lit(hash)} OR NOT EXISTS(SELECT 1 FROM authz.role WHERE id=${role}::uuid AND status='active' AND tenant_id=${tenant}::uuid) THEN RAISE EXCEPTION 'Existing assignment conflict'; END IF;
ELSE
SELECT id INTO root_id FROM authz.scope_target WHERE tenant_id=${tenant}::uuid AND scope_kind='tenant' AND target_id=${tenant}::uuid AND status='active';IF root_id IS NULL THEN RAISE EXCEPTION 'Tenant root scope missing'; END IF;
${a.scopeKind==='resource'?`INSERT INTO authz.scope_target(id,tenant_id,scope_kind,scope_key,target_id,parent_scope_target_id,display_name,status,created_by) VALUES(${scope}::uuid,${tenant}::uuid,'resource',${lit('attachment:'+a.targetId)},${lit(a.targetId)}::uuid,root_id,'Atlas synthetic document','active',${lit(actor)});`:''}
INSERT INTO authz.role(id,tenant_id,code,name,role_kind,source_type,source_ref,metadata,status,created_by) VALUES(${role}::uuid,${tenant}::uuid,${code},${lit(a.name)},'custom','manual',${lit(hash)},jsonb_build_object('atlasAssignmentSha256',${lit(hash)}),'draft',${lit(actor)});
INSERT INTO authz.role_permission(tenant_id,role_id,permission_id,created_by) SELECT ${tenant}::uuid,${role}::uuid,id,${lit(actor)} FROM authz.permission WHERE canonical_code IN (${codes});
UPDATE authz.role SET status='active',status_changed_at=now(),status_changed_by=${lit(actor)} WHERE id=${role}::uuid;
INSERT INTO authz.principal_group(id,tenant_id,code,name,group_kind,source_type,source_ref,metadata,status,created_by) VALUES(${group}::uuid,${tenant}::uuid,${code},${lit(a.name)},'custom','manual',${lit(hash)},jsonb_build_object('atlasAssignmentSha256',${lit(hash)}),'active',${lit(actor)});
INSERT INTO authz.group_member(tenant_id,group_id,principal_id,source_type,source_ref,status,effective_until,created_by) VALUES(${tenant}::uuid,${group}::uuid,${principal}::uuid,'manual',${lit(hash)},'active',${expires}::timestamptz,${lit(actor)});
INSERT INTO authz.group_role(tenant_id,group_id,role_id,scope_target_id,propagation_mode,source_type,source_ref,status,effective_until,created_by) VALUES(${tenant}::uuid,${group}::uuid,${role}::uuid,${a.scopeKind==='resource'?scope+'::uuid':'root_id'},'exact','manual',${lit(hash)},'active',${expires}::timestamptz,${lit(actor)});
END IF;
IF (SELECT count(*) FROM authz.role_permission WHERE role_id=${role}::uuid)<>${a.permissions.length} OR EXISTS(SELECT 1 FROM authz.role_permission rp JOIN authz.permission p ON p.id=rp.permission_id WHERE rp.role_id=${role}::uuid AND p.canonical_code NOT IN (${codes})) OR (SELECT count(*) FROM authz.group_member WHERE group_id=${group}::uuid)<>1 OR NOT EXISTS(SELECT 1 FROM authz.group_member WHERE group_id=${group}::uuid AND principal_id=${principal}::uuid AND status='active' AND effective_until=${expires}::timestamptz) OR (SELECT count(*) FROM authz.group_role WHERE group_id=${group}::uuid)<>1 OR NOT EXISTS(SELECT 1 FROM authz.group_role gr JOIN authz.scope_target st ON st.id=gr.scope_target_id WHERE gr.group_id=${group}::uuid AND gr.role_id=${role}::uuid AND gr.status='active' AND gr.propagation_mode='exact' AND gr.effective_until=${expires}::timestamptz AND st.scope_kind=${lit(a.scopeKind)} AND st.target_id=${lit(a.targetId)}::uuid) THEN RAISE EXCEPTION 'Assignment verification failed';END IF;
END $assign$;
`;
 }
 sql+=`SET CONSTRAINTS ALL IMMEDIATE;DO $verify$ DECLARE t record; actual jsonb; BEGIN FOR t IN SELECT * FROM prior_rows LOOP EXECUTE format('SELECT to_jsonb(r) FROM authz.%I r WHERE id=$1',t.table_name) INTO actual USING t.id; IF actual IS DISTINCT FROM t.row_data THEN RAISE EXCEPTION 'Existing authority changed: %',t.table_name; END IF;END LOOP;END $verify$;
SELECT jsonb_build_object('plane',${lit(plane)},'assignments',${assignments.length},'existingAuthorityRowsUnchanged',true,'expiresAt',${lit(packet.expiresAt)});${apply?'COMMIT':'ROLLBACK'};`;
 const output=execFileSync('docker',['exec','-i','athyper-dev-db-1','psql','-X','-U','postgres','-d','athyper_'+plane,'-At','-v','ON_ERROR_STOP=1'],{input:sql,encoding:'utf8',maxBuffer:2e6});const line=output.split('\n').find(l=>l.startsWith('{'));if(!line)throw Error('Missing assignment receipt');receipts.push(JSON.parse(line));save(false);
}
save(true);console.log(JSON.stringify({applied:apply,receipts}));
