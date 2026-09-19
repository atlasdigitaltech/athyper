// Read-only, named DEV membership proposal and complete authorization-row fingerprints.
// No apply mode; existing administrator memberships never become stewardship assignments.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
const [environment, output] = process.argv.slice(2);
if (!['dev', 'qa', 'stg'].includes(environment) || !output) throw new Error('Usage: review-business-partner-roles.mjs <dev|qa|stg> <output.json>');
function query(statement) {
 const result = execFileSync('docker', ['exec', `athyper-${environment}-db-1`, 'psql', '-X', '-U', 'postgres', '-d', 'athyper_neon', '-At', '-v', 'ON_ERROR_STOP=1', '-c', `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SET LOCAL statement_timeout='15s'; ${statement}; COMMIT;`], {encoding:'utf8', timeout:20000,maxBuffer:8_000_000});
 return JSON.parse(result.split('\n').find(line => line.startsWith('{')) ?? 'null');
}
const tables = ['plane_membership','role','permission','role_permission','principal_group','group_member','group_role','scope_target','deny_rule','delegation','delegation_grant','override','record_acl'];
const data = query(`SELECT jsonb_build_object(
 'candidates', (SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.role_code,c.principal_id,c.scope_target_id),'[]'::jsonb) FROM (
   SELECT DISTINCT gr.tenant_id,t.code tenant_code,t.name tenant_name,gm.principal_id,pr.code principal_code,pr.name principal_name,pr.status principal_status,pr.auth_epoch principal_auth_epoch,gr.group_id,pg.code group_code,gr.role_id,r.code role_code,gr.scope_target_id,st.scope_kind,st.scope_key,st.target_id scope_entity_id,st.display_name scope_name,gr.propagation_mode,gr.effective_from grant_effective_from,gr.effective_until grant_effective_until,
     (SELECT coalesce(jsonb_agg(p.canonical_code ORDER BY p.canonical_code),'[]'::jsonb) FROM authz.role_permission rp JOIN authz.permission p ON p.id=rp.permission_id WHERE rp.role_id=r.id AND rp.tenant_id=r.tenant_id AND (p.canonical_code LIKE 'neon.relationship.business_partner%' OR p.canonical_code LIKE 'neon.relationship.entity_case.%')) role_permission_codes,
     EXISTS (SELECT 1 FROM authz.plane_membership pm WHERE pm.tenant_id=gm.tenant_id AND pm.principal_id=gm.principal_id AND pm.status='active' AND pm.effective_from<=statement_timestamp() AND (pm.effective_until IS NULL OR pm.effective_until>statement_timestamp())) has_current_plane_membership
   FROM authz.group_role gr JOIN authz.role r ON r.id=gr.role_id AND r.tenant_id=gr.tenant_id
   JOIN authz.current_group_member gm ON gm.group_id=gr.group_id AND gm.tenant_id=gr.tenant_id
   JOIN authz.principal_group pg ON pg.id=gr.group_id AND pg.tenant_id=gr.tenant_id
   JOIN master.principal pr ON pr.id=gm.principal_id AND pr.tenant_id=gm.tenant_id
   JOIN master.tenant t ON t.id=gr.tenant_id
   JOIN authz.scope_target st ON st.id=gr.scope_target_id AND st.tenant_id=gr.tenant_id
   WHERE gr.status='active' AND r.status='active' AND pg.status='active' AND st.status='active'
     AND gr.effective_from<=statement_timestamp() AND (gr.effective_until IS NULL OR gr.effective_until>statement_timestamp())
     AND EXISTS (SELECT 1 FROM authz.role_permission rp JOIN authz.permission p ON p.id=rp.permission_id WHERE rp.role_id=r.id AND rp.tenant_id=r.tenant_id AND p.canonical_code LIKE 'neon.relationship.business_partner%')

 ) c),
 'authorizationFingerprints', jsonb_build_object(${tables.map(table=>`'${table}', (SELECT jsonb_build_object('rows',count(*),'sha256',encode(sha256(convert_to(coalesce(string_agg(to_jsonb(t)::text,E'\\n' ORDER BY to_jsonb(t)::text),''),'UTF8')),'hex')) FROM authz."${table}" t)`).join(',')}))`);
if (!data) throw new Error('Missing review evidence');
const profile = readFileSync('packages/contracts/platform/fixtures/entity-authorization/business-partner.v1.json');
const candidateResponsibilities = candidate => {
 const permissions = new Set(candidate.role_permission_codes), roles=[];
 if(permissions.has('neon.relationship.business_partner.read'))roles.push('directory_read_review');
 if(permissions.has('neon.relationship.entity_case.create'))roles.push('case_requester_review');
 if(permissions.has('neon.relationship.entity_case.decide'))roles.push('case_approver_review');
 if(permissions.has('neon.relationship.entity_case.materialize'))roles.push('case_applier_review');
 if(permissions.has('neon.relationship.business_partner.verify_contact'))roles.push('contact_verifier_review');
 if([...permissions].some(p=>p.includes('sensitive')||p.endsWith('.reveal')))roles.push('sensitive_access_review');
 if(permissions.has('neon.relationship.business_partner.create')||permissions.has('neon.relationship.business_partner.update'))roles.push('legacy_direct_mutation_review');
 return roles.length?roles:['existing_capability_review'];
};
const report = {schemaVersion:1,environment,generatedAt:new Date().toISOString(),mode:'proposal_only',profileSha256:createHash('sha256').update(profile).digest('hex'),grantsChanged:false,grantChanges:[],namedAssignments:[],...data,
 responsibilities:['global_directory_reader','global_proposal_requester','global_master_steward','global_approver','global_materializer','organization_requester','company_configurator'],
 reviewRows:data.candidates.map(candidate=>({...candidate,status:'pending_named_review',candidateResponsibilities:candidateResponsibilities(candidate),defaultDecision:'retain_current_grants',proposedResponsibility:null,proposedScope:null,proposedCapabilities:[],reviewer:null,decision:null,effectiveFrom:null,effectiveUntil:null,separationOfDutiesReview:null})),
 requiredReview:['Select a named principal/group for each responsibility; role membership alone is insufficient.','Approve global read, proposal, approve and materialize separately.','Retain organization/company boundaries unless an explicit individual grant change is reviewed.','Verify maker/checker separation, MFA, effective dates, deny rules and revocation handling.','Never apply this report; prepare a separate reviewed grant change after decisions are recorded.'],
 fingerprintLimits:'Full persisted NEON authorization rows, including revoked/denied/expired rows; hashes are equality evidence, not proof of effective access or activation lineage. Time-based expiry, principal status and external identity assurance can change access without changing these rows.'};
mkdirSync(dirname(output),{recursive:true});writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({output,candidates:data.candidates.length,namedAssignments:0,grantChanges:0,tables:tables.length}));
