import { financePermissions, type CanonicalJournalSourcePort, type CommitmentFulfillmentCommand, type CommitmentSourcePort, type CrossBookPolicyPort, type DestinationJournalCommandPort, type FinanceActor, type FinancePermissionChecker, type FinancePeriodAdmissionGuard, type InventoryCoordinate, type PlanningOutput, type PlanningRunStatus, type TaxSourcePort } from "@athyper/server-contract-finance";
import {
  AssetRevaluationService, BudgetBalanceService, BudgetService, CloseReadinessService,
  CommitmentService, CrossBookPostingService, FxRevaluationService, GlPostingService,
  GlBalanceQueryService, IcEliminationService, InventoryBalanceService, InventoryMovementService, InventoryQueryService,
  KyselyAssetRevaluationRepository, KyselyBudgetRepository, KyselyCloseReadinessRepository,
  KyselyCommitmentRepository, KyselyCrossBookExecutionRepository, KyselyFinanceCommandRepository,
  KyselyFxRevaluationRepository, KyselyGlBalanceRepository, KyselyIcEliminationRepository,
  KyselyInventoryRepository, KyselyPlanningRepository, KyselyTaxCalculationRepository,
  KyselyTaxConfigurationPort, KyselyTaxCreditRepository, PlanningOutputService,
  PlanningRunService, TaxCalculationService, TaxCreditService, ValuationLayerService,
  type FinanceAuditRecorder, type FinanceOutboxWriter, type RoundingResolver,
} from "@athyper/server-service-finance";
import type { Kysely, Transaction } from "kysely";

type Database = Record<string, never>;
export type FinanceSlice = "f2" | "f3" | "f4" | "f5" | "f6";
export const financeSliceOrder = ["f2", "f3", "f4", "f5", "f6"] as const;

export interface FinanceFeatureFlags {
  readonly f2BudgetPlanning: boolean;
  readonly f3LedgerCommitments: boolean;
  readonly f4InventoryFifo: boolean;
  readonly f5Tax: boolean;
  readonly f6Closing: boolean;
}

/** Every finance mutation surface is opt-in. */
export const defaultFinanceFeatureFlags: FinanceFeatureFlags = Object.freeze({
  f2BudgetPlanning: false, f3LedgerCommitments: false, f4InventoryFifo: false,
  f5Tax: false, f6Closing: false,
});

export const financeSlicePermissions = Object.freeze({
  f2: { read: financePermissions.budgetRead, manage: financePermissions.budgetManage, reverse: financePermissions.budgetReverse, rebuild: financePermissions.budgetRebuild, planningRead: financePermissions.planningRead, planningRun: financePermissions.planningRun, planningApprove: financePermissions.planningApprove },
  f3: { read: financePermissions.ledgerRead, post: financePermissions.ledgerPost, reverse: financePermissions.ledgerReverse, rebuild: financePermissions.ledgerRebuild, commitmentPost: financePermissions.commitmentPost, commitmentReverse: financePermissions.commitmentReverse },
  f4: { read: financePermissions.inventoryRead, post: financePermissions.inventoryPost, reverse: financePermissions.inventoryReverse, rebuild: financePermissions.inventoryRebuild },
  f5: { read: financePermissions.taxRead, manage: financePermissions.taxCalculate, post: financePermissions.taxCalculate, reverse: financePermissions.taxReverse, rebuild: financePermissions.taxRebuild },
  f6: { read: financePermissions.closeRead, manage: financePermissions.closeExecute, post: financePermissions.closeExecute, reverse: financePermissions.closeReverse, rebuild: financePermissions.closeRecover },
} as const);

export const financeSliceDdl = Object.freeze({
  f2: ["event.command_execution", "event.outbox", "audit.audit_event", "ledger.budget_transaction", "ledger.budget_balance", "ledger.planning_run", "ledger.planning_output"],
  f3: ["ledger.gl_balance", "ledger.cross_book_posting_execution", "ledger.commitment_fulfillment"],
  f4: ["ledger.inventory_movement", "ledger.inventory_valuation_layer", "ledger.inventory_balance"],
  f5: ["ledger.tax_calculation_line", "ledger.tax_credit_movement", "control.tax_rule", "control.tax_rate"],
  f6: ["document.fx_revaluation_run", "ledger.fx_revaluation_line", "document.ic_elimination", "ledger.ic_elimination_line", "ledger.asset_revaluation_reserve"],
} satisfies Readonly<Record<FinanceSlice, readonly string[]>>);

