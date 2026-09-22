import type {AuditRecorder} from "@athyper/server-contract-audit";
import type {Authorizer,VerifiedRequestContext} from "@athyper/server-contract-auth";
import type {PlaneTransactionCoordinator} from "@athyper/server-foundation/transaction";
import {sql,type Transaction} from "kysely";
import {MasterDataError} from "./errors.js";

type Tx=Transaction<Record<string,never>>;
type Row=Record<string,unknown>;
export type SetupKind="job_family"|"job_function"|"pay_grade"|"job"|"position"|"site"|"holiday_calendar";
export interface DraftSetupInput{kind:SetupKind;companyCodeId?:string;code:string;name:string;jobFamilyId?:string;jobFunctionId?:string;payGradeId?:string;jobId?:string;orgUnitId?:string;siteId?:string;siteType?:string;weekendPattern?:string;currencyCode?:string;gradeSet?:string;validFrom?:string;}
const tables:Record<SetupKind,string>={job_family:"master.job_family",job_function:"master.job_function",pay_grade:"master.pay_grade",job:"master.job",position:"master.position",site:"master.site",holiday_calendar:"master.holiday_calendar"};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const bad=(message:string)=>new MasterDataError(400,"HR_SETUP_INVALID",message);
const denied=()=>new MasterDataError(403,"HR_SETUP_FORBIDDEN","HR setup action is not authorized");
const conflict=(message:string)=>new MasterDataError(409,"HR_SETUP_CONFLICT",message);
const scoped=(kind:SetupKind)=>kind==="position"||kind==="site"||kind==="holiday_calendar";
const text=(value:unknown)=>String(value??"");
function validDate(value:string){const date=new Date(`${value}T00:00:00Z`);if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||Number.isNaN(date.getTime())||date.toISOString().slice(0,10)!==value)throw bad("A real effective date is required");}
function dbConflict(error:unknown):never{if(error&&typeof error==="object"&&["23505","23503","23514"].includes(String((error as {code?:unknown}).code)))throw conflict("Setup code or reference conflicts with existing data");throw error;}
export function createHrStage2SetupService(options:{authorizer:Authorizer;transactions:PlaneTransactionCoordinator<Tx>;audit:AuditRecorder<Tx>}){
 const run=<T>(context:VerifiedRequestContext,work:(tx:Tx)=>Promise<T>)=>options.transactions.run(context.planeKey,{tenantId:context.tenantId,principalId:context.principalId},work);
 const authorize=async(context:VerifiedRequestContext,permissionCode:string,resource:Readonly<Record<string,unknown>>)=>{if(context.planeKey!=="neon"||!(await options.authorizer.authorize({context,permissionCode,resource})).allowed)throw denied();};
 return {
  async setupDrafts(context:VerifiedRequestContext,companyCodeId:string){
   if(!uuid.test(companyCodeId))throw bad("Company is required");await authorize(context,"neon.hr.setup.read",{companyCodeId});
   const catalogAllowed=(await options.authorizer.authorize({context,permissionCode:"neon.hr.setup.catalog.publish",resource:{tenantId:context.tenantId}})).allowed||(await options.authorizer.authorize({context,permissionCode:"neon.hr.setup.catalog.write",resource:{tenantId:context.tenantId}})).allowed;
   return run(context,async tx=>(await sql<Row>`SELECT publication.id,publication.entity_kind,publication.entity_id,publication.company_code_id,publication.status,publication.row_version,publication.created_by,publication.created_at,publication.approved_by,publication.approved_at,
      COALESCE((SELECT code FROM master.job_family WHERE tenant_id=publication.tenant_id AND id=publication.entity_id AND publication.entity_kind='job_family'),(SELECT code FROM master.job_function WHERE tenant_id=publication.tenant_id AND id=publication.entity_id AND publication.entity_kind='job_function'),(SELECT code FROM master.pay_grade WHERE tenant_id=publication.tenant_id AND id=publication.entity_id AND publication.entity_kind='pay_grade'),(SELECT code FROM master.job WHERE tenant_id=publication.tenant_id AND id=publication.entity_id AND publication.entity_kind='job'),(SELECT code FROM master.position WHERE tenant_id=publication.tenant_id AND id=publication.entity_id AND publication.entity_kind='position'),(SELECT code FROM master.site WHERE tenant_id=publication.tenant_id AND id=publication.entity_id AND publication.entity_kind='site'),(SELECT code FROM master.holiday_calendar WHERE tenant_id=publication.tenant_id AND id=publication.entity_id AND publication.entity_kind='holiday_calendar')) AS code
      FROM master.hr_setup_publication publication WHERE publication.tenant_id=${context.tenantId}::uuid AND (publication.company_code_id=${companyCodeId}::uuid OR (publication.company_code_id IS NULL AND ${catalogAllowed})) ORDER BY publication.created_at DESC LIMIT 150`.execute(tx)).rows);
  },
  async draftSetup(context:VerifiedRequestContext,input:DraftSetupInput){
   if(!Object.hasOwn(tables,input.kind)||!input.code?.match(/^[A-Za-z0-9][A-Za-z0-9_.-]{1,62}$/)||!input.name?.trim()||input.name.length>256)throw bad("Valid setup kind, code and name are required");
   if(scoped(input.kind)?!input.companyCodeId||!uuid.test(input.companyCodeId):Boolean(input.companyCodeId))throw bad("Company scope does not match setup kind");
   for(const key of ["jobFamilyId","jobFunctionId","payGradeId","jobId","orgUnitId","siteId"] as const)if(input[key]&&!uuid.test(input[key]))throw bad("Invalid setup reference");
   if(input.kind==="position")validDate(input.validFrom??"");
   if(input.kind==="site"&&(!input.siteType?.match(/^[A-Za-z][A-Za-z0-9_-]{1,40}$/)))throw bad("Site type is required");
   if(input.kind==="pay_grade"&&input.currencyCode&&!/^[A-Z]{3}$/.test(input.currencyCode))throw bad("Invalid currency");
   if(input.kind==="holiday_calendar"&&input.weekendPattern&&!/^(SAT_SUN|FRI_SAT|SUN_ONLY)$/.test(input.weekendPattern))throw bad("Unsupported weekend pattern");
   await authorize(context,scoped(input.kind)?"neon.hr.setup.write":"neon.hr.setup.catalog.write",scoped(input.kind)?{companyCodeId:input.companyCodeId}:{tenantId:context.tenantId});
   return run(context,async tx=>{
    const company=input.companyCodeId?(await sql<Row>`SELECT id,legal_entity_id,country_code FROM master.company_code WHERE tenant_id=${context.tenantId}::uuid AND id=${input.companyCodeId}::uuid AND status='active'`.execute(tx)).rows[0]:undefined;
    if(input.companyCodeId&&!company)throw bad("Active company is required");
    const refs=(await sql<{family:boolean;function:boolean;grade:boolean;job:boolean;org:boolean;site:boolean}>`SELECT
      (${input.jobFamilyId??null}::uuid IS NULL OR EXISTS(SELECT 1 FROM master.job_family WHERE tenant_id=${context.tenantId}::uuid AND id=${input.jobFamilyId??null}::uuid AND status='active')) family,
      (${input.jobFunctionId??null}::uuid IS NULL OR EXISTS(SELECT 1 FROM master.job_function WHERE tenant_id=${context.tenantId}::uuid AND id=${input.jobFunctionId??null}::uuid AND status='active' AND (job_family_id IS NULL OR job_family_id=${input.jobFamilyId??null}::uuid))) function,
      (${input.payGradeId??null}::uuid IS NULL OR EXISTS(SELECT 1 FROM master.pay_grade WHERE tenant_id=${context.tenantId}::uuid AND id=${input.payGradeId??null}::uuid AND status='active')) grade,
      (${input.jobId??null}::uuid IS NULL OR EXISTS(SELECT 1 FROM master.job WHERE tenant_id=${context.tenantId}::uuid AND id=${input.jobId??null}::uuid AND status='active')) job,
      (${input.orgUnitId??null}::uuid IS NULL OR EXISTS(SELECT 1 FROM master.org_unit org WHERE org.tenant_id=${context.tenantId}::uuid AND org.id=${input.orgUnitId??null}::uuid AND org.status='active' AND (EXISTS(SELECT 1 FROM master.work_assignment a WHERE a.tenant_id=org.tenant_id AND a.org_unit_id=org.id AND a.company_code_id=${input.companyCodeId??null}::uuid) OR EXISTS(SELECT 1 FROM master.hr_org_company_assignment link WHERE link.tenant_id=org.tenant_id AND link.org_unit_id=org.id AND link.company_code_id=${input.companyCodeId??null}::uuid AND link.status='active' AND link.effective_from<=${input.validFrom??null}::date AND (link.effective_until IS NULL OR link.effective_until>${input.validFrom??null}::date))))) org,
      (${input.siteId??null}::uuid IS NULL OR EXISTS(SELECT 1 FROM master.site WHERE tenant_id=${context.tenantId}::uuid AND id=${input.siteId??null}::uuid AND status='active' AND company_code_id=${input.companyCodeId??null}::uuid)) site`.execute(tx)).rows[0];
    if(!refs||Object.values(refs).some(value=>!value))throw bad("A referenced setup item is inactive or outside scope");
    try{
     let row:Row|undefined;
     const args=[context.tenantId,input.code,input.name,context.principalId] as const;
     switch(input.kind){
      case "job_family":row=(await sql<Row>`INSERT INTO master.job_family(tenant_id,code,name,status,created_by) VALUES(${args[0]}::uuid,${args[1]},${args[2]},'draft',${args[3]}::uuid) RETURNING id,code,name,status`.execute(tx)).rows[0];break;
      case "job_function":row=(await sql<Row>`INSERT INTO master.job_function(tenant_id,code,name,job_family_id,status,created_by) VALUES(${args[0]}::uuid,${args[1]},${args[2]},${input.jobFamilyId??null}::uuid,'draft',${args[3]}::uuid) RETURNING id,code,name,status`.execute(tx)).rows[0];break;
      case "pay_grade":row=(await sql<Row>`INSERT INTO master.pay_grade(tenant_id,code,name,grade_set,currency_code,status,created_by) VALUES(${args[0]}::uuid,${args[1]},${args[2]},${input.gradeSet??null},${input.currencyCode??null}::char(3),'draft',${args[3]}::uuid) RETURNING id,code,name,status`.execute(tx)).rows[0];break;
      case "job":row=(await sql<Row>`INSERT INTO master.job(tenant_id,code,name,job_family_id,job_function_id,pay_grade_id,status,created_by) VALUES(${args[0]}::uuid,${args[1]},${args[2]},${input.jobFamilyId??null}::uuid,${input.jobFunctionId??null}::uuid,${input.payGradeId??null}::uuid,'draft',${args[3]}::uuid) RETURNING id,code,name,status`.execute(tx)).rows[0];break;
      case "position":row=(await sql<Row>`INSERT INTO master.position(tenant_id,code,name,company_code_id,legal_entity_id,job_id,org_unit_id,site_id,valid_from,status,created_by) VALUES(${args[0]}::uuid,${args[1]},${args[2]},${input.companyCodeId}::uuid,${company?.["legal_entity_id"]??null}::uuid,${input.jobId??null}::uuid,${input.orgUnitId??null}::uuid,${input.siteId??null}::uuid,${input.validFrom}::date,'draft',${args[3]}::uuid) RETURNING id,code,name,status`.execute(tx)).rows[0];break;
      case "site":row=(await sql<Row>`INSERT INTO master.site(tenant_id,code,name,company_code_id,site_type,country_code,status,created_by) VALUES(${args[0]}::uuid,${args[1]},${args[2]},${input.companyCodeId}::uuid,${input.siteType},${company?.["country_code"]}::char(2),'draft',${args[3]}::uuid) RETURNING id,code,name,status`.execute(tx)).rows[0];break;
      case "holiday_calendar":row=(await sql<Row>`INSERT INTO master.holiday_calendar(tenant_id,code,name,company_code_id,legal_entity_id,site_id,country_code,weekend_pattern,status,created_by) VALUES(${args[0]}::uuid,${args[1]},${args[2]},${input.companyCodeId}::uuid,${company?.["legal_entity_id"]??null}::uuid,${input.siteId??null}::uuid,${company?.["country_code"]}::char(2),${input.weekendPattern??"SAT_SUN"},'draft',${args[3]}::uuid) RETURNING id,code,name,status`.execute(tx)).rows[0];break;
     }
     if(!row)throw conflict("Draft was not created");
     const receipt=(await sql<Row>`INSERT INTO master.hr_setup_publication(tenant_id,entity_kind,entity_id,company_code_id,created_by) VALUES(${context.tenantId}::uuid,${input.kind},${row["id"]}::uuid,${input.companyCodeId??null}::uuid,${context.principalId}::uuid) RETURNING id,row_version,status`.execute(tx)).rows[0];
     await options.audit.record({eventCode:"hr.setup.draft_created",action:"create",outcome:"success",actor:{kind:"user",principalId:context.principalId},tenantId:context.tenantId,entityType:input.kind,entityId:text(row["id"]),requestId:context.requestId,metadata:{companyCodeId:input.companyCodeId??null,approvalId:receipt?.["id"]}},tx);
     return{...row,approvalId:receipt?.["id"],rowVersion:receipt?.["row_version"]};
    }catch(error){dbConflict(error);}
   });
  },
  async publishSetup(context:VerifiedRequestContext,approvalId:string,expectedVersion:number){
   if(!uuid.test(approvalId)||!Number.isInteger(expectedVersion)||expectedVersion<1)throw bad("Approval ID and version are required");
   return run(context,async tx=>{
    const receipt=(await sql<Row>`SELECT id,entity_kind,entity_id,company_code_id,status,row_version,created_by FROM master.hr_setup_publication WHERE tenant_id=${context.tenantId}::uuid AND id=${approvalId}::uuid FOR UPDATE`.execute(tx)).rows[0];
    if(!receipt)throw new MasterDataError(404,"HR_SETUP_NOT_FOUND","Setup approval was not found");
    const kind=receipt["entity_kind"] as SetupKind;if(!Object.hasOwn(tables,kind))throw bad("Unsupported setup kind");
    await authorize(context,scoped(kind)?"neon.hr.setup.publish":"neon.hr.setup.catalog.publish",scoped(kind)?{companyCodeId:receipt["company_code_id"]}:{tenantId:context.tenantId});
    if(receipt["created_by"]===context.principalId)throw denied();
    if(receipt["status"]!=="draft"||Number(receipt["row_version"])!==expectedVersion)throw conflict("Setup approval changed or was already published");
    const table=sql.raw(tables[kind]);
    const source=(await sql<Row>`UPDATE ${table} SET status='active',updated_at=now(),updated_by=${context.principalId}::uuid WHERE tenant_id=${context.tenantId}::uuid AND id=${receipt["entity_id"]}::uuid AND status='draft' RETURNING id,code,name,status`.execute(tx)).rows[0];
    if(!source)throw conflict("Draft setup record is unavailable");
    const updated=(await sql<Row>`UPDATE master.hr_setup_publication SET status='published',approved_at=now(),approved_by=${context.principalId}::uuid,row_version=row_version+1 WHERE tenant_id=${context.tenantId}::uuid AND id=${approvalId}::uuid AND row_version=${expectedVersion} RETURNING id,status,row_version,approved_by`.execute(tx)).rows[0];
    if(!updated)throw conflict("Setup approval changed");
    await options.audit.record({eventCode:"hr.setup.published",action:"publish",outcome:"success",actor:{kind:"user",principalId:context.principalId},tenantId:context.tenantId,entityType:kind,entityId:text(source["id"]),requestId:context.requestId,metadata:{companyCodeId:receipt["company_code_id"]??null,approvalId}},tx);
    return{...source,approval:updated};
   });
  },
 };
}
