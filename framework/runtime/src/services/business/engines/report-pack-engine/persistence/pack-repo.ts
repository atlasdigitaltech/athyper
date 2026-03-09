// framework/runtime/src/services/business/engines/report-pack-engine/persistence/pack-repo.ts
//
// Repository interfaces for the Report Pack Engine.
// Implementations are in the DB adapter layer.

import type {
  PackDefinition,
  PackItem,
  PackInstance,
  PackInstanceItem,
  PackInstanceStatus,
  PackItemStatus,
  ReportCommentary,
  BudgetLine,
  CommentaryTargetKind,
  CommentaryType,
} from "../domain/types.js";

// ---------------------------------------------------------------------------
// Pack Definition Repository
// ---------------------------------------------------------------------------

export interface PackDefinitionRepo {
  getById(tenantId: string, id: string): Promise<PackDefinition | null>;

  getByCode(
    tenantId: string,
    entityCode: string,
    packCode: string,
    version?: number,
  ): Promise<PackDefinition | null>;

  list(
    tenantId: string,
    entityCode: string,
    filters?: { packType?: string; isActive?: boolean },
  ): Promise<PackDefinition[]>;

  getItems(packDefinitionId: string): Promise<PackItem[]>;
}

// ---------------------------------------------------------------------------
// Pack Instance Repository
// ---------------------------------------------------------------------------

export interface PackInstanceRepo {
  create(input: {
    tenantId: string;
    entityCode: string;
    packDefinitionId: string;
    packVersion: number;
    fiscalYear: number;
    periodFrom: number;
    periodTo: number;
    bookCode: string;
    dimensionSetId?: string | null;
    varianceSource?: string | null;
    periodMode?: string | null;
    totalItems: number;
    generatedBy?: string | null;
    supersedesId?: string | null;
  }): Promise<PackInstance>;

  getById(tenantId: string, id: string): Promise<PackInstance | null>;

  list(
    tenantId: string,
    entityCode: string,
    filters?: {
      packDefinitionId?: string;
      fiscalYear?: number;
      status?: PackInstanceStatus;
    },
  ): Promise<PackInstance[]>;

  updateStatus(
    tenantId: string,
    id: string,
    status: PackInstanceStatus,
    actorId?: string,
  ): Promise<PackInstance>;

  updateProgress(
    id: string,
    itemsCompleted: number,
    generationDurationMs?: number,
  ): Promise<void>;

  insertItem(item: {
    packInstanceId: string;
    packItemId: string;
    statementInstanceId?: string | null;
    comparisonId?: string | null;
    itemStatus: PackItemStatus;
    errorMessage?: string | null;
    resolvedBookCode?: string | null;
    resolvedPeriodMode?: string | null;
    resolvedVarianceSource?: string | null;
    resolvedPeriodFrom?: number | null;
    resolvedPeriodTo?: number | null;
    resolvedFiscalYear?: number | null;
    sortOrder: number;
  }): Promise<PackInstanceItem>;

  updateItemStatus(
    id: string,
    status: PackItemStatus,
    errorMessage?: string | null,
    statementInstanceId?: string | null,
    comparisonId?: string | null,
  ): Promise<void>;

  getItems(packInstanceId: string): Promise<PackInstanceItem[]>;
}

// ---------------------------------------------------------------------------
// Budget Repository
// ---------------------------------------------------------------------------

export interface BudgetRepo {
  getLines(
    tenantId: string,
    entityCode: string,
    filters: {
      budgetCode?: string;
      budgetVersion?: number;
      fiscalYear: number;
      periodFrom: number;
      periodTo: number;
      bookCode?: string;
      accountId?: string;
      dimensionSetId?: string | null;
    },
  ): Promise<BudgetLine[]>;

  /** Calls fin.resolve_statement_budget() */
  resolveStatementBudget(
    tenantId: string,
    entityCode: string,
    definitionId: string,
    fiscalYear: number,
    periodFrom: number,
    periodTo: number,
    bookCode?: string,
    budgetCode?: string | null,
    dimensionSetId?: string | null,
  ): Promise<Array<{
    lineCode: string;
    accountId: string;
    accountCode: string;
    budgetAmount: string;
  }>>;
}

// ---------------------------------------------------------------------------
// Commentary Repository
// ---------------------------------------------------------------------------

export interface CommentaryRepo {
  create(input: {
    tenantId: string;
    targetKind: CommentaryTargetKind;
    targetId: string;
    packInstanceItemId?: string | null;
    statementLineCode?: string | null;
    commentaryType: CommentaryType;
    title?: string | null;
    body: string;
    authorId?: string | null;
    authorName?: string | null;
  }): Promise<ReportCommentary>;

  update(
    id: string,
    body: string,
    title?: string | null,
  ): Promise<ReportCommentary>;

  getByTarget(
    targetKind: CommentaryTargetKind,
    targetId: string,
    currentOnly?: boolean,
  ): Promise<ReportCommentary[]>;

  getByPackInstance(
    packInstanceId: string,
  ): Promise<ReportCommentary[]>;

  delete(id: string): Promise<void>;
}
