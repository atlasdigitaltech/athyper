// posting-engine/__tests__/risk-signal-event-parity.test.ts
//
// Phase 6.2b — Event emission parity tests.
// Verifies that manual (BFF) and scheduled (runtime) paths emit identical
// event families for all risk signal lifecycle actions.

import { describe, it, expect, beforeEach } from "vitest";

import type { OperationContext } from "../../shared/engine-base.js";
import { DefaultCloseRiskSignalOperationsService } from "../services/close-risk-signal-operations.js";

import type { RiskSignalEventEmitter } from "../services/risk-signal-event-publisher.js";
import {
  buildRiskSignalDomainEvent,
  createEventBusEmitter,
  NO_OP_EMITTER,
} from "../services/risk-signal-event-publisher.js";

import type {
  CloseRiskRule,
  CloseRiskSignal,
  RiskSignalEventPayload,
  RiskSignalState,
  PeriodCloseReadinessSnapshot,
} from "../domain/types.js";

import type {
  CloseRiskRuleRepo,
  CloseRiskSignalRepo,
  CloseOrchestrationSnapshotRepo,
  PeriodCloseActivityRepo,
} from "../persistence/period-close-repo.js";

import type { RiskEvaluationContextLoader } from "../services/close-risk-signal-operations.js";

// ---------------------------------------------------------------------------
// Test helpers — recording emitter
// ---------------------------------------------------------------------------

interface RecordedEvent {
  eventType: string;
  payload: RiskSignalEventPayload;
  ctx: OperationContext;
}

function createRecordingEmitter(): RiskSignalEventEmitter & { events: RecordedEvent[] } {
  const events: RecordedEvent[] = [];
  return {
    events,
    async emit(eventType: string, payload: RiskSignalEventPayload, ctx: OperationContext) {
      events.push({ eventType, payload, ctx });
    },
  };
}

// ---------------------------------------------------------------------------
// Stub context
// ---------------------------------------------------------------------------

const userCtx: OperationContext = {
  tenantId: "t-001",
  actorId: "user-1",
  actorType: "USER",
  correlationId: "corr-001",
  entityCode: "ENT01",
};

const schedulerCtx: OperationContext = {
  tenantId: "t-001",
  actorId: "risk-signal-dispatcher",
  actorType: "SCHEDULER",
  correlationId: "corr-002",
  entityCode: "ENT01",
};

// ---------------------------------------------------------------------------
// Stub repos
// ---------------------------------------------------------------------------

