// posting-engine/__tests__/domain-event-outbox-consumer.test.ts
//
// Phase 6.2b — Domain Event Outbox Consumer tests.
// Verifies drain semantics: claim, publish, mark completed,
// retry on failure, dead-letter after max retries.

import { describe, it, expect, beforeEach } from "vitest";

import {
  DomainEventOutboxConsumer,
} from "../services/domain-event-outbox-consumer.js";

import type {
  OutboxRow,
  OutboxEventPublisher,
  DomainEventOutboxRepo,
} from "../services/domain-event-outbox-consumer.js";

import type { DomainEvent } from "@athyper/core";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeRow(overrides?: Partial<OutboxRow>): OutboxRow {
  return {
    id: crypto.randomUUID(),
    tenantId: "t-001",
    eventType: "fin.risk_signal.fired",
    entityCode: "ENT01",
    aggregateId: "sig-1",
    aggregateType: "CloseRiskSignal",
    actorId: "user-1",
    actorType: "USER",
    source: "bff",
    correlationId: crypto.randomUUID(),
    payload: {
      signalId: "sig-1",
      ruleId: "rule-1",
      ruleCode: "test_rule",
      ruleType: "task_incomplete",
      severity: "high",
      signalFingerprint: "fp-abc",
      priorState: null,
      newState: "fired",
      targetStatus: "SOFT_CLOSE",
      affectedTaskCodes: [],
      title: "Test signal",
      message: "Test message",
      escalationRole: null,
      escalationLevel: 0,
      entityCode: "ENT01",
      fiscalYear: 2026,
      periodNumber: 3,
    },
    status: "PENDING",
    retryCount: 0,
    lastError: null,
    createdAt: new Date(),
    ...overrides,
  };
}

function createMockRepo(rows: OutboxRow[]): DomainEventOutboxRepo {
  return {
    async claimBatch(maxRetries, batchSize) {
      const pending = rows.filter((r) => r.status === "PENDING" && r.retryCount < maxRetries);
      const batch = pending.slice(0, batchSize);
      for (const r of batch) r.status = "PROCESSING";
      return batch;
    },
    async markCompleted(id) {
      const row = rows.find((r) => r.id === id);
      if (row) row.status = "COMPLETED";
    },
    async markFailed(id, nextRetry, isExhausted, error) {
      const row = rows.find((r) => r.id === id);
      if (row) {
        row.status = isExhausted ? "DEAD_LETTER" : "PENDING";
        row.retryCount = nextRetry;
        row.lastError = error;
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DomainEventOutboxConsumer", () => {
  let published: DomainEvent<unknown>[];
  let publisher: OutboxEventPublisher;

  beforeEach(() => {
    published = [];
    publisher = {
      async publish(event: DomainEvent<unknown>) {
        published.push(event);
      },
    };
  });

  it("drains pending events and publishes to EventBus", async () => {
    const row = makeRow();
    const repo = createMockRepo([row]);
    const consumer = new DomainEventOutboxConsumer(repo, publisher);

    const result = await consumer.drain();

    expect(result.picked).toBe(1);
    expect(result.published).toBe(1);
    expect(result.failed).toBe(0);
    expect(published).toHaveLength(1);
    expect(published[0].eventType).toBe("fin.risk_signal.fired");
    expect(published[0].aggregateType).toBe("CloseRiskSignal");
    expect(row.status).toBe("COMPLETED");
  });

  it("returns zero counts when no pending events", async () => {
    const repo = createMockRepo([]);
    const consumer = new DomainEventOutboxConsumer(repo, publisher);

    const result = await consumer.drain();

    expect(result.picked).toBe(0);
    expect(result.published).toBe(0);
    expect(published).toHaveLength(0);
  });

  it("retries failed events (increments retryCount)", async () => {
    const row = makeRow();
    const repo = createMockRepo([row]);
    const failPublisher: OutboxEventPublisher = {
      async publish() { throw new Error("EventBus unavailable"); },
    };
    const consumer = new DomainEventOutboxConsumer(repo, failPublisher, { maxRetries: 3 });

    const result = await consumer.drain();

    expect(result.picked).toBe(1);
    expect(result.published).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.deadLettered).toBe(0);
    expect(row.status).toBe("PENDING");
    expect(row.retryCount).toBe(1);
    expect(row.lastError).toBe("EventBus unavailable");
  });

  it("dead-letters events after max retries", async () => {
    const row = makeRow({ retryCount: 4 });
    const repo = createMockRepo([row]);
    const failPublisher: OutboxEventPublisher = {
      async publish() { throw new Error("persistent failure"); },
    };
    const consumer = new DomainEventOutboxConsumer(repo, failPublisher, { maxRetries: 5 });

    const result = await consumer.drain();

    expect(result.deadLettered).toBe(1);
    expect(row.status).toBe("DEAD_LETTER");
    expect(row.retryCount).toBe(5);
  });

  it("processes multiple events in a batch", async () => {
    const rows = [makeRow(), makeRow(), makeRow()];
    const repo = createMockRepo(rows);
    const consumer = new DomainEventOutboxConsumer(repo, publisher);

    const result = await consumer.drain();

    expect(result.picked).toBe(3);
    expect(result.published).toBe(3);
    expect(published).toHaveLength(3);
    expect(rows.every((r) => r.status === "COMPLETED")).toBe(true);
  });

  it("handles mixed success/failure in a batch", async () => {
    const rows = [makeRow(), makeRow(), makeRow()];
    let callCount = 0;
    const mixedPublisher: OutboxEventPublisher = {
      async publish() {
        callCount++;
        if (callCount === 2) throw new Error("transient failure");
      },
    };
    const repo = createMockRepo(rows);
    const consumer = new DomainEventOutboxConsumer(repo, mixedPublisher);

    const result = await consumer.drain();

    expect(result.picked).toBe(3);
    expect(result.published).toBe(2);
    expect(result.failed).toBe(1);
  });

  it("builds proper DomainEvent with risk signal builder", async () => {
    const row = makeRow();
    const repo = createMockRepo([row]);
    const consumer = new DomainEventOutboxConsumer(repo, publisher);

    await consumer.drain();

    const event = published[0];
    expect(event.eventType).toBe("fin.risk_signal.fired");
    expect(event.aggregateId).toBe("sig-1");
    expect(event.aggregateType).toBe("CloseRiskSignal");
    expect(event.payload).toEqual(row.payload);
    expect(event.eventId).toBeTruthy();
    expect(event.occurredAt).toBeInstanceOf(Date);
  });

  it("builds generic DomainEvent for non-risk-signal events", async () => {
    const row = makeRow({
      eventType: "fin.custom.event",
      aggregateType: "CustomAggregate",
      payload: { custom: "data" },
    });
    const repo = createMockRepo([row]);
    const consumer = new DomainEventOutboxConsumer(repo, publisher);

    await consumer.drain();

    const event = published[0];
    expect(event.eventType).toBe("fin.custom.event");
    expect(event.aggregateType).toBe("CustomAggregate");
    expect(event.payload).toEqual({ custom: "data" });
    expect(event.eventId).toBe(row.id);
  });

  it("skips rows already at max retries", async () => {
    const exhausted = makeRow({ retryCount: 5 });
    const pending = makeRow();
    const repo = createMockRepo([exhausted, pending]);
    const consumer = new DomainEventOutboxConsumer(repo, publisher, { maxRetries: 5 });

    const result = await consumer.drain();

    expect(result.picked).toBe(1);
    expect(result.published).toBe(1);
  });
});
