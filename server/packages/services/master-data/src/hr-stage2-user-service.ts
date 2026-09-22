import type {AuditRecorder} from "@athyper/server-contract-audit";
import type {Authorizer,VerifiedRequestContext} from "@athyper/server-contract-auth";
import type {PlaneTransactionCoordinator} from "@athyper/server-foundation/transaction";
import {sql,type Transaction} from "kysely";
import {MasterDataError} from "./errors.js";

type Tx=Transaction<Record<string,never>>;
type Row=Record<string,unknown>;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const text=(value:unknown)=>String(value??"");
const timestamp=(value:unknown)=>value instanceof Date?value.toISOString():text(value);
const bad=(message:string)=>new MasterDataError(400,"HR_USER_INVALID",message);
const denied=()=>new MasterDataError(403,"HR_USER_FORBIDDEN","User action is not authorized");
const conflict=(message:string)=>new MasterDataError(409,"HR_USER_CONFLICT",message);
const allowedFields=new Set(["preferredName","displayName"]);
function changesOf(value:unknown):Record<string,string>{if(!value||typeof value!=="object"||Array.isArray(value))throw bad("Profile changes must be an object");const result:Record<string,string>={};for(const [key,entry] of Object.entries(value)){if(!allowedFields.has(key)||typeof entry!=="string"||!entry.trim()||entry.trim().length>(key==="preferredName"?128:256))throw bad("Only valid preferred/display names may be changed");result[key]=entry.trim();}if(!Object.keys(result).length)throw bad("At least one profile change is required");return result;}
export function createHrStage2UserService(options:{readonly authorizer:Authorizer;readonly transactions:PlaneTransactionCoordinator<Tx>;readonly audit:AuditRecorder<Tx>}){
 const run=<T>(context:VerifiedRequestContext,work:(tx:Tx)=>Promise<T>)=>options.transactions.run(context.planeKey,{tenantId:context.tenantId,principalId:context.principalId},work);
 const authorize=async(context:VerifiedRequestContext,permissionCode:string)=>{if(context.planeKey!=="neon"||!(await options.authorizer.authorize({context,permissionCode,resource:{tenantId:context.tenantId}})).allowed)throw denied();};
 return {
  async submitOwnProfileRequest(context:VerifiedRequestContext,requestId:string,expectedVersion:number){
   if(!uuid.test(requestId)||!Number.isInteger(expectedVersion)||expectedVersion<1)throw bad("Request ID and version are required");await authorize(context,"neon.user.profile.request");
   return run(context,async tx=>{const row=(await sql<Row>`SELECT id,principal_id,status,row_version FROM document.user_profile_update_request WHERE tenant_id=${context.tenantId}::uuid AND id=${requestId}::uuid AND requested_by=${context.principalId}::uuid`.execute(tx)).rows[0];
    if(!row)throw denied();if(row["status"]==="submitted")return{...row,replayed:true};if(row["status"]!=="draft"||Number(row["row_version"])!==expectedVersion)throw conflict("Profile request changed or cannot be submitted");
    const updated=(await sql<Row>`UPDATE document.user_profile_update_request SET status='submitted',status_changed_at=now(),status_changed_by=${context.principalId}::uuid,updated_at=now(),updated_by=${context.principalId}::uuid,row_version=row_version+1 WHERE tenant_id=${context.tenantId}::uuid AND id=${requestId}::uuid AND requested_by=${context.principalId}::uuid AND status='draft' AND row_version=${expectedVersion} RETURNING id,principal_id,status,row_version`.execute(tx)).rows[0];if(!updated)throw conflict("Profile request changed while submitting");
    await options.audit.record({eventCode:"user.profile_change.submitted",action:"submit",outcome:"success",actor:{kind:"user",principalId:context.principalId},tenantId:context.tenantId,entityType:"user_profile_update_request",entityId:requestId,requestId:context.requestId},tx);return{...updated,replayed:false};
   });
  },
  async profileReviewQueue(context:VerifiedRequestContext){await authorize(context,"neon.user.profile.review");return run(context,async tx=>(await sql<Row>`SELECT id,code,principal_id,requested_by,requested_changes,status,row_version,created_at FROM document.user_profile_update_request WHERE tenant_id=${context.tenantId}::uuid AND status='submitted' ORDER BY created_at,id LIMIT 100`.execute(tx)).rows);},
  async decideProfileRequest(context:VerifiedRequestContext,input:{requestId:string;expectedVersion:number;decision:"apply"|"reject";reason?:string}){
   if(!uuid.test(input.requestId)||!Number.isInteger(input.expectedVersion)||input.expectedVersion<1||!["apply","reject"].includes(input.decision))throw bad("Invalid review action");if(input.decision==="reject"&&!input.reason?.trim())throw bad("Rejection reason is required");await authorize(context,"neon.user.profile.review");
   return run(context,async tx=>{await sql`SELECT set_config('app.hr_stage2_user_admin','true',true)`.execute(tx);const request=(await sql<Row>`SELECT id,principal_id,requested_by,requested_changes,status,row_version FROM document.user_profile_update_request WHERE tenant_id=${context.tenantId}::uuid AND id=${input.requestId}::uuid`.execute(tx)).rows[0];if(!request)throw new MasterDataError(404,"HR_PROFILE_REQUEST_NOT_FOUND","Profile request not found");
    if(request["requested_by"]===context.principalId)throw denied();if(request["status"]!=="submitted"||Number(request["row_version"])!==input.expectedVersion)throw conflict("Profile request changed or is not awaiting review");
    const changes=changesOf(request["requested_changes"]),principalId=text(request["principal_id"]);
    const principal=(await sql<Row>`SELECT id,principal_type,status FROM master.principal WHERE tenant_id=${context.tenantId}::uuid AND id=${principalId}::uuid`.execute(tx)).rows[0];if(!principal||principal["principal_type"]!=="user"||principal["status"]!=="active")throw conflict("Target user is no longer active");
    if(input.decision==="apply"){
      await sql`INSERT INTO master.principal_profile(tenant_id,principal_id,preferred_name,display_name,created_by) VALUES(${context.tenantId}::uuid,${principalId}::uuid,${changes["preferredName"]??null},${changes["displayName"]??null},${context.principalId}::uuid) ON CONFLICT(tenant_id,principal_id) DO UPDATE SET preferred_name=CASE WHEN ${Object.hasOwn(changes,"preferredName")} THEN ${changes["preferredName"]??null} ELSE master.principal_profile.preferred_name END,display_name=CASE WHEN ${Object.hasOwn(changes,"displayName")} THEN ${changes["displayName"]??null} ELSE master.principal_profile.display_name END,updated_at=now(),updated_by=${context.principalId}::uuid`.execute(tx);
    }
    const updated=(await sql<Row>`UPDATE document.user_profile_update_request SET status=${input.decision==="apply"?"applied":"rejected"},reviewed_at=now(),reviewed_by=${context.principalId}::uuid,review_reason=${input.reason?.trim()??null},status_changed_at=now(),status_changed_by=${context.principalId}::uuid,updated_at=now(),updated_by=${context.principalId}::uuid,row_version=row_version+1 WHERE tenant_id=${context.tenantId}::uuid AND id=${input.requestId}::uuid AND status='submitted' AND row_version=${input.expectedVersion} RETURNING id,principal_id,status,row_version,reviewed_by,reviewed_at`.execute(tx)).rows[0];if(!updated)throw conflict("Profile request changed during review");
    await options.audit.record({eventCode:input.decision==="apply"?"user.profile_change.applied":"user.profile_change.rejected",action:input.decision,outcome:"success",actor:{kind:"user",principalId:context.principalId},tenantId:context.tenantId,entityType:"user_profile_update_request",entityId:input.requestId,requestId:context.requestId,metadata:{fields:Object.keys(changes)}},tx);return updated;
   });
  },
  async adminUpdateProfile(context:VerifiedRequestContext,input:{principalId:string;expectedUpdatedAt?:string|null;preferredName?:string;displayName?:string}){
   if(!uuid.test(input.principalId))throw bad("Invalid user ID");const changes=changesOf(Object.fromEntries(Object.entries({preferredName:input.preferredName,displayName:input.displayName}).filter(([,value])=>value!==undefined)));await authorize(context,"neon.user.admin.write");
   return run(context,async tx=>{await sql`SELECT set_config('app.hr_stage2_user_admin','true',true)`.execute(tx);const principal=(await sql<Row>`SELECT id,principal_type,status FROM master.principal WHERE tenant_id=${context.tenantId}::uuid AND id=${input.principalId}::uuid`.execute(tx)).rows[0];if(!principal||principal["principal_type"]!=="user"||principal["status"]!=="active")throw conflict("Only active human users may be edited");
    const current=(await sql<Row>`SELECT preferred_name,display_name,updated_at FROM master.principal_profile WHERE tenant_id=${context.tenantId}::uuid AND principal_id=${input.principalId}::uuid`.execute(tx)).rows[0];
    if(input.expectedUpdatedAt!==undefined&&timestamp(current?.["updated_at"]||"")!==text(input.expectedUpdatedAt||""))throw conflict("User profile changed since it was loaded");
    if(Object.entries(changes).every(([key,value])=>current?.[key==="preferredName"?"preferred_name":"display_name"]===value))return{principalId:input.principalId,replayed:true};
    await sql`INSERT INTO master.principal_profile(tenant_id,principal_id,preferred_name,display_name,created_by) VALUES(${context.tenantId}::uuid,${input.principalId}::uuid,${changes["preferredName"]??null},${changes["displayName"]??null},${context.principalId}::uuid) ON CONFLICT(tenant_id,principal_id) DO UPDATE SET preferred_name=CASE WHEN ${Object.hasOwn(changes,"preferredName")} THEN ${changes["preferredName"]??null} ELSE master.principal_profile.preferred_name END,display_name=CASE WHEN ${Object.hasOwn(changes,"displayName")} THEN ${changes["displayName"]??null} ELSE master.principal_profile.display_name END,updated_at=now(),updated_by=${context.principalId}::uuid`.execute(tx);
    await options.audit.record({eventCode:"user.profile.admin_updated",action:"update",outcome:"success",actor:{kind:"user",principalId:context.principalId},tenantId:context.tenantId,entityType:"principal_profile",entityId:input.principalId,requestId:context.requestId,metadata:{fields:Object.keys(changes)}},tx);
    return{principalId:input.principalId,replayed:false};
   });
  },
 };
}
