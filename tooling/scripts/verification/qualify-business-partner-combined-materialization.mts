/** Read-only content rehearsal. This does not reserve, publish or sign a release. */
import {readFileSync,writeFileSync} from 'node:fs';
import {compileGraph} from '../../../server/packages/planes/studio/meta-entity-authoring/src/deterministic.js';
import {compileAuthorizationSuccessorDescriptor} from '../../../server/packages/planes/studio/meta-entity-authoring/src/authorization-successor.js';
import {baselineJsonHash} from '../../../server/packages/planes/studio/meta-entity-authoring/src/baseline-publication.js';
const read=(name:string)=>JSON.parse(readFileSync(`governance/policy/reports/${name}.dev.json`,'utf8'));
const persisted=read('business-partner-combined-persisted-approval'),proposal=read('business-partner-combined-successor'),source=read('business-partner-combined-source').source;
if(!persisted.approvalRecorded||persisted.status!=='approved'||persisted.changeSetRevision!==3||persisted.reviewRevision!==proposal.reviewRevision)throw Error('APPROVED_SUCCESSOR_REQUIRED');
const native=compileGraph(persisted.persistedGraph);
if(native.contractHash!==persisted.persistedNativeContractHash)throw Error('APPROVED_CONTRACT_CHANGED');
const descriptor=compileAuthorizationSuccessorDescriptor({nativeDescriptor:native.descriptor,predecessor:{releaseId:source.publication_release_id,releaseNo:Number(source.release_no),publicationKey:source.release_key,descriptor:source.descriptor,authoredContract:source.authored_contract},proposedDescriptor:proposal.descriptor});
const differences=read('business-partner-activation-differences');
const report={schemaVersion:1,kind:'bp_combined_materialization_rehearsal',capturedAt:new Date().toISOString(),changeSetId:persisted.changeSetId,changeSetRevision:3,reviewRevision:proposal.reviewRevision,contractHash:native.contractHash,descriptorHash:baselineJsonHash(descriptor),contentQualified:true,qualificationKind:'local_approved_snapshot_rehearsal',signed:false,releaseId:null,publicationEligible:false,grantChanges:[],activationAuthorized:false,unresolvedDifferences:differences.unresolvedDifferences,remainingGates:['Transactional combined materializer with current predecessor and revocation rechecks','Deployment of the combined materializer and runtime adapters','Reserved exact release coordinates and current catalog hash','Authenticated release-bound business/security review','Native signed compilation','Authenticated qualification against those signed artifacts','Explicit policy-difference acceptance with exact-release regression evidence']};
const path='governance/policy/reports/business-partner-combined-materialization.dev.json';writeFileSync(path,JSON.stringify(report,null,2)+'\n');console.log({path,contentQualified:true,signed:false,unresolvedDifferences:report.unresolvedDifferences});
