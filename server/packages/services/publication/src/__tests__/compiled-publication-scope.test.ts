import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {compiledPublicationTenant, type PublicationArtifactDocumentV1} from '@athyper/server-contract-publication';
import {projectionJson} from '../kysely-local-projection-repository.js';
const tenantId='11111111-1111-4111-8111-111111111111';
const key=`metadata.compiled_entity.business_partner.tenant.${tenantId}`;
describe('signed compiled publication scope in the worker projection',()=>{
 it('preserves existing global product releases',()=>{
  expect(compiledPublicationTenant('metadata.compiled_entity.business_partner',{entityCode:'business_partner'})).toBeNull();
 });
 it('requires exact signed tenant/key agreement',()=>{
  expect(compiledPublicationTenant(key,{entityCode:'business_partner',tenantId})).toBe(tenantId);
  expect(()=>compiledPublicationTenant(key,{entityCode:'business_partner'})).toThrow();
  expect(()=>compiledPublicationTenant(key,{entityCode:'business_partner',tenantId:'44444444-4444-4444-8444-444444444444'})).toThrow();
  expect(()=>compiledPublicationTenant('metadata.compiled_entity.business_partner',{entityCode:'business_partner',tenantId})).toThrow();
  expect(()=>compiledPublicationTenant(key,{entityCode:'customer',tenantId})).toThrow();
 });
 it('stages tenant identity from payload instead of null',()=>{
  const artifact={envelope:{artifactKind:'compiled_entity_runtime',publicationKey:key,releaseId:'release',releaseNo:1,targetPlane:'neon',payload:{entityCode:'business_partner',tenantId,generatedAt:'2026-09-25T00:00:00Z',release:{releaseId:'compiled',releaseHash:'hash'}}},manifest:{payloadSha256:'hash'}} as unknown as PublicationArtifactDocumentV1;
  expect(projectionJson(artifact)).toMatchObject({applied_release_payload:{tenant_id:tenantId,payload_json:{tenantId}}});
 });
 it('uses the projection-aware stage entry point, not a seven-argument base call',()=>{
  const source=readFileSync(new URL('../kysely-local-projection-repository.ts',import.meta.url),'utf8');
  expect(source).toContain('runtime_meta.fn_stage_release_projection(');
  expect(source).not.toContain('runtime_meta.fn_stage_release(');
 });
});
