// framework/runtime/src/services/business/engines/statement-engine/persistence/statement-repo.ts
//
// Repository interfaces for the Statement Engine.
// Implementations are in the DB adapter layer.

import type {
  StatementDefinition,
  StatementLine,
  StatementLineAccount,
  StatementInstance,
  StatementInstanceLine,
  ResolvedAccountBalance,
  InstanceStatus,
} from "../domain/types.js";

// ---------------------------------------------------------------------------
// Statement Definition Repository
// ---------------------------------------------------------------------------

export interface StatementDefinitionRepo {
  getById(tenantId: string, id: string): Promise<StatementDefinition | null>;

  getByCode(
    tenantId: string,
    entityCode: string,
    definitionCode: string,
    version?: number,
  ): Promise<StatementDefinition | null>;

  list(
    tenantId: string,
    entityCode: string,
    filters?: { statementType?: string; isActive?: boolean },
  ): Promise<StatementDefinition[]>;

  getLines(definitionId: string): Promise<StatementLine[]>;

  getLineAccounts(lineId: string): Promise<StatementLineAccount[]>;

  getAllLineAccounts(definitionId: string): Promise<StatementLineAccount[]>;
}

// ---------------------------------------------------------------------------
// Statement Instance Repository
// ---------------------------------------------------------------------------

export interface StatementInstanceRepo {
  create(input: {
    tenantId: string;
    entityCode: string;
    definitionId: string;
    definitionVersion: number;
    fiscalYear: number;
    periodFrom: number;
    periodTo: number;
    bookCode: string;
    dimensionSetId?: string | null;
    dimensionFilter?: Record<string, string> | null;
    currencyCode: string;
    generatedBy?: string | null;
    glBalanceAsOf?: Date | null;
    cubeRefreshRunId?: string | null;
    generationDurationMs?: number | null;
    totalLineCount: number;
    supersedesId?: string | null;
  }): Promise<StatementInstance>;

  getById(tenantId: string, id: string): Promise<StatementInstance | null>;

  list(
    tenantId: string,
    entityCode: string,
    filters?: {
      definitionId?: string;
      fiscalYear?: number;
      bookCode?: string;
      status?: InstanceStatus;
    },
  ): Promise<StatementInstance[]>;

  updateStatus(
    tenantId: string,
    id: string,
    status: InstanceStatus,
    actorId?: string,
  ): Promise<StatementInstance>;

  /** Insert computed line values for an instance */
  insertLines(lines: Array<{
    instanceId: string;
    lineId: string;
    lineCode: string;
    label: string;
    lineType: string;
    parentLineCode: string | null;
    level: number;
    sortOrder: number;
    currentAmount: string;
    priorAmount: string | null;
    budgetAmount: string | null;
    varianceAmount: string | null;
    variancePct: string | null;
    accountBreakdown: unknown[] | null;
    isBold: boolean;
    isUnderlined: boolean;
    indentLevel: number;
    isCalculated: boolean;
  }>): Promise<void>;

  getLines(instanceId: string): Promise<StatementInstanceLine[]>;
}

// ---------------------------------------------------------------------------
// Account Resolution Repository (calls SQL function)
// ---------------------------------------------------------------------------

export interface AccountResolutionRepo {
  /** Calls fin.resolve_statement_accounts() to get GL balances per statement line */
  resolveAccounts(
    tenantId: string,
    entityCode: string,
    definitionId: string,
    fiscalYear: number,
    periodFrom: number,
    periodTo: number,
    bookCode: string,
    dimensionSetId?: string | null,
  ): Promise<ResolvedAccountBalance[]>;
}
