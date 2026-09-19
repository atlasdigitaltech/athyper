/** Concrete temporary qualification proposal, never an approval. */
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const read=p=>JSON.parse(readFileSync(p));
const gaps=read('governance/policy/reviews/business-partner-release-19-qualification-grant-gaps.dev.json');
const readiness=read('governance/policy/reports/business-partner-release-19-execution-readiness.dev.json');
const actor=readiness.actors.find(a=>a.account==='catl.admin');
if(actor.tenantId!==gaps.tenantId||actor.principalId!==gaps.candidatePrincipalId||actor.organizations.length!==1||actor.companies.length!==1)throw Error('Qualification identity/scope changed');
const stable=name=>{const h=createHash('sha256').update('bp-release19-test-grants:'+name).digest('hex');return h.slice(0,8)+'-'+h.slice(8,12)+'-5'+h.slice(13,16)+'-a'+h.slice(17,20)+'-'+h.slice(20,32);};
const targets={tenant:actor.tenantId,operating_organization:actor.organizations[0].id,company_code:actor.companies[0].companyCodeId};
const assignments=Object.entries(targets).map(([scopeKind,targetId])=>{
 const permissions=gaps.permissions.filter(p=>p.catalogScopeKinds.includes(scopeKind));
 return {id:stable(scopeKind),roleId:stable('role:'+scopeKind),groupId:stable('group:'+scopeKind),code:'bp.r19.qualify.'+scopeKind,
 principalId:actor.principalId,account:actor.account,scopeKind,targetId,propagation:'exact',
 permissions:permissions.map(p=>({id:p.permissionId,code:p.permissionCode,operation:p.operation}))};
});
const body={schemaVersion:1,kind:'bp_release_19_temporary_test_grant_proposal',environment:'dev',plane:'neon',tenantId:actor.tenantId,
 releaseId:gaps.releaseId,artifactHash:gaps.artifactHash,effectiveFrom:'2026-09-10T06:35:00.000Z',effectiveUntil:'2026-09-10T10:35:00.000Z',
 assignments,uniquePermissions:gaps.permissions.length,reviewers:['catl.owner','catl.admin'],
 accessBoundary:'Tenant-scoped dedicated permissions cover all BP records in the existing DEV tenant; they cannot be restricted to test records by a resource grant. Organization/company permissions use only the listed exact coordinates.',
 approval:null,activationAuthorized:false,applySupported:false,
 conditions:{mfa:'Normal existing high-risk service preflights remain mandatory; no claim that group membership itself enforces MFA.',
 separationOfDuties:'Existing maker/approver/applier checks remain. catl.owner receives no new grants.',
 deniedBaseline:'Capture original authority before assignment; revalidate denials, scope incompatibility, revocation and expiry. No deny/ACL/delegation rows may be changed.',
 scopePropagation:'exact; no organization-to-tenant widening',
 effectiveDates:'Fixed four-hour UTC window. An expired proposal requires a new revision and acceptance.',
 workload:'Only isolated qualification records may be created or modified by the harness; this is an operator constraint, not a record-level limit on the grants.',
 rollback:'Revoke only the newly created qualification memberships/role assignments. Preserve all existing grants, denials and revocations; never restore a snapshot.',
 activation:'No release-head change and no removal of the release-19 activation hold.'}};
const proposalRevision=createHash('sha256').update(JSON.stringify(body)).digest('hex');
writeFileSync('governance/policy/reviews/business-partner-release-19-test-grants.proposal.dev.json',JSON.stringify({...body,proposalRevision},null,2)+'\n',{flag:'wx'});
console.log({proposalRevision,assignments:assignments.map(a=>({scopeKind:a.scopeKind,permissions:a.permissions.length})),uniquePermissions:gaps.permissions.length});
