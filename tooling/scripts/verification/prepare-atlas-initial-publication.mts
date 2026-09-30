import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {parseEntityAiDescriptor} from '../../../server/packages/contracts/metadata/src/entity-ai.js';
// @ts-expect-error Operator model uses native Node ESM; covered by node:test.
import {planInitialAi,assertCurrent} from './atlas-baseline-adoption-model.mjs';
const receipt=JSON.parse(readFileSync('docs/examples/atlas-f5/cirrus-baseline-adoption.applied.json','utf8'));
if(!receipt.applied||receipt.environment!=='dev'||receipt.tenantId!=='44444444-4444-4444-8444-444444444444'||!/^[-0-9a-f]{36}$/.test(receipt.result.baselineId))throw Error('An applied DEV Cirrus baseline is required');
const query=(plane:string,input:string)=>{
  try{return execFileSync('docker',['exec','-i','athyper-dev-db-1','psql','-X','-qAt','-U','postgres','-d',`athyper_${plane}`,'-v','ON_ERROR_STOP=1'],{input,encoding:'utf8',timeout:15000,stdio:['pipe','pipe','pipe']}).trim();}
  catch{throw Error('Publication preflight database query failed');}
};
const importedText=query('studio',`SELECT payload FROM metadata.entity_baseline_import b WHERE id='${receipt.result.baselineId}' AND tenant_id='${receipt.tenantId}' AND NOT EXISTS(SELECT 1 FROM metadata.entity_baseline_import_revocation r WHERE r.baseline_id=b.id)`);
if(!importedText)throw Error('Baseline unavailable or revoked');
const imported=JSON.parse(importedText);
if(imported.contentHash!==receipt.result.contentHash)throw Error('Applied receipt mismatch');
const quote=(value:string)=>"'"+value.replaceAll("'","''")+"'";
const currentText=query('neon',`SELECT jsonb_build_object('contract',to_jsonb(c),'descriptor',to_jsonb(d),'head',to_jsonb(h),'applied',to_jsonb(a)) FROM runtime_meta.release_activation_head h JOIN runtime_meta.applied_release a ON a.id=h.applied_release_id JOIN runtime_meta.entity_contract c ON c.publication_key=h.publication_key AND c.release_id=a.source_release_id JOIN runtime_meta.entity_descriptor d ON d.entity_contract_id=c.id AND d.applied_release_id=a.id WHERE c.tenant_id=${quote(imported.tenantId)}::uuid AND d.tenant_id=c.tenant_id AND h.publication_key=${quote(imported.publicationKey)} AND d.plane_code='neon' AND d.descriptor_kind='entity_runtime' AND d.status='active'`);
if(!currentText)throw Error('Baseline no longer active');
assertCurrent(imported,JSON.parse(currentText));
const ai=parseEntityAiDescriptor(JSON.parse(readFileSync('docs/examples/atlas-f2/business-partner.ai.json','utf8')),{entityCode:imported.entityCode,planeKey:'neon',fields:imported.source.descriptor.compiled_json.fields,operationKeys:Object.keys(imported.source.descriptor.compiled_json.operations)});
const plan={...planInitialAi(imported,ai),baselineImportId:receipt.result.baselineId,baselineImport:{id:receipt.result.baselineId,contentHash:imported.contentHash,sourceEntityId:imported.sourceEntityId,descriptorHash:planInitialAi(imported,ai).descriptorContentHash},preparedAt:new Date().toISOString(),author:'catl.admin',reviewer:'catl.owner',nativeAuthoringStatus:'not_submitted',note:'Review candidate only. Native authoring adapter and worker must preserve this contract and descriptor; do not send this runtime payload to graph replacement.'};
writeFileSync('docs/examples/atlas-f5/cirrus-initial-ai-publication-plan.json',JSON.stringify(plan,null,2)+'\n');
console.log(JSON.stringify({baselineImportId:plan.baselineImportId,sourceCurrent:true,aiValid:true,changedDescriptorKeys:plan.changedDescriptorKeys,proposedReleaseNo:plan.proposedReleaseNo,published:false}));
