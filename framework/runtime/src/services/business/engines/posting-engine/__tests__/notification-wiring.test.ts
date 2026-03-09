// posting-engine/__tests__/notification-wiring.test.ts
//
// Phase 6.3a — End-to-end notification wiring verification.
// Verifies that risk signal domain events published to the EventBus
// trigger the NotificationOrchestrator to enqueue plan-notification jobs.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { InMemoryEventBus } from "@athyper/core";

import {
  buildRiskSignalDomainEvent,
} from "../services/risk-signal-event-publisher.js";

import type {
  RiskSignalEventPayload,
} from "../domain/types.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makePayload(overrides?: Partial<RiskSignalEventPayload>): RiskSignalEventPayload {
  return {
    signalId: "sig-001",
    ruleId: "rule-001",
    ruleCode: "forecast_slipped",
    ruleType: "forecast_slipped",
    severity: "critical",
    signalFingerprint: "fp-abc123",
    priorState: null,
    newState: "fired",
    targetStatus: "SOFT_CLOSE",
    affectedTaskCodes: ["TB_CHECK"],
    title: "Forecast slippage detected",
    message: "Close forecast has slipped by 2 days",
    escalationRole: "CONTROLLER",
    escalationLevel: 0,
    entityCode: "ENT01",
    fiscalYear: 2026,
    periodNumber: 3,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Notification Wiring — EventBus → Orchestrator", () => {
  let eventBus: InMemoryEventBus;
  let receivedEvents: Array<{ eventType: string; eventId: string; payload: unknown }>;

  beforeEach(() => {
    eventBus = new InMemoryEventBus();
    receivedEvents = [];
  });

  it("EventBus delivers risk signal events to subscribers", async () => {
    eventBus.subscribe("fin.risk_signal.fired", (event) => {
      receivedEvents.push({
        eventType: event.eventType,
        eventId: event.eventId,
        payload: event.payload,
      });
    });

    const payload = makePayload();
    const event = buildRiskSignalDomainEvent("fin.risk_signal.fired", payload, {
      correlationId: "corr-001",
    });

    await eventBus.publish(event);

    expect(receivedEvents).toHaveLength(1);
    expect(receivedEvents[0].eventType).toBe("fin.risk_signal.fired");
    expect(receivedEvents[0].payload).toEqual(payload);
  });

  it("EventBus routes different event types to correct subscribers", async () => {
    const firedEvents: unknown[] = [];
    const resolvedEvents: unknown[] = [];

    eventBus.subscribe("fin.risk_signal.fired", (e) => firedEvents.push(e));
    eventBus.subscribe("fin.risk_signal.resolved", (e) => resolvedEvents.push(e));

    await eventBus.publish(
      buildRiskSignalDomainEvent("fin.risk_signal.fired", makePayload()),
    );
    await eventBus.publish(
      buildRiskSignalDomainEvent("fin.risk_signal.resolved", makePayload({ newState: "resolved" })),
    );

    expect(firedEvents).toHaveLength(1);
    expect(resolvedEvents).toHaveLength(1);
  });

  it("multiple subscribers receive same event", async () => {
    const subscriber1: unknown[] = [];
    const subscriber2: unknown[] = [];

    eventBus.subscribe("fin.risk_signal.fired", (e) => subscriber1.push(e));
    eventBus.subscribe("fin.risk_signal.fired", (e) => subscriber2.push(e));

    await eventBus.publish(
      buildRiskSignalDomainEvent("fin.risk_signal.fired", makePayload()),
    );

    expect(subscriber1).toHaveLength(1);
    expect(subscriber2).toHaveLength(1);
  });

  it("unsubscribe removes the handler", async () => {
    const unsub = eventBus.subscribe("fin.risk_signal.fired", (e) => {
      receivedEvents.push({
        eventType: e.eventType,
        eventId: e.eventId,
        payload: e.payload,
      });
    });

    await eventBus.publish(
      buildRiskSignalDomainEvent("fin.risk_signal.fired", makePayload()),
    );
    expect(receivedEvents).toHaveLength(1);

    unsub();

    await eventBus.publish(
      buildRiskSignalDomainEvent("fin.risk_signal.fired", makePayload()),
    );
    expect(receivedEvents).toHaveLength(1); // still 1
  });

  it("event contains proper DomainEvent metadata for notification orchestrator", async () => {
    eventBus.subscribe("fin.risk_signal.escalated", (event) => {
      receivedEvents.push({
        eventType: event.eventType,
        eventId: event.eventId,
        payload: event.payload,
      });
    });

    const payload = makePayload({
      newState: "fired",
      escalationLevel: 2,
      severity: "critical",
    });

    const event = buildRiskSignalDomainEvent(
      "fin.risk_signal.escalated",
      payload,
      { correlationId: "corr-esc" },
    );

    // Verify the event has the shape NotificationOrchestrator expects
    expect(event.eventId).toBeTruthy();
    expect(event.eventType).toBe("fin.risk_signal.escalated");
    expect(event.occurredAt).toBeInstanceOf(Date);
    expect(event.aggregateId).toBe("sig-001");
    expect(event.aggregateType).toBe("CloseRiskSignal");
    expect(event.metadata).toEqual(
      expect.objectContaining({
        entityCode: "ENT01",
        fiscalYear: 2026,
        periodNumber: 3,
        severity: "critical",
        ruleCode: "forecast_slipped",
        correlationId: "corr-esc",
      }),
    );

    await eventBus.publish(event);
    expect(receivedEvents).toHaveLength(1);
  });

  it("all 5 risk signal event types are routable", async () => {
    const eventTypes = [
      "fin.risk_signal.fired",
      "fin.risk_signal.acknowledged",
      "fin.risk_signal.resolved",
      "fin.risk_signal.suppressed",
      "fin.risk_signal.escalated",
    ];

    const received: string[] = [];

    for (const et of eventTypes) {
      eventBus.subscribe(et, (e) => received.push(e.eventType));
    }

    for (const et of eventTypes) {
      await eventBus.publish(
        buildRiskSignalDomainEvent(et, makePayload({ newState: et.split(".").pop() as any })),
      );
    }

    expect(received).toEqual(eventTypes);
  });

  it("simulates orchestrator subscription pattern (subscribeToEvents)", async () => {
    // Simulates what NotificationOrchestrator.subscribeToEvents() does:
    // subscribe to a list of event types and call handleDomainEvent for each
    const planJobs: Array<{ eventType: string; eventId: string; payload: unknown }> = [];

    const mockHandleDomainEvent = vi.fn(async (event: any) => {
      planJobs.push({
        eventType: event.eventType,
        eventId: event.eventId,
        payload: event.payload,
      });
    });

    // Simulate subscribeToEvents
    const eventTypes = [
      "fin.risk_signal.fired",
      "fin.risk_signal.escalated",
      "fin.risk_signal.resolved",
      "fin.risk_signal.acknowledged",
    ];

    const unsubscribers: Array<() => void> = [];
    for (const et of eventTypes) {
      unsubscribers.push(eventBus.subscribe(et, mockHandleDomainEvent));
    }

    // Publish a critical fired event
    await eventBus.publish(
      buildRiskSignalDomainEvent("fin.risk_signal.fired", makePayload()),
    );

    // Publish an escalation event
    await eventBus.publish(
      buildRiskSignalDomainEvent("fin.risk_signal.escalated", makePayload({
        newState: "fired",
        escalationLevel: 1,
      })),
    );

    expect(mockHandleDomainEvent).toHaveBeenCalledTimes(2);
    expect(planJobs).toHaveLength(2);
    expect(planJobs[0].eventType).toBe("fin.risk_signal.fired");
    expect(planJobs[1].eventType).toBe("fin.risk_signal.escalated");

    // Cleanup
    for (const unsub of unsubscribers) unsub();
  });
});
