import { expect, it } from 'vitest';
import { parseEntityDirectoryScope } from './directory-scope.js';

it('validates an explicit parent relationship without inferring an owner', () => {
  const parent = { entityCode: 'shipment', relationshipKey: 'items' };
  expect(parseEntityDirectoryScope({ schemaVersion: 1, mode: 'tenant', parent }).parent).toEqual(parent);
  for (const invalid of [null, {}, { entityCode: 'shipment' }, { ...parent, permissionCode: 'guessed.read' }, { ...parent, relationshipKey: '../items' }])
    expect(() => parseEntityDirectoryScope({ schemaVersion: 1, mode: 'tenant', parent: invalid })).toThrow('Invalid required parent scope');
  expect(parseEntityDirectoryScope({ schemaVersion: 1, mode: 'tenant' }).parent).toBeUndefined();
});
