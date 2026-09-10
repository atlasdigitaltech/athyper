import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
import {compileInitialBaselineDescriptor, baselineJsonHash, baselinePublicationCoordinate, type ImportedEntityBaseline} from '../baseline-publication.js';
import {sha256} from '../deterministic.js';
const baseline=JSON.parse(readFileSync(new URL('../../../../../../../docs/examples/atlas-f5/cirrus-baseline-import.json',import.meta.url),'utf8')) as ImportedEntityBaseline;
const ai=JSON.parse(readFileSync(new URL('../../../../../../../docs/examples/atlas-f2/business-partner.ai.json',import.meta.url),'utf8'));
it('preserves all runtime behavior while validating the AI delta against the imported fields and operations',()=>{
 const compiled=compileInitialBaselineDescriptor(baseline,ai);
 const {ai:delta,...rest}=compiled;
 expect(rest).toEqual(baseline.source.descriptor.compiled_json);
 expect(delta).toEqual(ai);
});
it('refuses unknown field references and disabled definitions',()=>{
 expect(()=>compileInitialBaselineDescriptor(baseline,{...ai,summaryFieldKeys:['not_a_bp_field']})).toThrow();
 expect(()=>compileInitialBaselineDescriptor(baseline,{...ai,enabled:false})).toThrow();
});
it('rejects altered imported payloads and already enabled baselines',()=>{
 const changed=structuredClone(baseline);changed.source.contract.contract_json.storage={schema:'other'};
 expect(()=>compileInitialBaselineDescriptor(changed,ai)).toThrow();
 const enabled=structuredClone(baseline);enabled.source.descriptor.compiled_json.ai=ai;enabled.contentHash=sha256(enabled.source);
 expect(()=>compileInitialBaselineDescriptor(enabled,ai)).toThrow();
});

it('matches the reviewed runtime hash without reordering descriptor fields',()=>{
 const plan=JSON.parse(readFileSync(new URL('../../../../../../../docs/examples/atlas-f5/cirrus-initial-ai-publication-plan.json',import.meta.url),'utf8'));
 expect(baselineJsonHash(compileInitialBaselineDescriptor(baseline,ai))).toBe(plan.baselineImport.descriptorHash);
});

it('compiles a global Mesh observation without changing its descriptor or contract',()=>{
 const mesh=JSON.parse(readFileSync(new URL('../../../../../../../docs/examples/atlas-f6/mesh-baseline-import.json',import.meta.url),'utf8'));
 const definition=JSON.parse(readFileSync(new URL('../../../../../../../docs/examples/atlas-f2/network-relationship.ai.json',import.meta.url),'utf8'));
 const result=compileInitialBaselineDescriptor(mesh,definition);
 const {ai:delta,...rest}=result;
 expect(rest).toEqual(mesh.source.descriptor.compiled_json);expect(delta).toEqual(definition);
 expect(mesh.source.contract.tenant_id).toBeNull();
});

it('isolates tenant fork keys and starts their own release sequence',()=>{
 const mesh=JSON.parse(readFileSync(new URL('../../../../../../../docs/examples/atlas-f6/mesh-baseline-import.json',import.meta.url),'utf8'));
 expect(baselinePublicationCoordinate(mesh)).toEqual({publicationKey:`${mesh.publicationKey}.tenant.${mesh.tenantId}`,releaseNo:1});
 expect(baselinePublicationCoordinate({...mesh,tenantId:'different-tenant'}).publicationKey).not.toBe(baselinePublicationCoordinate(mesh).publicationKey);
 expect(baselinePublicationCoordinate(baseline)).toEqual({publicationKey:baseline.publicationKey,releaseNo:baseline.sourceReleaseNo+1});
});