export type FinanceRouteAction = "read" | "manage" | "post" | "reverse" | "rebuild";
export interface FinanceEntryPoint { readonly kind: "route" | "worker" | "readiness" | "governance-port"; readonly code: string; readonly action?: FinanceRouteAction; readonly permission?: string; readonly method?:"get"|"post"; readonly path?:string; }
export const financeEntryPoints: Readonly<Record<FinanceSlice, readonly FinanceEntryPoint[]>> = Object.freeze({
  f2: [route("finance.budget.command", "manage", financePermissions.budgetManage), route("finance.budget.reverse", "reverse", financePermissions.budgetReverse), route("finance.budget.balance", "read", financePermissions.budgetRead), route("finance.budget.rebuild", "rebuild", financePermissions.budgetRebuild), route("finance.planning.run", "manage", financePermissions.planningRun), route("finance.planning.output", "read", financePermissions.planningRead), worker("finance.planning.execute"), readinessPoint("finance.f2")],
  f3: [route("finance.gl.post", "post", financePermissions.ledgerPost), route("finance.gl.reconcile", "read", financePermissions.ledgerRead), route("finance.cross_book.execute", "post", financePermissions.ledgerPost), route("finance.commitment.fulfill", "post", financePermissions.commitmentPost), route("finance.commitment.reverse", "reverse", financePermissions.commitmentReverse), worker("finance.cross_book.execute"), worker("finance.commitment.fulfill"), readinessPoint("finance.f3")],
  f4: [route("finance.inventory.move", "post", financePermissions.inventoryPost), route("finance.inventory.reverse", "reverse", financePermissions.inventoryReverse), route("finance.inventory.balance", "read", financePermissions.inventoryRead), route("finance.inventory.rebuild", "rebuild", financePermissions.inventoryRebuild), worker("finance.inventory.value-fifo"), readinessPoint("finance.f4")],
  f5: [route("finance.tax.calculate", "post", financePermissions.taxCalculate), route("finance.tax.reverse", "reverse", financePermissions.taxReverse), route("finance.tax.credit.move", "manage", financePermissions.taxCalculate), route("finance.tax.point-in-time", "read", financePermissions.taxRead), route("finance.tax.rebuild", "rebuild", financePermissions.taxRebuild), readinessPoint("finance.f5")],
  f6: [route("finance.close.run", "post", financePermissions.closeExecute), route("finance.close.status", "read", financePermissions.closeRead), route("finance.close.reverse", "reverse", financePermissions.closeReverse), route("finance.close.recover", "rebuild", financePermissions.closeRecover), worker("finance.close.fx"), worker("finance.close.intercompany"), worker("finance.close.asset-revaluation"), worker("finance.close.recover"), readinessPoint("finance.f6"), {kind:"governance-port", code:"finance.close.readiness", action:"read", permission:financePermissions.closeRead}],
});

