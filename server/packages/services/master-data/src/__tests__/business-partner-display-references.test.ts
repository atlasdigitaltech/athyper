import { expect, it } from "vitest";
import { DummyDriver, Kysely, PostgresAdapter, PostgresIntrospector, PostgresQueryCompiler, type Transaction } from "kysely";
import { businessPartnerDisplayReferences } from "../business-partner-display-references.js";

it("resolves registered IDs in one tenant-bound query while preserving technical references",async()=>{
  const id="11111111-1111-4111-8111-111111111111",queries:{sql:string;parameters:readonly unknown[]}[]=[];
  const db=new Kysely<Record<string,never>>({dialect:{createAdapter:()=>new PostgresAdapter(),createDriver:()=>new DummyDriver(),createIntrospector:db=>new PostgresIntrospector(db),createQueryCompiler:()=>new PostgresQueryCompiler()},log:event=>{if(event.level==='query')queries.push(event.query);},plugins:[{transformQuery:args=>args.node,transformResult:async args=>({...args.result,rows:[{id,code:"MY01",name:"Malaysia Operations"}]})}]});
  try {
    const value={organizationAssignments:[{operatingOrganizationId:id},{operatingOrganizationId:id}],unregisteredId:id};
    const result=await businessPartnerDisplayReferences(value,"tenant",db as unknown as Transaction<Record<string,never>>);
    expect(queries).toHaveLength(1);
    expect(queries[0]!.sql).toContain('"master"."operating_organization"');
    expect(queries[0]!.parameters).toContain("tenant");
    expect(result).toMatchObject({organizationAssignments:[{operatingOrganizationId:id,displayValues:{operatingOrganizationId:"MY01 · Malaysia Operations"}},{operatingOrganizationId:id,displayValues:{operatingOrganizationId:"MY01 · Malaysia Operations"}}],unregisteredId:id});
    expect(value.organizationAssignments[0]).not.toHaveProperty("displayValues");
  } finally {await db.destroy();}
});
