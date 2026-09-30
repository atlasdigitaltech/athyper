import {describe, expect, it} from 'vitest';
import {checkEntityAdoptionHeads, planEntityAdoption, type EntityAdoptionPlanInput} from '../entity-adoption-plan.js';
const tenantId='11111111-1111-4111-8111-111111111111';
const baselineReleaseId='22222222-2222-4222-8222-222222222222';
function candidate(): EntityAdoptionPlanInput {
  const shared={tenantId,entityCode:'business_partner',plane:'neon' as const,baselineReleaseId,baselineHash:'a'.repeat(64),expectedActiveHash:null};
  return {...shared,authorId:'33333333-3333-4333-8333-333333333333',publisherId:'44444444-4444-4444-8444-444444444444',
    native:{...shared,kind:'entity_runtime',publicationKey:`metadata.entity.business_partner.tenant.${tenantId}`,artifactHash:'b'.repeat(64)},
    compiled:{...shared,kind:'compiled_entity_runtime',publicationKey:`metadata.compiled_entity.business_partner.tenant.${tenantId}`,artifactHash:'c'.repeat(64)}};
}
describe('coordinated tenant adoption planning',()=>{
 it('pins both members and preserves the caller input',()=>{
  const input=candidate(), plan=planEntityAdoption(input);
  expect(plan.native).not.toBe(input.native);
  expect(Object.isFrozen(plan.native)).toBe(true);
  expect(checkEntityAdoptionHeads(plan,{native:null,compiled:null})).toBe('activate-pair');
 });
 it('rejects self publication',()=>{
  const input=candidate(); expect(()=>planEntityAdoption({...input,publisherId:input.authorId})).toThrow('INDEPENDENT_PUBLISHER');
 });
 it('rejects global and foreign tenant projections',()=>{
  for(const tenantId of [null,baselineReleaseId]) {
   const input=candidate(); expect(()=>planEntityAdoption({...input,compiled:{...input.compiled,tenantId}})).toThrow('TENANT_MISMATCH');
  }
 });
 it('rejects mismatched baseline and entity coordinates',()=>{
  const input=candidate();
  expect(()=>planEntityAdoption({...input,compiled:{...input.compiled,baselineHash:'d'.repeat(64)}})).toThrow('BASELINE_MISMATCH');
  expect(()=>planEntityAdoption({...input,native:{...input.native,entityCode:'customer'}})).toThrow('MEMBER_MISMATCH');
 });
 it('rejects global publication keys',()=>{
  const input=candidate(); expect(()=>planEntityAdoption({...input,compiled:{...input.compiled,publicationKey:'metadata.compiled_entity.business_partner'}})).toThrow('PUBLICATION_KEY');
 });
 it('accepts complete replay but rejects partial activation or changed heads',()=>{
  const plan=planEntityAdoption(candidate());
  expect(checkEntityAdoptionHeads(plan,{native:plan.native.artifactHash,compiled:plan.compiled.artifactHash})).toBe('already-active');
  expect(()=>checkEntityAdoptionHeads(plan,{native:plan.native.artifactHash,compiled:null})).toThrow('HEAD_CHANGED');
  expect(()=>checkEntityAdoptionHeads(plan,{native:'e'.repeat(64),compiled:null})).toThrow('HEAD_CHANGED');
 });
});
