import { createHash } from "node:crypto";
import type { AuditRecorder } from "@athyper/server-contract-audit";
import type { Authorizer, VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { PlaneTransactionCoordinator } from "@athyper/server-foundation/transaction";
import { sql, type Transaction } from "kysely";
import { MasterDataError } from "./errors.js";
import { createHrStage2PolicyService } from "./hr-stage2-policy-service.js";
import { createHrStage2UserService } from "./hr-stage2-user-service.js";
import { createHrStage2AuthorityService } from "./hr-stage2-authority-service.js";
import { createHrStage2SetupService } from "./hr-stage2-setup-service.js";
import { createHrStage2ReferenceService } from "./hr-stage2-reference-service.js";

type Tx=Transaction<Record<string,never>>;
type Row=Record<string,unknown>;
const deny=()=>new MasterDataError(403,"HR_STAGE2_FORBIDDEN","The requested HR setup or User action is not authorized");
const invalid=(message:string)=>new MasterDataError(400,"HR_STAGE2_INVALID",message);
const conflict=(message:string)=>new MasterDataError(409,"HR_STAGE2_CONFLICT",message);
const text=(value:unknown)=>String(value??"");
const dateOnly=(value:unknown)=>value instanceof Date?value.toISOString().slice(0,10):text(value).slice(0,10);
const sameChanges=(left:unknown,right:Readonly<Record<string,string>>)=>{
  if(!left||typeof left!=="object"||Array.isArray(left))return false;
  const stored=left as Record<string,unknown>;
  return Object.keys(stored).length===Object.keys(right).length&&Object.entries(right).every(([key,value])=>stored[key]===value);
};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createHrStage2Service(options:{
  readonly authorizer:Authorizer;
  readonly transactions:PlaneTransactionCoordinator<Tx>;
  readonly audit:AuditRecorder<Tx>;
}){
  const run=<T>(context:VerifiedRequestContext,work:(tx:Tx)=>Promise<T>)=>options.transactions.run(context.planeKey,{tenantId:context.tenantId,principalId:context.principalId},work);
  const authorize=async(context:VerifiedRequestContext,permissionCode:string,resource:Readonly<Record<string,unknown>>)=>{
    if(context.planeKey!=="neon"||!(await options.authorizer.authorize({context,permissionCode,resource})).allowed)throw deny();
  };
  return{
    ...createHrStage2PolicyService(options),
    ...createHrStage2UserService(options),
    ...createHrStage2AuthorityService(options),
    ...createHrStage2SetupService(options),
    ...createHrStage2ReferenceService(options),
    async catalog(context:VerifiedRequestContext,companyCodeId:string){
      if(!uuid.test(companyCodeId))throw invalid("A company ID is required");
      await authorize(context,"neon.hr.setup.read",{companyCodeId});
      return run(context,async tx=>{
        const company=(await sql<Row>`SELECT id,code,name,country_code,status FROM master.company_code WHERE tenant_id=${context.tenantId}::uuid AND id=${companyCodeId}::uuid AND status='active'`.execute(tx)).rows[0];
        if(!company)throw new MasterDataError(404,"HR_SETUP_COMPANY_NOT_FOUND","Company is unavailable");
        const [families,functions,grades,jobs,positions,organizations,sites,calendars,policies]=await Promise.all([
          sql<Row>`SELECT id,code,name,status FROM master.job_family WHERE tenant_id=${context.tenantId}::uuid AND status='active' ORDER BY name LIMIT 200`.execute(tx),
          sql<Row>`SELECT id,code,name,job_family_id,status FROM master.job_function WHERE tenant_id=${context.tenantId}::uuid AND status='active' ORDER BY name LIMIT 200`.execute(tx),
          sql<Row>`SELECT id,code,name,grade_set,currency_code,status FROM master.pay_grade WHERE tenant_id=${context.tenantId}::uuid AND status='active' ORDER BY name LIMIT 200`.execute(tx),
          sql<Row>`SELECT id,code,name,job_family_id,job_function_id,pay_grade_id,status FROM master.job WHERE tenant_id=${context.tenantId}::uuid AND status='active' ORDER BY name LIMIT 200`.execute(tx),
          sql<Row>`SELECT id,code,name,job_id,org_unit_id,site_id,valid_from,valid_to,status FROM master.position WHERE tenant_id=${context.tenantId}::uuid AND company_code_id=${companyCodeId}::uuid AND status<>'archived' ORDER BY name LIMIT 200`.execute(tx),
          sql<Row>`SELECT org.id,org.code,org.name,org.status FROM master.org_unit org WHERE org.tenant_id=${context.tenantId}::uuid AND org.status='active' AND (EXISTS(SELECT 1 FROM master.position position WHERE position.tenant_id=org.tenant_id AND position.org_unit_id=org.id AND position.company_code_id=${companyCodeId}::uuid) OR EXISTS(SELECT 1 FROM master.work_assignment assignment WHERE assignment.tenant_id=org.tenant_id AND assignment.org_unit_id=org.id AND assignment.company_code_id=${companyCodeId}::uuid) OR EXISTS(SELECT 1 FROM master.hr_org_company_assignment link WHERE link.tenant_id=org.tenant_id AND link.org_unit_id=org.id AND link.company_code_id=${companyCodeId}::uuid AND link.status='active' AND link.effective_from<=CURRENT_DATE AND (link.effective_until IS NULL OR link.effective_until>CURRENT_DATE))) ORDER BY org.name LIMIT 200`.execute(tx),
          sql<Row>`SELECT id,code,name,country_code,timezone_code,status FROM master.site WHERE tenant_id=${context.tenantId}::uuid AND company_code_id=${companyCodeId}::uuid AND status='active' ORDER BY name LIMIT 200`.execute(tx),
          sql<Row>`SELECT id,code,name,country_code,site_id,weekend_pattern,is_default,status FROM master.holiday_calendar WHERE tenant_id=${context.tenantId}::uuid AND (company_code_id=${companyCodeId}::uuid OR company_code_id IS NULL) AND status='active' ORDER BY is_default DESC,name LIMIT 200`.execute(tx),
          sql<Row>`SELECT definition.id,definition.name,definition.entity_type,definition.version_no,definition.definition_hash,definition.effective_from,definition.effective_until,definition.status,(SELECT count(*)::integer FROM control.policy_rule rule WHERE rule.policy_definition_id=definition.id) AS rule_count FROM control.policy_definition definition WHERE (definition.tenant_id=${context.tenantId}::uuid OR definition.tenant_id IS NULL) AND definition.entity_type LIKE 'hr.%' AND definition.status='active' ORDER BY definition.entity_type,definition.name,definition.version_no DESC LIMIT 200`.execute(tx),
        ]);
        return{company,jobFamilies:families.rows,jobFunctions:functions.rows,grades:grades.rows,jobs:jobs.rows,positions:positions.rows,organizations:organizations.rows,sites:sites.rows,calendars:calendars.rows,policies:policies.rows};
      });
    },
    async createDraftPosition(context:VerifiedRequestContext,input:{companyCodeId:string;code:string;name:string;validFrom:string;jobId?:string;orgUnitId?:string;siteId?:string}){
      if(!uuid.test(input.companyCodeId)||!input.code.match(/^[A-Za-z0-9][A-Za-z0-9_.-]{1,62}$/)||!input.name.trim()||input.name.length>256||!/^\d{4}-\d{2}-\d{2}$/.test(input.validFrom))throw invalid("Valid company, code, name and effective date are required");
      const parsedDate=new Date(`${input.validFrom}T00:00:00.000Z`);
      if(Number.isNaN(parsedDate.getTime())||parsedDate.toISOString().slice(0,10)!==input.validFrom)throw invalid("Effective date must be a real calendar day");
      for(const value of [input.jobId,input.orgUnitId,input.siteId])if(value&&!uuid.test(value))throw invalid("Invalid setup reference");
      await authorize(context,"neon.hr.setup.write",{companyCodeId:input.companyCodeId});
      return run(context,async tx=>{
        const company=(await sql<Row>`SELECT id,legal_entity_id FROM master.company_code WHERE tenant_id=${context.tenantId}::uuid AND id=${input.companyCodeId}::uuid AND status='active'`.execute(tx)).rows[0];
        if(!company)throw invalid("Company is unavailable");
        const refs=(await sql<{job:boolean;org:boolean;site:boolean}>`SELECT
          (${input.jobId??null}::uuid IS NULL OR EXISTS(SELECT 1 FROM master.job WHERE tenant_id=${context.tenantId}::uuid AND id=${input.jobId??null}::uuid AND status='active')) job,
          (${input.orgUnitId??null}::uuid IS NULL OR EXISTS(SELECT 1 FROM master.org_unit org WHERE org.tenant_id=${context.tenantId}::uuid AND org.id=${input.orgUnitId??null}::uuid AND org.status='active' AND (EXISTS(SELECT 1 FROM master.position position WHERE position.tenant_id=org.tenant_id AND position.org_unit_id=org.id AND position.company_code_id=${input.companyCodeId}::uuid) OR EXISTS(SELECT 1 FROM master.work_assignment assignment WHERE assignment.tenant_id=org.tenant_id AND assignment.org_unit_id=org.id AND assignment.company_code_id=${input.companyCodeId}::uuid) OR EXISTS(SELECT 1 FROM master.hr_org_company_assignment link WHERE link.tenant_id=org.tenant_id AND link.org_unit_id=org.id AND link.company_code_id=${input.companyCodeId}::uuid AND link.status='active' AND link.effective_from<=${input.validFrom}::date AND (link.effective_until IS NULL OR link.effective_until>${input.validFrom}::date))))) org,
          (${input.siteId??null}::uuid IS NULL OR EXISTS(SELECT 1 FROM master.site WHERE tenant_id=${context.tenantId}::uuid AND id=${input.siteId??null}::uuid AND company_code_id=${input.companyCodeId}::uuid AND status='active')) site`.execute(tx)).rows[0];
        if(!refs?.job||!refs.org||!refs.site)throw invalid("Job, organization or site is outside the selected company or inactive");
        const existing=(await sql<Row>`SELECT id,code,name,valid_from::text AS valid_from,status,company_code_id,job_id,org_unit_id,site_id,created_by FROM master.position WHERE tenant_id=${context.tenantId}::uuid AND code=${input.code} LIMIT 1`.execute(tx)).rows[0];
        if(existing){if(text(existing["company_code_id"])===input.companyCodeId&&text(existing["name"])===input.name&&dateOnly(existing["valid_from"])===input.validFrom&&existing["status"]==="draft"&&existing["created_by"]===context.principalId&&(existing["job_id"]??null)===(input.jobId??null)&&(existing["org_unit_id"]??null)===(input.orgUnitId??null)&&(existing["site_id"]??null)===(input.siteId??null)){
          await sql`INSERT INTO master.hr_setup_publication(tenant_id,entity_kind,entity_id,company_code_id,created_by) VALUES(${context.tenantId}::uuid,'position',${existing["id"]}::uuid,${input.companyCodeId}::uuid,${context.principalId}::uuid) ON CONFLICT(tenant_id,entity_kind,entity_id) DO NOTHING`.execute(tx);
          return{...existing,replayed:true};
        }throw conflict("Position code already exists with different setup");}
        const row=(await sql<Row>`INSERT INTO master.position(tenant_id,code,name,company_code_id,legal_entity_id,org_unit_id,job_id,site_id,valid_from,status,created_by) VALUES(${context.tenantId}::uuid,${input.code},${input.name},${input.companyCodeId}::uuid,${company["legal_entity_id"]??null}::uuid,${input.orgUnitId??null}::uuid,${input.jobId??null}::uuid,${input.siteId??null}::uuid,${input.validFrom}::date,'draft',${context.principalId}::uuid) RETURNING id,code,name,valid_from,status,company_code_id`.execute(tx)).rows[0];
        if(!row)throw conflict("Position was not created");
        await sql`INSERT INTO master.hr_setup_publication(tenant_id,entity_kind,entity_id,company_code_id,created_by) VALUES(${context.tenantId}::uuid,'position',${row["id"]}::uuid,${input.companyCodeId}::uuid,${context.principalId}::uuid)`.execute(tx);
        await options.audit.record({eventCode:"hr.setup.position.draft_created",action:"create",outcome:"success",actor:{kind:"user",principalId:context.principalId},tenantId:context.tenantId,entityType:"position",entityId:text(row["id"]),requestId:context.requestId,metadata:{companyCodeId:input.companyCodeId,validFrom:input.validFrom}},tx);
        return{...row,replayed:false};
      });
    },
    async users(context:VerifiedRequestContext,search:string,limit=50){
      if(search.length>100||!Number.isInteger(limit)||limit<1||limit>100)throw invalid("Invalid user search");
      await authorize(context,"neon.user.directory.read",{tenantId:context.tenantId});
      return run(context,async tx=>{await sql`SELECT set_config('app.hr_stage2_user_admin','true',true)`.execute(tx);return(await sql<Row>`SELECT principal.id,principal.code,principal.name,principal.principal_type,principal.status,profile.display_name,COALESCE(binding.sync_status::text,'unbound') sync_status FROM master.principal principal LEFT JOIN master.principal_profile profile ON profile.tenant_id=principal.tenant_id AND profile.principal_id=principal.id LEFT JOIN LATERAL(SELECT sync_status FROM master.principal_identity_binding binding WHERE binding.tenant_id=principal.tenant_id AND binding.principal_id=principal.id AND binding.status='active' ORDER BY binding.is_primary DESC,binding.created_at DESC LIMIT 1) binding ON true WHERE principal.tenant_id=${context.tenantId}::uuid AND (principal.name ILIKE ${"%"+search+"%"} OR principal.code ILIKE ${"%"+search+"%"}) ORDER BY principal.name,principal.id LIMIT ${limit}`.execute(tx)).rows;});
    },
    async user(context:VerifiedRequestContext,principalId:string){
      if(!uuid.test(principalId))throw invalid("Invalid user ID");
      await authorize(context,"neon.user.directory.read",{tenantId:context.tenantId});
      return run(context,async tx=>{
        await sql`SELECT set_config('app.hr_stage2_user_admin','true',true)`.execute(tx);
        const principal=(await sql<Row>`SELECT principal.id,principal.code,principal.name,principal.principal_type,principal.status,principal.provisioning_source,principal.auth_epoch,profile.given_name,profile.family_name,profile.preferred_name,profile.display_name,profile.updated_at AS profile_updated_at,ui.locale_code,ui.language_code,ui.timezone_code,ui.date_format,ui.number_format FROM master.principal principal LEFT JOIN master.principal_profile profile ON profile.tenant_id=principal.tenant_id AND profile.principal_id=principal.id LEFT JOIN master.principal_ui_profile ui ON ui.tenant_id=principal.tenant_id AND ui.principal_id=principal.id WHERE principal.tenant_id=${context.tenantId}::uuid AND principal.id=${principalId}::uuid`.execute(tx)).rows[0];
        if(!principal)throw new MasterDataError(404,"HR_USER_NOT_FOUND","User was not found");
        const [bindings,memberships,groups,employmentLinks]=await Promise.all([
          sql<Row>`SELECT id,provider_code,realm_key,username,is_primary,status,sync_status,sync_retry_count,last_verified_at FROM master.principal_identity_binding WHERE tenant_id=${context.tenantId}::uuid AND principal_id=${principalId}::uuid ORDER BY is_primary DESC,created_at DESC LIMIT 20`.execute(tx),
          sql<Row>`SELECT status,membership_kind,effective_from,effective_until FROM authz.plane_membership WHERE tenant_id=${context.tenantId}::uuid AND principal_id=${principalId}::uuid ORDER BY created_at DESC LIMIT 20`.execute(tx),
          sql<Row>`SELECT g.code group_code,g.name group_name,r.code role_code,target.scope_kind,target.target_id,gr.effective_from,gr.effective_until FROM authz.group_member gm JOIN authz.principal_group g ON g.tenant_id=gm.tenant_id AND g.id=gm.group_id LEFT JOIN authz.group_role gr ON gr.tenant_id=gm.tenant_id AND gr.group_id=gm.group_id AND gr.status='active' LEFT JOIN authz.role r ON r.tenant_id=gr.tenant_id AND r.id=gr.role_id LEFT JOIN authz.scope_target target ON target.tenant_id=gr.tenant_id AND target.id=gr.scope_target_id WHERE gm.tenant_id=${context.tenantId}::uuid AND gm.principal_id=${principalId}::uuid AND gm.status='active' ORDER BY g.name LIMIT 100`.execute(tx),
          sql<Row>`SELECT employee.id employee_id,employment.legal_entity_id employer_organization_id,employment.company_code_id,employment.status employment_status FROM master.employee employee JOIN master.employment employment ON employment.tenant_id=employee.tenant_id AND employment.employee_id=employee.id AND employment.status='active' AND employment.employment_status='active' WHERE employee.tenant_id=${context.tenantId}::uuid AND employee.principal_id=${principalId}::uuid AND employee.status='active' ORDER BY employment.is_primary DESC,employment.hire_date DESC LIMIT 10`.execute(tx),
        ]);
        return{principal,bindings:bindings.rows,memberships:memberships.rows,groups:groups.rows,employmentLinks:employmentLinks.rows};
      });
    },
    async requestOwnProfileChange(context:VerifiedRequestContext,input:{idempotencyKey:string;preferredName?:string;displayName?:string}){
      if(context.planeKey!=="neon"||!input.idempotencyKey.match(/^[A-Za-z0-9_.-]{8,120}$/))throw invalid("Invalid request key");
      const changes=Object.fromEntries([["preferredName",input.preferredName],["displayName",input.displayName]].filter((entry):entry is [string,string]=>typeof entry[1]==="string"&&entry[1].trim().length>0).map(([key,value])=>[key,value.trim()]));
      if(!Object.keys(changes).length||Object.entries(changes).some(([key,value])=>value.length>(key==="preferredName"?128:256)))throw invalid("A valid profile change is required");
      await authorize(context,"neon.user.profile.request",{tenantId:context.tenantId,principalId:context.principalId});
      return run(context,async tx=>{
        await sql`SELECT pg_advisory_xact_lock(hashtextextended(${context.tenantId+":"+context.principalId},0))`.execute(tx);
        const principal=(await sql<Row>`SELECT id,principal_type,status,name FROM master.principal WHERE tenant_id=${context.tenantId}::uuid AND id=${context.principalId}::uuid`.execute(tx)).rows[0];
        if(!principal||principal["principal_type"]!=="user"||principal["status"]!=="active")throw deny();
        const code="UPR."+createHash("sha256").update(context.tenantId+":"+context.principalId+":"+input.idempotencyKey).digest("hex").slice(0,32).toUpperCase();
        const existing=(await sql<Row>`SELECT id,code,status,requested_changes FROM document.user_profile_update_request WHERE tenant_id=${context.tenantId}::uuid AND code=${code}`.execute(tx)).rows[0];
        if(existing){if(sameChanges(existing["requested_changes"],changes))return{...existing,replayed:true};throw conflict("Request key was reused with different changes");}
        const active=(await sql<Row>`SELECT id FROM document.user_profile_update_request WHERE tenant_id=${context.tenantId}::uuid AND principal_id=${context.principalId}::uuid AND is_active LIMIT 1`.execute(tx)).rows[0];
        if(active)throw conflict("Finish or cancel the existing profile change request before creating another");
        const row=(await sql<Row>`INSERT INTO document.user_profile_update_request(tenant_id,code,name,created_by,requested_by,principal_id,principal_snapshot,request_scope,requested_changes,status) VALUES(${context.tenantId}::uuid,${code},${`Profile update for ${text(principal["name"])}`},${context.principalId}::uuid,${context.principalId}::uuid,${context.principalId}::uuid,${JSON.stringify({principalType:"user"})}::jsonb,ARRAY['principal_profile']::text[],${JSON.stringify(changes)}::jsonb,'draft') RETURNING id,code,status,requested_changes`.execute(tx)).rows[0];
        if(!row)throw conflict("Profile request was not created");
        await options.audit.record({eventCode:"user.profile_change.requested",action:"create",outcome:"success",actor:{kind:"user",principalId:context.principalId},tenantId:context.tenantId,entityType:"user_profile_update_request",entityId:text(row["id"]),requestId:context.requestId,metadata:{fields:Object.keys(changes)}},tx);
        return{...row,replayed:false};
      });
    },
    async ownProfileRequest(context:VerifiedRequestContext){
      if(context.planeKey!=="neon")throw deny();
      await authorize(context,"neon.user.profile.request",{tenantId:context.tenantId,principalId:context.principalId});
      return run(context,async tx=>(await sql<Row>`SELECT id,code,status,row_version,requested_changes,created_at FROM document.user_profile_update_request WHERE tenant_id=${context.tenantId}::uuid AND principal_id=${context.principalId}::uuid ORDER BY created_at DESC LIMIT 10`.execute(tx)).rows);
    },
  };
}
