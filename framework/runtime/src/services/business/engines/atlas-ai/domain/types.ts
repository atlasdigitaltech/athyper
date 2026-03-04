// framework/runtime/src/services/business/engines/atlas-ai/domain/types.ts

// --- Model Registry ---

export type ModelType = "CLASSIFICATION" | "REGRESSION" | "ANOMALY" | "RECOMMENDATION" | "NLP";
export type CapabilityLevel = "L1" | "L2" | "L3";
export type ModelStatus = "TRAINING" | "VALIDATING" | "DEPLOYED" | "DEPRECATED";
export type PredictionType = "RECOMMENDATION" | "ANOMALY" | "CLASSIFICATION" | "FORECAST";
export type ActionStatus = "PROPOSED" | "EXECUTED" | "REVERSED" | "REJECTED";

export interface AIModelRegistry {
    id: string;
    tenantId: string;
    modelCode: string;
    modelName: string;
    modelVersion: string;
    modelType: ModelType;
    targetEngine: string;
    capabilityLevel: CapabilityLevel;
    status: ModelStatus;
    config: Record<string, unknown>;
    performanceMetrics: Record<string, unknown>;
    deployedAt: Date | null;
    deployedBy: string | null;
    lastPredictionAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export interface CreateModelInput {
    tenantId: string;
    modelCode: string;
    modelName: string;
    modelVersion: string;
    modelType: ModelType;
    targetEngine: string;
    capabilityLevel: CapabilityLevel;
    config?: Record<string, unknown>;
}

// --- Prediction ---

export interface AIPrediction {
    id: string;
    tenantId: string;
    modelId: string;
    txnId: string | null;
    targetEngine: string;
    predictionType: PredictionType;
    inputFeatures: Record<string, unknown>;
    output: Record<string, unknown>;
    confidence: number;
    reasoningChain: string;
    wasAccepted: boolean | null;
    acceptedBy: string | null;
    acceptedAt: Date | null;
    createdAt: Date;
}

export interface CreatePredictionInput {
    tenantId: string;
    modelId: string;
    txnId?: string;
    targetEngine: string;
    predictionType: PredictionType;
    inputFeatures: Record<string, unknown>;
    output: Record<string, unknown>;
    confidence: number;
    reasoningChain: string;
}

// --- Action ---

export interface AIAction {
    id: string;
    tenantId: string;
    modelId: string;
    txnId: string | null;
    targetEngine: string;
    actionType: string;
    actionPayload: Record<string, unknown>;
    confidence: number;
    reasoningChain: string;
    status: ActionStatus;
    executedAt: Date | null;
    reversalWindowExpiresAt: Date | null;
    reversedAt: Date | null;
    reversedBy: string | null;
    createdAt: Date;
}

export interface CreateActionInput {
    tenantId: string;
    modelId: string;
    txnId?: string;
    targetEngine: string;
    actionType: string;
    actionPayload: Record<string, unknown>;
    confidence: number;
    reasoningChain: string;
    reversalWindowMinutes?: number;
}

// --- Drift Monitor ---

export interface AIDriftMonitor {
    id: string;
    tenantId: string;
    modelId: string;
    monitoringDate: Date;
    metricName: string;
    metricValue: number;
    baselineValue: number;
    driftDetected: boolean;
    alertSent: boolean;
    createdAt: Date;
}

// --- Governance Constants (Section 17.2) ---

/** Minimum confidence for autonomous action (L3) */
export const AUTONOMOUS_CONFIDENCE_THRESHOLD = 0.95;

/** Default reversal window in minutes */
export const DEFAULT_REVERSAL_WINDOW_MINUTES = 60;

/** Model status transitions */
export const MODEL_TRANSITIONS: Record<ModelStatus, ModelStatus[]> = {
    TRAINING: ["VALIDATING"],
    VALIDATING: ["DEPLOYED", "TRAINING"],
    DEPLOYED: ["DEPRECATED"],
    DEPRECATED: [],
};
