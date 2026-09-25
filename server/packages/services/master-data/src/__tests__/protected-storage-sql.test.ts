import {execFileSync} from "node:child_process";
import {expect,it} from "vitest";
import {DummyDriver,Kysely,PostgresAdapter,PostgresIntrospector,PostgresQueryCompiler,sql} from "kysely";
import {protectedTokenSql,restrictedValueFromStorage} from "../business-partner/protected-values/storage-contract.js";

// Opt-in, SELECT-only parity check against the existing DEV PostgreSQL engine. No application rows are read.
it.skipIf(process.env.RUN_BP_DEV_SQL_CHECK !== "1")("agrees with PostgreSQL for valid, malformed and conflicting token metadata",async()=>{
 const db=new Kysely<Record<string,never>>({dialect:{createAdapter:()=>new PostgresAdapter(),createDriver:()=>new DummyDriver(),createIntrospector:db=>new PostgresIntrospector(db),createQueryCompiler:()=>new PostgresQueryCompiler()}});
 try {
  for(const metadata of [{protectedValueToken:"bank:synthetic-test"},{protected:true,protectedValueToken:"bank:synthetic-test"},{protected:false,protectedValueToken:"bank:synthetic-test"},{protected:"true",protectedValueToken:"bank:synthetic-test"},{protectedValueToken:"bank:../invalid"},{protectedValueToken:"b".repeat(512)},{protectedValueToken:"b".repeat(513)},{},null]) {
   const query=sql`SELECT ${protectedTokenSql(sql`fixture.metadata`)} IS NOT NULL FROM (SELECT ${JSON.stringify(metadata)}::jsonb metadata) fixture`.compile(db);
   const statement=query.sql.replace(/\$(\d+)/g,(_,position)=>`'${String(query.parameters[Number(position)-1]).replaceAll("'","''")}'`);
   const value=execFileSync("docker",["exec","athyper-dev-db-1","psql","-X","-U","postgres","-d","athyper_neon","-v","ON_ERROR_STOP=1","-Atc",statement],{encoding:"utf8"}).trim();
   expect(value==="t").toBe(restrictedValueFromStorage(metadata,undefined,true)!==null);
  }
 } finally {await db.destroy();}
});
