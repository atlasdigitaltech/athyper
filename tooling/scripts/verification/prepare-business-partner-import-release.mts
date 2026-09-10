import {readFileSync,writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {canonicalBytes,sha256} from '../../../server/packages/adapters/publication-signing/src/canonical-json.js';
import {parseEntityRuntimeDescriptor} from '../../../server/packages/platform/metadata/src/descriptor-parser.js';
// @ts-expect-error Independently tested local verification module.
import {selectGovernedImport} from './entity-authorization/governed-import-selection.mjs';
const read=(path:string)=>JSON.parse(readFileSync(path,'utf8'));
const packet=read('governance/policy/reviews/business-partner-governed-import-workflow.dev.json');
const livePath='governance/policy/reports/business-partner-import-integration-publication.dev.json';
execFileSync('pnpm',['exec','tsx','tooling/scripts/verification/prepare-entity-authorization-publication.mts','dev','44444444-4444-4444-8444-444444444444','packages/contracts/platform/fixtures/entity-authorization/business-partner.v1.json','governance/config/governance/business-partner-authorization-bindings.v1.json',livePath],{stdio:'inherit'});
if(sha256(canonicalBytes(read(livePath).base))!==sha256(canonicalBytes(packet.source.base)))throw Error('IMPORT_LIVE_ACTIVATION_HEAD_CHANGED');
const digest=(path:string)=>createHash('sha256').update(readFileSync(path)).digest('hex');
if(digest('governance/policy/reviews/business-partner-operation-reviewers.dev.json')!==packet.nominationSha256)throw Error('IMPORT_NOMINATION_CHANGED');
for(const row of packet.rows)for(const evidence of [...row.proposal.implementationEvidence,...row.proposal.regressionEvidence])if(digest(evidence.path)!==evidence.sha256)throw Error('IMPORT_APPROVED_EVIDENCE_CHANGED');
const draft=selectGovernedImport({selection:read('governance/policy/reports/business-partner-corrected-release.dev.json'),packet,
 original:read('governance/policy/reviews/business-partner-operation-workflow.dev.json'),
 state:read(join(homedir(),'.athyper/instances/dev/deployments/bp-governed-import-review-20260910/review/output/state.json')),
 exported:read('governance/policy/reports/business-partner-governed-import-decisions.dev.json')});
parseEntityRuntimeDescriptor({entity_code:draft.base.entityCode,plane_code:draft.base.planeKey,release_id:draft.base.releaseId,release_no:draft.base.releaseNo,entity_contract_hash:draft.base.contractHash,compiled_hash:draft.selectionSha256,compiled_json:draft.descriptor});
const path='governance/policy/reports/business-partner-import-release.dev.json';writeFileSync(path,JSON.stringify(draft,null,2)+'\n');
console.log({path,selectionSha256:draft.selectionSha256,nativeDescriptorParsing:'passed',importReview:draft.importReview.status,publicationEligible:false,activationAuthorized:false});
