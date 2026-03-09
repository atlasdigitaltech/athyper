// lib/finance/reporting-types.ts
//
// Frontend DTOs for the Reporting Analytics Engine.
// MC-4 compliant: all monetary values are string (never float).

import type { BookCode } from "./types";

// ---------------------------------------------------------------------------
// Cube Type / Grain enums
// ---------------------------------------------------------------------------

export type CubeType = "FS" | "MGMT" | "OPS" | "IC";
export type CubeGrain = "MONTHLY" | "DAILY";
export type CubeRefreshMode = "EVENT" | "BATCH" | "HYBRID";
export type CubeRefreshRunType =
  | "INCREMENTAL"
  | "FULL_REBUILD"
  | "PERIOD_FREEZE"
  | "RECONCILIATION";
export type CubeRefreshStatus = "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";
export type CubeRefreshTrigger = "EVENT" | "SCHEDULER" | "MANUAL" | "PERIOD_CLOSE";

// ---------------------------------------------------------------------------
// Cube Definition
// ---------------------------------------------------------------------------

export interface CubeDefinitionDTO {
  id: string;
  entityCode: string;
  cubeCode: string;
  name: string;
  description: string | null;
  cubeType: CubeType;
  grain: CubeGrain;
  dimensionCodes: string[];
  measureCodes: string[];
  accountTypes: string[] | null;
  bookCodes: string[] | null;
  refreshMode: CubeRefreshMode;
  retentionYears: number;
  isActive: boolean;
  lastBuiltAt: string | null;
  lastFullRebuildAt: string | null;
}

// ---------------------------------------------------------------------------
// Balance Cube Row (pre-aggregated reporting data)
// ---------------------------------------------------------------------------

export interface CubeBalanceRowDTO {
  cubeCode: string;
  bookCode: BookCode;
  fiscalYear: number;
  periodNumber: number;
  currencyCode: string;
  accountId: string;
  accountCode: string;
  accountType: string;
  // Flat dimension value IDs
  costCenterValueId: string | null;
  profitCenterValueId: string | null;
  projectValueId: string | null;
  regionValueId: string | null;
  segmentValueId: string | null;
  locationValueId: string | null;
  functionValueId: string | null;
  intercompanyValueId: string | null;
  // Measures (MC-4: string)
  openingDebit: string;
  openingCredit: string;
  periodDebit: string;
  periodCredit: string;
  closingDebit: string;
  closingCredit: string;
  amountNet: string;
  // Metadata
  periodStatus: string | null;
  lastRefreshAt: string;
}

// ---------------------------------------------------------------------------
// Dimension value label resolution (for display)
// ---------------------------------------------------------------------------

export interface DimensionValueLabel {
  id: string;
  code: string;
  name: string;
  typeCode: string;
}

// ---------------------------------------------------------------------------
// P&L Report — structured for multi-dimensional analysis
// ---------------------------------------------------------------------------

export interface PnLReportFilters {
  entityCode: string;
  cubeCode?: string;
  bookCode?: BookCode;
  fiscalYear: number;
  periodFrom?: number;
  periodTo?: number;
  currencyCode?: string;
  // Dimension filters (optional, null = all)
  costCenterValueId?: string;
  profitCenterValueId?: string;
  projectValueId?: string;
  regionValueId?: string;
  segmentValueId?: string;
  locationValueId?: string;
  functionValueId?: string;
  intercompanyValueId?: string;
  // Grouping axis
  groupBy?: PnLGroupBy;
}

export type PnLGroupBy =
  | "account"
  | "cost_center"
  | "profit_center"
  | "project"
  | "region"
  | "segment"
  | "location"
  | "function"
  | "intercompany"
  | "period";

export interface PnLReportRowDTO {
  // Grouping key (depends on groupBy)
  groupKey: string;
  groupLabel: string;
  accountType: string;
  // Period values (MC-4: string)
  revenue: string;
  expense: string;
  netIncome: string;
  // Period-over-period comparison
  priorRevenue: string | null;
  priorExpense: string | null;
  priorNetIncome: string | null;
  revenueVariance: string | null;
  expenseVariance: string | null;
  netIncomeVariance: string | null;
  variancePercent: string | null;
}

