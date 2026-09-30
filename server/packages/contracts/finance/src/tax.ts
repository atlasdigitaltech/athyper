import type { FinanceActor, FinanceCommand } from "./commands.js";
import type {
  FinanceDecimal,
  FinanceCoordinates,
  RoundingEvidence,
  SourceDocumentEvidence,
} from "./foundation.js";
import type { FinanceCommandResult } from "./results.js";

export type TaxRateKind = "PERCENT" | "FIXED" | "PER_UNIT";
export type LedgerTaxRateKind = "percent" | "fixed" | "per_unit";
export type TaxPolicyDirection =
  "PURCHASE" | "SALE" | "PAYMENT" | "IMPORT" | "EXPORT" | "BOTH";
export type TaxDirection =
  "purchase" | "sale" | "payment" | "import" | "export";
export type TaxTreatment =
  | "standard"
  | "exempt"
  | "zero_rated"
  | "reverse_charge"
  | "withholding"
  | "non_taxable";
export type TaxRecoverability = "none" | "full" | "partial" | "conditional";
export type TaxPolicyRecoverability =
  "NONE" | "FULL" | "PARTIAL" | "CONDITIONAL";
export type TaxPricingMode = "exclusive" | "inclusive";

export interface TaxResolutionContext extends Readonly<
  Record<string, unknown>
> {
  readonly taxDate: string;
  readonly transactionDirection: "PURCHASE" | "SALE";
  readonly billToJurisdictionId?: string;
  readonly shipToJurisdictionId?: string;
  readonly billFromJurisdictionId?: string;
  readonly shipFromJurisdictionId?: string;
  readonly commodityCategoryId?: string;
  readonly supplierIndustryCode?: string;
  readonly counterpartyTaxStatus?: string;
  readonly documentEntityCode?: string;
}

/** Bounded, immutable copy of the matched resolution-rule revision. */
export interface TaxRuleSnapshot extends Readonly<Record<string, unknown>> {
  readonly ruleId: string;
  readonly ruleCode: string;
  readonly revision: string;
  readonly effectiveFrom: string;
  readonly effectiveTo?: string;
  readonly taxGroupId: string;
  readonly priority: number;
  readonly sourceHash: string;
  readonly groupRevision: string;
  readonly groupSourceHash: string;
  readonly roundingRuleId: string;
  readonly matchEvidence: Readonly<Record<string, unknown>>;
}

/** Bounded, immutable copy of one effective rate schedule revision. */
export interface TaxRateSnapshot extends Readonly<Record<string, unknown>> {
  readonly scheduleId: string;
  readonly revision: string;
  readonly effectiveFrom: string;
  readonly effectiveTo?: string;
  readonly jurisdictionId: string;
  readonly taxTypeId: string;
  readonly componentCode: string;
  readonly calculationSequence: number;
  readonly taxDirection: TaxPolicyDirection;
  readonly taxTreatment: Uppercase<TaxTreatment>;
  readonly rateKind: TaxRateKind;
  readonly rateValue: FinanceDecimal;
  readonly calculationBasisCode: string;
  readonly rateCurrency?: string;
  readonly rateUomCode?: string;
  readonly recoverability: TaxPolicyRecoverability;
  readonly recoverabilityPercent?: FinanceDecimal;
  readonly sourceHash: string;
}

/** Calculation choices captured with the line, including rounding evidence. */
export interface TaxBasisSnapshot extends Readonly<Record<string, unknown>> {
  readonly calculationBasisCode: string;
  readonly pricingMode: TaxPricingMode;
  readonly compound: boolean;
  readonly rounding: RoundingEvidence;
  readonly baseRounding: RoundingEvidence;
  readonly source: SourceDocumentEvidence & { readonly sourceLineId?: string };
  readonly baseCurrencyCode: string;
  readonly quantity?: FinanceDecimal;
  readonly uomCode?: string;
}

export interface ResolvedTaxConfiguration {
  readonly rule: TaxRuleSnapshot;
  readonly taxGroupId: string;
  readonly compound: boolean;
  readonly components: readonly TaxRateSnapshot[];
}

export interface TaxCalculationPayload extends Readonly<
  Record<string, unknown>
> {
  readonly coordinates: FinanceCoordinates;
  readonly source: SourceDocumentEvidence & { readonly sourceLineId?: string };
  readonly resolution: TaxResolutionContext;
  readonly pricingMode: TaxPricingMode;
  /** Net amount for exclusive pricing; gross amount for inclusive pricing. */
  readonly amount: FinanceDecimal;
  readonly quantity?: FinanceDecimal;
  readonly uomCode?: string;
  readonly baseCurrencyCode: string;
  readonly exchangeRate: FinanceDecimal;
  readonly postedAt: string;
  readonly reversesCalculationIds?: readonly string[];
}
export type TaxCalculationCommand = FinanceCommand<TaxCalculationPayload>;