export interface FinanceDdlProbe { check(objects: readonly string[]): Promise<{ readonly ready: boolean; readonly missing?: readonly string[]; readonly message?: string }>; }
export interface FinanceJobPublisher { enqueue(queue:string,name:string,data:Readonly<Record<string,unknown>>,options:{readonly jobId:string;readonly maxAttempts:number;readonly removeOnFail:false;readonly execution:{readonly planeKey:"neon";readonly scope:"tenant";readonly tenantId:string;readonly principalId:string};readonly payloadSchema:{readonly name:string;readonly version:1}}):Promise<string>; }
export interface FinanceRegistrationPorts {
  readonly journals?: CanonicalJournalSourcePort;
  readonly crossBookPolicies?: CrossBookPolicyPort;
  readonly destinationJournals?: DestinationJournalCommandPort;
  readonly commitments?: CommitmentSourcePort;
  readonly taxSources?: TaxSourcePort;
}
export interface RegisterFinanceOptions {
  readonly database: Kysely<Database>;
  readonly transactions: { run<T>(actor:FinanceActor, work:(transaction:Transaction<Database>)=>Promise<T>):Promise<T> };
  readonly flags?: Partial<FinanceFeatureFlags>;
  readonly permissions: FinancePermissionChecker;
  readonly guard: FinancePeriodAdmissionGuard;
  readonly rounding: RoundingResolver;
  readonly audit: FinanceAuditRecorder<Transaction<Database>>;
  readonly outbox: FinanceOutboxWriter<Transaction<Database>>;
  readonly ddl: FinanceDdlProbe;
  readonly ports?: FinanceRegistrationPorts;
  readonly jobs?: FinanceJobPublisher;
}

export interface FinanceSliceRegistration { readonly enabled:boolean; readonly entryPoints:readonly FinanceEntryPoint[]; readonly services:Readonly<Record<string,unknown>>; readonly readiness:()=>Promise<{status:"healthy"|"unhealthy";message?:string}>; }
export interface NeonFinanceRegistration { readonly executionPlane:"neon"; readonly flags:FinanceFeatureFlags; readonly slices:Readonly<Record<FinanceSlice,FinanceSliceRegistration>>; readonly enqueue:(slice:FinanceSlice, name:string, actor:FinanceActor, identity:string, data:Readonly<Record<string,unknown>>)=>Promise<string>;readonly executeWorker:(name:string,payload:Readonly<Record<string,unknown>>)=>Promise<unknown>; }

