import { homedir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { readFileSync,writeFileSync,existsSync } from 'node:fs';
import { parseEntityRuntimeDescriptor } from '../../../server/packages/platform/metadata/src/descriptor-parser.js';
import { assertBusinessPartnerCaseRuntimeSemantics } from '../../../server/apps/platform-host/src/composition/business-partner-case-runtime.js';
// @ts-expect-error Local verification module has independent Node regression tests.
import { prepareCaseRuntimeCorrection } from './entity-authorization/case-runtime-correction.mjs';
const read=(path:string)=>JSON.parse(readFileSync(path,'utf8'));
const correction=read('governance/policy/reviews/business-partner-case-runtime-correction.dev.json');
const digest=(path:string)=>createHash('sha256').update(readFileSync(path)).digest('hex');
if(digest('governance/policy/reviews/business-partner-operation-reviewers.dev.json')!==correction.nominationSha256)throw Error('CORRECTION_NOMINATION_CHANGED');
for(const row of correction.rows)for(const evidence of row.proposal.regressionEvidence)
 if(digest(evidence.path)!==evidence.sha256)throw Error('CORRECTION_REGRESSION_CHANGED');
const statePath=join(homedir(),'.athyper/instances/dev/deployments/bp-case-correction-review-20260910/review/output/state.json');
const exportedPath='governance/policy/reports/business-partner-case-correction-decisions.dev.json';
const review=existsSync(statePath)?{state:read(statePath),exported:read(exportedPath)}:undefined;
const draft=prepareCaseRuntimeCorrection(
  read('governance/policy/reports/business-partner-accepted-operations.dev.json'),
  read('governance/policy/reviews/business-partner-operation-workflow.dev.json'),
  correction, review,
);
assertBusinessPartnerCaseRuntimeSemantics(draft.descriptor.authorization);
parseEntityRuntimeDescriptor({entity_code:draft.base.entityCode,plane_code:draft.base.planeKey,
 release_id:draft.base.releaseId,release_no:draft.base.releaseNo,entity_contract_hash:draft.base.contractHash,
 compiled_hash:draft.selectionSha256,compiled_json:draft.descriptor});
const path='governance/policy/reports/business-partner-corrected-release.dev.json';
writeFileSync(path,JSON.stringify(draft,null,2)+'\n');
writeFileSync('governance/policy/reports/business-partner-case-target-check.dev.json',JSON.stringify({
 schemaVersion:1,selectionSha256:draft.selectionSha256,packetRevision:draft.packetRevision,
 correctedOperations:draft.correctionOperations,nativeDescriptorParsing:'passed',owningCaseSemantics:'passed',
 descriptorAndBindingTargets:'existing',originalApprovalsPreserved:true,correctionReview:draft.correctionReview.status,
 signedArtifact:null,publicationEligible:false,grantChanges:[],activationAuthorized:false,
},null,2)+'\n');
console.log({path,correctedOperations:draft.correctionOperations.length,owningCaseSemantics:'passed',publicationEligible:false});
