// framework/runtime/src/services/business/engines/posting-engine/services/risk-signal-event-publisher.ts
//
// Phase 6.2b — Shared risk signal event building + publishing infrastructure.
// Centralizes DomainEvent construction so both runtime (EventBus) and BFF
// (outbox) paths produce identical event envelopes.

import type { DomainEvent } from "@athyper/core";

import type {
  RiskSignalEventPayload,
  RiskSignalEventType,
} from "../domain/types";

import type { OperationContext } from "../../shared/engine-base";

// ---------------------------------------------------------------------------
// Async emitter interface — replaces the sync no-op-friendly version
// ---------------------------------------------------------------------------

/**
 * Async event emitter for risk signal lifecycle events.
 * Both runtime (EventBus) and BFF (outbox) implement this interface.
 *
 * The OperationContext provides tenantId, actorId, actorType, and correlationId
 * for event envelope construction and outbox persistence.
 */
export interface RiskSignalEventEmitter {
  emit(eventType: string, payload: RiskSignalEventPayload, ctx: OperationContext): Promise<void>;
}

// ---------------------------------------------------------------------------
// Shared DomainEvent builder — one function, both paths
// ---------------------------------------------------------------------------

/**
 * Build a proper DomainEvent<RiskSignalEventPayload> from event type + payload.
 * Used by both EventBus and outbox publishers to ensure identical envelope shape.
 */
export function buildRiskSignalDomainEvent(
  eventType: RiskSignalEventType | string,
  payload: RiskSignalEventPayload,
  ctx?: Partial<OperationContext>,
): DomainEvent<RiskSignalEventPayload> {
  return {
    eventId: crypto.randomUUID(),
    eventType,
    occurredAt: new Date(),
    aggregateId: payload.signalId,
    aggregateType: "CloseRiskSignal",
    payload,
    metadata: {
      entityCode: payload.entityCode,
      fiscalYear: payload.fiscalYear,
      periodNumber: payload.periodNumber,
      severity: payload.severity,
      ruleCode: payload.ruleCode,
      ...(ctx?.correlationId ? { correlationId: ctx.correlationId } : {}),
    },
  };
}

// ---------------------------------------------------------------------------
// Runtime implementation — wraps platform EventBus
// ---------------------------------------------------------------------------

/**
 * EventBus adapter for the runtime DI container path.
 * Publishes properly shaped DomainEvent objects to the in-memory EventBus.
 */
export function createEventBusEmitter(eventBus: {
  publish<T>(event: DomainEvent<T>): Promise<void>;
}): RiskSignalEventEmitter {
  return {
    async emit(eventType: string, payload: RiskSignalEventPayload, ctx: OperationContext) {
      const event = buildRiskSignalDomainEvent(eventType, payload, ctx);
      await eventBus.publish(event);
    },
  };
}

// ---------------------------------------------------------------------------
// No-op implementation — graceful degradation
// ---------------------------------------------------------------------------

export const NO_OP_EMITTER: RiskSignalEventEmitter = {
  async emit() {},
};
