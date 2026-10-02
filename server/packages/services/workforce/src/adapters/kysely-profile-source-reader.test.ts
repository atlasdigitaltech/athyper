import { expect, it } from 'vitest';
import { Kysely, DummyDriver, PostgresAdapter, PostgresIntrospector, PostgresQueryCompiler } from 'kysely';
import type { VerifiedRequestContext } from '@athyper/server-contract-auth';
import type { RecordTransaction } from '@athyper/server-service-records';
import { createKyselyProfileSourceReader } from './kysely-profile-source-reader.js';
import type { VerifiedProfileSourceSnapshot } from '../identity/verified-profile-source.js';

function fixture(snapshot?: VerifiedProfileSourceSnapshot) {
  const queries: { sql: string; parameters: readonly unknown[] }[] = [];
  class Driver extends DummyDriver {
    override async acquireConnection() {
      return {
        executeQuery: async <R>(query: { sql: string; parameters: readonly unknown[] }) => {
          queries.push(query);
          return { rows: (snapshot ? [{ snapshot }] : []) as R[] };
        },
        async *streamQuery<R>(): AsyncGenerator<{ rows: R[] }> { throw Error('unused'); },
      };
    }
  }
  const db = new Kysely<Record<string, never>>({ dialect: {
    createDriver: () => new Driver(), createAdapter: () => new PostgresAdapter(),
    createQueryCompiler: () => new PostgresQueryCompiler(), createIntrospector: db => new PostgresIntrospector(db),
  } });
  return { db, queries, transaction: db as unknown as RecordTransaction };
}
const snapshot: VerifiedProfileSourceSnapshot = {
  tenantId: 'target-tenant', principalId: 'selected-owner', revision: 'verified-revision',
  complete: true, fenced: true, state: 'linked',
  sources: [{ plane: 'neon', tenantId: 'canonical-tenant', entityCode: 'person', recordId: 'canonical-person', verified: true }],
};

it.each(['neon', 'studio', 'mesh'] as const)('selects the installed %s routine without substituting actor or source tenant', async planeKey => {
  const f = fixture(snapshot);
  try {
    const result = await createKyselyProfileSourceReader().lockAndRead({
      context: { planeKey, tenantId: 'target-tenant', principalId: 'administrator' } as VerifiedRequestContext,
      ownerPrincipalId: 'selected-owner',
    }, f.transaction);
    expect(f.queries).toHaveLength(1);
    expect(f.queries[0]!.sql).toContain(planeKey === 'neon' ? 'master.entity_profile_source_v1' : 'master.entity_projected_profile_source_v1');
    expect(f.queries[0]!.parameters).toEqual(['target-tenant', 'selected-owner']);
    expect(result.sources[0]!.tenantId).toBe('canonical-tenant');
  } finally { await f.db.destroy(); }
});

it('refuses an unknown plane before querying any database', async () => {
  const f = fixture(snapshot);
  try {
    await expect(createKyselyProfileSourceReader().lockAndRead({ context: { planeKey: 'unknown' } as unknown as VerifiedRequestContext, ownerPrincipalId: 'owner' }, f.transaction)).rejects.toThrow('ENTITY_SOURCE_PLANE_UNAVAILABLE');
    expect(f.queries).toEqual([]);
  } finally { await f.db.destroy(); }
});

it('does not turn missing authority evidence into an unlinked identity', async () => {
  const f = fixture();
  try {
    await expect(createKyselyProfileSourceReader().lockAndRead({ context: { planeKey: 'mesh', tenantId: 'tenant' } as VerifiedRequestContext, ownerPrincipalId: 'owner' }, f.transaction)).rejects.toThrow('ENTITY_SOURCE_EVIDENCE_UNAVAILABLE');
  } finally { await f.db.destroy(); }
});
