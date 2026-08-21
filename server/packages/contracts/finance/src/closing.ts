import type { FinanceActor, FinanceCommand } from "./commands.js";
import type { FinanceDecimal, SourceDocumentEvidence } from "./foundation.js";
import type { FinanceCommandResult } from "./results.js";

export interface FxRateSnapshot {
  readonly asOfDate: string;
  readonly rateType: string;
  readonly source: "MANUAL" | "PROVIDER" | "CENTRAL_BANK" | "SYSTEM";
  readonly revision: string;
  readonly hash: string;
  readonly rates: readonly { readonly transactionCurrencyCode: string; readonly functionalCurrencyCode: string; readonly closingRate: FinanceDecimal }[];
}
export interface FxExposure extends SourceDocumentEvidence {
  readonly lineId: string;
  readonly glAccountId: string;
  readonly transactionCurrencyCode: string;
  readonly functionalCurrencyCode: string;
  readonly balanceType: "receivable" | "payable" | "bank" | "intercompany" | "loan" | "other";
  readonly originalCurrencyBalance: FinanceDecimal;
  readonly originalFunctionalBalance: FinanceDecimal;
  readonly originalRate: FinanceDecimal;
  readonly businessPartnerId?: string;
  readonly costCenterId?: string;
  readonly profitCenterId?: string;
  readonly projectId?: string;
  readonly dimensionSetId?: string;
}
export interface FxRevaluationPayload extends Readonly<Record<string, unknown>> {
  readonly companyCodeId: string; readonly ledgerBookId: string; readonly fiscalPeriodId: string;
  readonly fiscalYear: number; readonly periodNumber: number; readonly revaluationDate: string;
  readonly postingDate?: string; readonly functionalCurrencyCode: string;
  readonly autoReverseDate?: string; readonly rateSnapshot: FxRateSnapshot; readonly exposures: readonly FxExposure[];
}
export type FxRevaluationCommand = FinanceCommand<FxRevaluationPayload>;
export interface FxRevaluationLine extends FxExposure { readonly id: string; readonly runId: string; readonly lineNo: number; readonly closingRate: FinanceDecimal; readonly revaluedFunctionalBalance: FinanceDecimal; readonly unrealizedGainLoss: FinanceDecimal; readonly idempotencyKey: string; }
export interface FxRevaluationRun { readonly id: string; readonly companyCodeId: string; readonly ledgerBookId: string; readonly fiscalPeriodId: string; readonly fiscalYear: number; readonly periodNumber: number; readonly status: string; readonly rateSnapshot: FxRateSnapshot; readonly totalUnrealizedGain: FinanceDecimal; readonly totalUnrealizedLoss: FinanceDecimal; readonly netAmount: FinanceDecimal; readonly lines: readonly FxRevaluationLine[]; }
export interface FxRevaluationRepository<Transaction = unknown> { appendRun(command: FxRevaluationCommand, lines: readonly Omit<FxRevaluationLine,"id"|"unrealizedGainLoss">[], transaction: Transaction): Promise<FxRevaluationRun>; }
export type FxRevaluationOutput = Readonly<Record<string,unknown>> & { readonly run: FxRevaluationRun };

