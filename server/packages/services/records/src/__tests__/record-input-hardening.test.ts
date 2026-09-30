import { expect, it } from "vitest";
import { Kysely, DummyDriver, PostgresAdapter, PostgresIntrospector, PostgresQueryCompiler } from "kysely";
import { createKyselyRecordRepository, type RecordTransaction } from "../kysely-record-repository.js";
import { validateRecordInput } from "../field-validation.js";
import type { EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";
const descriptor = { schema:"athyper.entity-runtime-descriptor/1.0",entityCode:"example",releaseId:"test",releaseNo:1,contractHash:"sha256:test",compiledHash:"sha256:test",operations:{},planeKey:"neon", storage:{schema:"shared",object:"example",idField:"id",tenantField:"tenant_id",versionField:"version"},
  fields:[{key:"name",storagePath:"display_name",type:"string",required:false,writableOn:["create","patch"],validation:{maxLength:8,pattern:"^[a-z]+$"}}] } satisfies EntityRuntimeDescriptor;
it("rejects unknown and raw storage keys before SQL while preserving server tenant injection", async () => {
  const queries: string[]=[];
  class Driver extends DummyDriver { override async acquireConnection(){return {executeQuery:async<R>(query:{sql:string})=>{queries.push(query.sql);return {rows:[{id:"record"}] as R[]};},async *streamQuery<R>():AsyncGenerator<{rows:R[]}>{throw Error("unused");}};} }
  const db=new Kysely<Record<string,never>>({dialect:{createDriver:()=>new Driver(),createAdapter:()=>new PostgresAdapter(),createQueryCompiler:()=>new PostgresQueryCompiler(),createIntrospector:db=>new PostgresIntrospector(db)}});
  const repository=createKyselyRecordRepository({databases:{neon:db}}), tx=db as unknown as RecordTransaction;
  try {
    for(const key of ["unknown","display_name","tenant_id","version"]){
      await expect(repository.create(descriptor,"tenant",{[key]:"bad"},tx)).rejects.toMatchObject({code:"RECORD_INPUT_FIELD_UNKNOWN"});
      await expect(repository.patch(descriptor,"tenant","record",{[key]:"bad"},1,tx)).rejects.toMatchObject({code:"RECORD_INPUT_FIELD_UNKNOWN"});
    }
    expect(queries).toHaveLength(0);
    await repository.create(descriptor,"tenant",{name:"value"},tx);
    expect(queries[0]).toContain('"display_name"');expect(queries[0]).toContain('"tenant_id"');
  } finally {await db.destroy();}
});
it("skips pattern evaluation after length rejection and bounds patterned input",()=>{
  const invalid={...descriptor,fields:[{...descriptor.fields[0]!,validation:{maxLength:3,pattern:"["}}]};
  expect(validateRecordInput(invalid,"create",{name:"oversized"}).name?.[0]?.code).toBe("FIELD_TOO_LONG");
  const bounded={...descriptor,fields:[{...descriptor.fields[0]!,validation:{pattern:"^[a-z]+$"}}]};
  expect(validateRecordInput(bounded,"create",{name:"a".repeat(4097)}).name?.[0]?.code).toBe("FIELD_TOO_LONG");
});
