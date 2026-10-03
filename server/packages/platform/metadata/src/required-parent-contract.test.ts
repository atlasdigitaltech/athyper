import { expect, it } from 'vitest';
import type { CompiledEntityArtifactV2 } from '@athyper/server-contract-publication';
import { validateCompiledRuntimeContracts } from './compiled-runtime-contract.js';
it('rejects parent-scoped split publication without a signed enforcing runtime member', () => {
  const core = { artifactType: 'core', artifactKey: 'line/core', entityCode: 'line', content: {
    directoryScope: { schemaVersion: 1, mode: 'tenant', parent: { entityCode: 'shipment', relationshipKey: 'lines' } },
  } } as unknown as CompiledEntityArtifactV2;
  expect(() => validateCompiledRuntimeContracts([core])).toThrow('COMPILED_ENTITY_PARENT_RUNTIME_REQUIRED');
});
