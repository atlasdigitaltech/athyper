// framework/runtime/src/services/business/engines/event-store/domain/types.ts

/**
 * Universal Event Envelope — v2.1 Spec Section 4.1
 *
 * Every financial event in the system is wrapped in this envelope.
 * The envelope ensures traceability, immutability, and partition-aware ordering.
 */

// --- Document & Actor Types ---

export type DocType =
    | "PR" | "PO" | "INVOICE" | "PAYMENT" | "CREDIT"
    | "ACCRUAL" | "RECLASS" | "CONTRACT" | "GRN" | "JE" | "OTHER";

export type ActorType = "USER" | "SYSTEM" | "AI_AGENT" | "SCHEDULER";

// --- Partition Domains ---

export type PartitionDomain =
    | "OU_FLOW"
    | "COMMITMENT_FLOW"
    | "FUNDING_FLOW"
    | "ENTITY_FLOW"
    | "INVENTORY_FLOW"
    | "WORKORDER_FLOW"
    | "ASSET_FLOW"
    | "COMMISSION_FLOW"
    | "IC_FLOW";

// --- Universal Event Envelope ---

export interface UniversalEventEnvelope<T = unknown> {
    id: string;
    eventType: string;
    eventVersion: string;
    createdAt: Date;
    sourceEngine: string;

    // Transaction Identity
    txnId: string;
    docId: string;
    docType: DocType;
    correlationId: string;
    causationId: string | null;

    // Actor
    actorType: ActorType;
    actorId: string;

    // Tenant & Org
    tenantId: string;
    entityCode: string | null;
    ouId: string | null;

    // Payload
    payload: T;
    payloadHash: string;
    metadata: Record<string, unknown>;

    // Partition
    partitionDomain: PartitionDomain;
    partitionKey: string;
    sequenceNo: bigint;
}

// --- Event Query Types ---

export interface EventQuery {
    tenantId: string;
    partitionDomain?: PartitionDomain;
    partitionKey?: string;
    eventType?: string;
    txnId?: string;
    docId?: string;
    correlationId?: string;
    fromSequenceNo?: bigint;
    toSequenceNo?: bigint;
    fromDate?: Date;
    toDate?: Date;
    limit?: number;
}

export interface EventPage {
    events: UniversalEventEnvelope[];
    lastSequenceNo: bigint | null;
    hasMore: boolean;
}

// --- Projection Types ---

export interface ProjectionRegistration {
    projectionId: string;
    owningEngine: string;
    projectionVersion: string;
    sourceEventTypes: string[];
    partitionDomains: PartitionDomain[];
    checkpointStrategy: "SEQUENCE_NO";
    rebuildStrategy: "SNAPSHOT_AND_CATCHUP" | "FULL_REBUILD";
    snapshotInterval: number | null;
    consistencyModel: "BOUNDED_STALENESS" | "EVENTUAL";
    dataRetention: string;
}

export interface ProjectionCheckpoint {
    projectionId: string;
    partitionDomain: PartitionDomain;
    partitionKey: string;
    lastEventId: string;
    lastSequenceNo: bigint;
}

export interface ProjectionSnapshot {
    projectionId: string;
    partitionDomain: PartitionDomain;
    partitionKey: string;
    lastSequenceNo: bigint;
    stateChecksum: string;
    snapshotData: unknown;
}

// --- Event Store Tiering ---

export type EventTier = "HOT" | "WARM" | "COLD" | "PURGE";

// --- Event Catalog Types ---

export interface EventTypeDefinition {
    eventType: string;
    sourceEngine: string;
    docType: DocType;
    partitionDomain: PartitionDomain;
    description: string;
}
