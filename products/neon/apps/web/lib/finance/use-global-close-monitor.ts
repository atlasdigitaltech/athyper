"use client";

// lib/finance/use-global-close-monitor.ts
//
// Data-fetching hook for the Atlas Global Close Monitor API.
// Returns multi-entity close intelligence for a parent entity
// and all its subsidiaries within a given fiscal period.

import { useState, useEffect, useCallback, useRef } from "react";

import { finGet } from "./fetcher";

// ---------------------------------------------------------------------------
// Types (mirrors the global-close API response shape)
// ---------------------------------------------------------------------------

export interface GlobalCloseEntityRiskDriver {
  source: string;
  label: string;
  points: number;
  count: number;
}

export interface GlobalCloseEntityRiskScore {
  score: number;
  level: "HIGH" | "MEDIUM" | "LOW" | "NONE";
  drivers: GlobalCloseEntityRiskDriver[];
}

export interface GlobalCloseEntityReadiness {
  completionPct: string;
  readinessScore: string;
  slaStatus: string;
  openExceptions: number;
  criticalExceptions: number;
  daysElapsed: string;
  daysRemaining: string;
}

export interface GlobalCloseEntityRelease {
  releaseCode: string;
  status: string;
  isCleanClose: boolean;
  overrideCount: number;
  readinessScore: string;
  releaseType: string;
}

export interface GlobalCloseEntityCalendar {
  softCloseTarget: string;
  hardCloseTarget: string;
  closeType: string;
}

export interface GlobalCloseEntity {
  entityCode: string;
  entityName: string;
  entityType: string;
  countryCode: string;
  functionalCurrency: string;
  consolidationMethod: string;
  ownershipPct: string;
  depth: number;

  periodStatus: string | null;
  closeStatus: string | null;
  closeRunNumber: number | null;
  elapsedDays: number | null;

  readiness: GlobalCloseEntityReadiness | null;

  anomalies: {
    activeCount: number;
    criticalCount: number;
    warningCount: number;
  };

  riskSignals: {
    activeCount: number;
    highCriticalCount: number;
  };

  exceptions: {
    openCount: number;
    criticalCount: number;
    gateBlockerCount: number;
  };

  reconciliation: {
    totalSessions: number;
    completedSessions: number;
    isComplete: boolean;
  };

  tasks: {
    totalTasks: number;
    completedTasks: number;
    failedTasks: number;
    blockedTasks: number;
  };

  release: GlobalCloseEntityRelease | null;
  calendar: GlobalCloseEntityCalendar | null;
  riskScore: GlobalCloseEntityRiskScore;
}

export interface GlobalCloseICSettlement {
  sourceEntity: string;
  destEntity: string;
  totalTxns: number;
  settledCount: number;
  pendingCount: number;
}

export interface GlobalCloseDelayedEntity {
  entityCode: string;
  entityName: string;
  elapsedDays: number;
  closeStatus: string;
  riskScore: number;
}

export interface GlobalCloseCriticalPath {
  entityCode: string;
  entityName: string;
  riskScore: number;
  topDrivers: GlobalCloseEntityRiskDriver[];
}

export interface GlobalCloseConsolidated {
  entityCount: number;
  groupRiskScore: number;
  groupRiskLevel: "HIGH" | "MEDIUM" | "LOW" | "NONE";
  statusDistribution: Record<string, number>;
  delayedCloseRanking: GlobalCloseDelayedEntity[];
  criticalPathEntity: GlobalCloseCriticalPath | null;
  totalAnomalies: number;
  totalCriticalAnomalies: number;
  totalOpenExceptions: number;
  totalGateBlockers: number;
}

// ---------------------------------------------------------------------------
// Phase 2 types
// ---------------------------------------------------------------------------

export interface CrossEntityRepeatedPattern {
  anomalyType: string;
  entityCount: number;
  totalOccurrences: number;
  entities: string[];
}

export interface CrossEntityHotspotAccount {
  accountCode: string;
  accountName: string;
  entityCount: number;
  anomalyCount: number;
  entities: string[];
}

export interface CrossEntityAnomalies {
  repeatedPatterns: CrossEntityRepeatedPattern[];
  hotspotAccounts: CrossEntityHotspotAccount[];
  severityDistribution: { CRITICAL: number; WARNING: number; INFO: number };
  totalAcrossGroup: number;
}

export interface ICAgingBuckets {
  current: number;
  days7: number;
  days14: number;
  days30: number;
  over30: number;
}

export interface ICNetExposure {
  source: string;
  dest: string;
  netAmount: string;
  currency: string;
  pendingCount: number;
}

export interface ICIntelligence {
  agingBuckets: ICAgingBuckets;
  agingAmounts: { current: string; days7: string; days14: string; days30: string; over30: string };
  netExposure: ICNetExposure[];
  exceptionPairs: ICNetExposure[];
  summary: {
    totalTransactions: number;
    pendingTransactions: number;
    totalAmount: string;
    settledAmount: string;
    pendingAmount: string;
    nettedCount: number;
  };
}

export interface EntityProjection {
  entityCode: string;
  entityName: string;
  closeStatus: string | null;
  elapsedDays: number | null;
  projectedRemainingDays: number;
  projectedTotalDays: number;
  riskScore: number;
  willBreachSla: boolean;
  hardCloseTarget: string | null;
}

