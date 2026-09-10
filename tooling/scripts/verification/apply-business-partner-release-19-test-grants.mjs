/** Apply only the exact separately approved temporary grant proposal. */
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
if(process.argv.length!==3||process.argv[2]!=='--apply')throw Error('Explicit --apply required');
const path='governance/policy/reviews/business-partner-release-19-test-grants.proposal.dev.json';
const packet=JSON.parse(readFileSync(path)),{proposalRevision,...body}=packet;
if(createHash('sha256').update(JSON.stringify(body)).digest('hex')!==proposalRevision||packet.environment!=='dev'||packet.plane!=='neon'||packet.approval!==null||packet.activationAuthorized!==false||Date.parse(packet.effectiveUntil)<=Date.now())throw Error('Invalid proposal');
const approval=JSON.parse(readFileSync('governance/policy/reviews/business-partner-release-19-test-grants.approval.dev.json'));
const rehearsal=JSON.parse(readFileSync('governance/policy/reports/business-partner-release-19-test-grants-dry-run.dev.json'));
if(approval.kind!=='explicit_user_temporary_test_grant_approval'||approval.source?.exactMessage!=='go ahead with catl.admin'||approval.grantChangesAuthorized!==true||approval.activationAuthorized!==false||
approval.proposalRevision!==proposalRevision||approval.proposalSha256!==createHash('sha256').update(readFileSync(path)).digest('hex')||
approval.principalId!==packet.assignments[0].principalId||approval.effectiveUntil!==packet.effectiveUntil||JSON.stringify(approval.approvedAssignmentIds)!==JSON.stringify(packet.assignments.map(a=>a.id))||
rehearsal.proposalRevision!==proposalRevision||!rehearsal.rollbackConfirmed||!rehearsal.existingAuthorityUnchanged||Date.parse(packet.effectiveFrom)>Date.now())throw Error('Exact current grant approval and rehearsal required');
const lit=x=>"'"+String(x).replaceAll("'","''")+"'";
const tenant=lit(packet.tenantId),start=lit(packet.effectiveFrom),end=lit(packet.effectiveUntil);
let sql=`BEGIN;
SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='30s';
SELECT set_config('app.current_tenant_id',${tenant},true);
SELECT pg_advisory_xact_lock(hashtextextended('bp-release19-test-grants:'||${tenant},0));
CREATE TEMP TABLE prior_authority(table_name text,id uuid,row_data jsonb) ON COMMIT DROP;
DO $capture$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['role','role_permission','principal_group','group_member','group_role','scope_target','deny_rule','delegation','delegation_grant','override','record_acl'] LOOP EXECUTE format('INSERT INTO prior_authority SELECT %L,id,to_jsonb(r) FROM authz.%I r',t,t);END LOOP;END $capture$;
`;
for(const a of packet.assignments){
 const role=lit(a.roleId),group=lit(a.groupId),principal=lit(a.principalId),kind=lit(a.scopeKind),target=lit(a.targetId);
 const values=a.permissions.map(p=>`(${lit(p.id)}::uuid,${lit(p.code)})`).join(',');
 sql+=`DO $rehearse$ DECLARE actor uuid; scope uuid; n integer; BEGIN
SELECT id INTO STRICT actor FROM master.principal WHERE tenant_id=${tenant}::uuid AND code='seed.three-plane-provisioner' AND principal_type='service_account' AND status='active';
IF NOT EXISTS(SELECT 1 FROM master.principal p JOIN authz.plane_membership pm ON pm.principal_id=p.id AND pm.tenant_id=p.tenant_id WHERE p.id=${principal}::uuid AND p.tenant_id=${tenant}::uuid AND p.code=${lit(a.account)} AND p.status='active' AND pm.status='active' AND (pm.effective_until IS NULL OR pm.effective_until>now())) THEN RAISE EXCEPTION 'Expected active principal admission missing';END IF;
SELECT id INTO STRICT scope FROM authz.scope_target WHERE tenant_id=${tenant}::uuid AND scope_kind=${kind} AND target_id=${target}::uuid AND status='active';
SELECT count(*) INTO n FROM (VALUES ${values}) v(id,code) JOIN authz.permission p ON p.id=v.id AND p.canonical_code=v.code AND p.status='published' WHERE EXISTS(SELECT 1 FROM authz.permission_scope_kind s WHERE s.permission_id=p.id AND s.status='active' AND s.scope_kind=${kind});
IF n<>${a.permissions.length} THEN RAISE EXCEPTION 'Permission/scope compatibility changed';END IF;
IF EXISTS(SELECT 1 FROM authz.role WHERE id=${role}::uuid OR (tenant_id=${tenant}::uuid AND code=${lit(a.code)})) OR EXISTS(SELECT 1 FROM authz.principal_group WHERE id=${group}::uuid OR (tenant_id=${tenant}::uuid AND code=${lit(a.code)})) THEN RAISE EXCEPTION 'Qualification identity collision';END IF;
INSERT INTO authz.role(id,tenant_id,code,name,role_kind,source_type,source_ref,metadata,status,created_by) VALUES(${role}::uuid,${tenant}::uuid,${lit(a.code)},'BP release 19 temporary qualification','custom','manual',${lit(proposalRevision)},jsonb_build_object('qualificationProposal',${lit(proposalRevision)}),'draft',actor);
INSERT INTO authz.role_permission(tenant_id,role_id,permission_id,created_by) SELECT ${tenant}::uuid,${role}::uuid,v.id,actor FROM (VALUES ${values}) v(id,code);
UPDATE authz.role SET status='active',status_changed_at=now(),status_changed_by=actor WHERE id=${role}::uuid;
INSERT INTO authz.principal_group(id,tenant_id,code,name,group_kind,source_type,source_ref,metadata,status,created_by) VALUES(${group}::uuid,${tenant}::uuid,${lit(a.code)},'BP release 19 temporary qualification','custom','manual',${lit(proposalRevision)},jsonb_build_object('qualificationProposal',${lit(proposalRevision)}),'active',actor);
INSERT INTO authz.group_member(tenant_id,group_id,principal_id,source_type,source_ref,status,effective_from,effective_until,created_by) VALUES(${tenant}::uuid,${group}::uuid,${principal}::uuid,'manual',${lit(proposalRevision)},'active',${start}::timestamptz,${end}::timestamptz,actor);
INSERT INTO authz.group_role(tenant_id,group_id,role_id,scope_target_id,propagation_mode,source_type,source_ref,status,effective_from,effective_until,created_by) VALUES(${tenant}::uuid,${group}::uuid,${role}::uuid,scope,'exact','manual',${lit(proposalRevision)},'active',${start}::timestamptz,${end}::timestamptz,actor);
END $rehearse$;`;
}
sql+=`SET CONSTRAINTS ALL IMMEDIATE;
DO $verify$ DECLARE r record; current_row jsonb; BEGIN FOR r IN SELECT * FROM prior_authority LOOP EXECUTE format('SELECT to_jsonb(x) FROM authz.%I x WHERE id=$1',r.table_name) INTO current_row USING r.id;IF current_row IS DISTINCT FROM r.row_data THEN RAISE EXCEPTION 'Existing authority changed';END IF;END LOOP;END $verify$;
SELECT jsonb_build_object('proposalRevision',${lit(proposalRevision)},'assignments',3,'rolePermissions',33,'existingAuthorityUnchanged',true,'effectiveFrom',${start},'effectiveUntil',${end});
COMMIT;`;
const output=execFileSync('docker',['exec','-i','athyper-dev-db-1','psql','-X','-U','postgres','-d','athyper_neon','-At','-v','ON_ERROR_STOP=1'],{input:sql,encoding:'utf8',maxBuffer:2000000});
if(!output.trim().endsWith('COMMIT'))throw Error('Commit not confirmed');
const receipt=JSON.parse(output.split('\n').find(l=>l.startsWith('{')));
const report={schemaVersion:1,kind:'bp_release_19_test_grants_applied',checkedAt:new Date().toISOString(),...receipt,committed:true,grantsChanged:true,activationAuthorized:false,approvalRecorded:true,approvalReference:approval.reference};
writeFileSync('governance/policy/reports/business-partner-release-19-test-grants-applied.dev.json',JSON.stringify(report,null,2)+'\n');
console.log(report);
