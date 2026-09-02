#!/usr/bin/env tsx

import {execFile} from "node:child_process";
import {createHash,randomUUID} from "node:crypto";
import {mkdir,readFile,writeFile} from "node:fs/promises";
import {dirname,resolve} from "node:path";
import {promisify} from "node:util";
import {pathToFileURL} from "node:url";
import {Client} from "pg";
import {assertLoopbackDatabaseTarget} from "../lib/database-target.js";

const execFileAsync=promisify(execFile);
const CONFIRMATION="RUN-BP-S4-CERTIFICATION";
const repositoryRoot=resolve(import.meta.dirname,"../../../..");
const compatibilityPath="config/governance/business-partner-s4-compatibility-retirement.v1.json";
type Rejection={code:string;rejected:boolean;sqlState:string|null;message:string};
type Race={code:string;accepted:number;rejected:number;loserSqlState:string|null};

export async function runBusinessPartnerS4Certification(options:{readonly neonDatabaseUrl:string;readonly confirmation?:string;readonly output?:string}){
  assertLoopbackDatabaseTarget(options.neonDatabaseUrl,"athyper_neon");
  if(options.confirmation!==CONFIRMATION)throw new Error(`execution requires --confirm=${CONFIRMATION}`);
  const client=new Client({connectionString:options.neonDatabaseUrl,application_name:"bp-s4-certification"});
  await client.connect();
  try{
    const objects=await verifyObjects(client);
    const negative=await runNegativeProbes(client);
    const concurrencyResult=await runConcurrencyProbes(options.neonDatabaseUrl),concurrency=concurrencyResult.probes;
    const compatibility=await measureCompatibility(client);
    const passed=objects.every(value=>value.present)&&negative.every(value=>value.rejected)&&concurrency.every(value=>value.accepted===1&&value.rejected===1)&&concurrencyResult.cleanupVerified;
    const evidence={schemaVersion:1,kind:"athyper.business-partner-s4-certification",capturedAt:new Date().toISOString(),database:"athyper_neon",sanitized:true,dataDisposition:{negativeFixtures:"transaction_rollback",concurrencyFixtures:"committed_then_deleted",cleanupVerified:concurrencyResult.cleanupVerified},objects,negative,concurrency,compatibility,passed};
    if(options.output){const destination=resolve(repositoryRoot,options.output);await mkdir(dirname(destination),{recursive:true});await writeFile(destination,`${JSON.stringify(evidence,null,2)}\n`,"utf8");}
    if(!passed)throw new Error("S4 certification did not pass every required probe");
    return evidence;
  }finally{await client.end();}
}

async function verifyObjects(client:Client){
  const names=["master.business_partner_alias","control.business_partner_decision_scope"];
  const rows=await client.query<{name:string;present:boolean}>("SELECT value name,to_regclass(value) IS NOT NULL present FROM unnest($1::text[]) value ORDER BY value",[names]);
  return rows.rows;
}

