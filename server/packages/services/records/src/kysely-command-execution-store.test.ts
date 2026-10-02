import { expect, it } from 'vitest';
import { Kysely, DummyDriver, PostgresAdapter, PostgresIntrospector, PostgresQueryCompiler } from 'kysely';
import { createKyselyCommandExecutionStore } from './kysely-command-execution-store.js';
import type { RecordTransaction } from './kysely-record-repository.js';
it('keeps command receipt/start consistent and completion monotonic under wall-clock correction',async()=>{
 const queries:string[]=[];
 class Driver extends DummyDriver { override async acquireConnection(){return {executeQuery:async<R>(query:{sql:string})=>{queries.push(query.sql);return {rows:[{id:'execution'}] as R[]};},async *streamQuery<R>():AsyncGenerator<{rows:R[]}>{throw Error('unused');}};} }
 const db=new Kysely<Record<string,never>>({dialect:{createDriver:()=>new Driver(),createAdapter:()=>new PostgresAdapter(),createQueryCompiler:()=>new PostgresQueryCompiler(),createIntrospector:db=>new PostgresIntrospector(db)}});
 const store=createKyselyCommandExecutionStore<{done:boolean}>();
 try {
  await store.begin({tenantId:'tenant',commandCode:'entity.profile.create',idempotencyKey:'request',requestFingerprint:'a'.repeat(64),actorPrincipalId:'actor',sourceService:'records'},db as unknown as RecordTransaction);
  await store.complete('execution',{done:true},'actor',db as unknown as RecordTransaction);
  expect(queries[0]).toContain('received_at, started_at');
  expect(queries[0]?.match(/transaction_timestamp\(\)/g)).toHaveLength(2);
  expect(queries[1]).toContain('GREATEST(clock_timestamp(), started_at)');
 } finally { await db.destroy(); }
});
