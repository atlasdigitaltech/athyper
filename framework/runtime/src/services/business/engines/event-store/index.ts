// framework/runtime/src/services/business/engines/event-store/index.ts

import type { Container } from "../../../../kernel/container.js";
import type { RuntimeModule } from "../../../types.js";

export const eventStoreModule: RuntimeModule = {
  name: "engine.eventStore",

  register(c: Container) {
    // Register event store repositories and services
    // Implementations are bound at bootstrap time based on adapter configuration
  },

  contribute(c: Container) {
    // Register health checks, projections, and background jobs
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
} from "./services/tiering-service.js";
export { DefaultTieringService } from "./services/tiering-service.js";

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