async function runNegativeProbes(client:Client):Promise<Rejection[]>{
  const tenant="00000000-0000-0000-0000-000000000000",actor=tenant;
  const ids={a:randomUUID(),b:randomUUID(),c:randomUUID(),supplier:randomUUID(),org:randomUUID(),inactiveOrg:randomUUID(),qualification:randomUUID()};
  await client.query("BEGIN");
  try{
    await context(client,tenant,actor);
    await client.query(`INSERT INTO master.operating_organization(id,tenant_id,code,name,domain,status,created_by) VALUES($1,$3,'s4_cert_active','S4 active organization','procurement','active',$3),($2,$3,'s4_cert_inactive','S4 inactive organization','procurement','draft',$3)`,[ids.org,ids.inactiveOrg,tenant]);
    await client.query(`INSERT INTO control.lookup_value(tenant_id,code,name,domain_code,is_system,status,created_by) VALUES($1,'s4_inactive','S4 inactive relationship','master.business_partner_relationship_type',false,'deprecated',$1)`,[tenant]);
    for(const [id,suffix] of [[ids.a,"A"],[ids.b,"B"],[ids.c,"C"]])await client.query(`INSERT INTO master.business_partner(id,tenant_id,code,name,partner_category,category_locked_by,created_by) VALUES($1,$2,$3,$3,'organization',$2,$2)`,[id,tenant,`S4CERT${suffix}`]);
    await client.query(`INSERT INTO master.supplier(id,tenant_id,business_partner_id,supplier_code,created_by) VALUES($1,$2,$3,'S4CERTSUP',$2)`,[ids.supplier,tenant,ids.a]);
    await client.query(`INSERT INTO control.business_partner_qualification(id,tenant_id,business_partner_id,partner_role,qualification_type_code,idempotency_key,created_by) VALUES($1,$2,$3,'supplier','basic','s4-cert-qualification',$2)`,[ids.qualification,tenant,ids.a]);
    const results=[] as Rejection[];
    results.push(await rejects(client,"inactive_catalog_reference",`INSERT INTO master.business_partner_relationship(tenant_id,source_business_partner_id,target_business_partner_id,relationship_type_code,status,created_by) VALUES($1,$2,$3,'s4_inactive','active',$1)`,[tenant,ids.a,ids.b]));
    results.push(await rejects(client,"overlapping_alias",async()=>{await client.query(`INSERT INTO master.business_partner_alias(tenant_id,business_partner_id,alias_kind,alias_name,effective_from,effective_until,created_by) VALUES($1,$2,'search','S4 Alias','2026-01-01','2027-01-01',$1)`,[tenant,ids.a]);await client.query(`INSERT INTO master.business_partner_alias(tenant_id,business_partner_id,alias_kind,alias_name,effective_from,effective_until,created_by) VALUES($1,$2,'search',' s4   alias ','2026-06-01','2026-12-01',$1)`,[tenant,ids.a]);}));
    results.push(await rejects(client,"overlapping_effective_assignment",async()=>{await client.query(`INSERT INTO master.business_partner_operating_organization_assignment(tenant_id,business_partner_id,operating_organization_id,partner_role,effective_from,effective_until,status,created_by) VALUES($1,$2,$3,'supplier','2026-01-01','2027-01-01','active',$1)`,[tenant,ids.a,ids.org]);await client.query(`INSERT INTO master.business_partner_operating_organization_assignment(tenant_id,business_partner_id,operating_organization_id,partner_role,effective_from,effective_until,status,created_by) VALUES($1,$2,$3,'supplier','2026-06-01','2026-12-01','active',$1)`,[tenant,ids.a,ids.org]);}));
    results.push(await rejects(client,"overlapping_relationship_period",async()=>{await client.query(`INSERT INTO master.business_partner_relationship(tenant_id,source_business_partner_id,target_business_partner_id,relationship_type_code,effective_from,effective_until,status,created_by) VALUES($1,$2,$3,'affiliate','2026-01-01','2027-01-01','active',$1)`,[tenant,ids.a,ids.b]);await client.query(`INSERT INTO master.business_partner_relationship(tenant_id,source_business_partner_id,target_business_partner_id,relationship_type_code,effective_from,effective_until,status,created_by) VALUES($1,$2,$3,'affiliate','2026-06-01','2026-12-01','active',$1)`,[tenant,ids.a,ids.b]);}));
    results.push(await rejects(client,"relationship_hierarchy_cycle",async()=>{for(const [source,target] of [[ids.a,ids.b],[ids.b,ids.c],[ids.c,ids.a]])await client.query(`INSERT INTO master.business_partner_relationship(tenant_id,source_business_partner_id,target_business_partner_id,relationship_type_code,status,created_by) VALUES($1,$2,$3,'parent','active',$1)`,[tenant,source,target]);}));
    results.push(await rejects(client,"multiple_scope_coordinates",`INSERT INTO control.business_partner_decision_scope(tenant_id,qualification_id,scope_group,scope_kind,operating_organization_id,company_code_id,created_by) VALUES($1,$2,2,'operating_organization',$3,$4,$1)`,[tenant,ids.qualification,ids.org,randomUUID()]));
    results.push(await rejects(client,"inactive_scope_reference",`INSERT INTO control.business_partner_decision_scope(tenant_id,qualification_id,scope_group,scope_kind,operating_organization_id,created_by) VALUES($1,$2,2,'operating_organization',$3,$1)`,[tenant,ids.qualification,ids.inactiveOrg]));
    results.push(await rejects(client,"scope_cardinality_over_100",async()=>{for(let group=2;group<=100;group++)await client.query(`INSERT INTO control.business_partner_decision_scope(tenant_id,qualification_id,scope_group,scope_mode,scope_kind,created_by) VALUES($1,$2,$3,'include','global',$1)`,[tenant,ids.qualification,group]);await client.query(`INSERT INTO control.business_partner_decision_scope(tenant_id,qualification_id,scope_group,scope_mode,scope_kind,created_by) VALUES($1,$2,1,'exclude','global',$1)`,[tenant,ids.qualification]);}));
    results.push(await rejects(client,"invalid_json_shape",`UPDATE master.business_partner SET metadata='[]'::jsonb WHERE tenant_id=$1 AND id=$2`,[tenant,ids.a]));
    results.push(await rejects(client,"oversized_json",`UPDATE master.business_partner SET metadata=jsonb_build_object('note',repeat('x',17000)) WHERE tenant_id=$1 AND id=$2`,[tenant,ids.a]));
    return results;
  }finally{await client.query("ROLLBACK");}
}

