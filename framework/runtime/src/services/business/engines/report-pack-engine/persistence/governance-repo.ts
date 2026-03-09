// framework/runtime/src/services/business/engines/report-pack-engine/persistence/governance-repo.ts
//
// Repository interfaces for Pack Governance: Certification, Distribution, Activity, Forecast.
// Implementations are in the DB adapter layer.

import type {
  PackCertification,
  CertificationStatus,
  PackDistribution,
  PackDistributionRecipient,
  DistributionStatus,
  RecipientDeliveryStatus,
  PackActivity,
  PackActivityType,
  ForecastScenario,
  ForecastLine,
  ScenarioStatus,
} from "../domain/types.js";

// ---------------------------------------------------------------------------
// Certification Repository
// ---------------------------------------------------------------------------

export interface CertificationRepo {
  create(input: {
    tenantId: string;
    packInstanceId: string;
    preparedBy?: string | null;
    preparedByName?: string | null;
  }): Promise<PackCertification>;

  getByPackInstance(packInstanceId: string): Promise<PackCertification | null>;

  updateStatus(
    id: string,
    status: CertificationStatus,
    actorId: string,
    actorName: string,
    notes?: string | null,
  ): Promise<PackCertification>;

  linkApprovalInstance(
    id: string,
    approvalInstanceId: string,
  ): Promise<void>;

  updateDisclosureNotes(
    id: string,
    disclosureNotes: string,
  ): Promise<void>;
}

// ---------------------------------------------------------------------------
// Distribution Repository
// ---------------------------------------------------------------------------

export interface DistributionRepo {
  create(input: {
    tenantId: string;
    packInstanceId: string;
    distributionCode: string;
    name: string;
    description?: string | null;
    format: string;
    certificationId?: string | null;
    distributedBy?: string | null;
    secureLinkToken?: string | null;
    linkExpiresAt?: Date | null;
    notes?: string | null;
  }): Promise<PackDistribution>;

  getById(id: string): Promise<PackDistribution | null>;

  listByPackInstance(packInstanceId: string): Promise<PackDistribution[]>;

  updateStatus(
    id: string,
    status: DistributionStatus,
  ): Promise<PackDistribution>;

  updateCounts(
    id: string,
    counts: {
      recipientCount?: number;
      deliveredCount?: number;
      viewedCount?: number;
      downloadedCount?: number;
    },
  ): Promise<void>;

  recall(
    id: string,
    recalledBy: string,
    reason: string,
  ): Promise<PackDistribution>;

  // Recipients
  addRecipient(input: {
    distributionId: string;
    recipientId?: string | null;
    recipientName: string;
    recipientEmail?: string | null;
    recipientRole?: string | null;
  }): Promise<PackDistributionRecipient>;

  getRecipients(distributionId: string): Promise<PackDistributionRecipient[]>;

  updateRecipientStatus(
    id: string,
    status: RecipientDeliveryStatus,
  ): Promise<void>;

  recordView(
    recipientId: string,
  ): Promise<void>;

  recordDownload(
    recipientId: string,
  ): Promise<void>;

  // Download log
  logDownload(input: {
    tenantId: string;
    distributionId: string;
    recipientId?: string | null;
    eventType: "VIEW" | "DOWNLOAD";
    format?: string | null;
    ipAddress?: string | null;
    userAgent?: string | null;
  }): Promise<void>;
}

// ---------------------------------------------------------------------------
// Activity Repository
// ---------------------------------------------------------------------------

export interface PackActivityRepo {
  log(input: {
    tenantId: string;
    entityCode: string;
    packInstanceId: string;
    activityType: PackActivityType;
    actorType?: "user" | "system" | "approval_engine" | "scheduler";
    actorId?: string | null;
    message?: string | null;
    payload?: Record<string, unknown>;
  }): Promise<PackActivity>;

  listByPackInstance(
    packInstanceId: string,
    limit?: number,
  ): Promise<PackActivity[]>;

  listByTenant(
    tenantId: string,
    entityCode: string,
    filters?: {
      activityType?: PackActivityType;
      fromDate?: Date;
      toDate?: Date;
    },
    limit?: number,
  ): Promise<PackActivity[]>;
}

// ---------------------------------------------------------------------------
// Forecast Repository
// ---------------------------------------------------------------------------

export interface ForecastRepo {
  // Scenarios
  createScenario(input: {
    tenantId: string;
    entityCode: string;
    scenarioCode: string;
    name: string;
    description?: string | null;
    scenarioType: string;
    baseBudgetCode?: string | null;
    assumptions?: Record<string, unknown>;
    createdBy?: string | null;
  }): Promise<ForecastScenario>;

  getScenarioById(tenantId: string, id: string): Promise<ForecastScenario | null>;

  listScenarios(
    tenantId: string,
    entityCode: string,
    filters?: { scenarioType?: string; status?: ScenarioStatus },
  ): Promise<ForecastScenario[]>;

  updateScenarioStatus(
    id: string,
    status: ScenarioStatus,
  ): Promise<ForecastScenario>;

  // Forecast lines
  upsertLines(lines: Array<{
    tenantId: string;
    entityCode: string;
    scenarioId: string;
    forecastCode: string;
    forecastVersion: number;
    accountId: string;
    fiscalYear: number;
    periodNumber: number;
    bookCode: string;
    dimensionSetId?: string | null;
    forecastAmount: string;
    driverType?: string | null;
    driverValue?: string | null;
    driverFormula?: string | null;
    createdBy?: string | null;
  }>): Promise<void>;

  getLines(
    tenantId: string,
    entityCode: string,
    filters: {
      scenarioId: string;
      fiscalYear: number;
      periodFrom: number;
      periodTo: number;
      bookCode?: string;
      forecastCode?: string;
      accountId?: string;
    },
  ): Promise<ForecastLine[]>;

  /** Calls fin.resolve_statement_forecast() */
  resolveStatementForecast(
    tenantId: string,
    entityCode: string,
    definitionId: string,
    fiscalYear: number,
    periodFrom: number,
    periodTo: number,
    scenarioId: string,
    bookCode?: string,
    forecastCode?: string | null,
    dimensionSetId?: string | null,
  ): Promise<Array<{
    lineCode: string;
    accountId: string;
    accountCode: string;
    forecastAmount: string;
  }>>;
}