/** Neon finance composition root. Business rules and SQL remain in service/repository packages. */
export function registerFinance(options:RegisterFinanceOptions):NeonFinanceRegistration {
  const flags={...defaultFinanceFeatureFlags,...options.flags};
  assertDependencyOrder(flags);
  const commandRepository=new KyselyFinanceCommandRepository();
  const common={transactions:options.transactions,commands:commandRepository,guard:options.guard,permissions:options.permissions,audit:options.audit,outbox:options.outbox};
  const budgetRepository=new KyselyBudgetRepository(), planningRepository=new KyselyPlanningRepository(options.database);
  const inventoryRepository=new KyselyInventoryRepository();
  const taxCalculations=new KyselyTaxCalculationRepository(), taxCredits=new KyselyTaxCreditRepository();
  const planningRuns=new PlanningRunService({transactions:options.transactions,repository:planningRepository,permissions:options.permissions,audit:options.audit,outbox:options.outbox}),planningOutputs=new PlanningOutputService({transactions:options.transactions,repository:planningRepository,permissions:options.permissions,audit:options.audit,outbox:options.outbox});
  const crossBook=options.ports?.journals&&options.ports.crossBookPolicies&&options.ports.destinationJournals?new CrossBookPostingService({...common,executions:new KyselyCrossBookExecutionRepository(),journals:options.ports.journals,policies:options.ports.crossBookPolicies,destination:options.ports.destinationJournals}):undefined;
  const commitments=options.ports?.commitments?new CommitmentService({...common,repository:new KyselyCommitmentRepository(),sources:options.ports.commitments}):undefined;
  const inventoryBalances=new InventoryBalanceService(inventoryRepository,options.permissions);
  const glRepository=new KyselyGlBalanceRepository(),glQueries=new GlBalanceQueryService({transactions:options.transactions,repository:glRepository,permissions:options.permissions}),inventoryQueries=new InventoryQueryService({transactions:options.transactions,repository:inventoryRepository,permissions:options.permissions});
  const fx=new FxRevaluationService({...common,repository:new KyselyFxRevaluationRepository()}),intercompany=new IcEliminationService({...common,repository:new KyselyIcEliminationRepository()}),assets=new AssetRevaluationService({...common,repository:new KyselyAssetRevaluationRepository()});
  const services:Record<FinanceSlice,Record<string,unknown>>={
    f2:{budget:new BudgetService({...common,repository:budgetRepository}),balances:new BudgetBalanceService(options.transactions,budgetRepository,options.permissions),planningRuns,planningOutputs},
    f3:{gl:options.ports?.journals?new GlPostingService({...common,repository:glRepository,journals:options.ports.journals,guard:options.guard as never}):undefined,reconciliation:glQueries,crossBook,commitments},
    f4:{movements:new InventoryMovementService({...common,repository:inventoryRepository}),valuation:new ValuationLayerService(inventoryRepository),balances:inventoryBalances,queries:inventoryQueries,valuationMethods:["fifo"]},
    f5:{calculations:options.ports?.taxSources?new TaxCalculationService({...common,repository:taxCalculations,configuration:new KyselyTaxConfigurationPort(options.database),sources:options.ports.taxSources,rounding:options.rounding}):undefined,credits:new TaxCreditService({...common,repository:taxCredits,sourceCalculations:{getCalculation:(actor:FinanceActor,id:string,tx:Transaction<Database>)=>taxCalculations.get(actor,id,tx)},guard:options.guard})},
    f6:{fx,intercompany,assets,readiness:new CloseReadinessService({transactions:options.transactions,repository:new KyselyCloseReadinessRepository(),permissions:options.permissions})},
  };
  const enabled:Record<FinanceSlice,boolean>={f2:flags.f2BudgetPlanning,f3:flags.f3LedgerCommitments,f4:flags.f4InventoryFifo,f5:flags.f5Tax,f6:flags.f6Closing};
  return {executionPlane:"neon",flags,slices:Object.fromEntries(financeSliceOrder.map(slice=>[slice,{enabled:enabled[slice],entryPoints:financeEntryPoints[slice],services:services[slice],readiness:readiness(options,slice,enabled[slice])}])) as unknown as Record<FinanceSlice,FinanceSliceRegistration>,enqueue:async(slice,name,actor,identity,data)=>{if(!enabled[slice])throw new Error(`FINANCE_SLICE_DISABLED:${slice}`);if(!options.jobs)throw new Error("FINANCE_DURABLE_JOBS_UNAVAILABLE");if(actor.planeKey!=="neon")throw new Error("FINANCE_NEON_REQUIRED");const jobId=deterministicFinanceJobId(slice,name,actor.tenantId,identity);return options.jobs.enqueue("finance",name,data,{jobId,maxAttempts:5,removeOnFail:false,execution:{planeKey:"neon",scope:"tenant",tenantId:actor.tenantId,principalId:actor.principalId},payloadSchema:{name,version:1}});},executeWorker:async(name,payload)=>{const actor=workerActor(payload),trustedCommand=()=>({...objectField(payload,"command"),actor});switch(name){case"finance.planning.execute":{const runId=stringField(payload,"runId"),expected=(typeof payload["expectedStatus"]==="string"?payload["expectedStatus"]:"pending") as PlanningRunStatus;await planningRuns.transition(actor,runId,expected,"running");try{for(const output of Array.isArray(payload["outputs"])?payload["outputs"]:[])await planningOutputs.append(actor,output as PlanningOutput);return await planningRuns.transition(actor,runId,"running","completed");}catch(error){await planningRuns.transition(actor,runId,"running","failed",error instanceof Error?error.message:"Planning execution failed");throw error;}}case"finance.cross_book.execute":if(!crossBook)throw new Error("FINANCE_CROSS_BOOK_ADAPTER_UNAVAILABLE");return crossBook.process(actor,stringField(payload,"executionId"));case"finance.commitment.fulfill":if(!commitments)throw new Error("FINANCE_COMMITMENT_ADAPTER_UNAVAILABLE");return commitments.fulfill(trustedCommand() as unknown as CommitmentFulfillmentCommand);case"finance.inventory.value-fifo":return inventoryQueries.rebuild(actor,objectField(payload,"coordinate") as unknown as InventoryCoordinate);case"finance.close.fx":return fx.execute(trustedCommand() as never);case"finance.close.intercompany":return intercompany.execute(trustedCommand() as never);case"finance.close.asset-revaluation":return assets.append(trustedCommand() as never);case"finance.close.recover":{const kind=stringField(payload,"kind");if(kind==="fx")return fx.execute(trustedCommand() as never);if(kind==="intercompany")return intercompany.execute(trustedCommand() as never);if(kind==="asset")return assets.append(trustedCommand() as never);throw new Error("FINANCE_CLOSE_KIND_INVALID");}default:throw new Error(`FINANCE_WORKER_NOT_BOUND:${name}`);}}};
}

