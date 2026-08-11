import { FinanceContractError, financePermissions, type AssetRevaluationCommand, type AssetRevaluationRepository, type CloseCoordinate, type CloseReadiness, type CloseReadinessRepository, type FinanceActor, type FinanceCommandRepository, type FinancePeriodAdmissionGuard, type FinancePermissionChecker, type FxRevaluationCommand, type FxRevaluationLine, type FxRevaluationRepository, type IcEliminationCommand, type IcEliminationRepository } from "@athyper/server-contract-finance";
import { canonicalFinanceHash } from "../shared/canonical.js";
import { decimalString, decimalUnits } from "../shared/decimal.js";
import type { FinanceAuditRecorder, FinanceOutboxWriter } from "../shared/evidence.js";

interface TransactionRunner<Transaction>{run<T>(actor:FinanceActor,work:(transaction:Transaction)=>Promise<T>):Promise<T>}
type Common<Transaction>={readonly transactions:TransactionRunner<Transaction>;readonly commands:FinanceCommandRepository<Transaction>;readonly guard:FinancePeriodAdmissionGuard;readonly permissions:FinancePermissionChecker;readonly audit:FinanceAuditRecorder<Transaction>;readonly outbox:FinanceOutboxWriter<Transaction>};

export class FxRevaluationService<Transaction>{
  constructor(private readonly options:Common<Transaction>&{readonly repository:FxRevaluationRepository<Transaction>}){}
  async execute(command:FxRevaluationCommand){
    await authorize(command.actor,this.options.permissions); validateFx(command); await this.options.guard.assertPeriodOpen(command.actor,{companyCodeId:command.payload.companyCodeId,ledgerBookId:command.payload.ledgerBookId,fiscalPeriodId:command.payload.fiscalPeriodId,currencyCode:command.payload.functionalCurrencyCode});
    const lines=command.payload.exposures.map((exposure,index)=>{
      const rate=command.payload.rateSnapshot.rates.find(item=>item.transactionCurrencyCode===exposure.transactionCurrencyCode&&item.functionalCurrencyCode===exposure.functionalCurrencyCode)!;
      const revalued=multiplyMoneyRate(exposure.originalCurrencyBalance,rate.closingRate);
      return {...exposure,runId:command.commandId,lineNo:index+1,closingRate:rate.closingRate,revaluedFunctionalBalance:revalued,idempotencyKey:`${command.idempotencyKey}:line:${index+1}`} satisfies Omit<FxRevaluationLine,"id"|"unrealizedGainLoss">;
    });
    return this.options.transactions.run(command.actor,tx=>this.options.commands.execute(command,tx,async current=>{
      const run=await this.options.repository.appendRun(command,lines,current);
      await evidence(this.options,command.actor,current,"finance.fx_revaluation.calculated","document.fx_revaluation_run",run.id,{lineCount:run.lines.length,rateSnapshotHash:run.rateSnapshot.hash,netAmount:run.netAmount});
      return{resourceId:run.id,version:1,output:{run}};
    }));
  }
}

export class IcEliminationService<Transaction>{
  constructor(private readonly options:Common<Transaction>&{readonly repository:IcEliminationRepository<Transaction>}){}
  async execute(command:IcEliminationCommand){
    await authorize(command.actor,this.options.permissions); validateIc(command); await this.options.guard.assertPeriodOpen(command.actor,{companyCodeId:command.payload.consolidationCompanyId,ledgerBookId:command.payload.ledgerBookId,fiscalPeriodId:command.payload.fiscalPeriodId,currencyCode:command.payload.currencyCode});
    return this.options.transactions.run(command.actor,tx=>this.options.commands.execute(command,tx,async current=>{
      const elimination=await this.options.repository.append(command,current);
      await evidence(this.options,command.actor,current,"finance.ic_elimination.calculated","document.ic_elimination",elimination.id,{lineCount:elimination.lineCount,eliminationAmount:elimination.eliminationAmount,functionalAmount:elimination.functionalAmount});
      return{resourceId:elimination.id,version:1,output:{elimination}};
    }));
  }
}

export class AssetRevaluationService<Transaction>{
  constructor(private readonly options:Common<Transaction>&{readonly repository:AssetRevaluationRepository<Transaction>}){}
  async append(command:AssetRevaluationCommand){
    await authorize(command.actor,this.options.permissions,command.payload.reversesReserveId?financePermissions.closeReverse:financePermissions.closeExecute); validateAsset(command); await this.options.guard.assertPeriodOpen(command.actor,{companyCodeId:command.payload.companyCodeId,ledgerBookId:command.payload.ledgerBookId,fiscalPeriodId:command.payload.fiscalPeriodId,currencyCode:command.payload.currencyCode});
    return this.options.transactions.run(command.actor,tx=>this.options.commands.execute(command,tx,async current=>{
      const chain=await this.options.repository.list(command.actor,command.payload.assetBookId,current);
      const previous=chain.at(-1); if(previous&&decimalUnits(previous.carryingAmountAfter,4)!==decimalUnits(command.payload.carryingAmountBefore,4))throw new FinanceContractError("FINANCE_IMMUTABLE_EVIDENCE","Carrying amount does not continue the asset reserve chain");
      if(command.payload.reversesReserveId){const original=await this.options.repository.get(command.actor,command.payload.reversesReserveId,current);validateAssetReversal(command,original);}
      const movement=await this.options.repository.append(command,current);
      await evidence(this.options,command.actor,current,"finance.asset_revaluation.posted","ledger.asset_revaluation_reserve",movement.id,{reserveType:movement.reserveType,movementAmount:movement.movementAmount,reversesReserveId:movement.reversesReserveId,sourceHash:movement.source.hash});
      return{resourceId:movement.id,version:1,output:{movement}};
    }));
  }
}

