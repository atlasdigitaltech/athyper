import {createHash} from 'node:crypto';
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
export const combinedHash=v=>createHash('sha256').update(JSON.stringify(stable(v))).digest('hex');
/** Three-way merge: only the reviewed authorization delta may replace the
 * approved predecessor. Unrelated/new predecessor content remains unchanged. */
export function combineBusinessPartnerSuccessor(capture, selection){
 const source=structuredClone(capture.source),target=structuredClone(selection.descriptor),baseline=source.baseline;
 if(capture.schemaVersion!==1||capture.kind!=='bp_combined_successor_source'||!['approved','published'].includes(source.status)||Number(source.release_no)!==18||source.publication_release_id!=='126721f6-a2e5-45e2-91bf-0d6a1b660c56'||source.approved_by===source.created_by||!source.approved_by)throw Error('COMBINED_APPROVED_PREDECESSOR_REQUIRED');
 if(selection.activationAuthorized!==false||selection.grantChanges.length||selection.base.tenantId!==source.tenant_id||selection.base.publicationKey!==source.release_key||selection.base.releaseId!==baseline.sourceReleaseId||selection.base.releaseNo!==baseline.sourceReleaseNo||combinedHash(baseline.source)!==baseline.contentHash)throw Error('COMBINED_BASE_MISMATCH');
 const original=baseline.source.descriptor.compiled_json,predecessor=source.descriptor;
 if(predecessor.entityCode!=='business_partner'||predecessor.planeKey!=='neon'||!predecessor.ai?.enabled||target.entityCode!==predecessor.entityCode||target.planeKey!==predecessor.planeKey)throw Error('COMBINED_ENTITY_MISMATCH');
 const permitted=new Set(['fields','operations','listPresentation','authorization','authorizationRuntime']);
 const result=structuredClone(predecessor),changed=[];
 for(const key of Object.keys(target)){
  if(combinedHash(target[key])===combinedHash(original[key]??null))continue;
  if(!permitted.has(key))throw Error(`COMBINED_UNREVIEWED_DELTA:${key}`);
  if(original[key]!==undefined&&combinedHash(predecessor[key]??null)!==combinedHash(original[key])&&combinedHash(predecessor[key]??null)!==combinedHash(target[key]))throw Error(`COMBINED_PREDECESSOR_CONFLICT:${key}`);
  result[key]=target[key];changed.push(key);
 }
 // Legacy operation identities belong to the old release. Native signing must
 // generate fresh bindings from persisted authored IDs and the exact catalog.
 result.operation_scope_bindings=[];
 if(combinedHash(result.ai)!==combinedHash(predecessor.ai))throw Error('COMBINED_ATLAS_CHANGED');
 for(const key of Object.keys(predecessor))if(!permitted.has(key)&&key!=='operation_scope_bindings'&&combinedHash(result[key])!==combinedHash(predecessor[key]))throw Error(`COMBINED_PRESERVATION_FAILED:${key}`);
 return {schemaVersion:1,kind:'bp_combined_successor_review',predecessor:{releaseId:source.publication_release_id,releaseNo:Number(source.release_no),publicationKey:source.release_key,descriptorHash:combinedHash(predecessor),authoredContractHash:combinedHash(source.authored_contract)},authorizationSelectionSha256:selection.selectionSha256,descriptor:result,descriptorHash:combinedHash(result),preservedAtlasHash:combinedHash(result.ai),changedDescriptorKeys:[...changed,'operation_scope_bindings'].sort(),nativeScopeBindings:'awaiting_persisted_operation_ids_and_native_compiler',grantChanges:[],activationAuthorized:false,publicationEligible:false,approvals:[],signedArtifact:null};
}
