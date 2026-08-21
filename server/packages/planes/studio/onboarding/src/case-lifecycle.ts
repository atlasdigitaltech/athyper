import { createHash } from "node:crypto";
import type { OnboardingCaseStatus } from "@athyper/contract-athyper-onboarding";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";

export interface CompiledStep { readonly id:string; readonly code:string; readonly title:string; readonly targetId?:string; readonly dependsOn?:readonly string[]; readonly criticality?:"activation_critical"|"independent"; readonly priority?:number }
export interface CompiledCheck { readonly id:string; readonly code:string; readonly name:string; readonly targetId:string; readonly stepId?:string; readonly resourceType:string; readonly metadata?:Readonly<Record<string,unknown>> }
export interface CompiledResource { readonly id:string; readonly targetId:string; readonly kind:string; readonly key:string; readonly desiredState:Readonly<Record<string,unknown>>; readonly accessGates?:Readonly<Record<string,unknown>>; readonly retention:"deletable"|"retain_business_data"|"retain_legal_and_audit" }
export interface OnboardingCompilation { readonly evidenceId:string; readonly targets:readonly { readonly id:string; readonly plane:"studio"|"neon"|"mesh"|"trustiam"; readonly tenantId:string; readonly criticality:"activation_critical"|"independent";readonly requestedProjectionId?:string;readonly requestedPlanId?:string;readonly requestedWorkspaceId?:string;readonly requestedScopeTargetId?:string }[]; readonly steps:readonly CompiledStep[]; readonly checks:readonly CompiledCheck[]; readonly resources:readonly CompiledResource[] }
export interface OnboardingCaseWriteResult { readonly caseId:string; readonly status:OnboardingCaseStatus; readonly desiredVersion:number; readonly desiredHash:string; readonly replayed:boolean }
export interface OnboardingDraftCommand { readonly context:VerifiedRequestContext;readonly idempotencyKey:string;readonly caseId:string;readonly caseCode:string;readonly canonicalPartyId:string;readonly sourceMode?:"self_service"|"buyer_invited"|"ops_governed"|"system_triggered";readonly activationCriticality?:"activation_critical"|"independent";readonly requestMetadata?:Readonly<Record<string,unknown>>;readonly requestPayload?:Readonly<Record<string,unknown>> }
export interface OnboardingCaseCommand { readonly context:VerifiedRequestContext; readonly caseId:string; readonly expectedStatus:OnboardingCaseStatus; readonly expectedDesiredVersion?:number; readonly idempotencyKey:string; readonly reason?:string; readonly approvedRevision?:Readonly<Record<string,unknown>>; readonly compilation?:OnboardingCompilation }
export interface OnboardingLifecycleRepository<Transaction> {
  createDraft(input:{readonly tenantId:string;readonly caseId:string;readonly caseCode:string;readonly canonicalPartyId:string;readonly requestedBy:string;readonly sourceMode:NonNullable<OnboardingDraftCommand["sourceMode"]>;readonly activationCriticality:NonNullable<OnboardingDraftCommand["activationCriticality"]>;readonly requestMetadata:Readonly<Record<string,unknown>>;readonly requestPayload:Readonly<Record<string,unknown>>;readonly idempotencyKeyHash:string;readonly fingerprint:string},transaction:Transaction):Promise<OnboardingCaseWriteResult>;
  transition(input:{readonly tenantId:string;readonly caseId:string;readonly from:OnboardingCaseStatus;readonly to:OnboardingCaseStatus;readonly actorId:string;readonly changedAt:string;readonly idempotencyKeyHash:string;readonly fingerprint:string;readonly expectedDesiredVersion?:number;readonly canonicalRevision?:Readonly<Record<string,unknown>>;readonly desiredHash?:string;readonly compilation?:OnboardingCompilation;readonly reason?:string},transaction:Transaction):Promise<OnboardingCaseWriteResult>;
  revokeExpiredGuestAccess(input:{readonly tenantId:string;readonly actorId:string;readonly now:string;readonly limit:number},transaction:Transaction):Promise<readonly string[]>;
  resolveWorkItem(input:{readonly tenantId:string;readonly caseId:string;readonly workItemId:string;readonly actorId:string},transaction:Transaction):Promise<boolean>;
}
export interface OnboardingTransactionCoordinator<Transaction>{run<Result>(actor:{readonly tenantId:string;readonly principalId:string},work:(transaction:Transaction)=>Promise<Result>):Promise<Result>}

