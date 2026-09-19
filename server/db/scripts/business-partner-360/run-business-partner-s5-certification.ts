#!/usr/bin/env tsx

import {randomUUID} from "node:crypto";
import {mkdir,readFile,writeFile} from "node:fs/promises";
import {dirname,resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {Client} from "pg";
import {assertLoopbackDatabaseTarget} from "../lib/database-target.js";

const CONFIRMATION="RUN-BP-S5-CERTIFICATION";
const repositoryRoot=resolve(import.meta.dirname,"../../../..");
const matrixPath="governance/config/governance/business-partner-s5-role-permission-matrix.v1.json";
const tenant="00000000-0000-0000-0000-000000000000";
const lifecycleFunction="control.command_business_partner_lifecycle(uuid,text,uuid,text,bigint,text,text,uuid)";
const decisionFunction="control.command_business_partner_decision(uuid,text,uuid,text,bigint,text,text,text,jsonb,uuid)";
type Failure={code:string;passed:boolean;sqlState:string|null;message:string};
type Fixture={maker:string;reviewer:string;businessPartners:string[];suppliers:string[];qualifications:string[]};

export async function runBusinessPartnerS5Certification(options:{readonly neonDatabaseUrl:string;readonly confirmation?:string;readonly output?:string}){
  assertLoopbackDatabaseTarget(options.neonDatabaseUrl,"athyper_neon");
  if(options.confirmation!==CONFIRMATION)throw new Error(`execution requires --confirm=${CONFIRMATION}`);
  const client=new Client({connectionString:options.neonDatabaseUrl,application_name:"bp-s5-certification"});await client.connect();
  const fixture=ids();
  try{
    await requireObjects(client);
    await seed(client,fixture);
    const roleMatrix=await evaluateRoleMatrix(client);
    const atomicityResult=await verifyAtomicity(client,fixture);
    const behavioral=await runBehavioral(client,fixture,atomicityResult.committedEvidenceId),atomicity=atomicityResult.evidence;
    const concurrency=await runConcurrency(options.neonDatabaseUrl,fixture);
    const catalog=await verifyCatalogControls(client);
    const passed=roleMatrix.every(row=>row.passed)&&behavioral.every(row=>row.passed)&&atomicity.passed&&concurrency.every(row=>row.passed)&&catalog.passed;
    const evidence={schemaVersion:1,kind:"athyper.business-partner-s5-certification",capturedAt:new Date().toISOString(),database:"athyper_neon",sanitized:true,matrix:matrixPath,roleMatrix,behavioral,concurrency,atomicity,catalog,passed};
    if(options.output){const destination=resolve(repositoryRoot,options.output);await mkdir(dirname(destination),{recursive:true});await writeFile(destination,`${JSON.stringify(evidence,null,2)}\n`,"utf8");}
    if(!passed)throw new Error("S5 certification did not pass every required probe");
    return evidence;
  }finally{await cleanup(client,fixture);await client.end();}
}

function ids():Fixture{
  return{maker:randomUUID(),reviewer:randomUUID(),businessPartners:Array.from({length:12},()=>randomUUID()),suppliers:Array.from({length:6},()=>randomUUID()),qualifications:Array.from({length:6},()=>randomUUID())};
}

async function requireObjects(client:Client){
  const result=await client.query<{missing:string[]}>(`SELECT array_agg(name) FILTER(WHERE present IS FALSE) missing FROM(VALUES
    ('control.business_partner_mutation_evidence',to_regclass('control.business_partner_mutation_evidence') IS NOT NULL),
    ('control.command_business_partner_lifecycle',to_regprocedure($1) IS NOT NULL),
    ('control.command_business_partner_decision',to_regprocedure($2) IS NOT NULL)) value(name,present)`,[lifecycleFunction,decisionFunction]);
  if((result.rows[0]?.missing?.length??0)>0)throw new Error(`missing S5 objects: ${result.rows[0]!.missing.join(", ")}`);
}

async function seed(client:Client,f:Fixture){
  await client.query("BEGIN");await context(client,f.maker);
  try{
    await client.query(`INSERT INTO master.principal(id,tenant_id,code,name,principal_type,created_by) VALUES($1,$3,$4,'S5 maker','user',$3),($2,$3,$5,'S5 reviewer','user',$3)`,[f.maker,f.reviewer,tenant,`s5_maker_${f.maker.slice(0,8)}`,`s5_reviewer_${f.reviewer.slice(0,8)}`]);
    for(const [index,id] of f.businessPartners.entries())await client.query(`INSERT INTO master.business_partner(id,tenant_id,code,name,partner_category,category_locked_by,created_by) VALUES($1,$2,$3,$4,'organization',$5,$5)`,[id,tenant,`S5C${index}${id.slice(0,7).toUpperCase()}`,`S5 certification ${index}`,f.maker]);
    for(let index=0;index<f.suppliers.length;index++){
      await client.query(`INSERT INTO master.supplier(id,tenant_id,business_partner_id,supplier_code,created_by) VALUES($1,$2,$3,$4,$5)`,[f.suppliers[index],tenant,f.businessPartners[index],`S5S${index}${f.suppliers[index]!.slice(0,7).toUpperCase()}`,f.maker]);
      await client.query(`INSERT INTO control.business_partner_qualification(id,tenant_id,business_partner_id,partner_role,qualification_type_code,idempotency_key,created_by) VALUES($1,$2,$3,'supplier','basic',$4,$5)`,[f.qualifications[index],tenant,f.businessPartners[index],`s5-seed-${f.qualifications[index]}`,f.maker]);
    }
    await client.query("COMMIT");
  }catch(error){await client.query("ROLLBACK");throw error;}
}

async function evaluateRoleMatrix(client:Client){
  const policy=JSON.parse(await readFile(resolve(repositoryRoot,matrixPath),"utf8")) as {rules:Array<{code:string;objects:string[];privilege:string;expected:Record<string,boolean>}>};
  const rows:Array<{rule:string;object:string;privilege:string;principal:string;actual:boolean;expected:boolean;passed:boolean}>=[];
  for(const rule of policy.rules)for(const object of rule.objects)for(const privilege of rule.privilege.split(","))for(const principal of ["athyperapp","athyperadmin","object_owner","PUBLIC"]){
    const actual=await privilegeCheck(client,object,privilege,principal),expected=rule.expected[principal]??false;
    rows.push({rule:rule.code,object,privilege,principal,actual,expected,passed:actual===expected});
  }
  return rows;
}

async function privilegeCheck(client:Client,object:string,privilege:string,principal:string){
  const role=principal==="object_owner"?await ownerOf(client,object):principal;
  if(principal==="PUBLIC")return publicPrivilege(client,object,privilege);
  if(object.includes("("))return Boolean((await client.query<{allowed:boolean}>("SELECT has_function_privilege($1,$2,$3) allowed",[role,object,privilege])).rows[0]?.allowed);
  const parts=object.split(".");
  if(parts.length===3)return Boolean((await client.query<{allowed:boolean}>("SELECT has_column_privilege($1,$2,$3,$4) allowed",[role,`${parts[0]}.${parts[1]}`,parts[2],privilege])).rows[0]?.allowed);
  return Boolean((await client.query<{allowed:boolean}>("SELECT has_table_privilege($1,$2,$3) allowed",[role,object,privilege])).rows[0]?.allowed);
}

async function ownerOf(client:Client,object:string){
  if(object.includes("("))return String((await client.query<{owner:string}>("SELECT pg_get_userbyid(proowner) owner FROM pg_proc WHERE oid=$1::regprocedure",[object])).rows[0]?.owner);
  const relation=object.split(".").slice(0,2).join(".");return String((await client.query<{owner:string}>("SELECT pg_get_userbyid(relowner) owner FROM pg_class WHERE oid=$1::regclass",[relation])).rows[0]?.owner);
}

async function publicPrivilege(client:Client,object:string,privilege:string){
  if(object.includes("("))return Boolean((await client.query<{allowed:boolean}>(`SELECT EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) acl WHERE p.oid=$1::regprocedure AND acl.grantee=0 AND acl.privilege_type=$2) allowed`,[object,privilege])).rows[0]?.allowed);
  const parts=object.split("."),relation=parts.slice(0,2).join(".");
  const tableGrant=Boolean((await client.query<{allowed:boolean}>(`SELECT EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) acl WHERE c.oid=$1::regclass AND acl.grantee=0 AND acl.privilege_type=$2) allowed`,[relation,privilege])).rows[0]?.allowed);
  if(parts.length<3||tableGrant)return tableGrant;
  return Boolean((await client.query<{allowed:boolean}>(`SELECT EXISTS(SELECT 1 FROM pg_attribute a CROSS JOIN LATERAL aclexplode(a.attacl) acl WHERE a.attrelid=$1::regclass AND a.attname=$2 AND acl.grantee=0 AND acl.privilege_type=$3) allowed`,[relation,parts[2],privilege])).rows[0]?.allowed);
}

async function verifyAtomicity(client:Client,f:Fixture){
  const committed=f.businessPartners[6]!,rolledBack=f.businessPartners[7]!,commitKey=`s5-atomic-commit-${randomUUID()}`,rollbackKey=`s5-atomic-rollback-${randomUUID()}`;
  const committedResult=await lifecycle(client,committed,"active",1,commitKey,f.reviewer,true),committedEvidenceId=String(committedResult.rows[0]?.evidence_id??"");
  const committedCounts=await bundleCounts(client,committed,commitKey);
  await client.query("BEGIN");await context(client,f.reviewer);await lifecycle(client,rolledBack,"active",1,rollbackKey,f.reviewer,false);await client.query("ROLLBACK");
  const rollbackCounts=await bundleCounts(client,rolledBack,rollbackKey),rollbackState=await state(client,rolledBack);
  const passed=committedResult.rows.length===1&&committedCounts.state==="active"&&committedCounts.version===2&&committedCounts.evidence===1&&committedCounts.outbox===1&&committedCounts.audit>=1&&rollbackState.state==="draft"&&rollbackState.version===1&&rollbackCounts.evidence===0&&rollbackCounts.outbox===0&&rollbackCounts.audit===0;
  return{evidence:{passed,committed:{projectionState:committedCounts.state,projectionVersion:committedCounts.version,evidence:committedCounts.evidence,audit:committedCounts.audit,outbox:committedCounts.outbox},rolledBack:{projectionState:rollbackState.state,projectionVersion:rollbackState.version,evidence:rollbackCounts.evidence,audit:rollbackCounts.audit,outbox:rollbackCounts.outbox}},committedEvidenceId};
}

async function bundleCounts(client:Client,bp:string,key:string){
  const row=(await client.query<{state:string;version:number;evidence:number;outbox:number;audit:number}>(`SELECT partner.status::text state,partner.record_version::int version,
    (SELECT count(*)::int FROM control.business_partner_mutation_evidence WHERE tenant_id=$1 AND idempotency_key=$3) evidence,
    (SELECT count(*)::int FROM event.outbox WHERE tenant_id=$1 AND aggregate_id=$2 AND source='neon.ddl') outbox,
    (SELECT count(*)::int FROM audit.audit_log WHERE tenant_id=$1 AND entity_id=$2 AND operation='update') audit
    FROM master.business_partner partner WHERE partner.tenant_id=$1 AND partner.id=$2`,[tenant,bp,key])).rows[0]!;return{...row,version:Number(row.version),evidence:Number(row.evidence),outbox:Number(row.outbox),audit:Number(row.audit)};
}
async function state(client:Client,bp:string){const row=(await client.query<{state:string;version:number}>("SELECT status::text state,record_version::int version FROM master.business_partner WHERE tenant_id=$1 AND id=$2",[tenant,bp])).rows[0]!;return{state:row.state,version:Number(row.version)};}

async function runBehavioral(client:Client,f:Fixture,evidenceId:string):Promise<Failure[]>{
  const results:Failure[]=[];const directBp=f.businessPartners[8]!,qualification=f.qualifications[0]!,selfQualification=f.qualifications[1]!;
  results.push(await rejected(client,"cross_tenant_command","42501",()=>lifecycleQuery(client,randomUUID(),directBp,"active",1,"s5-cross-tenant",f.reviewer)));
  results.push(await rejected(client,"cross_tenant_fk","23503",()=>client.query(`INSERT INTO control.business_partner_mutation_evidence(tenant_id,aggregate_kind,aggregate_id,business_partner_id,command_code,from_state,to_state,expected_version,resulting_version,reason,idempotency_key,command_fingerprint,evidence,occurred_by) VALUES($1,'business_partner',$2,$2,'transition_active','draft','active',1,2,'cross tenant','s5-cross-fk','${"a".repeat(64)}','{}',$3)`,[randomUUID(),directBp,f.reviewer])));
  results.push(await rejected(client,"direct_lifecycle_update_app","42501",()=>withRole(client,"athyperapp",f.reviewer,()=>client.query("UPDATE master.business_partner SET status='active' WHERE tenant_id=$1 AND id=$2",[tenant,directBp]))));
  results.push(await rejected(client,"direct_lifecycle_update_owner","42501",()=>client.query("UPDATE master.business_partner SET status='active',record_version=record_version+1,updated_by=$3 WHERE tenant_id=$1 AND id=$2",[tenant,directBp,f.reviewer])));
  results.push(await rejected(client,"direct_decision_update_app","42501",()=>withRole(client,"athyperapp",f.reviewer,()=>client.query("UPDATE control.business_partner_qualification SET decision='approved' WHERE tenant_id=$1 AND id=$2",[tenant,qualification]))));
  results.push(await rejected(client,"direct_decision_update_owner","42501",()=>client.query(`UPDATE control.business_partner_qualification SET decision='approved',decision_reason='direct',reviewed_at=clock_timestamp(),reviewed_by=$3,approved_at=clock_timestamp(),approved_by=$3,decision_idempotency_key='s5-direct-decision',decision_fingerprint=$4,row_version=row_version+1,updated_by=$3 WHERE tenant_id=$1 AND id=$2`,[tenant,qualification,f.reviewer,"a".repeat(64)])));
  results.push(await rejected(client,"direct_evidence_insert_app","42501",()=>withRole(client,"athyperapp",f.reviewer,()=>client.query(`INSERT INTO control.business_partner_mutation_evidence(tenant_id,aggregate_kind,aggregate_id,business_partner_id,command_code,from_state,to_state,expected_version,resulting_version,reason,idempotency_key,command_fingerprint,evidence,occurred_by) VALUES($1,'business_partner',$2,$2,'transition_active','draft','active',1,2,'direct','s5-direct-insert','${"a".repeat(64)}','{}',$3)`,[tenant,directBp,f.reviewer]))));
  results.push(await rejected(client,"direct_evidence_update_owner","23001",()=>client.query("UPDATE control.business_partner_mutation_evidence SET reason='changed' WHERE id=$1",[evidenceId])));
  results.push(await rejected(client,"direct_evidence_delete_owner","23001",()=>client.query("DELETE FROM control.business_partner_mutation_evidence WHERE id=$1",[evidenceId])));
  results.push(await staleProbe(client,directBp,f.reviewer));
  results.push(await replayProbe(client,f.businessPartners[9]!,f.reviewer));
  results.push(await reusedKeyProbe(client,f.businessPartners[10]!,f.reviewer));
  results.push(await rejected(client,"self_approval","42501",()=>decisionQuery(client,selfQualification,"approved",1,"s5-self-approval",f.maker,"{}")));
  results.push(await rejected(client,"invalid_lifecycle_transition","23514",()=>lifecycleQuery(client,tenant,directBp,"inactive",1,"s5-invalid-transition",f.reviewer)));
  results.push(await rejected(client,"oversized_evidence_json","23514",()=>decisionQuery(client,qualification,"approved",1,"s5-oversized-json",f.reviewer,JSON.stringify({note:"x".repeat(17000)}))));
  results.push(await rejected(client,"protected_evidence_json","23514",()=>decisionQuery(client,qualification,"approved",1,"s5-protected-json",f.reviewer,JSON.stringify({nested:{taxId:"masked-or-tokenized-only"}}))));
  results.push(await rejected(client,"internal_function_app","42501",()=>withRole(client,"athyperapp",f.reviewer,()=>client.query("SELECT control.fn_record_business_partner_mutation($1,'business_partner',$2,$2,'transition_active','draft','active',1,'internal','s5-internal-call',$3,'{}',$4)",[tenant,directBp,"a".repeat(64),f.reviewer]))));
  return results;
}

async function staleProbe(client:Client,bp:string,actor:string):Promise<Failure>{
  await client.query("BEGIN");await context(client,actor);try{const before=await state(client,bp),result=await lifecycleQuery(client,tenant,bp,"active",99,"s5-stale-version",actor),after=await state(client,bp);await client.query("ROLLBACK");const passed=result.rows.length===0&&JSON.stringify(before)===JSON.stringify(after);return{code:"stale_expected_version",passed,sqlState:null,message:passed?"no row and no mutation":"stale command changed state"};}catch(error){await client.query("ROLLBACK");return failure("stale_expected_version",error);}
}
async function replayProbe(client:Client,bp:string,actor:string):Promise<Failure>{
  await client.query("BEGIN");await context(client,actor);try{const key="s5-exact-replay",first=await lifecycleQuery(client,tenant,bp,"active",1,key,actor),second=await lifecycleQuery(client,tenant,bp,"active",1,key,actor);await client.query("ROLLBACK");const passed=first.rows.length===1&&second.rows[0]?.replayed===true&&first.rows[0]?.evidence_id===second.rows[0]?.evidence_id;return{code:"exact_idempotent_replay",passed,sqlState:null,message:passed?"same evidence returned":"replay mismatch"};}catch(error){await client.query("ROLLBACK");return failure("exact_idempotent_replay",error);}
}
async function reusedKeyProbe(client:Client,bp:string,actor:string):Promise<Failure>{
  await client.query("BEGIN");await context(client,actor);try{const key="s5-reused-key";await lifecycleQuery(client,tenant,bp,"active",1,key,actor);try{await lifecycleQuery(client,tenant,bp,"archived",1,key,actor);await client.query("ROLLBACK");return{code:"idempotency_fingerprint_collision",passed:false,sqlState:null,message:"accepted unexpectedly"};}catch(error){await client.query("ROLLBACK");const value=error as Error&{code?:string};return{code:"idempotency_fingerprint_collision",passed:value.code==="23505",sqlState:value.code??null,message:value.message.slice(0,240)};}}catch(error){await client.query("ROLLBACK");return failure("idempotency_fingerprint_collision",error);}
}

async function runConcurrency(url:string,f:Fixture){
  return[
    await race(url,"lifecycle_one_winner",lifecycleSql(),[tenant,"business_partner",f.businessPartners[0],"active",1,"race","s5-life-race-a",f.reviewer],[tenant,"business_partner",f.businessPartners[0],"active",1,"race","s5-life-race-b",f.reviewer],f.reviewer,"one_winner"),
    await race(url,"lifecycle_exact_replay",lifecycleSql(),[tenant,"business_partner",f.businessPartners[1],"active",1,"replay","s5-life-replay",f.reviewer],[tenant,"business_partner",f.businessPartners[1],"active",1,"replay","s5-life-replay",f.reviewer],f.reviewer,"replay"),
    await race(url,"decision_one_winner",decisionSql(),[tenant,"qualification",f.qualifications[2],"approved",1,"race","s5-decision-race-a","a".repeat(64),{},f.reviewer],[tenant,"qualification",f.qualifications[2],"approved",1,"race","s5-decision-race-b","b".repeat(64),{},f.reviewer],f.reviewer,"one_winner"),
    await race(url,"decision_exact_replay",decisionSql(),[tenant,"qualification",f.qualifications[3],"approved",1,"replay","s5-decision-replay","c".repeat(64),{},f.reviewer],[tenant,"qualification",f.qualifications[3],"approved",1,"replay","s5-decision-replay","c".repeat(64),{},f.reviewer],f.reviewer,"replay")
  ];
}

async function race(url:string,code:string,sql:string,firstValues:unknown[],secondValues:unknown[],actor:string,mode:"one_winner"|"replay"){
  const first=new Client({connectionString:url}),second=new Client({connectionString:url});await Promise.all([first.connect(),second.connect()]);
  try{
    await Promise.all([first.query("BEGIN"),second.query("BEGIN")]);await Promise.all([context(first,actor),context(second,actor)]);await Promise.all([first.query("SET LOCAL statement_timeout='5s'"),second.query("SET LOCAL statement_timeout='5s'")]);
    const winner=await first.query(sql,firstValues),contenderPromise=second.query(sql,secondValues).then(result=>({result,error:null})).catch((error:Error&{code?:string})=>({result:null,error}));await new Promise(resolveTimeout=>setTimeout(resolveTimeout,75));await first.query("COMMIT");const contender=await contenderPromise;if(contender.error)await second.query("ROLLBACK");else await second.query("COMMIT");
    const winnerRows=winner.rows.length,contenderRows=contender.result?.rows.length??0,replayed=contender.result?.rows[0]?.replayed===true;
    const passed=mode==="one_winner"?winnerRows===1&&contenderRows===0:winnerRows===1&&contenderRows===1&&replayed;
    return{code,mode,winnerRows,contenderRows,replayed,sqlState:contender.error?.code??null,passed};
  }finally{await Promise.all([first.query("ROLLBACK").catch(()=>undefined),second.query("ROLLBACK").catch(()=>undefined)]);await Promise.all([first.end(),second.end()]);}
}

async function verifyCatalogControls(client:Client){
  const tables=["master.business_partner","master.supplier","master.customer","master.business_partner_relationship","control.business_partner_qualification","control.supplier_preference_designation","control.customer_account_designation","control.customer_credit_review","control.customer_lifecycle_event","control.business_partner_mutation_evidence"];
  const rls=(await client.query<{relation:string;enabled:boolean;forced:boolean}>(`SELECT value relation,c.relrowsecurity enabled,c.relforcerowsecurity forced FROM unnest($1::text[]) value JOIN pg_class c ON c.oid=value::regclass ORDER BY value`,[tables])).rows;
  const tenantFks=(await client.query<{relation:string;tenantRoot:boolean;compositeTenantReferences:number;nonCompositeTenantReferences:number}>(`WITH selected AS(SELECT unnest($1::text[])::regclass oid),fk AS(
    SELECT con.conrelid,con.confrelid,con.conkey,con.confkey FROM pg_constraint con JOIN selected s ON s.oid=con.conrelid WHERE con.contype='f'),
  inspected AS(SELECT fk.*,(SELECT attnum FROM pg_attribute WHERE attrelid=fk.conrelid AND attname='tenant_id') local_tenant,
    (SELECT attnum FROM pg_attribute WHERE attrelid=fk.confrelid AND attname='tenant_id') foreign_tenant FROM fk)
  SELECT s.oid::regclass::text relation,
    EXISTS(SELECT 1 FROM inspected i WHERE i.conrelid=s.oid AND i.confrelid='master.tenant'::regclass AND i.local_tenant=ANY(i.conkey)) "tenantRoot",
    count(*) FILTER(WHERE i.foreign_tenant IS NOT NULL AND i.local_tenant=ANY(i.conkey) AND i.foreign_tenant=ANY(i.confkey))::int "compositeTenantReferences",
    count(*) FILTER(WHERE i.foreign_tenant IS NOT NULL AND NOT(i.local_tenant=ANY(i.conkey) AND i.foreign_tenant=ANY(i.confkey)))::int "nonCompositeTenantReferences"
  FROM selected s LEFT JOIN inspected i ON i.conrelid=s.oid GROUP BY s.oid ORDER BY 1`,[tables])).rows.map(row=>({...row,nonCompositeTenantReferences:Number(row.nonCompositeTenantReferences)}));
  const passed=rls.length===tables.length&&rls.every(row=>row.enabled&&row.forced)&&tenantFks.length===tables.length&&tenantFks.every(row=>(row.tenantRoot||row.compositeTenantReferences>0)&&row.nonCompositeTenantReferences===0);
  return{tables,rls,tenantFks,passed};
}

async function rejected(client:Client,code:string,expectedState:string,work:()=>Promise<unknown>):Promise<Failure>{
  await client.query("BEGIN");await context(client,fallbackActor(client));try{await work();await client.query("ROLLBACK");return{code,passed:false,sqlState:null,message:"accepted unexpectedly"};}catch(error){await client.query("ROLLBACK");const value=error as Error&{code?:string};return{code,passed:value.code===expectedState,sqlState:value.code??null,message:value.message.slice(0,240)};}
}
function fallbackActor(_client:Client){return tenant;}
async function withRole<T>(client:Client,role:"athyperapp"|"athyperadmin",actor:string,work:()=>Promise<T>){await client.query(`SET LOCAL ROLE ${role}`);await context(client,actor);return work();}
async function context(client:Client,actor:string){await client.query("SELECT set_config('app.database_plane','neon',true),set_config('app.current_tenant_id',$1,true),set_config('app.current_principal_id',$2,true)",[tenant,actor]);}
function lifecycleSql(){return "SELECT * FROM control.command_business_partner_lifecycle($1,$2,$3,$4,$5,$6,$7,$8)";}
function decisionSql(){return "SELECT * FROM control.command_business_partner_decision($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)";}
async function lifecycleQuery(client:Client,targetTenant:string,bp:string,toState:string,version:number,key:string,actor:string){await context(client,actor);return client.query(lifecycleSql(),[targetTenant,"business_partner",bp,toState,version,"S5 certification",key,actor]);}
async function lifecycle(client:Client,bp:string,toState:string,version:number,key:string,actor:string,commit:boolean){await client.query("BEGIN");await context(client,actor);try{const result=await lifecycleQuery(client,tenant,bp,toState,version,key,actor);await client.query(commit?"COMMIT":"ROLLBACK");return result;}catch(error){await client.query("ROLLBACK");throw error;}}
async function decisionQuery(client:Client,qualification:string,toState:string,version:number,key:string,actor:string,payload:string){await context(client,actor);return client.query(decisionSql(),[tenant,"qualification",qualification,toState,version,"S5 certification",key,"a".repeat(64),payload,actor]);}
function failure(code:string,error:unknown):Failure{const value=error as Error&{code?:string};return{code,passed:false,sqlState:value.code??null,message:value.message.slice(0,240)};}

async function cleanup(client:Client,f:Fixture){
  await client.query("ROLLBACK").catch(()=>undefined);await client.query("BEGIN").catch(()=>undefined);await client.query("SET LOCAL session_replication_role=replica").catch(()=>undefined);
  await client.query("DELETE FROM event.outbox WHERE aggregate_id=ANY($1::uuid[]) OR actor_id=ANY($2::uuid[])",[f.businessPartners,[f.maker,f.reviewer]]).catch(()=>undefined);
  await client.query("DELETE FROM audit.audit_log WHERE entity_id=ANY($1::uuid[]) OR actor_principal_id=ANY($2::uuid[])",[f.businessPartners,[f.maker,f.reviewer]]).catch(()=>undefined);
  await client.query("DELETE FROM control.business_partner_mutation_evidence WHERE aggregate_id=ANY($1::uuid[]) OR occurred_by=ANY($2::uuid[])",[f.businessPartners,[f.maker,f.reviewer]]).catch(()=>undefined);
  await client.query("DELETE FROM control.business_partner_decision_scope WHERE qualification_id=ANY($1::uuid[])",[f.qualifications]).catch(()=>undefined);
  await client.query("DELETE FROM control.business_partner_qualification WHERE id=ANY($1::uuid[])",[f.qualifications]).catch(()=>undefined);
  await client.query("DELETE FROM master.supplier WHERE id=ANY($1::uuid[])",[f.suppliers]).catch(()=>undefined);
  await client.query("DELETE FROM master.business_partner WHERE id=ANY($1::uuid[])",[f.businessPartners]).catch(()=>undefined);
  await client.query("DELETE FROM master.principal WHERE id=ANY($1::uuid[])",[[f.maker,f.reviewer]]).catch(()=>undefined);
  await client.query("COMMIT").catch(()=>undefined);
}

function option(args:readonly string[],name:string){return args.find(value=>value.startsWith(`${name}=`))?.slice(name.length+1);}
if(import.meta.url===pathToFileURL(process.argv[1]??"").href){const args=process.argv.slice(2),url=option(args,"--neon-database-url")??process.env["ATHYPER_NEON_DATABASE_ADMIN_URL"];if(!url)throw new Error("--neon-database-url or ATHYPER_NEON_DATABASE_ADMIN_URL is required");process.stdout.write(`${JSON.stringify(await runBusinessPartnerS5Certification({neonDatabaseUrl:url,confirmation:option(args,"--confirm"),...(option(args,"--output")?{output:option(args,"--output")}: {})}),null,2)}\n`);}
