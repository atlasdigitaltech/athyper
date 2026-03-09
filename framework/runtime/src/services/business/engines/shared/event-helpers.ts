// framework/runtime/src/services/business/engines/shared/event-helpers.ts

/**
 * Shared event helpers for the financial engine event store.
 * Covers partition key computation and payload hashing (MC-1, MC-4).
 */

import type {
  PartitionDomain,
  DocType,
  ActorType,
  UniversalEventEnvelope,
} from "../event-store/domain/types";

/**
 * Compute deterministic partition key from domain + identifiers.
 * Format: "{domain}:{tenantId}:{entityCode}:{primaryId}"
 */
export function computePartitionKey(
  domain: PartitionDomain,
  tenantId: string,
  entityCode: string,
  primaryId: string,
): string {
  return `${domain}:${tenantId}:${entityCode}:${primaryId}`;
}

/**
 * Compute SHA-256 hash of a canonical payload.
 * Uses JSON.stringify with sorted keys for deterministic output.
 */
export async function computePayloadHash(payload: unknown): Promise<string> {
  const canonical = canonicalizeJson(payload);
  const encoder = new TextEncoder();
  const data = encoder.encode(canonical);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return bufferToHex(hashBuffer);
}

/**
 * Verify a payload hash matches the expected hash.
 */
export async function verifyPayloadHash(
  payload: unknown,
  expectedHash: string,
): Promise<boolean> {
  const actualHash = await computePayloadHash(payload);
  return actualHash === expectedHash;
}

/**
 * Generate a correlation ID for a new transaction flow.
 */
export function generateCorrelationId(): string {
  return crypto.randomUUID();
}

/**
 * Build an event envelope with computed fields.
 */
export function buildEventEnvelope<T>(params: {
  eventType: string;
  sourceEngine: string;
  txnId: string;
  docId: string;
  docType: DocType;
  correlationId: string;
  causationId: string | null;
  actorType: ActorType;
  actorId: string;
  tenantId: string;
  entityCode: string | null;
  ouId: string | null;
  payload: T;
  partitionDomain: PartitionDomain;
  partitionKey: string;
  metadata?: Record<string, unknown>;
}): Omit<
  UniversalEventEnvelope<T>,
  "id" | "sequenceNo" | "payloadHash" | "createdAt" | "eventVersion"
> {
  return {
    eventType: params.eventType,
    sourceEngine: params.sourceEngine,
    txnId: params.txnId,
    docId: params.docId,
    docType: params.docType,
    correlationId: params.correlationId,
    causationId: params.causationId,
    actorType: params.actorType,
    actorId: params.actorId,
    tenantId: params.tenantId,
    entityCode: params.entityCode,
    ouId: params.ouId,
    payload: params.payload,
    metadata: params.metadata ?? {},
    partitionDomain: params.partitionDomain,
    partitionKey: params.partitionKey,
  };
}

// --- Internal helpers ---

/**
 * Canonicalize JSON with sorted keys for deterministic hashing.
 */
function canonicalizeJson(value: unknown): string {
  return JSON.stringify(value, (_key, val) => {
    if (val && typeof val === "object" && !Array.isArray(val)) {
      return Object.keys(val as Record<string, unknown>)
        .sort()
        .reduce<Record<string, unknown>>((sorted, k) => {
          sorted[k] = (val as Record<string, unknown>)[k];
          return sorted;
        }, {});
    }
    return val;
  });
}

function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
