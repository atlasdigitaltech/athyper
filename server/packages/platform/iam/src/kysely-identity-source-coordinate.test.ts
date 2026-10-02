import { expect, it } from "vitest";
import { Kysely, DummyDriver, PostgresAdapter, PostgresIntrospector, PostgresQueryCompiler, type Transaction } from "kysely";
import { KyselyPlaneLocalIdentityAuthority } from "./kysely-identity-saga.js";
import type { PlaneLocalIdentityAuthority } from "./identity-saga.js";

type Db = Record<string, never>;
const input: Parameters<PlaneLocalIdentityAuthority["converge"]>[0] = {
  identityId:"identity",personId:"person",sourcePlane:"neon",sourceTenantId:"source-tenant",
  identifier:"user@example.test",displayName:"User",providerSubject:"subject",realmKey:"realm",
  desiredVersion:2,desiredHash:"a".repeat(64),
  membership:{organizationId:"org",relationship:"employer",sourceRef:"employment:one"},
  applications:[{plane:"mesh",targetTenantId:"application-tenant",roles:[]}],
};

it("persists the exact source Person coordinate when provisioning a different plane and tenant",async()=>{
  const statements:{sql:string;parameters:readonly unknown[]}[]=[];
  class Driver extends DummyDriver {
    override async acquireConnection(){return {
      async executeQuery<R>(query:{sql:string;parameters:readonly unknown[]}) {
        statements.push(query);
        const rows = query.sql.startsWith("SELECT id,status FROM master.principal") ? []
          : query.sql.startsWith("INSERT INTO master.principal(") ? [{id:"principal",status:"active"}]
          : query.sql.startsWith("SELECT principal_id FROM master.principal_identity_binding") ? [{principal_id:"principal"}]
          : query.sql.startsWith("SELECT id,status FROM authz.plane_membership") ? [{id:"membership",status:"active"}] : [];
        return {rows:rows as R[]};
      },
      async *streamQuery<R>():AsyncGenerator<{rows:R[]}>{throw Error("unused");},
    };}
  }
  const db=new Kysely<Db>({dialect:{createDriver:()=>new Driver(),createAdapter:()=>new PostgresAdapter(),createQueryCompiler:()=>new PostgresQueryCompiler(),createIntrospector:db=>new PostgresIntrospector(db)}});
  const run = async<T>(work:(tx:Transaction<Db>)=>Promise<T>)=>work(db as unknown as Transaction<Db>);
  const authority=new KyselyPlaneLocalIdentityAuthority(run,{run:async(_plane,work)=>run(work)},"actor");
  try {
    await authority.converge(input);
    for(const prefix of ["INSERT INTO master.principal(","INSERT INTO master.principal_identity_binding("]) {
      const query=statements.find(s=>s.sql.startsWith(prefix));expect(query).toBeDefined();
      const evidence=query!.parameters.filter((v):v is string=>typeof v==="string"&&v.startsWith("{")).map(v=>JSON.parse(v)).find(v=>v.trustIamIdentityId==="identity");
      expect(evidence).toMatchObject({personId:"person",sourcePlane:"neon",sourceTenantId:"source-tenant",relationship:"employer",sourceRef:"employment:one"});
      expect(evidence.sourceTenantId).not.toBe("application-tenant");
    }
  }finally{await db.destroy();}
});

it("rejects missing source coordinates before opening any plane transaction",async()=>{
  let opened=false;
  const run=async<T>(_work:(tx:Transaction<Db>)=>Promise<T>):Promise<T>=>{opened=true;throw Error("unexpected transaction");};
  const authority=new KyselyPlaneLocalIdentityAuthority(run,{run:async(_plane,work)=>run(work)},"actor");
  await expect(authority.converge({...input,sourceTenantId:""})).rejects.toThrow("IDENTITY_SOURCE_TENANT_INVALID");
  await expect(authority.converge({...input,sourcePlane:"unknown" as "neon"})).rejects.toThrow("IDENTITY_SOURCE_PLANE_INVALID");
  expect(opened).toBe(false);
});
