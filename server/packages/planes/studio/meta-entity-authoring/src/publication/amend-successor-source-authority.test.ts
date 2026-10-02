import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { parseTableEntityProduct } from '../authoring/table-product.js';
import { amendSuccessorSourceAuthority } from './amend-successor-source-authority.js';
import { compileGraph } from '../deterministic.js';

function baseline() {
  return parseTableEntityProduct(JSON.parse(readFileSync(new URL('../../../../../../../metadata/products/shared/entities/principal_profile/definition.json', import.meta.url), 'utf8'))).definition;
}
it('changes only the published source binding and leaves its predecessor untouched', () => {
  const graph = baseline(), before = structuredClone(graph);
  const amended = amendSuccessorSourceAuthority(graph, 'identity.profile-source.v1');
  const expected = structuredClone(before);
  const surface = expected.surfaces!.find(s => s.layoutConfig?.ownerAccess)!;
  surface.layoutConfig!.ownerAccess = { ...(surface.layoutConfig!.ownerAccess as object), sourceAuthority: 'identity.profile-source.v1' };
  expect(amended).toEqual(expected);
  expect(graph).toEqual(before);
  expect(amendSuccessorSourceAuthority(amended, 'identity.profile-source.v1')).toEqual(amended);
  const artifact = compileGraph(amended), predecessor = compileGraph(before);
  expect(artifact.descriptor.ownerAccess).toMatchObject({ sourceAuthority: 'identity.profile-source.v1', ownerField: 'principal_id' });
  expect(artifact.contractHash).not.toBe(predecessor.contractHash);
  expect(artifact.descriptorHash).not.toBe(predecessor.descriptorHash);
});
it('rejects absent or ambiguous ownership and executable resolver paths', () => {
  const graph = baseline();
  expect(() => amendSuccessorSourceAuthority({ ...graph, surfaces: [] }, 'identity.profile-source.v1')).toThrow('OWNER_REQUIRED');
  const owner = graph.surfaces!.find(s => s.layoutConfig?.ownerAccess)!;
  expect(() => amendSuccessorSourceAuthority({ ...graph, surfaces: [...graph.surfaces!, { ...owner, id: 'duplicate' }] }, 'identity.profile-source.v1')).toThrow('OWNER_REQUIRED');
  expect(() => amendSuccessorSourceAuthority(graph, 'https://untrusted/resolver')).toThrow('KEY_INVALID');
});