export class CloseReadinessService<Transaction>{
  constructor(private readonly options:{readonly transactions:TransactionRunner<Transaction>;readonly repository:CloseReadinessRepository<Transaction>;readonly permissions:FinancePermissionChecker;readonly now?:()=>Date}){}
  async query(actor:FinanceActor,coordinate:CloseCoordinate):Promise<CloseReadiness>{
    requireNeon(actor);if(!await this.options.permissions.isAllowed(actor,financePermissions.closeRead))throw new FinanceContractError("FINANCE_PERMISSION_DENIED"); validateCoordinate(coordinate);
    const metrics=await this.options.transactions.run(actor,tx=>this.options.repository.query(actor,coordinate,tx));
    const codes=new Set(metrics.map(metric=>metric.code));
    return{coordinate,ready:["fx_revaluation","ic_elimination","asset_revaluation"].every(code=>codes.has(code))&&metrics.every(metric=>metric.ready),metrics,evaluatedAt:(this.options.now?.()??new Date()).toISOString()};
  }
}

function validateFx(command:FxRevaluationCommand){const p=command.payload;validateCoordinate({companyCodeId:p.companyCodeId,ledgerBookId:p.ledgerBookId,fiscalPeriodId:p.fiscalPeriodId,fiscalYear:p.fiscalYear,periodNumber:p.periodNumber});date(p.revaluationDate,"revaluationDate");if(p.postingDate)date(p.postingDate,"postingDate");if(p.autoReverseDate)date(p.autoReverseDate,"autoReverseDate");if(!p.exposures.length)invalid("FX revaluation requires at least one exposure");const s=p.rateSnapshot;date(s.asOfDate,"rateSnapshot.asOfDate");if(s.asOfDate!==p.revaluationDate||!s.revision.trim()||!s.rateType.trim()||s.hash!==canonicalFinanceHash({asOfDate:s.asOfDate,rateType:s.rateType,source:s.source,revision:s.revision,rates:s.rates}))throw new FinanceContractError("FINANCE_IMMUTABLE_EVIDENCE","FX rate snapshot hash or date is invalid");const identities=new Set<string>();for(const [i,x]of p.exposures.entries()){if(x.transactionCurrencyCode===x.functionalCurrencyCode||x.functionalCurrencyCode!==p.functionalCurrencyCode)invalid("FX exposure currencies are invalid");positive(x.originalRate,"originalRate");money(x.originalCurrencyBalance,"originalCurrencyBalance");money(x.originalFunctionalBalance,"originalFunctionalBalance");if(!x.lineId||!x.glAccountId||!x.sourceType.match(/^[a-z][a-z0-9_.-]{1,126}$/)||!x.sourceId||!x.hash||x.version<1)invalid("FX exposure evidence is incomplete");const identity=`${x.sourceType}:${x.sourceId}:${x.lineId}`;if(identities.has(identity))invalid("FX exposure identity is duplicated");identities.add(identity);const rates=s.rates.filter(r=>r.transactionCurrencyCode===x.transactionCurrencyCode&&r.functionalCurrencyCode===x.functionalCurrencyCode);if(rates.length!==1)invalid(`FX exposure ${i+1} must resolve exactly one closing rate`);positive(rates[0]!.closingRate,"closingRate");}}
function validateIc(command:IcEliminationCommand){const p=command.payload;validateCoordinate({companyCodeId:p.consolidationCompanyId,ledgerBookId:p.ledgerBookId,fiscalPeriodId:p.fiscalPeriodId,fiscalYear:p.fiscalYear,periodNumber:p.periodNumber});date(p.eliminationDate,"eliminationDate");date(p.postingDate,"postingDate");if(p.eliminationDate>p.postingDate||p.sourceCompanyCodeId===p.counterpartyCompanyCodeId||!p.eliminationCode.trim()||!p.consolidationGroup.trim()||p.lines.length<2)invalid("Intercompany elimination coordinates are invalid");positive(p.exchangeRate,"exchangeRate");const numbers=new Set<number>(),ids=new Set<string>();let debit=0n,credit=0n,fDebit=0n,fCredit=0n;for(const line of p.lines){if(line.lineNo<1||numbers.has(line.lineNo)||!line.lineId||ids.has(line.lineId)||!line.glAccountId)invalid("Elimination line identity is invalid or duplicated");numbers.add(line.lineNo);ids.add(line.lineId);const d=money(line.debitAmount,"debitAmount"),c=money(line.creditAmount,"creditAmount"),fd=money(line.functionalDebit,"functionalDebit"),fc=money(line.functionalCredit,"functionalCredit");if(!((d>0n&&c===0n)||(d===0n&&c>0n))||!((fd>0n&&fc===0n)||(fd===0n&&fc>0n))||(d>0n)!==(fd>0n))invalid("Elimination lines must have one-sided matching polarity");debit+=d;credit+=c;fDebit+=fd;fCredit+=fc;}if(debit!==credit||fDebit!==fCredit)invalid("Intercompany elimination is not balanced in transaction and functional currency");}
function validateAsset(command:AssetRevaluationCommand){const p=command.payload;date(p.effectiveDate,"effectiveDate");if(!p.assetId||!p.assetBookId||!p.companyCodeId||!p.ledgerBookId||!p.fiscalPeriodId||!p.source.sourceType.match(/^[a-z][a-z0-9_.-]{1,126}$/)||!p.source.sourceId||p.source.version<1||!p.source.hash)invalid("Asset valuation evidence is incomplete");const movement=money(p.movementAmount,"movementAmount"),before=money(p.carryingAmountBefore,"carryingAmountBefore"),after=money(p.carryingAmountAfter,"carryingAmountAfter");if(movement===0n||before<0n||after<0n)invalid("Asset revaluation amounts are invalid");if(p.fairValue!==undefined&&money(p.fairValue,"fairValue")<0n)invalid("Fair value cannot be negative");if(p.recoverableAmount!==undefined&&money(p.recoverableAmount,"recoverableAmount")<0n)invalid("Recoverable amount cannot be negative");if(p.reserveType==="revaluation_surplus"||p.reserveType==="revaluation_decrease"){if(p.fairValue===undefined||!p.valuationMethod?.trim())invalid("Fair-value movements require fair value and valuation method evidence");}if(p.reserveType==="impairment"&&p.recoverableAmount===undefined)invalid("Impairment requires recoverable amount evidence");const reversal=p.reserveType==="impairment_reversal"||p.reserveType==="disposal_release";if(reversal!==Boolean(p.reversesReserveId))invalid("Only reversal/release movements must link an original reserve movement");}
function validateAssetReversal(command:AssetRevaluationCommand,original:Awaited<ReturnType<AssetRevaluationRepository<unknown>["get"]>>){const p=command.payload;if(!original||original.reversesReserveId||original.assetBookId!==p.assetBookId||original.assetId!==p.assetId||original.companyCodeId!==p.companyCodeId||original.ledgerBookId!==p.ledgerBookId||original.currencyCode!==p.currencyCode)invalid("Asset reversal does not reference an eligible movement");if(decimalUnits(p.movementAmount,4)!==-decimalUnits(original.movementAmount,4)||decimalUnits(p.carryingAmountBefore,4)!==decimalUnits(original.carryingAmountAfter,4)||decimalUnits(p.carryingAmountAfter,4)!==decimalUnits(original.carryingAmountBefore,4))invalid("Asset reversal must exactly negate the original movement and carrying transition");}
function multiplyMoneyRate(amount:string,rate:string){const product=decimalUnits(amount,4)*decimalUnits(rate,10);const divisor=10n**10n;const sign=product<0n?-1n:1n,abs=product<0n?-product:product;return decimalString(sign*((abs+divisor/2n)/divisor),4);}
function validateCoordinate(c:CloseCoordinate){if(!c.companyCodeId||!c.ledgerBookId||!c.fiscalPeriodId||c.fiscalYear<1900||c.fiscalYear>9999||c.periodNumber<1||c.periodNumber>16)invalid("Close coordinate is invalid");}
function money(v:string,f:string){return decimalUnits(v,4,f)}function positive(v:string,f:string){if(decimalUnits(v,10,f)<=0n)invalid(`${f} must be positive`)}function date(v:string,f:string){if(!/^\d{4}-\d{2}-\d{2}$/.test(v))invalid(`${f} must be an ISO date`)}function invalid(message:string):never{throw new FinanceContractError("FINANCE_INVALID_COMMAND",message)}
function requireNeon(actor:FinanceActor){if(actor.planeKey!=="neon")invalid("Finance executes only in Neon")}
async function authorize(actor:FinanceActor,permissions:FinancePermissionChecker,permission:string=financePermissions.closeExecute){requireNeon(actor);if(!await permissions.isAllowed(actor,permission))throw new FinanceContractError("FINANCE_PERMISSION_DENIED")}
async function evidence<Transaction>(o:Common<Transaction>,actor:FinanceActor,tx:Transaction,eventType:string,aggregateType:string,id:string,metadata:Readonly<Record<string,unknown>>){await o.outbox.append({tenantId:actor.tenantId,topic:"finance",eventType,eventKey:id,aggregateType,aggregateId:id,actorId:actor.principalId,correlationId:actor.correlationId,payload:metadata},tx);await o.audit.record({eventCode:eventType,action:"append",outcome:"success",actor:{kind:"user",principalId:actor.principalId},tenantId:actor.tenantId,entityType:aggregateType,entityId:id,correlationId:actor.correlationId,metadata},tx)}
