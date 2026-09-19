import type { FinanceActor, FinanceCommand } from "./commands.js";
import type {
  BookPeriodRecord,
  BookPeriodTransitionCommand,
  CurrencyEvidence,
  CurrencyRoundingDefaults,
  LedgerBookEvidence,
  RoundingResolutionRequest,
  RoundingRuleCandidate,
  SourceDocumentEvidence,
} from "./foundation.js";
import type { FinanceCommandResult } from "./results.js";

export interface FinanceCommandRepository<Transaction = unknown> {
  execute<
    Payload extends Readonly<Record<string, unknown>>,
    Output extends Readonly<Record<string, unknown>>,
  >(
    command: FinanceCommand<Payload>,
    transaction: Transaction,
    apply: (transaction: Transaction) => Promise<{
      readonly resourceId: string;
      readonly version: number;
      readonly output: Output;
    }>,
  ): Promise<FinanceCommandResult<Output>>;
}

export interface RoundingPolicyReader {
  listCandidates(
    request: RoundingResolutionRequest,
  ): Promise<readonly RoundingRuleCandidate[]>;
  getCurrencyDefaults(
    request: Pick<
      RoundingResolutionRequest,
      "tenantId" | "actor" | "currencyCode"
    >,
  ): Promise<CurrencyRoundingDefaults | undefined>;
}

export interface BookPeriodRepository<Transaction = unknown> {
  get(
    tenantId: string,
    ledgerBookId: string,
    fiscalPeriodId: string,
    transaction?: Transaction,
  ): Promise<BookPeriodRecord | undefined>;
  transition(
    command: BookPeriodTransitionCommand,
    current: BookPeriodRecord,
    transaction?: Transaction,
  ): Promise<BookPeriodRecord>;
}

export interface FinanceFoundationReader {
  getLedgerBook(
    actor: FinanceActor,
    companyCodeId: string,
    ledgerBookId: string,
  ): Promise<LedgerBookEvidence | undefined>;
  getBookPeriod(
    actor: FinanceActor,
    ledgerBookId: string,
    fiscalPeriodId: string,
  ): Promise<BookPeriodRecord | undefined>;
  getCurrency(
    actor: FinanceActor,
    currencyCode: string,
  ): Promise<CurrencyEvidence | undefined>;
  getSourceDocument(
    actor: FinanceActor,
    sourceType: string,
    sourceId: string,
    version: number,
  ): Promise<SourceDocumentEvidence | undefined>;
}

export interface FinancePermissionChecker {
  isAllowed(actor: FinanceActor, permissionCode: string): Promise<boolean>;
}