export interface TaxCalculationLine {
  readonly id: string;
  readonly coordinates: FinanceCoordinates;
  readonly source: SourceDocumentEvidence & { readonly sourceLineId?: string };
  readonly jurisdictionId: string;
  readonly taxTypeId: string;
  readonly taxGroupId: string;
  readonly taxRateScheduleId: string;
  readonly componentCode: string;
  readonly taxDirection: TaxDirection;
  readonly taxTreatment: TaxTreatment;
  readonly rateKind: LedgerTaxRateKind;
  readonly rateValue: FinanceDecimal;
  readonly calculationBasisCode: string;
  readonly taxableBaseAmount: FinanceDecimal;
  readonly taxAmount: FinanceDecimal;
  readonly roundingAdjustment: FinanceDecimal;
  readonly recoverability: TaxRecoverability;
  readonly recoverableAmount: FinanceDecimal;
  readonly nonrecoverableAmount: FinanceDecimal;
  readonly baseCurrencyAmount: FinanceDecimal;
  readonly exchangeRate: FinanceDecimal;
  readonly ruleSnapshot: TaxRuleSnapshot;
  readonly rateSnapshot: TaxRateSnapshot;
  readonly basisSnapshot: TaxBasisSnapshot;
  readonly evidenceHash: string;
  readonly reversesCalculationId?: string;
  readonly idempotencyKey: string;
  readonly postedAt: string;
}

export interface TaxConfigurationPort {
  resolve(
    actor: FinanceActor,
    context: TaxResolutionContext,
    companyCodeId: string,
  ): Promise<ResolvedTaxConfiguration | undefined>;
}
export interface TaxSourcePort {
  loadImmutable(
    actor: FinanceActor,
    evidence: SourceDocumentEvidence,
  ): Promise<SourceDocumentEvidence | undefined>;
}
export interface TaxCalculationRepository<Transaction = unknown> {
  append(
    actor: FinanceActor,
    line: TaxCalculationLine,
    transaction: Transaction,
  ): Promise<TaxCalculationLine>;
  get(
    actor: FinanceActor,
    id: string,
    transaction: Transaction,
  ): Promise<TaxCalculationLine | undefined>;
  findReversal(
    actor: FinanceActor,
    originalId: string,
    transaction: Transaction,
  ): Promise<TaxCalculationLine | undefined>;
}
export interface TaxCalculationOutput extends Readonly<
  Record<string, unknown>
> {
  readonly lines: readonly TaxCalculationLine[];
  readonly totalTaxAmount: FinanceDecimal;
  readonly totalBaseCurrencyAmount: FinanceDecimal;
}
export interface TaxCalculationServiceContract {
  calculate(
    command: TaxCalculationCommand,
  ): Promise<FinanceCommandResult<TaxCalculationOutput>>;
  replay(line: TaxCalculationLine): TaxCalculationLine;
}

export type TaxCreditBucket =
  "input" | "output" | "withholding_deducted" | "withholding_suffered";
export type TaxCreditMovementType =
  "posting" | "reversal" | "amendment" | "carry_forward" | "adjustment";
export interface TaxCreditCoordinate extends FinanceCoordinates {
  readonly jurisdictionId: string;
  readonly taxTypeId: string;
  readonly taxBucket: TaxCreditBucket;
}
export interface TaxCreditMovement extends TaxCreditCoordinate {
  readonly id: string;
  readonly movementType: TaxCreditMovementType;
  readonly amount: FinanceDecimal;
  readonly sourceTaxCalculationId?: string;
  readonly reversesMovementId?: string;
  readonly idempotencyKey: string;
  readonly reason?: string;
  readonly createdAt: string;
}
export type TaxCreditMovementPayload = Readonly<Record<string, unknown>> &
  Omit<TaxCreditMovement, "id" | "idempotencyKey" | "createdAt">;
export type TaxCreditMovementCommand = FinanceCommand<TaxCreditMovementPayload>;
export interface TaxCreditBalance extends TaxCreditCoordinate {
  readonly asOf: string;
  readonly amount: FinanceDecimal;
  readonly movementCount: number;
  readonly lastMovementId?: string;
}
export interface TaxCreditRepository<Transaction = unknown> {
  append(
    command: TaxCreditMovementCommand,
    transaction: Transaction,
  ): Promise<TaxCreditMovement>;
  get(
    actor: FinanceActor,
    id: string,
    transaction: Transaction,
  ): Promise<TaxCreditMovement | undefined>;
  findReversal(
    actor: FinanceActor,
    originalId: string,
    transaction: Transaction,
  ): Promise<TaxCreditMovement | undefined>;
  listForSource(
    actor: FinanceActor,
    sourceTaxCalculationId: string,
    transaction: Transaction,
  ): Promise<readonly TaxCreditMovement[]>;
  list(
    actor: FinanceActor,
    coordinate: TaxCreditCoordinate,
    asOf: string,
    transaction: Transaction,
  ): Promise<readonly TaxCreditMovement[]>;
}
export interface TaxCreditSourcePort<Transaction = unknown> {
  getCalculation(
    actor: FinanceActor,
    id: string,
    transaction: Transaction,
  ): Promise<TaxCalculationLine | undefined>;
}
export interface TaxCreditServiceContract {
  move(command: TaxCreditMovementCommand): Promise<
    FinanceCommandResult<
      Readonly<Record<string, unknown>> & {
        readonly movement: TaxCreditMovement;
      }
    >
  >;
  balance(
    actor: FinanceActor,
    coordinate: TaxCreditCoordinate,
    asOf: string,
  ): Promise<TaxCreditBalance>;
  rebuild(
    actor: FinanceActor,
    coordinate: TaxCreditCoordinate,
    asOf: string,
  ): Promise<TaxCreditBalance>;
}
