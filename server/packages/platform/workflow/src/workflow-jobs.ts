import {sql,type Kysely} from "kysely";
import type {JobExecutionResult,JobHandler,JobPublisher} from "@athyper/server-contract-jobs";
import type {PlaneKey} from "@athyper/server-foundation/context";
import type {SlaAutomationResult} from "./sla-automation.js";

export const WORKFLOW_MAINTENANCE_QUEUE="workflow.maintenance";
export const DISCOVER_WORKFLOW_SLA_JOB="workflow.sla.discover";
export const SWEEP_WORKFLOW_SLA_JOB="workflow.sla.sweep";
export interface WorkflowSlaDiscoveryRequest{readonly planeKey:PlaneKey;readonly principalId:string;readonly limit?:number;}
export interface WorkflowSlaSweepRequest{readonly planeKey:PlaneKey;readonly tenantId:string;readonly principalId:string;readonly limit?:number;}
export interface WorkflowSlaTenantCatalog{listDueTenants(planeKey:PlaneKey,at:string,limit:number):Promise<readonly string[]>;}
export interface WorkflowSlaSweep{ sweep(request:WorkflowSlaSweepRequest):Promise<SlaAutomationResult>; }

export function createKyselyWorkflowSlaTenantCatalog(databases:Partial<Record<PlaneKey,Kysely<Record<string,never>>>>):WorkflowSlaTenantCatalog{return{async listDueTenants(planeKey,at,limit){const database=databases[planeKey];if(!database)throw new Error(`Workflow database is not configured for ${planeKey}`);const result=await sql<{tenant_id:string}>`SELECT tenant_id FROM document.fn_workflow_sla_due_tenants(${at}::timestamptz,${bounded(limit,1,1000)})`.execute(database);return result.rows.map(row=>row.tenant_id);}};}

export function createWorkflowSlaDiscoveryHandler(options:{readonly catalog:WorkflowSlaTenantCatalog;readonly jobs:JobPublisher;readonly now?:()=>Date}):JobHandler<typeof DISCOVER_WORKFLOW_SLA_JOB,WorkflowSlaDiscoveryRequest>{return{async handle(job):Promise<JobExecutionResult>{const request=discovery(job.data),at=(options.now?.()??new Date()).toISOString(),tenants=await options.catalog.listDueTenants(request.planeKey,at,request.limit??500),bucket=Math.floor(new Date(at).getTime()/60_000);for(const tenantId of tenants){const data:WorkflowSlaSweepRequest={planeKey:request.planeKey,tenantId,principalId:request.principalId,limit:100};await options.jobs.enqueue(WORKFLOW_MAINTENANCE_QUEUE,SWEEP_WORKFLOW_SLA_JOB,data,{jobId:`workflow-sla-${request.planeKey}-${tenantId}-${bucket}`,maxAttempts:5,backoff:{kind:"exponential",delayMs:5_000,jitter:0.2},execution:{planeKey:request.planeKey,scope:"tenant",tenantId,principalId:request.principalId},payloadSchema:{name:SWEEP_WORKFLOW_SLA_JOB,version:1},removeOnComplete:1000,removeOnFail:5000});}return{status:"completed",output:{tenants:tenants.length,discoveredAt:at}};}};}
export function createWorkflowSlaSweepHandler(automation:WorkflowSlaSweep):JobHandler<typeof SWEEP_WORKFLOW_SLA_JOB,WorkflowSlaSweepRequest>{return{async handle(job):Promise<JobExecutionResult>{const request=sweep(job.data),result=await automation.sweep(request);return{status:"completed",output:{...result}};}};}
function discovery(value:WorkflowSlaDiscoveryRequest):WorkflowSlaDiscoveryRequest{if(!["studio","neon","mesh"].includes(value.planeKey)||!uuid(value.principalId)||(value.limit!==undefined&&(!Number.isInteger(value.limit)||value.limit<1||value.limit>1000)))throw new TypeError("Invalid workflow SLA discovery request");return value;}
function sweep(value:WorkflowSlaSweepRequest):WorkflowSlaSweepRequest{if(!["studio","neon","mesh"].includes(value.planeKey)||!uuid(value.tenantId)||!uuid(value.principalId)||(value.limit!==undefined&&(!Number.isInteger(value.limit)||value.limit<1||value.limit>500)))throw new TypeError("Invalid workflow SLA sweep request");return value;}
function uuid(value:string):boolean{return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);}
function bounded(value:number,min:number,max:number):number{if(!Number.isInteger(value)||value<min||value>max)throw new TypeError(`limit must be ${min}-${max}`);return value;}
