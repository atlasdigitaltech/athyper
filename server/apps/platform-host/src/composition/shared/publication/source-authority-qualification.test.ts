import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { compileTableEntityProduct, parseTableEntityProduct } from '@athyper/server-plane-studio-meta-entity-authoring';
import { qualifyReferencePublicationTarget } from './target-qualification.js';
it('blocks publication when the declared profile source resolver is not installed', async () => {
  const product = parseTableEntityProduct(JSON.parse(readFileSync(new URL('../../../../../../../metadata/products/shared/entities/principal_profile/definition.json', import.meta.url), 'utf8')));
  const {graph, artifact} = compileTableEntityProduct(product, 'neon');
  const target = structuredClone({graph, artifact, targetPlane: 'neon' as const, sourceContractHash: artifact.contractHash});
  target.graph.surfaces![0]!.layoutConfig = { ...target.graph.surfaces![0]!.layoutConfig, tableEntityProduct: {} };
  target.artifact.descriptor.ownerAccess = { ...(target.artifact.descriptor.ownerAccess as object), sourceAuthority: 'identity.profile-source.v1' };
  await expect(qualifyReferencePublicationTarget(target, { databases: {}, runtime: { qualify() {} }, qualifyCapabilities: async () => {} })).rejects.toThrow('PUBLICATION_SOURCE_AUTHORITY_UNAVAILABLE');
});
it('does not accept a registered resolver name without target qualification',async()=>{
  const product=parseTableEntityProduct(JSON.parse(readFileSync(new URL('../../../../../../../metadata/products/shared/entities/principal_profile/definition.json',import.meta.url),'utf8')));
  const {graph,artifact}=compileTableEntityProduct(product,'neon');
  graph.surfaces![0]!.layoutConfig={...graph.surfaces![0]!.layoutConfig,tableEntityProduct:{}};
  artifact.descriptor.ownerAccess={...(artifact.descriptor.ownerAccess as object),sourceAuthority:'identity.profile-source.v1'};
  await expect(qualifyReferencePublicationTarget({graph,artifact,targetPlane:'neon',sourceContractHash:artifact.contractHash},{databases:{},sourceAuthorities:new Set(['identity.profile-source.v1']),runtime:{qualify(){}},qualifyCapabilities:async()=>{}})).rejects.toThrow('PUBLICATION_SOURCE_AUTHORITY_UNAVAILABLE');
});
it('blocks a target whose installed source implementation is not qualified',async()=>{
  const product=parseTableEntityProduct(JSON.parse(readFileSync(new URL('../../../../../../../metadata/products/shared/entities/principal_profile/definition.json',import.meta.url),'utf8')));
  const {graph,artifact}=compileTableEntityProduct(product,'neon');
  graph.surfaces![0]!.layoutConfig={...graph.surfaces![0]!.layoutConfig,tableEntityProduct:{}};
  artifact.descriptor.ownerAccess={...(artifact.descriptor.ownerAccess as object),sourceAuthority:'identity.profile-source.v1'};
  await expect(qualifyReferencePublicationTarget({graph,artifact,targetPlane:'neon',sourceContractHash:artifact.contractHash},{databases:{neon:{} as never},sourceAuthorities:new Set(['identity.profile-source.v1']),sourceAuthorityQualifiers:new Map([['identity.profile-source.v1',async()=>false]]),runtime:{qualify(){}},qualifyCapabilities:async()=>{}})).rejects.toThrow('PUBLICATION_SOURCE_AUTHORITY_UNAVAILABLE');
});