export interface PnLReportDTO {
  filters: PnLReportFilters;
  rows: PnLReportRowDTO[];
  totals: {
    revenue: string;
    expense: string;
    netIncome: string;
    priorRevenue: string | null;
    priorExpense: string | null;
    priorNetIncome: string | null;
  };
  dimensionLabels: Record<string, DimensionValueLabel>;
  cubeDefinition: CubeDefinitionDTO | null;
  lastRefreshAt: string | null;
}

// ---------------------------------------------------------------------------
// Month-End Comparative Analysis
// ---------------------------------------------------------------------------

export interface MonthEndComparisonDTO {
  accountCode: string;
  accountName: string;
  accountType: string;
  periods: MonthEndPeriodDTO[];
}

export interface MonthEndPeriodDTO {
  fiscalYear: number;
  periodNumber: number;
  periodDebit: string;
  periodCredit: string;
  amountNet: string;
  closingDebit: string;
  closingCredit: string;
}

export interface MonthEndAnalysisFilters {
  entityCode: string;
  cubeCode?: string;
  bookCode?: BookCode;
  fiscalYear: number;
  periodsToCompare?: number; // default: 6
  accountTypes?: string[];
  groupBy?: PnLGroupBy;
  // Dimension filter
  costCenterValueId?: string;
  profitCenterValueId?: string;
  projectValueId?: string;
  regionValueId?: string;
}

// ---------------------------------------------------------------------------
// Dashboard Drilldown
// ---------------------------------------------------------------------------

export interface DrilldownRequest {
  entityCode: string;
  cubeCode: string;
  fiscalYear: number;
  periodNumber: number;
  bookCode?: BookCode;
  // Which dimension axis to drill into
  drillAxis: PnLGroupBy;
  // Current filter context (the "breadcrumb" of the drill path)
  parentFilters: Record<string, string>;
}

export interface DrilldownRowDTO {
  dimensionValueId: string;
  dimensionCode: string;
  dimensionName: string;
  periodDebit: string;
  periodCredit: string;
  amountNet: string;
  rowCount: number;
  hasChildren: boolean;
}

export interface DrilldownResultDTO {
  axis: PnLGroupBy;
  parentFilters: Record<string, string>;
  rows: DrilldownRowDTO[];
  totals: {
    periodDebit: string;
    periodCredit: string;
    amountNet: string;
  };
}

// ---------------------------------------------------------------------------
// Cube Refresh Run (admin/ops)
// ---------------------------------------------------------------------------

export interface CubeRefreshRunDTO {
  id: string;
  cubeCode: string;
  runType: CubeRefreshRunType;
  fiscalYear: number | null;
  periodNumber: number | null;
  bookCode: BookCode | null;
  rowsInserted: number;
  rowsUpdated: number;
  rowsDeleted: number;
  totalCubeRows: number | null;
  // Reconciliation fields
  glBalanceTotal: string | null;
  cubeTotal: string | null;
  variance: string | null;
  isReconciled: boolean | null;
  // Execution
  status: CubeRefreshStatus;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  errorMessage: string | null;
  triggerSource: CubeRefreshTrigger;
}

// ---------------------------------------------------------------------------
// Cube Status / Freshness
// ---------------------------------------------------------------------------

export type ReconciliationStatus = "OK" | "WARNING" | "FAILED" | "UNKNOWN";

export interface CubeStatusDTO {
  cubeLastBuiltAt: string | null;
  cubeLastFullRebuildAt: string | null;
  reconciliation: {
    status: ReconciliationStatus;
    isReconciled: boolean | null;
    variance: string | null;
    glBalanceTotal: string | null;
    cubeTotal: string | null;
    completedAt: string | null;
    errorMessage: string | null;
  } | null;
}

// ---------------------------------------------------------------------------
// Dimension Picker Metadata
// ---------------------------------------------------------------------------