async function runConcurrencyProbes(url:string):Promise<{probes:Race[];cleanupVerified:boolean}>{
  const owner=new Client({connectionString:url}),tenant="00000000-0000-0000-0000-000000000000",ids={bp:randomUUID(),target:randomUUID(),supplier:randomUUID(),org:randomUUID(),qualification:randomUUID()};
  let probes:Race[]=[];let cleanupVerified=false;
  await owner.connect();
  try{
    await owner.query("BEGIN");await context(owner,tenant,tenant);
    await owner.query(`INSERT INTO master.operating_organization(id,tenant_id,code,name,domain,status,created_by) VALUES($1,$2,$3,'S4 race organization','procurement','active',$2)`,[ids.org,tenant,`s4_race_${ids.org.slice(0,8)}`]);
    for(const [id,suffix] of [[ids.bp,"A"],[ids.target,"B"]])await owner.query(`INSERT INTO master.business_partner(id,tenant_id,code,name,partner_category,category_locked_by,created_by) VALUES($1,$2,$3,$3,'organization',$2,$2)`,[id,tenant,`S4R${suffix}${id.slice(0,8).toUpperCase()}`]);
    await owner.query(`INSERT INTO master.supplier(id,tenant_id,business_partner_id,supplier_code,created_by) VALUES($1,$2,$3,$4,$2)`,[ids.supplier,tenant,ids.bp,`S4R${ids.supplier.slice(0,8).toUpperCase()}`]);
    await owner.query(`INSERT INTO control.business_partner_qualification(id,tenant_id,business_partner_id,partner_role,qualification_type_code,idempotency_key,created_by) VALUES($1,$2,$3,'supplier','basic',$4,$2)`,[ids.qualification,tenant,ids.bp,`s4-race-${ids.qualification}`]);await owner.query("COMMIT");
    probes=[
      await race(url,"alias_overlap",`INSERT INTO master.business_partner_alias(tenant_id,business_partner_id,alias_kind,alias_name,effective_from,status,created_by) VALUES($1,$2,'search','S4 Concurrent Alias','2026-01-01','active',$1)`,[tenant,ids.bp]),
      await race(url,"assignment_overlap",`INSERT INTO master.business_partner_operating_organization_assignment(tenant_id,business_partner_id,operating_organization_id,partner_role,effective_from,status,created_by) VALUES($1,$2,$3,'supplier','2026-01-01','active',$1)`,[tenant,ids.bp,ids.org]),
      await race(url,"relationship_overlap",`INSERT INTO master.business_partner_relationship(tenant_id,source_business_partner_id,target_business_partner_id,relationship_type_code,effective_from,status,created_by) VALUES($1,$2,$3,'affiliate','2026-01-01','active',$1)`,[tenant,ids.bp,ids.target]),
      await race(url,"decision_scope_overlap",`INSERT INTO control.business_partner_decision_scope(tenant_id,qualification_id,scope_group,scope_mode,scope_kind,effective_from,created_by) VALUES($1,$2,2,'include','global','2026-01-01',$1)`,[tenant,ids.qualification])
    ];
  }finally{
    await owner.query("BEGIN").catch(()=>undefined);await owner.query("SET LOCAL session_replication_role=replica").catch(()=>undefined);
    await owner.query(`DELETE FROM audit.audit_log WHERE entity_id=ANY($1::uuid[])`,[[ids.bp,ids.target,ids.org,ids.qualification]]).catch(()=>undefined);
    await owner.query(`DELETE FROM control.business_partner_decision_scope WHERE qualification_id=$1`,[ids.qualification]).catch(()=>undefined);
    await owner.query(`DELETE FROM control.business_partner_qualification WHERE id=$1`,[ids.qualification]).catch(()=>undefined);
    await owner.query(`DELETE FROM master.supplier WHERE id=$1`,[ids.supplier]).catch(()=>undefined);
    await owner.query(`DELETE FROM master.business_partner_operating_organization_assignment WHERE business_partner_id=$1`,[ids.bp]).catch(()=>undefined);
    await owner.query(`DELETE FROM master.business_partner_relationship WHERE source_business_partner_id=$1 OR target_business_partner_id=$1`,[ids.bp]).catch(()=>undefined);
    await owner.query(`DELETE FROM master.business_partner_alias WHERE business_partner_id=$1`,[ids.bp]).catch(()=>undefined);
    await owner.query(`DELETE FROM master.business_partner WHERE id=ANY($1::uuid[])`,[[ids.bp,ids.target]]).catch(()=>undefined);
    await owner.query(`DELETE FROM master.operating_organization WHERE id=$1`,[ids.org]).catch(()=>undefined);await owner.query("COMMIT").catch(()=>undefined);
    const residue=await owner.query<{count:number}>(`SELECT count(*)::int count FROM master.business_partner WHERE tenant_id=$1 AND id=ANY($2::uuid[])`,[tenant,[ids.bp,ids.target]]).catch(()=>({rows:[{count:-1}]}));
    cleanupVerified=Number(residue.rows[0]?.count)===0;await owner.end();
  }
  return{probes,cleanupVerified};
}