const TRANSITIONS:Record<OnboardingCaseStatus,readonly OnboardingCaseStatus[]>={draft:["submitted","cancelled"],submitted:["qualifying","cancelled"],qualifying:["awaiting_approval","rejected","failed"],awaiting_approval:["approved","rejected","cancelled"],approved:["provisioning"],provisioning:["reconciling","failed","cancelled"],reconciling:["active","failed","offboarding"],active:["qualifying","offboarding"],rejected:[],cancelled:[],failed:["provisioning","offboarding"],offboarding:["offboarded","failed"],offboarded:[]};

export class OnboardingCaseLifecycleService<Transaction>{
  constructor(private readonly repository:OnboardingLifecycleRepository<Transaction>,private readonly transactions:OnboardingTransactionCoordinator<Transaction>,private readonly now:()=>Date=()=>new Date()){}
  draft(command:OnboardingDraftCommand){const caseCode=required(command.caseCode).toLowerCase();if(!/^[a-z][a-z0-9_.-]{1,126}$/.test(caseCode))throw new TypeError("Invalid onboarding case code");const requestMetadata=boundedObject(command.requestMetadata??{}),requestPayload=boundedObject(command.requestPayload??{}),idempotencyKeyHash=sha256(required(command.idempotencyKey)),fingerprint=sha256(JSON.stringify(canonicalize({caseId:command.caseId,caseCode,canonicalPartyId:command.canonicalPartyId,sourceMode:command.sourceMode??"self_service",activationCriticality:command.activationCriticality??"independent",requestMetadata,requestPayload})));return this.transactions.run({tenantId:command.context.tenantId,principalId:command.context.principalId},transaction=>this.repository.createDraft({tenantId:command.context.tenantId,caseId:command.caseId,caseCode,canonicalPartyId:command.canonicalPartyId,requestedBy:command.context.principalId,sourceMode:command.sourceMode??"self_service",activationCriticality:command.activationCriticality??"independent",requestMetadata,requestPayload,idempotencyKeyHash,fingerprint},transaction));}
  submit(command:OnboardingCaseCommand){return this.move(command,"submitted",true);}
  beginQualification(command:OnboardingCaseCommand){return this.move(command,"qualifying");}
  compile(command:OnboardingCaseCommand){if(!command.compilation)throw new TypeError("Compilation is required");validateCompilation(command.compilation);return this.move(command,"awaiting_approval");}
  approve(command:OnboardingCaseCommand){return this.move(command,"approved",true);}
  reject(command:OnboardingCaseCommand){return this.move(command,"rejected");}
  provision(command:OnboardingCaseCommand){return this.move(command,"provisioning");}
  reconcile(command:OnboardingCaseCommand){return this.move(command,"reconciling");}
  activate(command:OnboardingCaseCommand){return this.move(command,"active");}
  correct(command:OnboardingCaseCommand){return this.move(command,"qualifying");}
  suspend(command:OnboardingCaseCommand){return this.correct(command);}
  offboard(command:OnboardingCaseCommand){return this.move(command,"offboarding");}
  finishOffboarding(command:OnboardingCaseCommand){return this.move(command,"offboarded");}
  fail(command:OnboardingCaseCommand){return this.move(command,"failed");}
  cancel(command:OnboardingCaseCommand){return this.move(command,"cancelled");}
  private move(command:OnboardingCaseCommand,to:OnboardingCaseStatus,requiresRevision=false){
    if(command.expectedStatus!==to&&!TRANSITIONS[command.expectedStatus].includes(to))throw new TypeError(`Invalid onboarding transition: ${command.expectedStatus} -> ${to}`);
    if(requiresRevision&&!command.approvedRevision)throw new TypeError("A canonical approved revision is required");
    if(command.compilation)validateCompilation(command.compilation);
    const canonicalRevision=command.approvedRevision?canonicalize(command.approvedRevision):undefined;
    const desiredHash=canonicalRevision?sha256(JSON.stringify(canonicalRevision)):undefined;
    const idempotencyKeyHash=sha256(required(command.idempotencyKey));
    const fingerprint=sha256(JSON.stringify(canonicalize({caseId:command.caseId,from:command.expectedStatus,to,expectedDesiredVersion:command.expectedDesiredVersion??null,desiredHash:desiredHash??null,compilation:command.compilation??null,reason:command.reason??null})));
    return this.transactions.run({tenantId:command.context.tenantId,principalId:command.context.principalId},transaction=>this.repository.transition({tenantId:command.context.tenantId,caseId:command.caseId,from:command.expectedStatus,to,actorId:command.context.principalId,changedAt:this.now().toISOString(),idempotencyKeyHash,fingerprint,...(command.expectedDesiredVersion!==undefined?{expectedDesiredVersion:command.expectedDesiredVersion}:{}),...(canonicalRevision?{canonicalRevision,desiredHash}:{}),...(command.compilation?{compilation:command.compilation}:{}),...(command.reason?{reason:command.reason}: {})},transaction));
  }
}

