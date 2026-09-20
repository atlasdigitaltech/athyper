import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { EntityDescriptorCoordinate, EntityRuntimeDescriptor, EntityRuntimePageIntentV1 } from "./descriptors.js";
import type { EntityRuntimeBootstrapV1 } from "@athyper/contract-platform-entity-runtime";

export interface MetadataReader {
  getEntityDescriptor(context: VerifiedRequestContext, entityCode: string): Promise<EntityRuntimeDescriptor | null>;
  /** Optional until the entity-runtime routes are introduced. This port defines the
   * browser-safe bootstrap shape without registering an endpoint in Phase 1. */
  getEntityRuntimeBootstrap?(
    context: VerifiedRequestContext,
    entityCode: string,
    intent: EntityRuntimePageIntentV1,
  ): Promise<EntityRuntimeBootstrapV1 | null>;
}

/** Plane-local projection reader. Implementations must not call Athyper at request time. */
export interface EntityDescriptorRepository {
  findActive(coordinate: EntityDescriptorCoordinate): Promise<EntityRuntimeDescriptor | null>;
}

export interface EntityDescriptorCache {
  get(coordinate: EntityDescriptorCoordinate): Promise<EntityRuntimeDescriptor | null | undefined>;
  set(coordinate: EntityDescriptorCoordinate, descriptor: EntityRuntimeDescriptor | null, ttlMs: number): Promise<void>;
  invalidate(coordinate: EntityDescriptorCoordinate): Promise<void>;
}

/** Durable publication event consumed independently by every runtime plane. */
export interface MetadataGenerationEvent {
  readonly eventId: string;
  readonly planeKey: EntityDescriptorCoordinate["planeKey"];
  readonly tenantId: string | null;
  readonly entityCode: string;
  readonly generation: number;
  readonly releaseId: string;
}

export interface MetadataGenerationCheckpoint {
  get(coordinate: EntityDescriptorCoordinate): Promise<number | undefined>;
  advance(coordinate: EntityDescriptorCoordinate, generation: number, eventId: string): Promise<boolean>;
}