export interface IcEliminationLineInput {
  readonly lineId: string; readonly lineNo: number; readonly glAccountId: string;
  readonly debitAmount: FinanceDecimal; readonly creditAmount: FinanceDecimal;
  readonly functionalDebit: FinanceDecimal; readonly functionalCredit: FinanceDecimal;
  readonly costCenterId?: string; readonly profitCenterId?: string; readonly projectId?: string; readonly siteId?: string; readonly dimensionSetId?: string; readonly description?: string;
}
export interface IcEliminationPayload extends Readonly<Record<string, unknown>> {
  readonly eliminationCode: string; readonly consolidationCompanyId: string; readonly sourceCompanyCodeId: string; readonly counterpartyCompanyCodeId: string;
  readonly eliminationType: "revenue_expense"|"receivable_payable"|"inventory_markup"|"intercompany_profit"|"minority_interest"|"investment"|"dividend"|"loan"|"other";
  readonly consolidationGroup: string; readonly ledgerBookId: string; readonly fiscalPeriodId: string; readonly fiscalYear: number; readonly periodNumber: number;
  readonly eliminationDate: string; readonly postingDate: string; readonly currencyCode: string; readonly functionalCurrencyCode: string; readonly exchangeRate: FinanceDecimal;
  readonly lines: readonly IcEliminationLineInput[]; readonly source?: SourceDocumentEvidence;
}
export type IcEliminationCommand = FinanceCommand<IcEliminationPayload>;
export interface IcEliminationLine extends IcEliminationLineInput { readonly id: string; readonly eliminationId: string; readonly idempotencyKey: string; }
export interface IcEliminationRun { readonly id: string; readonly eliminationCode: string; readonly lineCount: number; readonly eliminationAmount: FinanceDecimal; readonly functionalAmount: FinanceDecimal; readonly lines: readonly IcEliminationLine[]; }
export interface IcEliminationRepository<Transaction = unknown> { append(command: IcEliminationCommand, transaction: Transaction): Promise<IcEliminationRun>; }
export type IcEliminationOutput = Readonly<Record<string,unknown>> & { readonly elimination: IcEliminationRun };

export type AssetReserveType = "revaluation_surplus"|"revaluation_decrease"|"impairment"|"impairment_reversal"|"reserve_transfer"|"disposal_release";
export interface AssetRevaluationPayload extends Readonly<Record<string,unknown>> {
  readonly companyCodeId: string; readonly ledgerBookId: string; readonly fiscalPeriodId: string; readonly assetId: string; readonly assetBookId: string;
  readonly reserveType: AssetReserveType; readonly movementAmount: FinanceDecimal; readonly currencyCode: string; readonly effectiveDate: string;
  readonly carryingAmountBefore: FinanceDecimal; readonly carryingAmountAfter: FinanceDecimal; readonly fairValue?: FinanceDecimal; readonly recoverableAmount?: FinanceDecimal;
  readonly valuationMethod?: string; readonly appraiserReference?: string; readonly source: SourceDocumentEvidence; readonly journalEntryId?: string; readonly reversesReserveId?: string; readonly notes?: string;
}
export type AssetRevaluationCommand = FinanceCommand<AssetRevaluationPayload>;
export interface AssetReserveMovement extends AssetRevaluationPayload { readonly id: string; readonly postedAt: string; readonly idempotencyKey: string; }
export interface AssetRevaluationRepository<Transaction=unknown> { get(actor:FinanceActor,id:string,transaction:Transaction):Promise<AssetReserveMovement|undefined>; list(actor:FinanceActor,assetBookId:string,transaction:Transaction):Promise<readonly AssetReserveMovement[]>; append(command:AssetRevaluationCommand,transaction:Transaction):Promise<AssetReserveMovement>; }
export type AssetRevaluationOutput = Readonly<Record<string,unknown>> & { readonly movement: AssetReserveMovement };

export interface CloseCoordinate { readonly companyCodeId:string; readonly ledgerBookId:string; readonly fiscalPeriodId:string; readonly fiscalYear:number; readonly periodNumber:number; }
export interface CloseReadinessMetric { readonly code:string; readonly ready:boolean; readonly sourceTotal:FinanceDecimal; readonly closeTotal:FinanceDecimal; readonly difference:FinanceDecimal; readonly evidenceCount:number; readonly detail:Readonly<Record<string,unknown>>; }
export interface CloseReadiness { readonly coordinate:CloseCoordinate; readonly ready:boolean; readonly metrics:readonly CloseReadinessMetric[]; readonly evaluatedAt:string; }
export interface CloseReadinessRepository<Transaction=unknown> { query(actor:FinanceActor,coordinate:CloseCoordinate,transaction:Transaction):Promise<readonly CloseReadinessMetric[]>; }

export interface FxRevaluationServiceContract { execute(command:FxRevaluationCommand):Promise<FinanceCommandResult<FxRevaluationOutput>>; }
export interface IcEliminationServiceContract { execute(command:IcEliminationCommand):Promise<FinanceCommandResult<IcEliminationOutput>>; }
export interface AssetRevaluationServiceContract { append(command:AssetRevaluationCommand):Promise<FinanceCommandResult<AssetRevaluationOutput>>; }
