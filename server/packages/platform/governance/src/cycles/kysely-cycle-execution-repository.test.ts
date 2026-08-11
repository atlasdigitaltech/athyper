import { DummyDriver, Kysely, PostgresAdapter, PostgresIntrospector, PostgresQueryCompiler, type Dialect } from "kysely";
import { describe, expect, it } from "vitest";
import { KyselyCycleExecutionRepository } from "./kysely-cycle-execution-repository.js";

describe("KyselyCycleExecutionRepository",()=>{
  it("sets RLS identity and locks the run when loading a task",async()=>{const queries:string[]=[],planes:string[]=[],db=new Kysely<Record<string,never>>({dialect:dummyDialect(),log:event=>{queries.push(event.query.sql);}}),transactions={run:async<T>(plane:string,_actor:unknown,work:(transaction:any)=>Promise<T>)=>{planes.push(plane);return db.transaction().execute(work);}},repository=new KyselyCycleExecutionRepository("neon",transactions as never);await repository.transaction({tenantId:"00000000-0000-4000-8000-000000000001",principalId:"00000000-0000-4000-8000-000000000002"},async store=>{await store.getTask("00000000-0000-4000-8000-000000000003");});expect(planes).toEqual(["neon"]);expect(queries.some(query=>query.includes("set_config('app.current_tenant_id'")&&query.includes("app.current_principal_id"))).toBe(true);expect(queries.join("\n")).toMatch(/for update/i);await db.destroy();});
});

function dummyDialect():Dialect{return{createAdapter:()=>new PostgresAdapter(),createDriver:()=>new DummyDriver(),createIntrospector:db=>new PostgresIntrospector(db),createQueryCompiler:()=>new PostgresQueryCompiler()};}