async function race(url:string,code:string,statement:string,values:unknown[]):Promise<Race>{
  const first=new Client({connectionString:url}),second=new Client({connectionString:url});await Promise.all([first.connect(),second.connect()]);
  try{await Promise.all([first.query("BEGIN"),second.query("BEGIN")]);await Promise.all([first.query("SET LOCAL statement_timeout='5s'"),second.query("SET LOCAL statement_timeout='5s'")]);await first.query(statement,values);const contender=second.query(statement,values).then(()=>({ok:true,sqlState:null})).catch((error:NodeJS.ErrnoException&{code?:string})=>({ok:false,sqlState:error.code??null}));await new Promise(resolveTimeout=>setTimeout(resolveTimeout,75));await first.query("COMMIT");const result=await contender;if(result.ok)await second.query("COMMIT");else await second.query("ROLLBACK");return{code,accepted:1+(result.ok?1:0),rejected:result.ok?0:1,loserSqlState:result.sqlState};}
  finally{await Promise.all([first.query("ROLLBACK").catch(()=>undefined),second.query("ROLLBACK").catch(()=>undefined)]);await Promise.all([first.end(),second.end()]);}
}

async function measureCompatibility(client:Client){
  const policyText=await readFile(resolve(repositoryRoot,compatibilityPath),"utf8");
  const sourcePatterns={
    business_partner_aliases_cache:String.raw`\b(?:business_partner|bp|partner)\.aliases\b`,
    flattened_decision_scope:String.raw`business_partner_(?:qualification|decision_scope)|supplier_preference_designation|customer_account_designation|customer_credit_review`
  } as const;
  const scan=async(pattern:string)=>{const {stdout}=await execFileAsync("rg",["-n","--glob","*.ts","--glob","*.tsx","--glob","*.sql","--glob","!server/db/ddl/**","--glob","!server/db/migrations/**",pattern,"server/packages","apps"],{cwd:repositoryRoot,maxBuffer:4*1024*1024}).catch(error=>({stdout:(error as {stdout?:string}).stdout??""}));return stdout.split(/\r?\n/u).filter(Boolean);};
  const aliasMatches=await scan(sourcePatterns.business_partner_aliases_cache),scopeCandidates=await scan(sourcePatterns.flattened_decision_scope);
  const scopeMatches=scopeCandidates.filter(line=>/\b(?:operating_organization_id|company_code_id|commodity_capability_id|commodity_category_id)\b/u.test(line));
  const statsAvailable=Boolean((await client.query<{available:boolean}>("SELECT to_regclass('pg_catalog.pg_stat_statements') IS NOT NULL available")).rows[0]?.available);
  let observedQueries=0;if(statsAvailable)observedQueries=Number((await client.query(`SELECT count(*)::int count FROM pg_catalog.pg_stat_statements WHERE query~*'business_partner[^;]*aliases|business_partner_(qualification|decision_scope|account_designation|credit_review)[^;]*(operating_organization_id|company_code_id|commodity_capability_id|commodity_category_id)'`)).rows[0]?.count??0);
  return{policy:compatibilityPath,policySha256:createHash("sha256").update(policyText).digest("hex"),surfaces:[{code:"business_partner_aliases_cache",repositorySourceMatchCount:aliasMatches.length,repositorySourceMatches:aliasMatches.slice(0,100)},{code:"flattened_decision_scope",repositorySourceMatchCount:scopeMatches.length,repositorySourceMatches:scopeMatches.slice(0,100)}],pgStatStatementsAvailable:statsAvailable,observedCompatibilityQueryCount:observedQueries,removalEligible:false};
}

