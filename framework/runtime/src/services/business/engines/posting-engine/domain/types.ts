// framework/runtime/src/services/business/engines/posting-engine/domain/types.ts

// --- Chart of Accounts ---

export type AccountType =
  | "ASSET"
  | "LIABILITY"
  | "EQUITY"
  | "REVENUE"
  | "EXPENSE";
export type NormalBalance = "DEBIT" | "CREDIT";
export type SubledgerType =
  | "AP"
  | "AR"
  | "ASSET"
  | "INVENTORY"
  | "WIP"
  | "COMMISSION"
  | null;
export type PeriodStatus = "FUTURE" | "OPEN" | "SOFT_CLOSE" | "HARD_CLOSE";
export type JEStatus = "CREATED" | "POSTED" | "REVERSED";

export interface ChartOfAccounts {
  id: string;
  tenantId: string;
  entityCode: string;
  accountCode: string;
  accountName: string;
  accountType: AccountType;
  normalBalance: NormalBalance;
  parentId: string | null;
  level: number;
  isGroup: boolean;
  isActive: boolean;
  allowDirectPosting: boolean;
  subledgerType: SubledgerType;
  currencyCode: string | null;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateAccountInput {
  tenantId: string;
  entityCode: string;
  accountCode: string;
  accountName: string;
  accountType: AccountType;
  normalBalance: NormalBalance;
  parentId?: string;
  level?: number;
  isGroup?: boolean;
  allowDirectPosting?: boolean;
  subledgerType?: SubledgerType;
  currencyCode?: string;
  tags?: string[];
}

// --- Cost Center & Profit Center ---

export interface CostCenter {
  id: string;
  tenantId: string;
  entityCode: string;
  code: string;
  name: string;
  parentId: string | null;
  isActive: boolean;
  createdAt: Date;
}

export interface ProfitCenter {
  id: string;
  tenantId: string;
  entityCode: string;
  code: string;
  name: string;
  isActive: boolean;
  createdAt: Date;
}

// --- Fiscal Period ---

export interface FiscalPeriod {
  id: string;
  tenantId: string;
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
  periodName: string;
  startDate: Date;
  endDate: Date;
  status: PeriodStatus;
  openedAt: Date | null;
  softClosedAt: Date | null;
  hardClosedAt: Date | null;
  closedBy: string | null;
  createdAt: Date;
}

// --- Accounting Profile ---

export interface AccountingProfile {
  id: string;
  tenantId: string;
  entityCode: string;
  code: string;
  name: string;
  description: string | null;
  intentFilter: Record<string, unknown> | null;
  categoryFilter: Record<string, unknown> | null;
  postingPattern: PostingPatternEntry[];
  isActive: boolean;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PostingPatternEntry {
  side: "DEBIT" | "CREDIT";
  accountResolution: {
    method: "DIRECT" | "INTENT_LOOKUP" | "CATEGORY_LOOKUP" | "SUBLEDGER";
    accountCode?: string;
    lookupField?: string;
  };
  amountSource: "GROSS" | "NET" | "TAX" | "DISCOUNT" | "CUSTOM";
  customAmountField?: string;
  subledgerType?: SubledgerType;
  description?: string;
}

// --- Journal Entry ---

export interface JournalEntry {
  id: string;
  tenantId: string;
  entityCode: string;
  jeNumber: string;
  txnId: string;
  docId: string;
  docType: string;
  accountingProfileId: string | null;
  fiscalYear: number;
  periodNumber: number;
  postingDate: Date;
  description: string | null;
  status: JEStatus;
  totalDebit: string;
  totalCredit: string;
  currencyCode: string;
  isReversal: boolean;
  reversalOfId: string | null;
  reversedById: string | null;
  postedBy: string | null;
  postedAt: Date | null;
  createdAt: Date;
}

export interface JournalLine {
  id: string;
  tenantId: string;
  jeId: string;
  lineNo: number;
  accountId: string;
  costCenterId: string | null;
  profitCenterId: string | null;
  debitAmount: string;
  creditAmount: string;
  currencyCode: string;
  description: string | null;
  subledgerType: SubledgerType;
  subledgerRefId: string | null;
  /** Links JE line back to the source document line that generated it */
  sourceDocLineId: string | null;
  tags: string[];
}

export interface CreateJournalEntryInput {
  tenantId: string;
  entityCode: string;
  txnId: string;
  docId: string;
  docType: string;
  accountingProfileId?: string;
  postingDate: Date;
  description?: string;
  currencyCode: string;
  lines: CreateJournalLineInput[];
  postedBy: string;
  /** Idempotency key — prevents duplicate JE creation from retries */
  idempotencyKey?: string;
}

export interface CreateJournalLineInput {
  accountId: string;
  costCenterId?: string;
  profitCenterId?: string;
  debitAmount: string;
  creditAmount: string;
  currencyCode: string;
  description?: string;
  subledgerType?: SubledgerType;
  subledgerRefId?: string;
  /** Links to the source document line (invoice line, payment allocation) */
  sourceDocLineId?: string;
  tags?: string[];
}

// --- GL Balance ---

export interface GLBalance {
  id: string;
  tenantId: string;
  entityCode: string;
  accountId: string;
  fiscalYear: number;
  periodNumber: number;
  costCenterId: string | null;
  currencyCode: string;
  openingDebit: string;
  openingCredit: string;
  periodDebit: string;
  periodCredit: string;
  closingDebit: string;
  closingCredit: string;
  updatedAt: Date;
}

// --- Period transitions ---

export const PERIOD_TRANSITIONS: Record<PeriodStatus, PeriodStatus[]> = {
  FUTURE: ["OPEN"],
  OPEN: ["SOFT_CLOSE"],
  SOFT_CLOSE: ["OPEN", "HARD_CLOSE"],
  HARD_CLOSE: [],
};
