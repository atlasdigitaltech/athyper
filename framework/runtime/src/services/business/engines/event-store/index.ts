// framework/runtime/src/services/business/engines/event-store/index.ts

import type { Container } from "../../../../kernel/container.js";
import type { RuntimeModule } from "../../../types.js";

export const eventStoreModule: RuntimeModule = {
  name: "engine.eventStore",

  register(c: Container) {
    // Register event store repositories and services
    // Implementations are bound at bootstrap time based on adapter configuration
  },

  async contribute(c: Container) {
    // Register health checks, projections, and background jobs

    // Schedule tiering job: weekly at 4 AM UTC on Sundays
    // Reads policy from evt.data_tiering_policy, checks legal hold from
    // core.data_retention_policy, and executes HOT→WARM→COLD transitions.
    try {
      const { TOKENS } = await import("../../../../kernel/tokens.js");
      const jobRegistry = await c.resolve<any>(TOKENS.jobRegistry);
      if (jobRegistry?.addSchedule) {
        jobRegistry.addSchedule({
          name: "event-store-tiering",
          cron: "0 4 * * 0", // Weekly at 4 AM UTC on Sundays
          jobName: "event-store-tiering",
        });
      }
    } catch {
      // Job registry not available — tiering runs on-demand only
    }
  },
};

// Re-export domain types
export type {
  UniversalEventEnvelope,
  DocType,
  ActorType,
  PartitionDomain,
  EventQuery,
  EventPage,
  ProjectionRegistration,
  ProjectionCheckpoint,
  ProjectionSnapshot,
  EventTier,
  EventTypeDefinition,
} from "./domain/types.js";

// Re-export services
export type {
  EventPublisher,
  PublishEventInput,
} from "./services/event-publisher.js";
export { DefaultEventPublisher } from "./services/event-publisher.js";
export type {
  EventConsumer,
  EventHandler,
  ConsumerSubscription,
} from "./services/event-consumer.js";
export { DefaultEventConsumer } from "./services/event-consumer.js";
export type { ProjectionManager } from "./services/projection-manager.js";
export { DefaultProjectionManager } from "./services/projection-manager.js";
export type {
  TieringService,
  TieringConfig,
  ResolvedTieringPolicy,
} from "./services/tiering-service.js";
export {
  DefaultTieringService,
  policyToConfig,
} from "./services/tiering-service.js";

// Re-export persistence interfaces
export type { EventRepo } from "./persistence/event-repo.js";
export type { SnapshotRepo } from "./persistence/snapshot-repo.js";
export type { CheckpointRepo } from "./persistence/checkpoint-repo.js";
export type { ProjectionRegistryRepo } from "./persistence/projection-registry-repo.js";
export type { SequenceCounterRepo } from "./persistence/sequence-counter-repo.js";

// Re-export domain utilities
export {
  hashPayload,
  verifyHash,
  computeChainHash,
  verifyChain,
} from "./domain/hash-chain.js";
export {
  computePartitionKey,
  parsePartitionKey,
  PartitionKeys,
} from "./domain/partition-strategy.js";
export * as EventCatalog from "./domain/event-catalog.js";
