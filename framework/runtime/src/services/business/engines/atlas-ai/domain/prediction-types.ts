// framework/runtime/src/services/business/engines/atlas-ai/domain/prediction-types.ts
//
// Atlas AI Phase 2 — Predictive Analytics domain types.

export type AtlasPredictionType =
  | "CLOSE_DURATION"
  | "RELEASE_READINESS"
  | "RECON_COMPLETION";

export interface CloseDurationPrediction {
  expectedCloseDays: string;     // MC-4: numeric as string
  confidencePercent: number;
  historicalAvgDays: string;
  currentProgressPercent: number;
  criticalPathMinutes: number | null;
  factors: {
    taskCompletionRate: number;
    riskSignalCount: number;
    reconCompletionRate: number;
    historicalCloseDays: number[];
  };
}

export interface ReleaseReadinessPrediction {
  probability: number;            // 0.0 – 1.0
  confidencePercent: number;
  blockers: string[];
  factors: {
    taskCompletionRate: number;
    activeRiskSignals: number;
    criticalAnomalies: number;
    reconComplete: boolean;
    consistencyPassing: boolean;
  };
}

export interface ReconCompletionPrediction {
  expectedHours: string;          // MC-4: numeric as string
  confidencePercent: number;
  sessionsRemaining: number;
  historicalAvgHours: string;
  factors: {
    totalSessions: number;
    completedSessions: number;
    avgMatchRate: number;
    historicalCompletionHours: number[];
  };
}

export interface PredictionComputeInput {
  tenantId: string;
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
}

export interface PredictionComputeResult {
  closeDuration: CloseDurationPrediction | null;
  releaseReadiness: ReleaseReadinessPrediction | null;
  reconCompletion: ReconCompletionPrediction | null;
}
