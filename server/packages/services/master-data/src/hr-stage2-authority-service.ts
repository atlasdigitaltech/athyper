import type {Authorizer,VerifiedRequestContext} from "@athyper/server-contract-auth";
import type {PlaneTransactionCoordinator} from "@athyper/server-foundation/transaction";
import {sql,type Transaction} from "kysely";
import {MasterDataError} from "./errors.js";

type Tx=Transaction<Record<string,never>>;
type Row=Record<string,unknown>;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const denied=()=>new MasterDataError(403,"HR_AUTHORITY_FORBIDDEN","Current workforce authority is not available");
export function createHrStage2AuthorityService(options:{readonly authorizer:Authorizer;readonly transactions:PlaneTransactionCoordinator<Tx>}){
 return {async employeeAuthority(context:VerifiedRequestContext,employeeId:string,companyCodeId:string){
  if(context.planeKey!=="neon"||!uuid.test(employeeId)||!uuid.test(companyCodeId))throw new MasterDataError(400,"HR_AUTHORITY_INVALID","Employee and company IDs are required");
  const permission=await options.authorizer.authorize({context,permissionCode:"neon.workforce.read",resource:{companyCodeId}});if(!permission.allowed)throw denied();
  return options.transactions.run(context.planeKey,{tenantId:context.tenantId,principalId:context.principalId},async tx=>{
   const target=(await sql<Row>`SELECT employee.id,employee.principal_id,assignment.id assignment_id,assignment.manager_employee_id,manager.principal_id manager_principal_id,assignment.company_code_id FROM master.employee employee JOIN master.work_assignment assignment ON assignment.tenant_id=employee.tenant_id AND assignment.employee_id=employee.id AND assignment.company_code_id=${companyCodeId}::uuid AND assignment.status='active' AND assignment.assignment_type='primary' AND assignment.effective_from<=CURRENT_DATE AND (assignment.effective_until IS NULL OR assignment.effective_until>CURRENT_DATE) JOIN master.employment employment ON employment.tenant_id=assignment.tenant_id AND employment.id=assignment.employment_id AND employment.employee_id=employee.id AND employment.status='active' AND employment.employment_status='active' AND employment.hire_date<=CURRENT_DATE AND (employment.termination_date IS NULL OR employment.termination_date>CURRENT_DATE) LEFT JOIN master.employee manager ON manager.tenant_id=assignment.tenant_id AND manager.id=assignment.manager_employee_id AND manager.status='active' WHERE employee.tenant_id=${context.tenantId}::uuid AND employee.id=${employeeId}::uuid AND employee.status='active' ORDER BY assignment.effective_from DESC LIMIT 1`.execute(tx)).rows[0];
   if(!target)throw new MasterDataError(404,"HR_AUTHORITY_EMPLOYEE_NOT_FOUND","No approved current relationship exists in this company");
   const self=target["principal_id"]===context.principalId;
   const manager=target["manager_principal_id"]===context.principalId;
   let delegated=false;
   if(target["manager_principal_id"]&&!manager){const row=(await sql<Row>`SELECT delegation.id FROM authz.delegation delegation JOIN authz.delegation_grant grant_row ON grant_row.tenant_id=delegation.tenant_id AND grant_row.delegation_id=delegation.id JOIN authz.permission permission ON permission.id=grant_row.permission_id JOIN authz.scope_target scope ON scope.tenant_id=grant_row.tenant_id AND scope.id=grant_row.scope_target_id WHERE delegation.tenant_id=${context.tenantId}::uuid AND delegation.delegate_id=${context.principalId}::uuid AND delegation.delegator_id=${target["manager_principal_id"]}::uuid AND delegation.status='active' AND delegation.approved_at IS NOT NULL AND delegation.effective_from<=now() AND delegation.effective_until>now() AND permission.canonical_code='neon.workforce.read' AND scope.scope_kind='company_code' AND scope.target_id=${companyCodeId}::uuid AND scope.status='active' LIMIT 1`.execute(tx)).rows[0];delegated=Boolean(row);}
   const hr=(await options.authorizer.authorize({context,permissionCode:"neon.workforce.profile.write",resource:{companyCodeId}})).allowed;
   return{employeeId,companyCodeId,asOf:new Date().toISOString().slice(0,10),self,manager,delegatedManager:delegated,hr,managerPrincipalId:target["manager_principal_id"]??null,assignmentId:target["assignment_id"],authoritySource:self?"self":manager?"current_manager":delegated?"approved_delegation":hr?"hr_scope":"read_only"};
  });
 }};
}
