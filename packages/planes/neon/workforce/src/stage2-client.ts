import { createOperation, encodePathSegment, type HttpClient } from "@athyper/platform-api-client";

export interface SetupRow { readonly id:string; readonly code:string; readonly name:string; readonly status:string; readonly [key:string]:unknown; }
export type SetupKind="job_family"|"job_function"|"pay_grade"|"job"|"position"|"site"|"holiday_calendar";
export interface SetupDraft {readonly id:string;readonly entity_kind:SetupKind;readonly entity_id:string;readonly code?:string;readonly name?:string;readonly company_code_id?:string;readonly status:"draft"|"published";readonly row_version:number;readonly created_by:string;readonly created_at:string;}
export interface SetupDraftInput {readonly kind:SetupKind;readonly companyCodeId?:string;readonly code:string;readonly name:string;readonly jobFamilyId?:string;readonly jobFunctionId?:string;readonly payGradeId?:string;readonly jobId?:string;readonly orgUnitId?:string;readonly siteId?:string;readonly siteType?:string;readonly weekendPattern?:string;readonly currencyCode?:string;readonly gradeSet?:string;readonly validFrom?:string;}
export interface OrgCompanyAssignment {readonly id:string;readonly org_unit_id:string;readonly org_code?:string;readonly org_name?:string;readonly company_code_id:string;readonly effective_from:string;readonly effective_until?:string;readonly status:string;readonly row_version:number;readonly created_by?:string;}
export interface CalendarDayChange {readonly id:string;readonly holiday_calendar_id:string;readonly calendar_name?:string;readonly company_code_id:string;readonly holiday_date:string;readonly name:string;readonly day_type:string;readonly observance_type:string;readonly is_half_day:boolean;readonly status:string;readonly row_version:number;readonly created_by?:string;}
export interface SetupCatalog { readonly company:{readonly id:string;readonly code:string;readonly name:string;readonly country_code?:string};readonly jobFamilies:readonly SetupRow[];readonly jobFunctions:readonly SetupRow[];readonly grades:readonly SetupRow[];readonly jobs:readonly SetupRow[];readonly positions:readonly SetupRow[];readonly organizations:readonly SetupRow[];readonly sites:readonly SetupRow[];readonly calendars:readonly SetupRow[];readonly policies:readonly (Readonly<Record<string,unknown>>)[]; }
export interface UserSummary { readonly id:string;readonly code:string;readonly name:string;readonly principal_type:string;readonly status:string;readonly display_name?:string;readonly sync_status:string; }
export interface UserDetail {readonly principal:Readonly<Record<string,unknown>>;readonly bindings:readonly Readonly<Record<string,unknown>>[];readonly memberships:readonly Readonly<Record<string,unknown>>[];readonly groups:readonly Readonly<Record<string,unknown>>[];readonly employmentLinks:readonly {readonly employee_id:string;readonly employer_organization_id:string;readonly company_code_id:string;readonly employment_status:string}[];}
export interface ProfileRequest {readonly id:string;readonly code:string;readonly status:string;readonly row_version:number;readonly principal_id?:string;readonly requested_by?:string;readonly requested_changes:Readonly<Record<string,unknown>>;readonly created_at?:string;readonly replayed?:boolean;}
export interface PolicyAssignment {readonly id:string;readonly policy_definition_id:string;readonly entity_type:string;readonly policy_version_no:number;readonly scope_kind:"country"|"company"|"site";readonly country_code:string;readonly company_code_id?:string;readonly site_id?:string;readonly effective_from:string;readonly effective_until?:string;readonly status:string;readonly created_by:string;readonly row_version:number;}
export interface EffectivePolicies {readonly asOf:string;readonly countryCode:string;readonly selected:readonly PolicyAssignment[];readonly overridden:readonly (PolicyAssignment&{readonly reason:string})[];readonly unconfigured:boolean;}
export interface EmployeeAuthority {readonly employeeId:string;readonly companyCodeId:string;readonly asOf:string;readonly self:boolean;readonly manager:boolean;readonly delegatedManager:boolean;readonly hr:boolean;readonly authoritySource:string;}
const catalog=createOperation<SetupCatalog>({method:"GET",path:"/api/neon/hr-setup/catalog"});
const position=createOperation<SetupRow,Readonly<{companyCodeId:string;code:string;name:string;validFrom:string;jobId?:string;orgUnitId?:string;siteId?:string}>>({method:"POST",path:"/api/neon/hr-setup/positions",idempotency:"forbidden"});
const setupDrafts=createOperation<readonly SetupDraft[]>({method:"GET",path:"/api/neon/hr-setup/drafts"});
const setupDraftCreate=createOperation<SetupRow,SetupDraftInput>({method:"POST",path:"/api/neon/hr-setup/drafts",idempotency:"forbidden"});
const setupDraftPublish=createOperation<SetupRow,Readonly<{expectedVersion:number}>>({method:"POST",path:({approvalId})=>`/api/neon/hr-setup/drafts/${encodePathSegment(approvalId)}/publish`,idempotency:"forbidden"});
const orgCandidates=createOperation<readonly SetupRow[]>({method:"GET",path:"/api/neon/hr-setup/org-candidates"});
const orgAssignments=createOperation<readonly OrgCompanyAssignment[]>({method:"GET",path:"/api/neon/hr-setup/org-company-assignments"});
const orgAssignmentDraft=createOperation<OrgCompanyAssignment,Readonly<{companyCodeId:string;orgUnitId:string;effectiveFrom:string;effectiveUntil?:string}>>({method:"POST",path:"/api/neon/hr-setup/org-company-assignments",idempotency:"forbidden"});
const orgAssignmentPublish=createOperation<OrgCompanyAssignment,Readonly<{expectedVersion:number}>>({method:"POST",path:({assignmentId})=>`/api/neon/hr-setup/org-company-assignments/${encodePathSegment(assignmentId)}/publish`,idempotency:"forbidden"});
const calendarDayChanges=createOperation<readonly CalendarDayChange[]>({method:"GET",path:"/api/neon/hr-setup/calendar-day-changes"});
const calendarDayDraft=createOperation<CalendarDayChange,Readonly<{companyCodeId:string;calendarId:string;holidayDate:string;name:string;dayType?:string;observanceType?:string;isHalfDay?:boolean}>>({method:"POST",path:"/api/neon/hr-setup/calendar-day-changes",idempotency:"forbidden"});
const calendarDayPublish=createOperation<CalendarDayChange,Readonly<{expectedVersion:number}>>({method:"POST",path:({changeId})=>`/api/neon/hr-setup/calendar-day-changes/${encodePathSegment(changeId)}/publish`,idempotency:"forbidden"});
const users=createOperation<readonly UserSummary[]>({method:"GET",path:"/api/neon/users"});
const user=createOperation<UserDetail>({method:"GET",path:({principalId})=>`/api/neon/users/${encodePathSegment(principalId)}`});
const ownRequests=createOperation<readonly ProfileRequest[]>({method:"GET",path:"/api/neon/users/me/profile-change"});
const ownRequest=createOperation<ProfileRequest,Readonly<{idempotencyKey:string;preferredName?:string;displayName?:string}>>({method:"POST",path:"/api/neon/users/me/profile-change",idempotency:"forbidden"});
const submitOwnRequest=createOperation<ProfileRequest,Readonly<{expectedVersion:number}>>({method:"POST",path:({requestId})=>`/api/neon/users/me/profile-change/${encodePathSegment(requestId)}/submit`,idempotency:"forbidden"});
const reviewQueue=createOperation<readonly ProfileRequest[]>({method:"GET",path:"/api/neon/users/profile-changes/review"});
const decideRequest=createOperation<ProfileRequest,Readonly<{expectedVersion:number;decision:"apply"|"reject";reason?:string}>>({method:"POST",path:({requestId})=>`/api/neon/users/profile-changes/${encodePathSegment(requestId)}/decision`,idempotency:"forbidden"});
const adminProfile=createOperation<{readonly principalId:string;readonly replayed:boolean},Readonly<{expectedUpdatedAt?:string|null;preferredName?:string;displayName?:string}>>({method:"PATCH",path:({principalId})=>`/api/neon/users/${encodePathSegment(principalId)}/profile`,idempotency:"forbidden"});
const authority=createOperation<EmployeeAuthority>({method:"GET",path:({employeeId})=>`/api/neon/workforce/${encodePathSegment(employeeId)}/authority`});
const workforceIamRetry=createOperation<Readonly<{projectionId:string;replayed:boolean}>,Readonly<{employerOrganizationId:string;createPrincipal:boolean;idempotencyKey:string}>>({method:"POST",path:({employeeId})=>`/api/neon/workforce/${encodePathSegment(employeeId)}/iam-projection/retry`,idempotency:"forbidden"});
const simulate=createOperation<Readonly<Record<string,unknown>>,Readonly<{entityType:string;policyDefinitionIds:readonly string[];facts:Readonly<Record<string,unknown>>}>>({method:"POST",path:"/api/policy/simulate",idempotency:"forbidden"});
const policyAssignments=createOperation<readonly PolicyAssignment[]>({method:"GET",path:"/api/neon/hr-setup/policy-assignments"});
const effectivePolicies=createOperation<EffectivePolicies>({method:"GET",path:"/api/neon/hr-setup/policy-effective"});
const policyAssignmentCreate=createOperation<PolicyAssignment,Readonly<{idempotencyKey:string;policyDefinitionId:string;scopeKind:"country"|"company"|"site";countryCode:string;companyCodeId?:string;siteId?:string;effectiveFrom:string;effectiveUntil?:string}>>({method:"POST",path:"/api/neon/hr-setup/policy-assignments",idempotency:"forbidden"});
const policyAssignmentPublish=createOperation<PolicyAssignment,Readonly<{expectedVersion:number}>>({method:"POST",path:({assignmentId})=>`/api/neon/hr-setup/policy-assignments/${encodePathSegment(assignmentId)}/publish`,idempotency:"forbidden"});
export function createHrStage2Client(http:HttpClient){return Object.freeze({
  catalog:(companyCodeId:string,signal?:AbortSignal)=>http.request(catalog,{query:{companyCodeId},signal}),
  draftPosition:(body:{companyCodeId:string;code:string;name:string;validFrom:string;jobId?:string;orgUnitId?:string;siteId?:string})=>http.request(position,{body}),
  setupDrafts:(companyCodeId:string,signal?:AbortSignal)=>http.request(setupDrafts,{query:{companyCodeId},signal}),
  createSetupDraft:(body:SetupDraftInput)=>http.request(setupDraftCreate,{body}),
  publishSetupDraft:(approvalId:string,expectedVersion:number)=>http.request(setupDraftPublish,{params:{approvalId},body:{expectedVersion}}),
  orgCandidates:(companyCodeId:string,signal?:AbortSignal)=>http.request(orgCandidates,{query:{companyCodeId},signal}),
  orgAssignments:(companyCodeId:string,signal?:AbortSignal)=>http.request(orgAssignments,{query:{companyCodeId},signal}),
  draftOrgAssignment:(body:{companyCodeId:string;orgUnitId:string;effectiveFrom:string;effectiveUntil?:string})=>http.request(orgAssignmentDraft,{body}),
  publishOrgAssignment:(assignmentId:string,expectedVersion:number)=>http.request(orgAssignmentPublish,{params:{assignmentId},body:{expectedVersion}}),
  calendarDayChanges:(companyCodeId:string,signal?:AbortSignal)=>http.request(calendarDayChanges,{query:{companyCodeId},signal}),
  draftCalendarDay:(body:{companyCodeId:string;calendarId:string;holidayDate:string;name:string;dayType?:string;observanceType?:string;isHalfDay?:boolean})=>http.request(calendarDayDraft,{body}),
  publishCalendarDay:(changeId:string,expectedVersion:number)=>http.request(calendarDayPublish,{params:{changeId},body:{expectedVersion}}),
  users:(search:string,signal?:AbortSignal)=>http.request(users,{query:{search,limit:50},signal}),
  user:(principalId:string,signal?:AbortSignal)=>http.request(user,{params:{principalId},signal}),
  ownRequests:(signal?:AbortSignal)=>http.request(ownRequests,{signal}),
  requestOwnChange:(body:{idempotencyKey:string;preferredName?:string;displayName?:string})=>http.request(ownRequest,{body}),
  submitOwnRequest:(requestId:string,expectedVersion:number)=>http.request(submitOwnRequest,{params:{requestId},body:{expectedVersion}}),
  reviewQueue:(signal?:AbortSignal)=>http.request(reviewQueue,{signal}),
  decideRequest:(requestId:string,body:{expectedVersion:number;decision:"apply"|"reject";reason?:string})=>http.request(decideRequest,{params:{requestId},body}),
  adminProfile:(principalId:string,body:{expectedUpdatedAt?:string|null;preferredName?:string;displayName?:string})=>http.request(adminProfile,{params:{principalId},body}),
  authority:(employeeId:string,companyCodeId:string,signal?:AbortSignal)=>http.request(authority,{params:{employeeId},query:{companyCodeId},signal}),
  retryWorkforceIam:(employeeId:string,employerOrganizationId:string)=>http.request(workforceIamRetry,{params:{employeeId},body:{employerOrganizationId,createPrincipal:true,idempotencyKey:globalThis.crypto.randomUUID()}}),
  simulate:(body:{entityType:string;policyDefinitionIds:readonly string[];facts:Readonly<Record<string,unknown>>})=>http.request(simulate,{body}),
  policyAssignments:(companyCodeId:string,signal?:AbortSignal)=>http.request(policyAssignments,{query:{companyCodeId},signal}),
  effectivePolicies:(query:{companyCodeId:string;siteId?:string;asOf:string},signal?:AbortSignal)=>http.request(effectivePolicies,{query,signal}),
  createPolicyAssignment:(body:{idempotencyKey:string;policyDefinitionId:string;scopeKind:"country"|"company"|"site";countryCode:string;companyCodeId?:string;siteId?:string;effectiveFrom:string;effectiveUntil?:string})=>http.request(policyAssignmentCreate,{body}),
  publishPolicyAssignment:(assignmentId:string,expectedVersion:number)=>http.request(policyAssignmentPublish,{params:{assignmentId},body:{expectedVersion}}),
});}
