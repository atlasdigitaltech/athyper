// framework/runtime/src/services/business/engines/commitment-engine/index.ts

import type { Container } from "../../../../kernel/container.js";
import type { RuntimeModule } from "../../../types.js";

export const commitmentEngineModule: RuntimeModule = {
  name: "engine.commitment",

  register(c: Container) {
    // Register commitment repositories and services
  },

  contribute(c: Container) {
    // Register health checks, event consumers, background jobs
  },
};

// Re-export domain types
export type {
  Commitment,
  CreateCommitmentInput,
  CommitmentDocType,
  CommitmentType,
  CommitmentStatus,
  CommitmentLineItem,
  RenewalTerms,
  CommitmentSchedule,
  CreateScheduleInput,
  ScheduleStatus,
  CommitmentFulfillment,
  CreateFulfillmentInput,
  FulfillmentType,
  SchedulePattern,
} from "./domain/types.js";
export { COMMITMENT_TRANSITIONS } from "./domain/types.js";

// Re-export services
export type { CommitmentService } from "./services/commitment-service.js";
export { DefaultCommitmentService } from "./services/commitment-service.js";

// Re-export persistence interfaces
export type { CommitmentRepo } from "./persistence/commitment-repo.js";
export type { CommitmentScheduleRepo } from "./persistence/schedule-repo.js";
export type { CommitmentFulfillmentRepo } from "./persistence/fulfillment-repo.js";

// Re-export domain logic
export {
  isValidCommitmentTransition,
  determineStatusFromFulfillment,
} from "./domain/lifecycle.js";
export { generateScheduleEntries } from "./domain/schedule-generator.js";
export {
  matchFulfillmentToSchedule,
  calculateFulfilledAmount,
} from "./domain/fulfillment-matcher.js";
