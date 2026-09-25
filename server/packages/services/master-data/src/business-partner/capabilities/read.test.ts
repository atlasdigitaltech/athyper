import {describe,it,expect} from 'vitest';
import {Kysely,PostgresAdapter,PostgresIntrospector,PostgresQueryCompiler,type Transaction} from 'kysely';
import {readEnabledPartnerCapabilities} from './read.js';

describe('enabled partner capabilities',()=>{
 it.each([[false,false,[]],[true,false,['supplier']],[false,true,['customer']],[true,true,['supplier','customer']]] as const)('projects independent flags %s/%s without a legacy UUID',async(supplier,customer,expected)=>{
  let statement='',parameters:readonly unknown[]=[];
  const db=new Kysely<Record<string,never>>({dialect:{createAdapter:()=>new PostgresAdapter(),createIntrospector:db=>new PostgresIntrospector(db),createQueryCompiler:()=>new PostgresQueryCompiler(),createDriver:()=>({async init(){},async acquireConnection(){return {async executeQuery(query:{sql:string;parameters:readonly unknown[]}){statement=query.sql;parameters=query.parameters;return {rows:[{supplier_enabled:supplier,customer_enabled:customer}]};},async *streamQuery(){}} as never;},async releaseConnection(){},async beginTransaction(){},async commitTransaction(){},async rollbackTransaction(){},async destroy(){}})}});
  try{
   const rows=await readEnabledPartnerCapabilities('tenant','partner',db as unknown as Transaction<Record<string,never>>);
   expect(rows.map(r=>r.code)).toEqual(expected);
   expect(rows.every(r=>r.status==='enabled'&&!('id' in r))).toBe(true);
   expect(statement).toContain('FROM master.business_partner');
   expect(statement).not.toMatch(/master\.(supplier|customer)\b/);
   expect(parameters).toEqual(['tenant','partner']);
  }finally{await db.destroy();}
 });
});
