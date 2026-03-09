// framework/runtime/src/services/business/engines/atlas-ai/persistence/anomaly-repo.ts

import type {
  AnomalyBaseline,
  AtlasAnomaly,
  AnomalyStatus,
  BaselineMetricType,
} from "../domain/anomaly-types.js";

// ---------------------------------------------------------------------------
// Baseline repository
// ---------------------------------------------------------------------------

export interface AnomalyBaselineRepo {
  /** Upsert a baseline (ON CONFLICT update) */
  upsert(baseline: Omit<AnomalyBaseline, "id" | "computedAt">): Promise<AnomalyBaseline>;

  /** Get baseline for a specific account+metric */
  get(
    tenantId: string,
    entityCode: string,
    accountId: string,
    metricType: BaselineMetricType,
    bookCode?: string,
  ): Promise<AnomalyBaseline | null>;

  /** List all baselines for an entity */
  listByEntity(
    tenantId: string,
    entityCode: string,
    bookCode?: string,
  ): Promise<AnomalyBaseline[]>;
}

// ---------------------------------------------------------------------------
// Anomaly repository
// ---------------------------------------------------------------------------

export interface AnomalyRepo {
  /** Create a new anomaly (ON CONFLICT returns existing) */
  upsert(anomaly: Omit<AtlasAnomaly, "id" | "createdAt" | "updatedAt">): Promise<AtlasAnomaly>;

  /** Get anomaly by ID */
  getById(tenantId: string, id: string): Promise<AtlasAnomaly | null>;

  /** List active anomalies for a period */
  listActive(
    tenantId: string,
    entityCode: string,
    fiscalYear: number,
    periodNumber: number,
  ): Promise<AtlasAnomaly[]>;

  /** List anomalies with optional filters */
  list(
    tenantId: string,
    entityCode: string,
    filters?: {
      fiscalYear?: number;
      periodNumber?: number;
      status?: AnomalyStatus[];
      severity?: string[];
      anomalyType?: string[];
      accountId?: string;
    },
  ): Promise<AtlasAnomaly[]>;

  /** Transition anomaly status */
  updateStatus(
    tenantId: string,
    id: string,
    status: AnomalyStatus,
    updates?: {
      acknowledgedBy?: string;
      acknowledgedAt?: Date;
      resolvedBy?: string;
      resolvedAt?: Date;
      resolutionNotes?: string;
    },
  ): Promise<AtlasAnomaly>;

  /** Link anomaly to a risk signal */
  linkRiskSignal(
    tenantId: string,
    anomalyId: string,
    riskSignalId: string,
  ): Promise<void>;
}
