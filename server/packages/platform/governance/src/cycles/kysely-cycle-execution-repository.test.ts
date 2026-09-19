import { DummyDriver, Kysely, PostgresAdapter, PostgresIntrospector, PostgresQueryCompiler, type Dialect } from "kysely";
import { describe, expect, it } from "vitest";
import { KyselyCycleExecutionRepository } from "./kysely-cycle-execution-repository.js";

describe("KyselyCycleExecutionRepository",()=>{
  it("sets RLS identity and locks the run when loading a task",async()=>{const queries:string[]=[],planes:string[]=[],db=new Kysely<Record<string,never>>({dialect:dummyDialect(),log:event=>{queries.push(event.query.sql);}}),transactions={run:async<T>(plane:string,_actor:unknown,work:(transaction:any)=>Promise<T>)=>{planes.push(plane);return db.transaction().execute(work);}},repository=new KyselyCycleExecutionRepository("neon",transactions as never);await repository.transaction({tenantId:"00000000-0000-4000-8000-000000000001",principalId:"00000000-0000-4000-8000-000000000002"},async store=>{await store.getTask("00000000-0000-4000-8000-000000000003");});expect(planes).toEqual(["neon"]);expect(queries.some(query=>query.includes("set_config('app.current_tenant_id'")&&query.includes("app.current_principal_id"))).toBe(true);expect(queries.join("\n")).toMatch(/for update/i);await db.destroy();});
  it("locks absent idempotency keys and serializes deviations/certifications with their run", async () => {
    const queries: string[] = [];
    const db = new Kysely<Record<string,never>>({dialect:dummyDialect(),log:event=>{queries.push(event.query.sql);}});
    const repository = new KyselyCycleExecutionRepository("neon", {run:async(_plane:unknown,_actor:unknown,work:(tx:any)=>Promise<any>)=>db.transaction().execute(work)} as never);
    try {
      await repository.transaction({tenantId:"tenant",principalId:"principal"}, async store => {
        await store.findRunByIdempotencyKey("key"); await store.findDeviationCarryByIdempotencyKey("carry");
        await store.getDeviation("deviation"); await store.getCertification("certification");
      });
      expect(queries.filter(query=>query.includes("pg_advisory_xact_lock"))).toHaveLength(2);
      for (const table of ["cycle_deviation", "cycle_certification"]) expect(queries.find(query=>query.includes(`FROM governance.${table} item`))).toMatch(/JOIN governance.cycle_run run.*FOR UPDATE OF run,item/);
    } finally { await db.destroy(); }
  });

});

function dummyDialect():Dialect{return{createAdapter:()=>new PostgresAdapter(),createDriver:()=>new DummyDriver(),createIntrospector:db=>new PostgresIntrospector(db),createQueryCompiler:()=>new PostgresQueryCompiler()};}
