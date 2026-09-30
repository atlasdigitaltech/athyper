/** Revoke only this proposal's new memberships and assignments. Default is rollback rehearsal. */
import{readFileSync,writeFileSync}from'node:fs';import{execFileSync}from'node:child_process';import{createHash}from'node:crypto';
const apply=process.argv[2]==='--revoke';if(process.argv.slice(2).some(x=>x!=='--revoke'))throw Error('Use no arguments or --revoke');
const bytes=readFileSync('governance/policy/reviews/business-partner-release-19-test-grants.proposal.dev.json'),p=JSON.parse(bytes),approval=JSON.parse(readFileSync('governance/policy/reviews/business-partner-release-19-test-grants.approval.dev.json'));
if(approval.proposalSha256!==createHash('sha256').update(bytes).digest('hex')||!approval.grantChangesAuthorized||approval.activationAuthorized!==false)throw Error('Exact approved cleanup scope required');
const lit=x=>"'"+String(x).replaceAll("'","''")+"'",groups=p.assignments.map(a=>lit(a.groupId)+'::uuid').join(','),tenant=lit(p.tenantId),revision=lit(p.proposalRevision);
const sql=`BEGIN;SET LOCAL lock_timeout='3s';SELECT pg_advisory_xact_lock(hashtextextended('bp-release19-test-grants:'||${tenant},0));
DO $revoke$ DECLARE actor uuid; BEGIN
SELECT id INTO STRICT actor FROM master.principal WHERE tenant_id=${tenant}::uuid AND code='seed.three-plane-provisioner' AND principal_type='service_account' AND status='active';
IF (SELECT count(*) FROM authz.principal_group WHERE id IN (${groups}) AND tenant_id=${tenant}::uuid AND source_ref=${revision})<>3 THEN RAISE EXCEPTION 'Qualification cleanup ownership mismatch'; END IF;
IF EXISTS(SELECT 1 FROM authz.group_member WHERE group_id IN (${groups}) AND (tenant_id<>${tenant}::uuid OR source_ref IS DISTINCT FROM ${revision} OR principal_id<>${lit(p.assignments[0].principalId)}::uuid)) OR EXISTS(SELECT 1 FROM authz.group_role WHERE group_id IN (${groups}) AND (tenant_id<>${tenant}::uuid OR source_ref IS DISTINCT FROM ${revision})) THEN RAISE EXCEPTION 'Unexpected membership/assignment, stop cleanup';END IF;
UPDATE authz.group_member SET status='revoked',status_changed_at=now(),status_changed_by=actor,updated_at=now(),updated_by=actor WHERE tenant_id=${tenant}::uuid AND group_id IN (${groups}) AND source_ref=${revision} AND status<>'revoked';
UPDATE authz.group_role SET status='revoked',status_changed_at=now(),status_changed_by=actor,updated_at=now(),updated_by=actor WHERE tenant_id=${tenant}::uuid AND group_id IN (${groups}) AND source_ref=${revision} AND status<>'revoked';
END $revoke$;SET CONSTRAINTS ALL IMMEDIATE;
SELECT jsonb_build_object('membershipsRevoked',(SELECT count(*) FROM authz.group_member WHERE group_id IN (${groups}) AND status='revoked'),'assignmentsRevoked',(SELECT count(*) FROM authz.group_role WHERE group_id IN (${groups}) AND status='revoked'));
${apply?'COMMIT':'ROLLBACK'};`;
const out=execFileSync('docker',['exec','-i','athyper-bp-r19-db','psql','-X','-U','postgres','-d','athyper_neon','-At','-v','ON_ERROR_STOP=1'],{input:sql,encoding:'utf8'});
if(!out.trim().endsWith(apply?'COMMIT':'ROLLBACK'))throw Error('Cleanup transaction outcome unconfirmed');
const counts=JSON.parse(out.split('\n').find(l=>l.startsWith('{')));if(counts.membershipsRevoked!==3||counts.assignmentsRevoked!==3)throw Error('Cleanup coverage incomplete');
const report={schemaVersion:1,kind:'bp_release_19_isolated_test_grant_cleanup',capturedAt:new Date().toISOString(),proposalRevision:p.proposalRevision,...counts,applied:apply,rollbackRehearsal:!apply,oldGrantsRestored:false,activationAuthorized:false,isolatedOnly:true,sharedDevChanged:false};
writeFileSync('governance/policy/reports/business-partner-release-19-isolated-test-grants-cleanup.'+(apply?'applied':'rehearsal')+'.dev.json',JSON.stringify(report,null,2)+'\n');console.log(report);
