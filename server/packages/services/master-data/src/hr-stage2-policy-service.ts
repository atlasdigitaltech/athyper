import {createHash} from "node:crypto";
import type {AuditRecorder} from "@athyper/server-contract-audit";
import type {Authorizer,VerifiedRequestContext} from "@athyper/server-contract-auth";
import type {PlaneTransactionCoordinator} from "@athyper/server-foundation/transaction";
import {sql,type Transaction} from "kysely";
import {MasterDataError} from "./errors.js";

type Tx=Transaction<Record<string,never>>;
type Row=Record<string,unknown>;
type ScopeKind="country"|"company"|"site";
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const date=/^\d{4}-\d{2}-\d{2}$/;
const text=(value:unknown)=>String(value??"");
const bad=(message:string)=>new MasterDataError(400,"HR_POLICY_INVALID",message);
const denied=()=>new MasterDataError(403,"HR_POLICY_FORBIDDEN","HR policy action is not authorized");
const conflict=(message:string)=>new MasterDataError(409,"HR_POLICY_CONFLICT",message);
function validateDate(value:string){if(!date.test(value))throw bad("A YYYY-MM-DD date is required");const parsed=new Date(`${value}T00:00:00Z`);if(Number.isNaN(parsed.getTime())||parsed.toISOString().slice(0,10)!==value)throw bad("Invalid effective date");}
function pgConflict(error:unknown):never{if(error&&typeof error==="object"&&["23P01","23505"].includes(String((error as {code?:unknown}).code)))throw conflict("An active policy version overlaps this scope and period");throw error;}
export interface HrPolicyAssignmentInput{readonly idempotencyKey:string;readonly policyDefinitionId:string;readonly scopeKind:ScopeKind;readonly countryCode:string;readonly companyCodeId?:string;readonly siteId?:string;readonly effectiveFrom:string;readonly effectiveUntil?:string;}
export function createHrStage2PolicyService(options:{readonly authorizer:Authorizer;readonly transactions:PlaneTransactionCoordinator<Tx>;readonly audit:AuditRecorder<Tx>}){
 const run=<T>(context:VerifiedRequestContext,work:(tx:Tx)=>Promise<T>)=>options.transactions.run(context.planeKey,{tenantId:context.tenantId,principalId:context.principalId},work);
 const authorize=async(context:VerifiedRequestContext,permissionCode:string,resource:Readonly<Record<string,unknown>>)=>{if(context.planeKey!=="neon"||!(await options.authorizer.authorize({context,permissionCode,resource})).allowed)throw denied();};
 const company=async(tx:Tx,tenantId:string,companyCodeId:string)=>{const row=(await sql<Row>`SELECT id,country_code,status FROM master.company_code WHERE tenant_id=${tenantId}::uuid AND id=${companyCodeId}::uuid`.execute(tx)).rows[0];if(!row||row["status"]!=="active"||!row["country_code"])throw bad("An active company with country is required");return row;};
 return {
  async policyAssignments(context:VerifiedRequestContext,companyCodeId:string){
   if(!uuid.test(companyCodeId))throw bad("Invalid company");await authorize(context,"neon.hr.setup.read",{companyCodeId});
   return run(context,async tx=>{const scope=await company(tx,context.tenantId,companyCodeId);return (await sql<Row>`SELECT id,policy_definition_id,entity_type,policy_version_no,definition_hash,scope_kind,country_code,company_code_id,site_id,effective_from::text,effective_until::text,status,created_by,approved_by,row_version FROM master.hr_policy_assignment WHERE tenant_id=${context.tenantId}::uuid AND country_code=${scope["country_code"]}::char(2) AND (scope_kind='country' OR company_code_id=${companyCodeId}::uuid) ORDER BY entity_type,scope_kind,effective_from DESC LIMIT 300`.execute(tx)).rows;});
  },
  async resolvePolicy(context:VerifiedRequestContext,input:{companyCodeId:string;siteId?:string;asOf:string}){
   if(!uuid.test(input.companyCodeId)||(input.siteId&&!uuid.test(input.siteId)))throw bad("Invalid company or site");validateDate(input.asOf);await authorize(context,"neon.hr.setup.read",{companyCodeId:input.companyCodeId});
   return run(context,async tx=>{const scope=await company(tx,context.tenantId,input.companyCodeId);if(input.siteId){const site=(await sql<Row>`SELECT company_code_id,country_code FROM master.site WHERE tenant_id=${context.tenantId}::uuid AND id=${input.siteId}::uuid AND status='active'`.execute(tx)).rows[0];if(!site||site["company_code_id"]!==input.companyCodeId||site["country_code"]!==scope["country_code"])throw bad("Site is outside this company");}
    const rows=(await sql<Row>`SELECT id,policy_definition_id,entity_type,policy_version_no,definition_hash,scope_kind,country_code,company_code_id,site_id,effective_from::text,effective_until::text FROM master.hr_policy_assignment WHERE tenant_id=${context.tenantId}::uuid AND status='active' AND country_code=${scope["country_code"]}::char(2) AND effective_from<=${input.asOf}::date AND (effective_until IS NULL OR effective_until>${input.asOf}::date) AND (scope_kind='country' OR (scope_kind='company' AND company_code_id=${input.companyCodeId}::uuid) OR (scope_kind='site' AND site_id=${input.siteId??null}::uuid AND company_code_id=${input.companyCodeId}::uuid)) ORDER BY entity_type,CASE scope_kind WHEN 'site' THEN 3 WHEN 'company' THEN 2 ELSE 1 END DESC,effective_from DESC,id LIMIT 300`.execute(tx)).rows;
    const selected:Row[]=[],overridden:Row[]=[];const seen=new Set<string>();for(const row of rows){const key=text(row["entity_type"]);if(seen.has(key))overridden.push({...row,reason:"A more specific country/company/site assignment takes precedence"});else{selected.push(row);seen.add(key);}}
    return{asOf:input.asOf,companyCodeId:input.companyCodeId,siteId:input.siteId??null,countryCode:scope["country_code"],selected,overridden,unconfigured:selected.length===0};
   });
  },
  async createPolicyAssignment(context:VerifiedRequestContext,input:HrPolicyAssignmentInput){
   if(!uuid.test(input.policyDefinitionId)||!input.idempotencyKey.match(/^[A-Za-z0-9_.-]{8,120}$/)||!(["country","company","site"] as string[]).includes(input.scopeKind)||!/^[A-Z]{2}$/.test(input.countryCode))throw bad("Invalid policy, request key, scope or country");
   validateDate(input.effectiveFrom);if(input.effectiveUntil){validateDate(input.effectiveUntil);if(input.effectiveUntil<=input.effectiveFrom)throw bad("Effective until must follow effective from");}
   if(input.scopeKind==="country"&&(input.companyCodeId||input.siteId))throw bad("Country policy cannot specify a company or site");
   if(input.scopeKind!=="country"&&(!input.companyCodeId||!uuid.test(input.companyCodeId)))throw bad("Company is required");
   if(input.scopeKind==="site"&&(!input.siteId||!uuid.test(input.siteId)))throw bad("Site is required");
   if(input.scopeKind==="company"&&input.siteId)throw bad("Company policy cannot specify a site");
   await authorize(context,input.scopeKind==="country"?"neon.hr.policy.country.write":"neon.hr.setup.write",input.scopeKind==="country"?{tenantId:context.tenantId}:{companyCodeId:input.companyCodeId});
   return run(context,async tx=>{await sql`SELECT pg_advisory_xact_lock(hashtextextended(${context.tenantId+":"+context.principalId+":"+input.idempotencyKey},0))`.execute(tx);
    const key=createHash("sha256").update(context.tenantId+":"+context.principalId+":"+input.idempotencyKey).digest("hex");
    const existing=(await sql<Row>`SELECT id,policy_definition_id,scope_kind,country_code,company_code_id,site_id,effective_from::text,effective_until::text,status,row_version FROM master.hr_policy_assignment WHERE tenant_id=${context.tenantId}::uuid AND command_key_hash=${key}`.execute(tx)).rows[0];
    if(existing){if(existing["policy_definition_id"]===input.policyDefinitionId&&existing["scope_kind"]===input.scopeKind&&existing["country_code"]===input.countryCode&&(existing["company_code_id"]??null)===(input.companyCodeId??null)&&(existing["site_id"]??null)===(input.siteId??null)&&existing["effective_from"]===input.effectiveFrom&&(existing["effective_until"]??null)===(input.effectiveUntil??null))return{...existing,replayed:true};throw conflict("Request key was reused with different policy facts");}
    const definition=(await sql<Row>`SELECT id,tenant_id,entity_type,version_no,definition_hash,effective_from::text,effective_until::text,status FROM control.policy_definition WHERE id=${input.policyDefinitionId}::uuid`.execute(tx)).rows[0];
    if(!definition||definition["status"]!=="active"||(definition["tenant_id"]!==null&&definition["tenant_id"]!==context.tenantId)||!text(definition["entity_type"]).startsWith("hr.")||!definition["definition_hash"]||text(definition["effective_from"])>input.effectiveFrom||(definition["effective_until"]&&(!input.effectiveUntil||text(definition["effective_until"])<input.effectiveUntil)))throw bad("Active HR policy version does not cover the requested period");
    const country=(await sql<Row>`SELECT code FROM shared.country WHERE code=${input.countryCode}::char(2) AND status='active'`.execute(tx)).rows[0];if(!country)throw bad("Country is unavailable");
    if(input.companyCodeId){const selected=await company(tx,context.tenantId,input.companyCodeId);if(selected["country_code"]!==input.countryCode)throw bad("Company country does not match");}
    if(input.siteId){const site=(await sql<Row>`SELECT company_code_id,country_code FROM master.site WHERE tenant_id=${context.tenantId}::uuid AND id=${input.siteId}::uuid AND status='active'`.execute(tx)).rows[0];if(!site||site["company_code_id"]!==input.companyCodeId||site["country_code"]!==input.countryCode)throw bad("Site is outside company/country");}
    const row=(await sql<Row>`INSERT INTO master.hr_policy_assignment(tenant_id,command_key_hash,policy_definition_id,entity_type,policy_version_no,definition_hash,scope_kind,country_code,company_code_id,site_id,effective_from,effective_until,status,created_by) VALUES(${context.tenantId}::uuid,${key},${input.policyDefinitionId}::uuid,${definition["entity_type"]}::text,${definition["version_no"]}::integer,${definition["definition_hash"]}::text,${input.scopeKind},${input.countryCode}::char(2),${input.companyCodeId??null}::uuid,${input.siteId??null}::uuid,${input.effectiveFrom}::date,${input.effectiveUntil??null}::date,'draft',${context.principalId}::uuid) RETURNING id,policy_definition_id,entity_type,policy_version_no,scope_kind,country_code,company_code_id,site_id,effective_from::text,effective_until::text,status,row_version`.execute(tx)).rows[0];
    if(!row)throw conflict("Policy assignment was not created");await options.audit.record({eventCode:"hr.policy.assignment.draft_created",action:"create",outcome:"success",actor:{kind:"user",principalId:context.principalId},tenantId:context.tenantId,entityType:"hr_policy_assignment",entityId:text(row["id"]),requestId:context.requestId,metadata:{scopeKind:input.scopeKind,policyDefinitionId:input.policyDefinitionId}},tx);return{...row,replayed:false};
   });
  },
  async publishPolicyAssignment(context:VerifiedRequestContext,assignmentId:string,expectedVersion:number){
   if(!uuid.test(assignmentId)||!Number.isInteger(expectedVersion)||expectedVersion<1)throw bad("Assignment ID and version are required");
   return run(context,async tx=>{const row=(await sql<Row>`SELECT id,scope_kind,company_code_id,status,created_by,row_version FROM master.hr_policy_assignment WHERE tenant_id=${context.tenantId}::uuid AND id=${assignmentId}::uuid`.execute(tx)).rows[0];if(!row)throw new MasterDataError(404,"HR_POLICY_NOT_FOUND","Policy assignment not found");
    await authorize(context,"neon.hr.policy.publish",row["scope_kind"]==="country"?{tenantId:context.tenantId}:{companyCodeId:row["company_code_id"]});
    if(row["created_by"]===context.principalId)throw denied();if(row["status"]!=="draft"||Number(row["row_version"])!==expectedVersion)throw conflict("Policy assignment changed or is already published");
    try{const updated=(await sql<Row>`UPDATE master.hr_policy_assignment SET status='active',approved_at=now(),approved_by=${context.principalId}::uuid,updated_at=now(),updated_by=${context.principalId}::uuid,row_version=row_version+1 WHERE tenant_id=${context.tenantId}::uuid AND id=${assignmentId}::uuid AND status='draft' AND row_version=${expectedVersion} RETURNING id,status,row_version,approved_by`.execute(tx)).rows[0];if(!updated)throw conflict("Policy assignment changed while publishing");await options.audit.record({eventCode:"hr.policy.assignment.published",action:"publish",outcome:"success",actor:{kind:"user",principalId:context.principalId},tenantId:context.tenantId,entityType:"hr_policy_assignment",entityId:assignmentId,requestId:context.requestId,metadata:{expectedVersion}},tx);return updated;}catch(error){pgConflict(error);}
   });
  },
 };
}