export interface EnhancedCriticalPath {
  projectedGroupCompletionDays: number | null;
  slowestEntity: EntityProjection | null;
  blockingChain: EntityProjection[];
  entityProjections?: EntityProjection[];
  slaBreachCount?: number;
  delayExplanation: string;
}

export interface OverrideConcentration {
  byEntity: Array<{ entityCode: string; entityName: string; overrideCount: number }>;
  totalOverrides: number;
  entitiesWithOverrides: number;
  concentrationRisk: "HIGH" | "MEDIUM" | "LOW" | "NONE";
}

export interface GroupNarrative {
  dashboardSummary: string;
  cfoBrief: string;
  delayExplanation: string;
  generatedAt: string;
  provider: "template";
  deterministic: boolean;
}

// ---------------------------------------------------------------------------
// Phase 3 types — Global Close Forecasting
// ---------------------------------------------------------------------------

export interface EntityForecast {
  entityCode: string;
  entityName: string;
  historicalAvgDays: number | null;
  historicalStddev: number | null;
  historicalP75Days: number | null;
  historicalP95Days: number | null;
  historicalPeriodCount: number;
  currentPaceDays: number | null;
  predictedDays: number;
  confidence: number;
  hardBreachPct: number | null;
  slaBreachRate: number | null;
  trend: "improving" | "stable" | "worsening";
  elapsedDays: number | null;
  completionPct: number;
}

export interface GroupForecast {
  entityForecasts: EntityForecast[];
  group: {
    predictedCompletionDays: number | null;
    confidence: number | null;
    slowestEntity: { entityCode: string; entityName: string; predictedDays: number } | null;
    entityCount: number;
  };
  breachDistribution: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  trajectorySummary: {
    improving: number;
    stable: number;
    worsening: number;
  };
}

// ---------------------------------------------------------------------------
// Phase 4 types — Longitudinal Intelligence
// ---------------------------------------------------------------------------

export interface EntityBehaviorProfile {
  entityCode: string;
  entityName: string;
  avgCloseDays: number;
  medianCloseDays: number;
  periodCount: number;
  slaBreachCount: number;
  slaBreachRate: number;
  trend: "improving" | "stable" | "worsening";
}

export interface PersistentAnomalyPattern {
  anomalyType: string;
  entityCount: number;
  periodCount: number;
  totalOccurrences: number;
  entities: string[];
  isPersistent: boolean;
}

export interface EntityTrend {
  entityCode: string;
  entityName: string;
  closeSpeedTrend: "improving" | "stable" | "worsening";
  anomalyTrend: "improving" | "stable" | "worsening";
  overallDirection: "improving" | "stable" | "needs_attention";
  periodCount: number;
  latestAnomalyCount: number;
}

export interface DelayExplanation {
  entityCode: string;
  entityName: string;
  explanation: string;
  avgCloseDays: number;
  slaBreachRate: number;
}

export interface LongitudinalIntelligence {
  entityProfiles: EntityBehaviorProfile[];
  persistentPatterns: PersistentAnomalyPattern[];
  entityTrends: EntityTrend[];
  delayExplanations: DelayExplanation[];
}

export interface GlobalCloseMonitorData {
  parentEntity: { code: string; name: string };
  fiscalYear: number;
  periodNumber: number;
  entities: GlobalCloseEntity[];
  icSettlement: GlobalCloseICSettlement[];
  consolidated: GlobalCloseConsolidated;
  // Phase 2
  crossEntityAnomalies: CrossEntityAnomalies;
  icIntelligence: ICIntelligence;
  enhancedCriticalPath: EnhancedCriticalPath;
  overrideConcentration: OverrideConcentration;
  groupNarrative: GroupNarrative;
  // Phase 3
  groupForecast: GroupForecast;
  // Phase 4
  longitudinalIntelligence: LongitudinalIntelligence;
  computedAt: string;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseGlobalCloseMonitorParams {
  parentEntityCode: string;
  fiscalYear: number;
  periodNumber: number;
}

export interface UseGlobalCloseMonitorResult {
  data: GlobalCloseMonitorData | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useGlobalCloseMonitor(
  params: UseGlobalCloseMonitorParams | null,
): UseGlobalCloseMonitorResult {
  const [data, setData] = useState<GlobalCloseMonitorData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const refreshCounter = useRef(0);

  const paramKey = params
    ? `${params.parentEntityCode}:${params.fiscalYear}:${params.periodNumber}`
    : "";

  const fetchData = useCallback(async () => {
    if (!params) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const url = `/api/fin/atlas/global-close?parentEntityCode=${encodeURIComponent(params.parentEntityCode)}&fiscalYear=${params.fiscalYear}&periodNumber=${params.periodNumber}`;
      const result = await finGet<{ data: GlobalCloseMonitorData }>(url, controller.signal);
      if (!controller.signal.aborted) {
        setData(result.data);
      }
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      if (!controller.signal.aborted) {
        setError(err?.message ?? "Failed to load global close monitor");
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [paramKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchData();
    return () => abortRef.current?.abort();
  }, [fetchData]);

  const refresh = useCallback(() => {
    refreshCounter.current += 1;
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refresh };
}