export function validateCompilation(value:OnboardingCompilation):void{
  if(!/^[0-9a-f-]{36}$/.test(value.evidenceId))throw new TypeError("Compilation evidence ID is required");
  const targets=unique(value.targets.map(x=>x.id),"target");const steps=unique(value.steps.map(x=>x.id),"step");unique(value.checks.map(x=>x.id),"check");unique(value.resources.map(x=>`${x.targetId}:${x.key}`),"resource");
  for(const target of value.targets)if(!target.requestedProjectionId&&!target.requestedPlanId&&!target.requestedWorkspaceId&&!target.requestedScopeTargetId)throw new TypeError(`Target ${target.id} requires a bounded projection, plan, workspace, or scope coordinate`);
  for(const step of value.steps){if(step.targetId&&!targets.has(step.targetId))throw new TypeError(`Unknown step target: ${step.targetId}`);for(const dependency of step.dependsOn??[])if(!steps.has(dependency))throw new TypeError(`Unknown step dependency: ${dependency}`);}
  for(const check of value.checks){if(!targets.has(check.targetId))throw new TypeError(`Unknown check target: ${check.targetId}`);if(check.stepId&&!steps.has(check.stepId))throw new TypeError(`Unknown check step: ${check.stepId}`);}
  for(const resource of value.resources)if(!targets.has(resource.targetId))throw new TypeError(`Unknown resource target: ${resource.targetId}`);
  for(const resource of value.resources)if(resource.accessGates&&(Array.isArray(resource.accessGates)||typeof resource.accessGates!=="object"))throw new TypeError(`Invalid access gates for resource: ${resource.key}`);
  const visiting=new Set<string>(),visited=new Set<string>(),byId=new Map(value.steps.map(x=>[x.id,x]));const visit=(id:string)=>{if(visiting.has(id))throw new TypeError("Onboarding step graph contains a cycle");if(visited.has(id))return;visiting.add(id);for(const dependency of byId.get(id)?.dependsOn??[])visit(dependency);visiting.delete(id);visited.add(id);};for(const id of steps)visit(id);
}
export function canonicalize(value:unknown):any{if(Array.isArray(value))return value.map(canonicalize);if(value&&typeof value==="object")return Object.fromEntries(Object.entries(value as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonicalize(v)]));return value;}
function unique(values:readonly string[],kind:string){const result=new Set<string>();for(const value of values){if(!value||result.has(value))throw new TypeError(`Duplicate or empty ${kind}: ${value}`);result.add(value);}return result;}
function sha256(value:string){return createHash("sha256").update(value).digest("hex");}function required(value:string){const result=value.trim();if(!result)throw new TypeError("Idempotency key is required");return result;}
function boundedObject(value:Readonly<Record<string,unknown>>){if(Array.isArray(value)||Buffer.byteLength(JSON.stringify(value),"utf8")>65536)throw new TypeError("Onboarding payload must be a bounded object");return value;}
