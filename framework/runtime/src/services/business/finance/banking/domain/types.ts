// finance/banking/domain/types.ts

export type StatementSource = "MANUAL" | "CSV" | "OFX" | "MT940" | "API";
export type StatementStatus =
  | "IMPORTED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED";
export type LineDirection = "DEBIT" | "CREDIT";
export type MatchStatus =
  | "UNMATCHED"
  | "AUTO_MATCHED"
  | "MANUAL_MATCHED"
  | "CONFIRMED"
  | "EXCLUDED";
export type ReconciliationStatus = "OPEN" | "COMPLETED" | "CANCELLED";

export interface BankStatement {
  id: string;
  tenantId: string;
  entityCode: string;
  statementNumber: string;
  bankAccountId: string;
  bankName: string | null;
  statementDate: Date;
  periodStart: Date;
  periodEnd: Date;
  openingBalance: string;
  closingBalance: string;
  currencyCode: string;
  source: StatementSource;
  status: StatementStatus;
  lineCount: number;
  importedBy: string | null;
  importedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface BankStatementLine {
  id: string;
  tenantId: string;
  statementId: string;
  lineNo: number;
  transactionDate: Date;
  valueDate: Date | null;
  amount: string;
  direction: LineDirection;
  reference: string | null;
  description: string | null;
  counterparty: string | null;
  matchStatus: MatchStatus;
  matchConfidence: number | null;
  matchedPaymentId: string | null;
  matchedAt: Date | null;
  matchedBy: string | null;
  bankReference: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReconciliationSession {
  id: string;
  tenantId: string;
  statementId: string;
  status: ReconciliationStatus;
  totalLines: number;
  autoMatched: number;
  manualMatched: number;
  unmatched: number;
  excluded: number;
  discrepancy: string;
  startedBy: string | null;
  startedAt: Date;
  completedBy: string | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateBankStatementInput {
  tenantId: string;
  entityCode: string;
  statementNumber: string;
  bankAccountId: string;
  bankName?: string;
  statementDate: Date;
  periodStart: Date;
  periodEnd: Date;
  openingBalance: string;
  closingBalance: string;
  currencyCode: string;
  source?: StatementSource;
  lines: CreateStatementLineInput[];
}

export interface CreateStatementLineInput {
  transactionDate: Date;
  valueDate?: Date;
  amount: string;
  direction: LineDirection;
  reference?: string;
  description?: string;
  counterparty?: string;
  bankReference?: string;
}

export interface MatchResult {
  lineId: string;
  paymentId: string;
  confidence: number;
  matchType: "EXACT" | "FUZZY_REF" | "AMOUNT_ONLY";
}
