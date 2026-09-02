#!/usr/bin/env tsx

import {randomUUID} from "node:crypto";
import {mkdir,readFile,writeFile} from "node:fs/promises";
import {dirname,resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {Client} from "pg";
import {assertLoopbackDatabaseTarget} from "../lib/database-target.js";

const CONFIRMATION="APPLY-BP-S4-DISPOSABLE-MIGRATION";
const repositoryRoot=resolve(import.meta.dirname,"../../../..");
const migrationPath="server/db/migrations/20260903_neon_business_partner_integrity_hardening.sql";

export async function runBusinessPartnerS4MigrationEvidence(options:{readonly neonDatabaseUrl:string;readonly confirmation?:string;readonly output?:string}){
  assertLoopbackDatabaseTarget(options.neonDatabaseUrl,"athyper_neon");
  if(options.confirmation!==CONFIRMATION)throw new Error(`execution requires --confirm=${CONFIRMATION}`);
  const client=new Client({connectionString:options.neonDatabaseUrl,application_name:"bp-s4-migration-evidence"});await client.connect();
  const tenant="00000000-0000-0000-0000-000000000000",actor=tenant;
  const ids={dirty:randomUUID(),supplierBp:randomUUID(),customerBp:randomUUID(),supplier:randomUUID(),customer:randomUUID(),org:randomUUID(),legal:randomUUID(),company:randomUUID(),qualification:randomUUID(),preference:randomUUID(),designation:randomUUID(),credit:randomUUID()};
  try{
    const alreadyInstalled=Boolean((await client.query<{installed:boolean}>("SELECT to_regclass('master.business_partner_alias') IS NOT NULL installed")).rows[0]?.installed);
    if(alreadyInstalled)throw new Error("migration evidence requires a disposable pre-S4 database");
    const migration=await readFile(resolve(repositoryRoot,migrationPath),"utf8"),preflight=migration.slice(migration.indexOf("DO $$"),migration.indexOf("INSERT INTO control.lookup_domain"));
    await client.query("BEGIN");await setContext(client,tenant,actor);
    await client.query(`INSERT INTO master.business_partner(id,tenant_id,code,name,partner_category,category_locked_by,metadata,created_by) VALUES($1,$2,'S4DIRTY','S4 dirty preflight','organization',$2,'{"creditLimit":1}',$2)`,[ids.dirty,tenant]);
    let preflightRejected=false,preflightSqlState:string|null=null,preflightMessage="";try{await client.query(preflight);}catch(error){const value=error as Error&{code?:string};preflightRejected=true;preflightSqlState=value.code??null;preflightMessage=value.message;}
    await client.query("ROLLBACK");
    if(!preflightRejected||!preflightMessage.includes("S4 preflight failed"))throw new Error("S4 dirty-data preflight did not fail with actionable output");

    await setContext(client,tenant,actor);
    await client.query(`INSERT INTO master.operating_organization(id,tenant_id,code,name,domain,status,created_by) VALUES($1,$2,$3,'S4 migration organization','both','active',$2)`,[ids.org,tenant,`s4_migration_${ids.org.slice(0,8)}`]);
    await client.query(`INSERT INTO master.legal_entity(id,tenant_id,code,name,legal_name,functional_currency,status,created_by) VALUES($1,$2,$3,'S4 migration legal entity','S4 migration legal entity','MYR','active',$2)`,[ids.legal,tenant,`s4_legal_${ids.legal.slice(0,8)}`]);
    await client.query(`INSERT INTO master.company_code(id,tenant_id,legal_entity_id,code,name,functional_currency,status,created_by) VALUES($1,$2,$3,$4,'S4 migration company','MYR','active',$2)`,[ids.company,tenant,ids.legal,`s4_company_${ids.company.slice(0,8)}`]);
    await client.query(`INSERT INTO master.business_partner(id,tenant_id,code,name,partner_category,category_locked_by,aliases,created_by) VALUES($1,$3,$4,'S4 supplier BP','organization',$3,ARRAY['Legacy Supplier',' Legacy Trading '],$3),($2,$3,$5,'S4 customer BP','organization',$3,ARRAY['Legacy Customer'],$3)`,[ids.supplierBp,ids.customerBp,tenant,`S4SUP${ids.supplierBp.slice(0,8).toUpperCase()}`,`S4CUS${ids.customerBp.slice(0,8).toUpperCase()}`]);
    await client.query(`INSERT INTO master.supplier(id,tenant_id,business_partner_id,supplier_code,created_by) VALUES($1,$2,$3,$4,$2)`,[ids.supplier,tenant,ids.supplierBp,`S4SUP${ids.supplier.slice(0,8).toUpperCase()}`]);
    await client.query(`INSERT INTO master.customer(id,tenant_id,business_partner_id,customer_code,created_by) VALUES($1,$2,$3,$4,$2)`,[ids.customer,tenant,ids.customerBp,`S4CUS${ids.customer.slice(0,8).toUpperCase()}`]);
    await client.query(`INSERT INTO master.operating_organization_company_assignment(tenant_id,operating_organization_id,company_code_id,effective_from,status,created_by) VALUES($1,$2,$3,CURRENT_DATE,'active',$1)`,[tenant,ids.org,ids.company]);
    await client.query(`INSERT INTO master.business_partner_operating_organization_assignment(tenant_id,business_partner_id,operating_organization_id,partner_role,effective_from,status,created_by) VALUES($1,$2,$4,'supplier',CURRENT_DATE,'active',$1),($1,$3,$4,'customer',CURRENT_DATE,'active',$1)`,[tenant,ids.supplierBp,ids.customerBp,ids.org]);
    await client.query(`INSERT INTO control.business_partner_qualification(id,tenant_id,business_partner_id,partner_role,operating_organization_id,company_code_id,qualification_type_code,idempotency_key,created_by) VALUES($1,$2,$3,'supplier',$4,$5,'basic',$6,$2)`,[ids.qualification,tenant,ids.supplierBp,ids.org,ids.company,`s4-qualification-${ids.qualification}`]);
    await client.query(`INSERT INTO control.supplier_preference_designation(id,tenant_id,business_partner_id,supplier_id,operating_organization_id,company_code_id,effective_from,rationale,idempotency_key,created_by) VALUES($1,$2,$3,$4,$5,$6,CURRENT_DATE,'S4 migration probe',$7,$2)`,[ids.preference,tenant,ids.supplierBp,ids.supplier,ids.org,ids.company,`s4-preference-${ids.preference}`]);
    await client.query(`INSERT INTO control.customer_account_designation(id,tenant_id,business_partner_id,customer_id,operating_organization_id,company_code_id,designation_type,effective_from,rationale,idempotency_key,created_by) VALUES($1,$2,$3,$4,$5,$6,'key_account',CURRENT_DATE,'S4 migration probe',$7,$2)`,[ids.designation,tenant,ids.customerBp,ids.customer,ids.org,ids.company,`s4-designation-${ids.designation}`]);
    await client.query(`INSERT INTO control.customer_credit_review(id,tenant_id,business_partner_id,customer_id,operating_organization_id,company_code_id,idempotency_key,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$2)`,[ids.credit,tenant,ids.customerBp,ids.customer,ids.org,ids.company,`s4-credit-${ids.credit}`]);
    const before=await authorityCounts(client,ids),legacyAliasElements=Number((await client.query<{count:number}>(`SELECT sum(cardinality(aliases))::int count FROM master.business_partner WHERE id=ANY($1::uuid[])`,[[ids.supplierBp,ids.customerBp]])).rows[0]?.count??0);
    await client.query(migration);
    const after=await authorityCounts(client,ids);
    const aliasRows=Number((await client.query<{count:number}>(`SELECT count(*)::int count FROM master.business_partner_alias WHERE business_partner_id=ANY($1::uuid[])`,[[ids.supplierBp,ids.customerBp]])).rows[0]?.count??0);
    const scopeRows=await client.query<{authority:string;count:number}>(`SELECT CASE WHEN qualification_id IS NOT NULL THEN 'qualification' WHEN supplier_preference_id IS NOT NULL THEN 'supplier_preference' WHEN customer_designation_id IS NOT NULL THEN 'customer_designation' ELSE 'credit_review' END authority,count(*)::int count FROM control.business_partner_decision_scope WHERE qualification_id=$1 OR supplier_preference_id=$2 OR customer_designation_id=$3 OR credit_review_id=$4 GROUP BY 1 ORDER BY 1`,[ids.qualification,ids.preference,ids.designation,ids.credit]);
    const expectedScopes={credit_review:2,customer_designation:2,qualification:2,supplier_preference:2};
    const scopesCorrect=scopeRows.rows.length===4&&scopeRows.rows.every(row=>row.count===expectedScopes[row.authority as keyof typeof expectedScopes]);
    const rowCountsPreserved=JSON.stringify(before)===JSON.stringify(after),passed=preflightRejected&&rowCountsPreserved&&aliasRows===legacyAliasElements&&scopesCorrect;
    const evidence={schemaVersion:1,kind:"athyper.business-partner-s4-migration-evidence",capturedAt:new Date().toISOString(),database:"athyper_neon",disposableRequired:true,migration:migrationPath,preflight:{rejected:preflightRejected,sqlState:preflightSqlState,message:preflightMessage},before,after,rowCountsPreserved,aliases:{legacyElements:legacyAliasElements,backfilledRows:aliasRows,preserved:aliasRows===legacyAliasElements},scopes:{rows:scopeRows.rows,expected:expectedScopes,preserved:scopesCorrect},passed};
    if(options.output){const destination=resolve(repositoryRoot,options.output);await mkdir(dirname(destination),{recursive:true});await writeFile(destination,`${JSON.stringify(evidence,null,2)}\n`,"utf8");}
    if(!passed)throw new Error("S4 migration evidence failed");return evidence;
  }finally{await client.end();}
}

async function authorityCounts(client:Client,ids:Record<string,string>){const row=(await client.query<Record<string,number>>(`SELECT (SELECT count(*)::int FROM master.business_partner WHERE id=ANY($1::uuid[])) business_partners,(SELECT count(*)::int FROM master.supplier WHERE id=$2) suppliers,(SELECT count(*)::int FROM master.customer WHERE id=$3) customers,(SELECT count(*)::int FROM control.business_partner_qualification WHERE id=$4) qualifications,(SELECT count(*)::int FROM control.supplier_preference_designation WHERE id=$5) preferences,(SELECT count(*)::int FROM control.customer_account_designation WHERE id=$6) designations,(SELECT count(*)::int FROM control.customer_credit_review WHERE id=$7) credit_reviews`,[[ids.supplierBp,ids.customerBp],ids.supplier,ids.customer,ids.qualification,ids.preference,ids.designation,ids.credit])).rows[0];return Object.fromEntries(Object.entries(row??{}).map(([key,value])=>[key,Number(value)]));}
async function setContext(client:Client,tenant:string,actor:string){await client.query("SELECT set_config('app.database_plane','neon',false),set_config('app.current_tenant_id',$1,false),set_config('app.current_principal_id',$2,false)",[tenant,actor]);}
function option(args:readonly string[],name:string){return args.find(value=>value.startsWith(`${name}=`))?.slice(name.length+1);}
if(import.meta.url===pathToFileURL(process.argv[1]??"").href){const args=process.argv.slice(2),url=option(args,"--neon-database-url")??process.env["ATHYPER_NEON_DATABASE_ADMIN_URL"];if(!url)throw new Error("--neon-database-url is required");process.stdout.write(`${JSON.stringify(await runBusinessPartnerS4MigrationEvidence({neonDatabaseUrl:url,confirmation:option(args,"--confirm"),...(option(args,"--output")?{output:option(args,"--output")}: {})}),null,2)}\n`);}
