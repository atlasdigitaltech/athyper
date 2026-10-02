import {expect,it,vi} from "vitest";
import {Kysely,DummyDriver,PostgresAdapter,PostgresIntrospector,PostgresQueryCompiler} from "kysely";
import type {VerifiedRequestContext} from "@athyper/server-contract-auth";
import type {RegisteredActionCommand} from "@athyper/server-contract-records";
import type {EntityRuntimeDescriptor} from "@athyper/server-contract-metadata";
import type {RecordTransaction} from "@athyper/server-service-records";
import {createPrincipalPersonLinkAction} from "./principal-person-link-action.js";
const command={context:{planeKey:"neon",tenantId:"44444444-4444-4444-8444-444444444444",principalId:"hr"} as VerifiedRequestContext,
  entityCode:"principal",recordId:"11111111-1111-4111-8111-111111111111",actionCode:"link_person",idempotencyKey:"test-link-idempotency",origin:"operation",validationMode:"strict",
  input:{personId:"22222222-2222-4222-8222-222222222222",employmentId:"33333333-3333-4333-8333-333333333333",sourceRevision:"source-sha256:"+"a".repeat(64)}} as RegisteredActionCommand;
const descriptor:EntityRuntimeDescriptor={schema:'athyper.entity-runtime-descriptor/1.0',planeKey:'neon',releaseId:'release',releaseNo:1,compiledHash:'a'.repeat(64),contractHash:'b'.repeat(64),fields:[],operations:{},entityCode:"principal",storage:{schema:"master",object:"principal",idField:'id'},actions:[{code:'link_person',handlerKey:'identity.principal.link_person.v1',permissionCode:'neon.workforce.profile.write'}]};
const scopedDescriptor=descriptor;
function fixture(allowed:boolean,scope=true,failureCode?:string){
  const queries:{sql:string;parameters:readonly unknown[]}[]=[];
  class Driver extends DummyDriver{override async acquireConnection(){return {executeQuery:async<R>(q:{sql:string;parameters:readonly unknown[]})=>{queries.push(q);if(failureCode&&q.sql.includes('master.entity_link_person_v1'))throw Object.assign(new Error('private database diagnostic'),{code:failureCode});return {rows:(q.sql.includes('SELECT company_code_id')&&scope?[{company_code_id:"stored-company"}]:[]) as R[]};},async *streamQuery<R>():AsyncGenerator<{rows:R[]}>{throw Error('unused');}};}}
  const db=new Kysely<Record<string,never>>({dialect:{createDriver:()=>new Driver(),createAdapter:()=>new PostgresAdapter(),createQueryCompiler:()=>new PostgresQueryCompiler(),createIntrospector:db=>new PostgresIntrospector(db)}});
  const authorize=vi.fn(async()=>allowed?{allowed:true as const}:{allowed:false as const,reason:"scope denied"});
  const handler=createPrincipalPersonLinkAction({authorize});
  return {db,queries,authorize,handler,tx:db as unknown as RecordTransaction};
}
it("authorizes the stored employment company and invokes only the fenced link routine in the supplied transaction",async()=>{
  const f=fixture(true);try{
    expect((await f.handler.execute(command,descriptor,f.tx)).kind).toBe("Committed");
    expect(f.authorize).toHaveBeenCalledWith(expect.objectContaining({permissionCode:"neon.workforce.profile.write",resource:expect.objectContaining({companyCodeId:"stored-company",recordId:command.recordId})}));
    expect(f.queries.at(-1)!.sql).toContain('master.entity_link_person_v1');
    expect(f.queries.at(-1)!.parameters).toEqual([command.context.tenantId,command.recordId,command.input!['personId'],command.input!['sourceRevision']]);
    expect(f.queries.some(q=>q.sql.includes('UPDATE master.principal')||q.sql.includes('group_member'))).toBe(false);
  }finally{await f.db.destroy();}
});
it.each([[false,true],[true,false]])("denies without a valid stored scope and HR authorization (%s,%s)",async(allowed,scope)=>{
  const f=fixture(allowed,scope);try{
    expect((await f.handler.execute(command,descriptor,f.tx)).kind).toBe("Forbidden");
    expect(f.queries.some(q=>q.sql.includes('entity_link_person_v1'))).toBe(false);
  }finally{await f.db.destroy();}
});
it("rejects client-supplied company scope and identity/security fields before database reads",async()=>{
  const f=fixture(true);try{
    expect((await f.handler.execute({...command,input:{...command.input,companyCodeId:"forged-company",roles:["admin"]}},descriptor,f.tx)).kind).toBe("ValidationFailed");
    expect(f.queries).toEqual([]);
  }finally{await f.db.destroy();}
});
it('resolves the outer published action resource from stored Employment without treating it as a grant',async()=>{
  const f=fixture(false);try{
    expect(await f.handler.resolveAuthorizationResource!(command,scopedDescriptor,f.tx)).toEqual({kind:'Resolved',resource:{companyCodeId:'stored-company',personId:command.input!['personId'],employmentId:command.input!['employmentId']}});
    expect(f.authorize).not.toHaveBeenCalled();
    expect(f.queries.some(q=>q.sql.includes('entity_link_person_v1'))).toBe(false);
    expect((await f.handler.authorize!(command,scopedDescriptor,f.tx))?.kind).toBe('Forbidden');
  }finally{await f.db.destroy();}
});
it('rejects an incorrectly published link permission before resolving scope',async()=>{
  const f=fixture(true);try{
    expect((await f.handler.resolveAuthorizationResource!(command,{...descriptor,actions:[]},f.tx)).kind).toBe('CapabilityUnavailable');
    expect(f.queries).toEqual([]);
  }finally{await f.db.destroy();}
});
it.each([
  ['42501',403,'ENTITY_LINK_FORBIDDEN'],
  ['40001',409,'ENTITY_LINK_CONFLICT'],
  ['23505',409,'ENTITY_LINK_CONFLICT'],
  ['23503',422,'ENTITY_LINK_SOURCE_INVALID'],
])('returns a safe domain error for a rejected source transition (%s)',async(code,status,expected)=>{
  const f=fixture(true,true,code);try{
    await expect(f.handler.execute(command,descriptor,f.tx)).rejects.toMatchObject({statusCode:status,code:expected});
  }finally{await f.db.destroy();}
});
