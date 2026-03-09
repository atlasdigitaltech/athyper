// framework/runtime/src/services/business/engines/statement-engine/domain/types.ts
//
// Domain model for the Financial Statement Engine.
// Statements are metadata-driven: line hierarchies, account mappings,
// and calculation rules exist as data, not code.

// --- Statement Types ---

export type StatementType =
  | "INCOME_STATEMENT"
  | "BALANCE_SHEET"
  | "CASH_FLOW"
  | "TRIAL_BALANCE"
  | "MANAGEMENT"
  | "COMPARISON"
  | "DIMENSION_PACK";

export type StatementScope = "SYSTEM" | "TENANT" | "ENTITY";

export type StatementLineType =
  | "SECTION"
  | "ACCOUNT"
  | "SUBTOTAL"
  | "CALCULATION"
  | "MOVEMENT"
  | "SEPARATOR"
  | "NOTE";

export type AccountMappingMode = "EXACT" | "RANGE" | "TYPE";
export type SignTreatment = "NATURAL" | "INVERT";
export type NormalBalance = "DEBIT" | "CREDIT";

export type InstanceStatus =
  | "DRAFT"
  | "REVIEWED"
  | "APPROVED"
  | "FINALIZED"
  | "PUBLISHED"
  | "SUPERSEDED";

export const INSTANCE_TRANSITIONS: Record<InstanceStatus, InstanceStatus[]> = {
  DRAFT: ["REVIEWED"],
  REVIEWED: ["DRAFT", "APPROVED"],
  APPROVED: ["REVIEWED", "FINALIZED"],
  FINALIZED: ["PUBLISHED", "SUPERSEDED"],
  PUBLISHED: ["SUPERSEDED"],
  SUPERSEDED: [],
};

// --- Statement Definition ---

export interface StatementDefinition {
  id: string;
  tenantId: string;
  entityCode: string;
  definitionCode: string;
  name: string;
  description: string | null;
  statementType: StatementType;
  bookCodes: string[] | null;
  reportingStandard: string | null;
  currencyCode: string | null;
  dimensionCodes: string[] | null;
  version: number;
  scope: StatementScope;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// --- Statement Line ---

export interface StatementLine {
  id: string;
  definitionId: string;
  lineCode: string;
  label: string;
  description: string | null;
  parentLineId: string | null;
  level: number;
  sortOrder: number;
  lineType: StatementLineType;
  calculationFormula: CalculationStep[] | null;
  isBold: boolean;
  isUnderlined: boolean;
  indentLevel: number;
  showSign: boolean;
  invertSign: boolean;
  accountTypeFilter: string | null;
  normalBalance: NormalBalance;
  isActive: boolean;
  createdAt: Date;
}

/** One step in a calculation formula */
export interface CalculationStep {
  lineCode: string;
  operator: "+" | "-" | "*" | "/";
}

// --- Account Mapping ---

export interface StatementLineAccount {
  id: string;
  lineId: string;
  mappingMode: AccountMappingMode;
  accountCode: string | null;
  rangeFrom: string | null;
  rangeTo: string | null;
  accountType: string | null;
  subledgerType: string | null;
  signTreatment: SignTreatment;
  priority: number;
  sortOrder: number;
  createdAt: Date;
}

// --- Statement Instance ---

export interface StatementInstance {
  id: string;
  tenantId: string;
  entityCode: string;
  definitionId: string;
  definitionVersion: number;
  fiscalYear: number;
  periodFrom: number;
  periodTo: number;
  bookCode: string;
  dimensionSetId: string | null;
  dimensionFilter: Record<string, string> | null;
  currencyCode: string;
  status: InstanceStatus;
  generatedAt: Date;
  generatedBy: string | null;
  generationDurationMs: number | null;
  glBalanceAsOf: Date | null;
  cubeRefreshRunId: string | null;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  approvedBy: string | null;
  approvedAt: Date | null;
  finalizedAt: Date | null;
  publishedBy: string | null;
  publishedAt: Date | null;
  supersedesId: string | null;
  totalLineCount: number;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// --- Instance Line (computed values) ---

export interface StatementInstanceLine {
  id: string;
  instanceId: string;
  lineId: string;
  lineCode: string;
  label: string;
  lineType: StatementLineType;
  parentLineCode: string | null;
  level: number;
  sortOrder: number;
  currentAmount: string;
  priorAmount: string | null;
  budgetAmount: string | null;
  varianceAmount: string | null;
  variancePct: string | null;
  accountBreakdown: AccountBreakdownEntry[] | null;
  isBold: boolean;
  isUnderlined: boolean;
  indentLevel: number;
  isCalculated: boolean;
  createdAt: Date;
}

export interface AccountBreakdownEntry {
  accountId: string;
  accountCode: string;
  accountName: string;
  amount: string;
}

// --- Generation Input ---

export interface GenerateStatementInput {
  tenantId: string;
  entityCode: string;
  definitionId: string;
  fiscalYear: number;
  periodFrom: number;
  periodTo: number;
  bookCode?: string;
  dimensionSetId?: string;
  dimensionFilter?: Record<string, string>;
  currencyCode?: string;
  includePriorYear?: boolean;
  generatedBy?: string;
}

// --- Resolved Account Data (from SQL function) ---

export interface ResolvedAccountBalance {
  lineCode: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: string;
  periodDebit: string;
  periodCredit: string;
  closingDebit: string;
  closingCredit: string;
  signTreatment: SignTreatment;
}