async function rejects(client:Client,code:string,work:string|(()=>Promise<void>),values:unknown[]=[]):Promise<Rejection>{
  const savepoint=`probe_${code}`;await client.query(`SAVEPOINT ${savepoint}`);try{if(typeof work==="string")await client.query(work,values);else await work();await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);return{code,rejected:false,sqlState:null,message:"accepted unexpectedly"};}catch(error){await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);const value=error as Error&{code?:string};return{code,rejected:true,sqlState:value.code??null,message:value.message.slice(0,300)};}}
async function context(client:Client,tenant:string,actor:string){await client.query("SELECT set_config('app.database_plane','neon',true),set_config('app.current_tenant_id',$1,true),set_config('app.current_principal_id',$2,true)",[tenant,actor]);}
function option(args:readonly string[],name:string){return args.find(value=>value.startsWith(`${name}=`))?.slice(name.length+1);}
if(import.meta.url===pathToFileURL(process.argv[1]??"").href){const args=process.argv.slice(2),url=option(args,"--neon-database-url")??process.env["ATHYPER_NEON_DATABASE_ADMIN_URL"];if(!url)throw new Error("--neon-database-url or ATHYPER_NEON_DATABASE_ADMIN_URL is required");process.stdout.write(`${JSON.stringify(await runBusinessPartnerS4Certification({neonDatabaseUrl:url,confirmation:option(args,"--confirm"),...(option(args,"--output")?{output:option(args,"--output")}: {})}),null,2)}\n`);}
