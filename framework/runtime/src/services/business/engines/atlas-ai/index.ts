// framework/runtime/src/services/business/engines/atlas-ai/index.ts

import type { Container } from "../../../../kernel/container.js";
import type { RuntimeModule } from "../../../types.js";

export const atlasAiModule: RuntimeModule = {
    name: "engine.atlasAi",

    register(c: Container) {
        // Register AI model registry, prediction, action repos and services
    },

    contribute(c: Container) {
        // Register drift monitoring jobs, model retraining triggers
    },
};

// Re-export domain types
export type {
    AIModelRegistry, CreateModelInput, ModelType, CapabilityLevel, ModelStatus,
    AIPrediction, CreatePredictionInput, PredictionType,
    AIAction, CreateActionInput, ActionStatus,
    AIDriftMonitor,
} from "./domain/types.js";
export { AUTONOMOUS_CONFIDENCE_THRESHOLD, DEFAULT_REVERSAL_WINDOW_MINUTES, MODEL_TRANSITIONS } from "./domain/types.js";

// Re-export services
export type { ActionService, AIActionRepo } from "./services/action-service.js";
export { DefaultActionService } from "./services/action-service.js";
