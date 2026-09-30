import {readFileSync} from 'node:fs';
import {createHash,generateKeyPairSync,sign,verify} from 'node:crypto';
import {expect,it} from 'vitest';
import {PUBLICATION_ARTIFACT_SCHEMA_V1,PUBLICATION_ARTIFACT_MEDIA_TYPE_V1} from '@athyper/server-contract-publication';
import {VerifiedPublicationArtifactLoader} from '../publication-artifact-loader.js';
const imported=JSON.parse(readFileSync(new URL('../../../../../../docs/examples/atlas-f5/cirrus-baseline-import.json',import.meta.url),'utf8'));
const ai=JSON.parse(readFileSync(new URL('../../../../../../docs/examples/atlas-f2/business-partner.ai.json',import.meta.url),'utf8'));
const ordered=(x:unknown):unknown=>Array.isArray(x)?x.map(ordered):x&&typeof x==='object'?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,ordered(v)])):x;
const canonicalBytes=(x:unknown)=>Buffer.from(JSON.stringify(ordered(x)));
const sha256=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
async function load(mode:'valid'|'bad-contract-signature'|'bad-field'='valid') {
 const {privateKey,publicKey}=generateKeyPairSync('ed25519');
 const c=imported.source.contract,contract=c.contract_json,descriptor={...imported.source.descriptor.compiled_json,ai:structuredClone(ai)};
 if(mode==='bad-field')descriptor.ai.summaryFieldKeys=['absent'];
 const contractHash=sha256(canonicalBytes(contract)),id='10000000-0000-4000-8000-000000000001',publishedAt='2026-09-10T00:00:00.000Z';
 const payload={entityContract:{id,tenantId:imported.tenantId,entityId:imported.sourceEntityId,entityCode:imported.entityCode,releaseId:id,revisionId:id,releaseNo:18,contractSchemaCode:c.contract_schema_code,contractSchemaVersion:c.contract_schema_version,contractHash,contract,publicationKey:imported.publicationKey,signature:{algorithm:'Ed25519',keyId:'test',signature:sign(null,canonicalBytes(mode==='bad-contract-signature'?{}:contract),privateKey).toString('base64')},publishedAt},
 entityDescriptor:{id:'10000000-0000-4000-8000-000000000002',plane:'neon',descriptorKind:'entity_runtime',descriptorSchemaVersion:'1.0.0',sourceContractHash:contractHash,compiledHash:sha256(canonicalBytes(descriptor)),descriptor,compilerVersion:'test/1.0.0',compatibilityLevel:'backward_compatible',generatedAt:publishedAt}};
 const envelope={schema:PUBLICATION_ARTIFACT_SCHEMA_V1,publicationKey:imported.publicationKey,releaseId:id,releaseNo:18,releaseKind:'publish',targetPlane:'neon',artifactKind:'entity_runtime',generatedAt:publishedAt,compatibilityLevel:'backward_compatible',payload};
 const manifest={artifactSchema:PUBLICATION_ARTIFACT_SCHEMA_V1,mediaType:PUBLICATION_ARTIFACT_MEDIA_TYPE_V1,publicationKey:imported.publicationKey,releaseId:id,releaseNo:18,targetPlane:'neon',artifactKind:'entity_runtime',payloadSha256:sha256(canonicalBytes(payload)),compiler:{name:'test',version:'1.0.0'},contractSchemaVersion:c.contract_schema_version,descriptorSchemaVersion:'1.0.0',signatureAlgorithm:'Ed25519',signingKeyId:'test',createdAt:publishedAt,evidence:{importedBaseline:{appliedReleaseId:imported.source.head.applied_release_id,rowVersion:imported.source.head.row_version,sourceReleaseNo:17,artifactHash:imported.sourceArtifactHash}}};
 const signature=sign(null,canonicalBytes({envelope,manifest}),privateKey).toString('base64'),bytes=canonicalBytes({envelope,manifest,signature});
 const loader=new VerifiedPublicationArtifactLoader({store:{get:async()=>bytes,putImmutable:async()=>{}},verifier:{verify:async input=>verify(null,input.bytes,publicKey,Buffer.from(input.signature,'base64'))},canonicalizer:{canonicalBytes,sha256},runtimeVersion:'1.0.0'});
 return loader.load({deploymentId:id,deploymentStatus:'dispatched',targetPlane:'neon',targetEnvironment:'test',targetInstance:'*',publicationKey:imported.publicationKey,sourceReleaseId:id,sourceReleaseNo:18,artifactUri:'s3://test/baseline.json',artifactHash:sha256(bytes),signatureAlgorithm:'Ed25519',signingKeyId:'test',signature});
}
it('verifies a newly signed initial AI artifact while preserving the imported contract and activation precondition',async()=>{
 const result=await load();expect(result.verification.signatureVerified).toBe(true);
 expect(result.document.manifest.evidence?.importedBaseline).toMatchObject({sourceReleaseNo:17});
 expect(result.document.envelope.payload).toHaveProperty('entityContract.contract',imported.source.contract.contract_json);
});
it('rejects an invalid inner contract signature even with a valid envelope signature',async()=>{await expect(load('bad-contract-signature')).rejects.toThrow('ARTIFACT_SIGNATURE_INVALID');});
it('rejects invalid AI field references even in a correctly signed artifact',async()=>{await expect(load('bad-field')).rejects.toThrow('ARTIFACT_PAYLOAD_INVALID');});