export interface CubeDimensionDTO {
  code: string;
  label: string;
  groupByKey: string;
}

// ---------------------------------------------------------------------------
// Refresh trigger request (POST body)
// ---------------------------------------------------------------------------

export interface CubeRefreshRequest {
  cubeCode: string;
  entityCode: string;
  runType: "FULL_REBUILD" | "RECONCILIATION";
  fiscalYear?: number;
  periodNumber?: number;
}

// ---------------------------------------------------------------------------
// Report Presets
// ---------------------------------------------------------------------------

export type ReportPresetType = "pnl" | "drilldown" | "month_end" | "statement";
export type PresetScope = "SYSTEM" | "USER" | "SHARED";

export interface ReportPresetDTO {
  id: string;
  presetCode: string;
  presetName: string;
  description: string | null;
  reportType: ReportPresetType;
  scope: PresetScope;
  ownerPrincipalId: string | null;
  parameters: Record<string, unknown>;
  stateHash: string;
  isDefault: boolean;
  isPinned: boolean;
  version: number;
  createdAt: string;
  createdBy: string;
  updatedAt: string | null;
}

export interface ReportPresetCreateRequest {
  presetCode: string;
  presetName: string;
  description?: string;
  reportType: ReportPresetType;
  scope: PresetScope;
  parameters: Record<string, unknown>;
  isDefault?: boolean;
  isPinned?: boolean;
}

export interface ReportPresetUpdateRequest {
  presetName?: string;
  description?: string;
  parameters?: Record<string, unknown>;
  isDefault?: boolean;
  isPinned?: boolean;
  version: number; // optimistic concurrency
}

// ---------------------------------------------------------------------------
// Financial Statement Model
// ---------------------------------------------------------------------------

export type StatementType = "PNL" | "BALANCE_SHEET" | "CASH_FLOW" | "MGMT_PNL" | "CUSTOM";

export type StatementRowType =
  | "HEADING"
  | "LINE"
  | "SUBTOTAL"
  | "FORMULA"
  | "RATIO"
  | "SPACER";

export type SignPolicy =
  | "NATURAL"
  | "DEBIT_POSITIVE"
  | "CREDIT_POSITIVE"
  | "ABSOLUTE"
  | "INVERT";

export type DisplayStyle =
  | "NORMAL"
  | "BOLD"
  | "ITALIC"
  | "UNDERLINE"
  | "DOUBLE_LINE"
  | "SHADED";

export type EmphasisStyle =
  | "NONE"
  | "PRIMARY"
  | "SUCCESS"
  | "DANGER"
  | "MUTED";

export interface StatementDefinitionDTO {
  id: string;
  statementCode: string;
  name: string;
  description: string | null;
  statementType: StatementType;
  scope: string;
  bookCode: string | null;
  isActive: boolean;
  version: number;
}

export interface StatementRowDTO {
  rowCode: string;
  label: string;
  rowType: StatementRowType;
  depth: number;
  sortOrder: number;
  parentRowCode: string | null;
  displayStyle: DisplayStyle;
  signPolicy: SignPolicy;
  emphasisStyle: EmphasisStyle;
  formulaExpression: string | null;
  indentLevel: number;
  isExpandable: boolean;
  isVisible: boolean;
  showZero: boolean;
  // Amounts (MC-4: string)
  amountDebit: string;
  amountCredit: string;
  amountNet: string;
  priorDebit: string;
  priorCredit: string;
  priorNet: string;
  variance: string;
  variancePct: string | null;
  // Account detail
  mappedAccountCodes: string[] | null;
}

export type DiagnosticSeverity = "error" | "warning" | "info";

export interface StatementDiagnostic {
  code: string;
  severity: DiagnosticSeverity;
  rowCode: string | null;
  message: string;
}

export interface DiagnosticSummary {
  errorCount: number;
  warningCount: number;
  infoCount: number;
}

