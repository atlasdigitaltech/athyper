import type { JobDefinition, JobEnvelope, JobHandler, JobHandlerRegistry } from "@athyper/server-contract-jobs";
import type { NeonFinanceRegistration } from "./register-finance.js";

export const FINANCE_QUEUE="finance";
export const financeWorkerNames=["finance.planning.execute","finance.cross_book.execute","finance.commitment.fulfill","finance.inventory.value-fifo","finance.close.fx","finance.close.intercompany","finance.close.asset-revaluation","finance.close.recover"] as const;
export type FinanceWorkerName=typeof financeWorkerNames[number];

export function financeJobDefinitions(finance:NeonFinanceRegistration):readonly JobDefinition[]{const enabled=new Set(Object.values(finance.slices).filter(slice=>slice.enabled).flatMap(slice=>slice.entryPoints.filter(point=>point.kind==="worker").map(point=>point.code)));return financeWorkerNames.filter(name=>enabled.has(name)).map(name=>({code:name,owner:"@athyper/server-plane-neon",queue:FINANCE_QUEUE,name,scope:"tenant",payloadSchema:{name,version:1},timeoutMs:name.startsWith("finance.close.")?300_000:120_000,maxAttempts:5,executionRetentionDays:90}));}

export function registerFinanceJobHandlers(registry:JobHandlerRegistry,finance:NeonFinanceRegistration):void{for(const definition of financeJobDefinitions(finance))registry.register(definition.queue,definition.name,handler(finance,definition.name));}

function handler(finance:NeonFinanceRegistration,name:string):JobHandler{return{async handle(job){assertCoordinate(job);const output=await finance.executeWorker(name,record(job.data));return{status:"completed",output:{result:output}};}};}
function assertCoordinate(job:JobEnvelope):void{const payload=record(job.data),actor=record(payload["actor"]);if(job.execution?.planeKey!=="neon"||job.execution.scope!=="tenant"||!job.execution.tenantId||actor["planeKey"]!=="neon"||actor["tenantId"]!==job.execution.tenantId||actor["principalId"]!==job.execution.principalId)throw new Error("FINANCE_JOB_COORDINATE_MISMATCH");}
function record(value:unknown):Record<string,unknown>{if(!value||typeof value!=="object"||Array.isArray(value))throw new Error("FINANCE_WORKER_PAYLOAD_INVALID");return value as Record<string,unknown>;}
