import { expect, it } from 'vitest';
import { parseEntityDirectoryScope } from './directory-scope.js';

it('validates an explicit parent relationship without inferring an owner', () => {
  const parent = { entityCode: 'shipment', relationshipKey: 'items' };
  expect(parseEntityDirectoryScope({ schemaVersion: 1, mode: 'tenant', parent }).parent).toEqual(parent);
  for (const invalid of [null, {}, { entityCode: 'shipment' }, { ...parent, permissionCode: 'guessed.read' }, { ...parent, relationshipKey: '../items' }])
    expect(() => parseEntityDirectoryScope({ schemaVersion: 1, mode: 'tenant', parent: invalid })).toThrow('Invalid required parent scope');
  expect(parseEntityDirectoryScope({ schemaVersion: 1, mode: 'tenant' }).parent).toBeUndefined();
});

it('rejects incomplete or ambiguous directory field bindings', () => {
  const valid = { schemaVersion: 1, mode: 'company', fieldBinding: { resolver: 'neon.directory.fields.v1', companyField: 'company_owner' } };
  expect(parseEntityDirectoryScope(valid)).toEqual(valid);
  for (const value of [
    { ...valid, mode: 'tenant' },
    { ...valid, mode: 'organization' },
    { ...valid, mode: 'organization_company' },
    { ...valid, fieldBinding: { ...valid.fieldBinding, companyField: 'x; DROP TABLE' } },
    { ...valid, fieldBinding: { ...valid.fieldBinding, resolver: 'guessed' } },
    { ...valid, fieldBinding: { ...valid.fieldBinding, allowNull: true } },
  ]) expect(() => parseEntityDirectoryScope(value)).toThrow('Invalid directory field binding');
});
