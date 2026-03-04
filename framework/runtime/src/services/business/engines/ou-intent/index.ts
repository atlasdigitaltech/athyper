// framework/runtime/src/services/business/engines/ou-intent/index.ts

import type { Container } from "../../../../kernel/container.js";
import type { RuntimeModule } from "../../../types.js";

export const ouIntentModule: RuntimeModule = {
  name: "engine.ouIntent",

  register(c: Container) {
    // Register OU and Intent repositories and services
  },

  contribute(c: Container) {
    // Register health checks and event consumers
  },
};

// Re-export domain types
export type {
  OperatingUnit,
  CreateOperatingUnitInput,
  UpdateOperatingUnitInput,
  OUStatus,
  BusinessIntent,
  CreateBusinessIntentInput,
  IntentDomain,
  IntentVisibility,
  OUIntentMapping,
  CreateOUIntentMappingInput,
  ResolvedOUDefaults,
} from "./domain/types.js";
export { OU_TRANSITIONS } from "./domain/types.js";

// Re-export services
export type { OperatingUnitService } from "./services/operating-unit-service.js";
export { DefaultOperatingUnitService } from "./services/operating-unit-service.js";
export type { BusinessIntentService } from "./services/business-intent-service.js";
export { DefaultBusinessIntentService } from "./services/business-intent-service.js";
export type { OUIntentMappingService } from "./services/ou-intent-mapping-service.js";
export { DefaultOUIntentMappingService } from "./services/ou-intent-mapping-service.js";

// Re-export persistence interfaces
export type { OperatingUnitRepo } from "./persistence/operating-unit-repo.js";
export type { BusinessIntentRepo } from "./persistence/business-intent-repo.js";
export type { OUIntentMappingRepo } from "./persistence/ou-intent-mapping-repo.js";

// Re-export domain logic
export {
  isValidOUTransition,
  getAllowedTransitions,
} from "./domain/ou-lifecycle.js";
export { resolveDefaults } from "./domain/inheritance-resolver.js";