export interface StatementReportDTO {
  definition: StatementDefinitionDTO;
  rows: StatementRowDTO[];
  fiscalYear: number;
  periodFrom: number;
  periodTo: number;
  bookCode: string;
  cubeCode: string;
  diagnosticCount?: number;
  diagnosticSummary?: DiagnosticSummary;
  diagnostics?: StatementDiagnostic[];
}

export interface StatementReportFilters {
  entityCode: string;
  statementCode: string;
  fiscalYear: number;
  periodFrom?: number;
  periodTo?: number;
  bookCode?: string;
  cubeCode?: string;
}

// ---------------------------------------------------------------------------
// Statement Snapshot (point-in-time capture at period close)
// ---------------------------------------------------------------------------

export type SnapshotTriggerContext = "MANUAL" | "PERIOD_CLOSE" | "SCHEDULED";
export type SnapshotStatus = "DRAFT" | "REVIEWED" | "APPROVED" | "FINALIZED" | "PUBLISHED" | "SUPERSEDED";

export interface StatementSnapshotMeta {
  instanceId: string;
  status: SnapshotStatus;
  triggerContext: SnapshotTriggerContext;
  snapshotHash: string | null;
  periodStatusAtCapture: string | null;
  generatedAt: string;
  glBalanceAsOf: string | null;
  cubeRefreshRunId: string | null;
  finalizedAt: string | null;
  publishedAt: string | null;
  totalLineCount: number;
  diagnosticCount: number;
  diagnosticSummary: DiagnosticSummary | null;
  notes: string | null;
}

export interface StatementSnapshotDTO extends StatementReportDTO {
  snapshot: StatementSnapshotMeta;
}

export interface StatementSnapshotFilters {
  entityCode: string;
  statementCode: string;
  fiscalYear: number;
  periodFrom?: number;
  periodTo?: number;
  bookCode?: string;
  instanceId?: string;
  triggerContext?: SnapshotTriggerContext;
}

// ---------------------------------------------------------------------------
// Statement Comparison (live vs snapshot, snapshot vs snapshot)
// ---------------------------------------------------------------------------

export type CompareChangeType = "UNCHANGED" | "CHANGED" | "ADDED" | "REMOVED";

/** Client-side filter for comparison row visibility */
export type ChangeFilter =
  | "ALL"
  | "CHANGED"
  | "ADDED"
  | "REMOVED"
  | "CHANGED_OR_NEW";

export interface CompareSourceInfo {
  type: "live" | "snapshot";
  instanceId: string | null;
  snapshotHash: string | null;
  generatedAt: string | null;
  triggerContext: SnapshotTriggerContext | null;
  definitionVersion: number | null;
  /** Diagnostic summary captured at snapshot time (null for live sources) */
  diagnosticCount: number;
  diagnosticSummary: DiagnosticSummary | null;
}

export interface CompareRowDTO {
  rowCode: string;
  label: string;
  rowType: StatementRowType;
  indentLevel: number;
  sortOrder: number;
  displayStyle: DisplayStyle;
  changeType: CompareChangeType;
  // Base amounts (MC-4: string, "0" if ADDED)
  baseNet: string;
  basePriorNet: string;
  // Compare amounts (MC-4: string, "0" if REMOVED)
  compareNet: string;
  comparePriorNet: string;
  // Delta
  deltaNet: string;
  deltaPriorNet: string;
  deltaPct: string | null;
}

export interface StatementCompareDTO {
  definition: StatementDefinitionDTO;
  base: CompareSourceInfo;
  compare: CompareSourceInfo;
  rows: CompareRowDTO[];
  summary: {
    totalRows: number;
    changedRows: number;
    addedRows: number;
    removedRows: number;
    unchangedRows: number;
    totalDeltaNet: string;
  };
}

export interface StatementCompareFilters {
  entityCode: string;
  statementCode: string;
  fiscalYear: number;
  periodFrom?: number;
  periodTo?: number;
  bookCode?: string;
  cubeCode?: string;
  /** "live" or a snapshot instanceId */
  baseSource: string;
  /** "live" or a snapshot instanceId */
  compareSource: string;
}