export function deterministicFinanceJobId(slice:FinanceSlice,name:string,tenantId:string,identity:string):string { return `finance:${slice}:${clean(name)}:${clean(tenantId)}:${clean(identity)}`; }
function clean(value:string):string { const result=value.trim().toLowerCase().replace(/[^a-z0-9_.:-]+/g,"-");if(!result)throw new TypeError("Finance job identity is required");return result; }
function readiness(options:RegisterFinanceOptions,slice:FinanceSlice,enabled:boolean){return async()=>{if(!enabled)return{status:"healthy" as const,message:`Finance ${slice.toUpperCase()} is disabled`};const missingAdapters=requiredAdapters(options,slice);if(missingAdapters.length)return{status:"unhealthy" as const,message:`Missing Neon finance adapters: ${missingAdapters.join(", ")}`};const result=await options.ddl.check(financeSliceDdl[slice]);return result.ready?{status:"healthy" as const}:{status:"unhealthy" as const,message:result.message??`Missing Neon finance DDL: ${(result.missing??[]).join(", ")}`};};}
function requiredAdapters(options:RegisterFinanceOptions,slice:FinanceSlice):string[]{const missing:string[]=[];if(["f2","f3","f4","f6"].includes(slice)&&!options.jobs)missing.push("durable-jobs");if(slice==="f3"){if(!options.ports?.journals)missing.push("canonical-journals");if(!options.ports?.crossBookPolicies)missing.push("cross-book-policies");if(!options.ports?.destinationJournals)missing.push("destination-journals");if(!options.ports?.commitments)missing.push("commitment-sources");}if(slice==="f5"&&!options.ports?.taxSources)missing.push("tax-sources");return missing;}
function assertDependencyOrder(flags:FinanceFeatureFlags):void { if(flags.f3LedgerCommitments&&!flags.f2BudgetPlanning)bad("F3 requires F2");if((flags.f4InventoryFifo||flags.f5Tax)&&!flags.f3LedgerCommitments)bad("F4/F5 require F3");if(flags.f6Closing&&!(flags.f4InventoryFifo&&flags.f5Tax))bad("F6 requires F4 and F5"); }
function bad(message:string):never { throw new Error(`FINANCE_SLICE_DEPENDENCY_INVALID: ${message}`); }
function objectField(value:Readonly<Record<string,unknown>>,key:string):Record<string,unknown>{const field=value[key];if(!field||typeof field!=="object"||Array.isArray(field))throw new Error(`FINANCE_WORKER_PAYLOAD_INVALID:${key}`);return field as Record<string,unknown>;}function stringField(value:Readonly<Record<string,unknown>>,key:string):string{const field=value[key];if(typeof field!=="string"||!field.trim())throw new Error(`FINANCE_WORKER_PAYLOAD_INVALID:${key}`);return field;}function workerActor(payload:Readonly<Record<string,unknown>>):FinanceActor{const value=objectField(payload,"actor");if(value["planeKey"]!=="neon")throw new Error("FINANCE_NEON_REQUIRED");return value as unknown as FinanceActor;}
function route(code:string,action:FinanceRouteAction,permission:string):FinanceEntryPoint{const suffix=code.replace(/^finance\./,"").replaceAll(".","/").replaceAll("_","-");return{kind:"route",code,action,permission,method:action==="read"?"get":"post",path:`/api/finance/${suffix}`};}function worker(code:string):FinanceEntryPoint{return{kind:"worker",code};}function readinessPoint(code:string):FinanceEntryPoint{return{kind:"readiness",code};}