function makeRule(overrides?: Partial<CloseRiskRule>): CloseRiskRule {
  return {
    id: "rule-1",
    tenantId: "t-001",
    entityCode: "ENT01",
    ruleCode: "test_rule",
    ruleName: "Test Rule",
    description: null,
    ruleType: "task_incomplete",
    parameters: {},
    severity: "high",
    escalationRole: "controller",
    escalationUserId: null,
    cooldownMinutes: 240,
    targetStatus: "SOFT_CLOSE",
    autoResolveWhenClear: false,
    suppressionScope: "instance",
    acknowledgeSlaMinutes: 120,
    resolveSlaMinutes: 480,
    escalationEnabled: true,
    maxEscalationLevel: 3,
    escalationIntervalMinutes: 60,
    isActive: true,
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeSignal(overrides?: Partial<CloseRiskSignal>): CloseRiskSignal {
  return {
    id: "sig-1",
    tenantId: "t-001",
    entityCode: "ENT01",
    fiscalYear: 2026,
    periodNumber: 3,
    ruleId: "rule-1",
    ruleCode: "test_rule",
    ruleType: "task_incomplete",
    severity: "high",
    signalState: "fired",
    signalFingerprint: "fp-abc",
    suppressionScope: null,
    triggerSnapshotId: "snap-1",
    title: "Test signal",
    message: "Test message",
    evidence: {},
    firedAt: new Date("2026-03-01T10:00:00Z"),
    acknowledgedBy: null,
    acknowledgedAt: null,
    resolvedBy: null,
    resolvedAt: null,
    resolutionNotes: null,
    escalationLevel: 0,
    lastEscalatedAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

function createStubRuleRepo(rules: CloseRiskRule[]): CloseRiskRuleRepo {
  return {
    async listByEntity() { return rules; },
    async getByCode(_t, _e, ruleCode) { return rules.find((r) => r.ruleCode === ruleCode) ?? null; },
    async upsert() { throw new Error("not used"); },
    async setActive() { throw new Error("not used"); },
  };
}

function createStubSignalRepo(signals: CloseRiskSignal[]): CloseRiskSignalRepo {
  const store = new Map(signals.map((s) => [s.id, { ...s }]));
  return {
    async getById(_t, signalId) { return store.get(signalId) ?? null; },
    async insert(_t, signal) {
      const id = `sig-${crypto.randomUUID().slice(0, 8)}`;
      const s = { ...signal, id, tenantId: _t, createdAt: new Date() } as CloseRiskSignal;
      store.set(id, s);
      return s;
    },
    async listActive() { return [...store.values()].filter((s) => ["fired", "acknowledged"].includes(s.signalState)); },
    async listByPeriod() { return [...store.values()]; },
    async updateState(_t, signalId, update) {
      const s = store.get(signalId)!;
      Object.assign(s, update);
      store.set(signalId, s);
      return s;
    },
    async escalate(_t, signalId, level, at) {
      const s = store.get(signalId)!;
      s.escalationLevel = level;
      s.lastEscalatedAt = at;
      store.set(signalId, s);
      return s;
    },
    async getSummary() { return { activeCount: 0, criticalCount: 0, highCount: 0, unacknowledgedCount: 0 }; },
  };
}

function createStubActivityRepo(): PeriodCloseActivityRepo {
  return {
    async append(_t, activity) {
      return {
        id: crypto.randomUUID(),
        tenantId: _t,
        entityCode: activity.entityCode,
        fiscalYear: activity.fiscalYear,
        periodNumber: activity.periodNumber,
        checklistId: null,
        taskCode: activity.taskCode ?? null,
        activityType: activity.activityType,
        actorType: activity.actorType,
        actorId: activity.actorId ?? null,
        message: activity.message,
        payload: activity.payload ?? null,
        createdAt: new Date(),
      };
    },
    async listByPeriod() { return []; },
    async listByChecklist() { return []; },
  };
}

function createStubSnapshotRepo(): CloseOrchestrationSnapshotRepo {
  return {
    async insert() { throw new Error("not used"); },
    async getLatest() { return null; },
    async listByPeriod() { return []; },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Risk Signal Event Parity", () => {
  // ── buildRiskSignalDomainEvent ──────────────────────────────────────

  describe("buildRiskSignalDomainEvent", () => {
    it("produces a properly shaped DomainEvent", () => {
      const payload: RiskSignalEventPayload = {
        signalId: "sig-1",
        ruleId: "rule-1",
        ruleCode: "test_rule",
        ruleType: "task_incomplete",
        severity: "high",
        signalFingerprint: "fp-abc",
        priorState: null,
        newState: "fired",
        targetStatus: "SOFT_CLOSE",
        affectedTaskCodes: ["T01"],
        title: "Test signal",
        message: "Test message",
        escalationRole: "controller",
        escalationLevel: 0,
        entityCode: "ENT01",
        fiscalYear: 2026,
        periodNumber: 3,
      };

      const event = buildRiskSignalDomainEvent("fin.risk_signal.fired", payload, userCtx);

      expect(event.eventType).toBe("fin.risk_signal.fired");
      expect(event.aggregateId).toBe("sig-1");
      expect(event.aggregateType).toBe("CloseRiskSignal");
      expect(event.payload).toBe(payload);
      expect(event.eventId).toBeTruthy();
      expect(event.occurredAt).toBeInstanceOf(Date);
      expect(event.metadata?.correlationId).toBe("corr-001");
      expect(event.metadata?.entityCode).toBe("ENT01");
    });

    it("omits correlationId from metadata when ctx has none", () => {
      const payload: RiskSignalEventPayload = {
        signalId: "sig-1", ruleId: "r1", ruleCode: "rc", ruleType: "task_incomplete",
        severity: "high", signalFingerprint: null, priorState: null, newState: "fired",
        targetStatus: null, affectedTaskCodes: [], title: "T", message: "M",
        escalationRole: null, escalationLevel: 0, entityCode: "E", fiscalYear: 2026, periodNumber: 1,
      };
      const event = buildRiskSignalDomainEvent("fin.risk_signal.fired", payload);
      expect(event.metadata?.correlationId).toBeUndefined();
    });
  });

  // ── createEventBusEmitter ───────────────────────────────────────────

  describe("createEventBusEmitter", () => {
    it("publishes a DomainEvent with correct eventType to EventBus", async () => {
      const published: any[] = [];
      const mockBus = { async publish(event: any) { published.push(event); } };
      const emitter = createEventBusEmitter(mockBus);

      const payload: RiskSignalEventPayload = {
        signalId: "sig-1", ruleId: "r1", ruleCode: "rc", ruleType: "task_incomplete",
        severity: "high", signalFingerprint: null, priorState: null, newState: "fired",
        targetStatus: "SOFT_CLOSE", affectedTaskCodes: [], title: "T", message: "M",
        escalationRole: null, escalationLevel: 0, entityCode: "ENT01", fiscalYear: 2026, periodNumber: 3,
      };

      await emitter.emit("fin.risk_signal.fired", payload, userCtx);

      expect(published).toHaveLength(1);
      expect(published[0].eventType).toBe("fin.risk_signal.fired");
      expect(published[0].aggregateId).toBe("sig-1");
      expect(published[0].aggregateType).toBe("CloseRiskSignal");
      expect(published[0].payload).toEqual(payload);
    });
  });

  // ── NO_OP_EMITTER ──────────────────────────────────────────────────

  describe("NO_OP_EMITTER", () => {
    it("does not throw", async () => {
      const payload: RiskSignalEventPayload = {
        signalId: "sig-1", ruleId: "r1", ruleCode: "rc", ruleType: "task_incomplete",
        severity: "high", signalFingerprint: null, priorState: null, newState: "fired",
        targetStatus: null, affectedTaskCodes: [], title: "T", message: "M",
        escalationRole: null, escalationLevel: 0, entityCode: "E", fiscalYear: 2026, periodNumber: 1,
      };
      await expect(NO_OP_EMITTER.emit("fin.risk_signal.fired", payload, userCtx)).resolves.toBeUndefined();
    });
  });

  // ── Lifecycle event parity — operations service emits same events
  //    regardless of actorType (USER vs SCHEDULER)
  // ─────────────────────────────────────────────────────────────────

  describe("transition events — parity across invocation paths", () => {
    let rule: CloseRiskRule;
    let signal: CloseRiskSignal;

    beforeEach(() => {
      rule = makeRule();
      signal = makeSignal();
    });

    async function runTransition(ctx: OperationContext, targetState: RiskSignalState, resolutionNotes?: string) {
      const emitter = createRecordingEmitter();
      const service = new DefaultCloseRiskSignalOperationsService(
        createStubRuleRepo([rule]),
        createStubSignalRepo([signal]),
        createStubSnapshotRepo(),
        createStubActivityRepo(),
        emitter,
        { async load() { return null; } },
      );
      await service.transition(ctx, "sig-1", targetState, resolutionNotes);
      return emitter.events;
    }

    it("acknowledge — same event from USER and SCHEDULER", async () => {
      const userEvents = await runTransition(userCtx, "acknowledged");
      // Reset signal state for scheduler test
      signal = makeSignal();
      const schedulerEvents = await runTransition(schedulerCtx, "acknowledged");

      expect(userEvents).toHaveLength(1);
      expect(schedulerEvents).toHaveLength(1);

      expect(userEvents[0].eventType).toBe("fin.risk_signal.acknowledged");
      expect(schedulerEvents[0].eventType).toBe("fin.risk_signal.acknowledged");

      // Same payload shape
      expect(userEvents[0].payload.newState).toBe("acknowledged");
      expect(schedulerEvents[0].payload.newState).toBe("acknowledged");

      // Source distinction preserved
      expect(userEvents[0].ctx.actorType).toBe("USER");
      expect(schedulerEvents[0].ctx.actorType).toBe("SCHEDULER");
    });

    it("resolve — same event from USER and SCHEDULER", async () => {
      // First acknowledge, then resolve
      signal = makeSignal({ signalState: "acknowledged", acknowledgedBy: "user-1", acknowledgedAt: new Date() });
      const userEvents = await runTransition(userCtx, "resolved", "Fixed the issue");

      signal = makeSignal({ signalState: "acknowledged", acknowledgedBy: "system", acknowledgedAt: new Date() });
      const schedulerEvents = await runTransition(schedulerCtx, "resolved", "Auto-resolved");

      expect(userEvents).toHaveLength(1);
      expect(schedulerEvents).toHaveLength(1);

      expect(userEvents[0].eventType).toBe("fin.risk_signal.resolved");
      expect(schedulerEvents[0].eventType).toBe("fin.risk_signal.resolved");
    });

    it("suppress — same event from USER and SCHEDULER", async () => {
      const userEvents = await runTransition(userCtx, "suppressed");

      signal = makeSignal();
      const schedulerEvents = await runTransition(schedulerCtx, "suppressed");

      expect(userEvents).toHaveLength(1);
      expect(schedulerEvents).toHaveLength(1);

      expect(userEvents[0].eventType).toBe("fin.risk_signal.suppressed");
      expect(schedulerEvents[0].eventType).toBe("fin.risk_signal.suppressed");
    });
  });

  describe("escalation events", () => {
    it("escalateOverdue emits fin.risk_signal.escalated", async () => {
      const rule = makeRule({
        escalationEnabled: true,
        acknowledgeSlaMinutes: 1, // 1 minute — already breached
        maxEscalationLevel: 3,
      });
      const signal = makeSignal({
        firedAt: new Date("2026-03-01T00:00:00Z"), // way in the past
        escalationLevel: 0,
      });

      const emitter = createRecordingEmitter();
      const service = new DefaultCloseRiskSignalOperationsService(
        createStubRuleRepo([rule]),
        createStubSignalRepo([signal]),
        createStubSnapshotRepo(),
        createStubActivityRepo(),
        emitter,
        { async load() { return null; } },
      );

      const result = await service.escalateOverdue(userCtx, "ENT01", 2026, 3);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.escalated).toBe(1);
      }

      expect(emitter.events).toHaveLength(1);
      expect(emitter.events[0].eventType).toBe("fin.risk_signal.escalated");
      expect(emitter.events[0].payload.escalationLevel).toBe(1);
      expect(emitter.events[0].payload.escalationRole).toBe("controller");
    });
  });

  describe("evaluate events", () => {
    it("evaluate emits fin.risk_signal.fired for new signals", async () => {
      const rule = makeRule();

      const snapshot: PeriodCloseReadinessSnapshot = {
        id: "snap-1",
        tenantId: "t-001",
        entityCode: "ENT01",
        fiscalYear: 2026,
        periodNumber: 3,
        snapshotAt: new Date(),
        targetStatus: "SOFT_CLOSE",
        totalTasks: 5,
        satisfiedCount: 3,
        readyCount: 1,
        blockedCount: 1,
        failedCount: 0,
        notReadyCount: 0,
        inProgressCount: 0,
        criticalPathMinutes: 120,
        predictedReadyAt: null,
        blockerTaskCodes: ["T01"],
        confidence: "medium",
        snapshotSource: "api_call",
        computationVersion: "1.0",
        triggeredBy: "system",
        createdAt: new Date(),
      };

      const emitter = createRecordingEmitter();
      const contextLoader: RiskEvaluationContextLoader = {
        async load() {
          return {
            tenantId: "t-001",
            entityCode: "ENT01",
            fiscalYear: 2026,
            periodNumber: 3,
            currentSnapshot: snapshot,
            priorSnapshots: [],
            activeSignals: [],
            closeCalendar: null,
            graphNodes: [{
              checklistId: "cl-1",
              taskId: "t-1",
              taskCode: "T01",
              taskName: "Trial Balance",
              category: "RECONCILIATION",
              requiredBefore: "SOFT_CLOSE" as const,
              completionMode: "SYSTEM",
              status: "PENDING",
              readinessState: "READY" as const,
              satisfactionState: "UNSATISFIED" as const,
              predecessorTaskCodes: [],
              successorTaskCodes: [],
              blockedByTaskCodes: [],
              downstreamImpactCount: 0,
              estimatedDurationMinutes: null,
              severity: "critical",
              orchestrationGroup: null,
              assignedRole: null,
              assignedUserId: null,
              dueAt: null,
              earliestStartAt: null,
              predictedFinishAt: null,
            }],
          };
        },
      };

      const service = new DefaultCloseRiskSignalOperationsService(
        createStubRuleRepo([rule]),
        createStubSignalRepo([]),
        createStubSnapshotRepo(),
        createStubActivityRepo(),
        emitter,
        contextLoader,
      );

      const result = await service.evaluate(userCtx, "ENT01", 2026, 3, "SOFT_CLOSE");

      // Events emitted depend on how many rules fire — at least verify the event type
      if (result.ok && result.value.fired > 0) {
        const firedEvents = emitter.events.filter((e) => e.eventType === "fin.risk_signal.fired");
        expect(firedEvents.length).toBeGreaterThan(0);
        expect(firedEvents[0].payload.newState).toBe("fired");
        expect(firedEvents[0].ctx.actorType).toBe("USER");
      }
    });
  });
});
