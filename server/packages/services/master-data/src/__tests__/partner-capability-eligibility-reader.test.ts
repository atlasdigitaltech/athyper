import {describe,it,expect} from 'vitest';
import {Kysely,PostgresAdapter,PostgresIntrospector,PostgresQueryCompiler} from 'kysely';
import {KyselyBusinessPartnerEligibilityRepository} from '../kysely-business-partner-eligibility-repository.js';

function database(enabled:boolean){
 const statements:string[]=[];
 const db=new Kysely<Record<string,never>>({dialect:{
  createAdapter:()=>new PostgresAdapter(),createIntrospector:db=>new PostgresIntrospector(db),createQueryCompiler:()=>new PostgresQueryCompiler(),
  createDriver:()=>({async init(){},async acquireConnection(){return {async executeQuery(query:{sql:string}){
   statements.push(query.sql);
   return {rows:query.sql.startsWith('SELECT bp.status')?[{status:'active',capability_enabled:enabled,assignment_id:'assignment',assignment_status:'active',company_compatible:true,profile_id:'profile',profile_status:'active',payment_term_id:'term'}]:[]};
  },async *streamQuery(){}} as never;},async releaseConnection(){},async beginTransaction(){},async commitTransaction(){},async rollbackTransaction(){},async destroy(){}})
 }});
 return {db,statements};
}
describe('BP capability eligibility authority',()=>{
 it.each(['supplier','customer'] as const)('uses %s capability, never a retained legacy role identity',async role=>{
  for(const enabled of [false,true]){
   const {db,statements}=database(enabled);
   try{
    const result=await new KyselyBusinessPartnerEligibilityRepository().resolve({tenantId:'tenant',businessPartnerId:'partner',operatingOrganizationId:'org',role,operationCode:'purchasing',businessDate:'2026-09-25'},db);
    expect(statements[0]).toContain('bp.supplier_enabled');
    expect(statements[0]).toContain('bp.customer_enabled');
    expect(statements[0]).not.toMatch(/master\.(supplier|customer)\b|role_record|role_id/);
    expect(result?.reasons.some(r=>r.code==='ROLE_INACTIVE')).toBe(!enabled);
    // Enabled alone must not skip risk/qualification and other governing checks.
    expect(result?.eligible).toBe(false);
   }finally{await db.destroy();}
  }
 });
});
