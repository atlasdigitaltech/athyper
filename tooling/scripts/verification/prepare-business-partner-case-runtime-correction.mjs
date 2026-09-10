import { readFileSync,writeFileSync,existsSync } from 'node:fs';
import { proposalHash,hash } from './entity-authorization/named-role-review.mjs';
const read = path => JSON.parse(readFileSync(path));
const original=read('governance/policy/reviews/business-partner-operation-workflow.dev.json');
const keys=['case_update','case_validate','case_submit','case_decide','case_materialize'];
const test='server/apps/platform-host/src/composition/__tests__/business-partner-case-runtime.test.ts';
const rows=original.rows.filter(r=>keys.includes(r.operation)).map(row=>{
 const proposal={...row.proposal,target:'existing',handler:{key:`business_partner.${row.operation}.v1`,variant:'stored_case'},
 rationale:'This command changes an existing independently owned request. Resolve the current immutable snapshot ownership using the request ID; proposed coordinates cannot determine its authorization scope.',
 priorApproval:{packetRevision:original.packetRevision,proposalSha256:row.proposalSha256},
 regressionEvidence:[{path:test,sha256:hash(readFileSync(test)),test:'rejects each proposed-resource binding for an existing case before publication'}],
 remainingEngineering:['Qualify the stored-case path against the same signed release and current reviewer/grant authority.'],nativeCompilationEligible:false};
 return {operation:row.operation,proposal,proposalSha256:proposalHash(proposal)};
});
const {packetRevision:oldRevision,...source}=original;
const body={...source,rows,previousPacketRevision:oldRevision,revisionReason:'Correct existing-case ownership before runtime registration and publication.',grantChanges:[],activationAuthorized:false};
const packet={...body,packetRevision:proposalHash(body)};
const path='governance/policy/reviews/business-partner-case-runtime-correction.dev.json';
const content=JSON.stringify(packet,null,2)+'\n';
if(existsSync(path)&&readFileSync(path,'utf8')!==content)throw Error('Preserve existing correction revision; author a new revision');
writeFileSync(path,content);
const descriptor=structuredClone(read('governance/policy/reports/business-partner-accepted-operations.dev.json').descriptor);
for(const op of descriptor.authorization.operations)if(keys.includes(op.key))op.target='existing';
writeFileSync('governance/policy/reports/business-partner-case-runtime-correction.dev.json',JSON.stringify({schemaVersion:1,packetRevision:packet.packetRevision,approved:false,descriptorDraft:descriptor,correctedOperations:keys,registeredOwningCaseOperations:7,grantChanges:[],activationAuthorized:false,publicationEligible:false,remaining:['explicit_correction_review','other_owning_runtime_registrations','reviewed_governed_import','exact_signed_release_qualification','policy_difference_acceptance']},null,2)+'\n');
console.log({path,correctedOperations:keys.length,approvals:0,grantsChanged:false});
