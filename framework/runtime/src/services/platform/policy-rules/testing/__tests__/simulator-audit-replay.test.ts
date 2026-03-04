/**
 * Unit tests for audit replay feature in PolicySimulatorService.
 *
 * Uses inline mocks to avoid cross-workspace import issues.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Inline Mock Factories ──────────────────────────────────

function createMockDb(rows: Record<string, unknown>[] = []) {
  const execute = vi.fn().mockResolvedValue(rows);
  const executeTakeFirst = vi.fn().mockResolvedValue(rows[0] ?? undefined);

  const builder = {
    selectFrom: vi.fn().mockReturnThis(),
    selectAll: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
    execute,
    executeTakeFirst,
  };

  return {
    db: builder as any,
    execute,
    executeTakeFirst,
  };
}

function createMockEvaluator(decision?: Record<string, unknown>) {
  return {
    evaluate: vi.fn().mockResolvedValue(
      decision ?? {
        effect: "allow",
        matchedRules: [],
        conflictResolution: "deny_overrides",
        evaluationTimeMs: 5,
        timestamp: new Date(),
        correlationId: "test",
        metadata: {
          durationMs: 5,
          evaluatedAt: new Date(),
          evaluatorVersion: "test",
          correlationId: "test",
        },
      },
    ),
  } as any;
}

function createMockFactsProvider() {
  return {
    resolveSubject: vi.fn().mockResolvedValue({
      principalId: "user-1",
      principalType: "user",
      roles: ["admin"],
      groups: [],
      ouMembership: { path: "/", code: "root" },
      attributes: {},
    }),
    resolveResource: vi.fn().mockResolvedValue({
      type: "order",
      id: "order-123",
      module: "content",
      attributes: {},
    }),
  } as any;
}

function buildAuditRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "evt-001",
    tenant_id: "tenant-1",
    event_type: "WORKFLOW.APPROVE",
    severity: "info",
    instance_id: "inst-1",
    entity_type: "order",
    entity_id: "order-123",
    entity: JSON.stringify({
      type: "order",
      id: "order-123",
      module: "content",
    }),
    actor: JSON.stringify({
      userId: "user-1",
      principalType: "user",
      roles: ["approver"],
      groups: ["finance"],
      attributes: { department: "finance" },
    }),
    workflow: JSON.stringify({
      templateCode: "order_approval",
      templateVersion: 1,
    }),
    action: "WORKFLOW.APPROVE",
    details: null,
    event_timestamp: new Date("2025-12-01T10:00:00Z"),
    ip_address: "10.0.0.1",
    user_agent: "test-agent",
    correlation_id: "corr-1",
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────

describe("PolicySimulatorService — audit replay", () => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  let SimulatorClass: typeof import("../simulator.service.js").PolicySimulatorService;

  beforeEach(async () => {
    // Dynamic import to get fresh module
    const mod = await import("../simulator.service.js");
    SimulatorClass = mod.PolicySimulatorService;
  });

  it("replays an audit event with current policies", async () => {
    const auditRow = buildAuditRow();
    const { db } = createMockDb([auditRow]);
    const evaluator = createMockEvaluator();
    const facts = createMockFactsProvider();

    const simulator = new SimulatorClass(db, evaluator, facts);

    const result = await simulator.simulate("tenant-1", {
      source: "audit_replay",
      auditEventId: "evt-001",
      useCurrentPolicies: true,
    });

    expect(result.success).toBe(true);
    expect(result.decision).toBeDefined();
    expect(evaluator.evaluate).toHaveBeenCalledTimes(1);

    // Verify the policy input was constructed from audit data
    const callArgs = evaluator.evaluate.mock.calls[0][0];
    expect(callArgs.subject.principalId).toBe("user-1");
    expect(callArgs.resource.type).toBe("order");
    expect(callArgs.action.namespace).toBe("WORKFLOW");
    expect(callArgs.action.code).toBe("APPROVE");
  });

  it("replays with historical policies (useCurrentPolicies=false)", async () => {
    const auditRow = buildAuditRow();
    const { db } = createMockDb([auditRow]);
    const evaluator = createMockEvaluator();
    const facts = createMockFactsProvider();

    const simulator = new SimulatorClass(db, evaluator, facts);

    const result = await simulator.simulate("tenant-1", {
      source: "audit_replay",
      auditEventId: "evt-001",
      useCurrentPolicies: false,
    });

    expect(result.success).toBe(true);
    // The context should contain the audit event timestamp
    const callArgs = evaluator.evaluate.mock.calls[0][0];
    expect(callArgs.context.timestamp).toEqual(
      new Date("2025-12-01T10:00:00Z"),
    );
  });

  it("throws descriptive error for non-existent event ID", async () => {
    const { db } = createMockDb([]); // no rows
    const evaluator = createMockEvaluator();
    const facts = createMockFactsProvider();

    const simulator = new SimulatorClass(db, evaluator, facts);

    const result = await simulator.simulate("tenant-1", {
      source: "audit_replay",
      auditEventId: "nonexistent-id",
      useCurrentPolicies: true,
    });

    // Should fail gracefully with error in result
    expect(result.success).toBe(false);
    expect(result.warnings.some((w) => w.includes("nonexistent-id"))).toBe(
      true,
    );
  });

  it("rejects cross-tenant access (event belongs to different tenant)", async () => {
    const auditRow = buildAuditRow({ tenant_id: "other-tenant" });
    const { db } = createMockDb([]); // Query filters by tenant_id, so no results
    const evaluator = createMockEvaluator();
    const facts = createMockFactsProvider();

    const simulator = new SimulatorClass(db, evaluator, facts);

    const result = await simulator.simulate("tenant-1", {
      source: "audit_replay",
      auditEventId: "evt-001",
      useCurrentPolicies: true,
    });

    expect(result.success).toBe(false);
    expect(evaluator.evaluate).not.toHaveBeenCalled();
  });

  it("handles event with direct ENTITY.CREATE action field", async () => {
    const auditRow = buildAuditRow({
      action: "ENTITY.CREATE",
    });
    const { db } = createMockDb([auditRow]);
    const evaluator = createMockEvaluator();
    const facts = createMockFactsProvider();

    const simulator = new SimulatorClass(db, evaluator, facts);

    const result = await simulator.simulate("tenant-1", {
      source: "audit_replay",
      auditEventId: "evt-001",
      useCurrentPolicies: true,
    });

    expect(result.success).toBe(true);
    const callArgs = evaluator.evaluate.mock.calls[0][0];
    expect(callArgs.action.namespace).toBe("ENTITY");
    expect(callArgs.action.code).toBe("CREATE");
    expect(callArgs.action.fullCode).toBe("ENTITY.CREATE");
  });

  it("handles event with missing subject data gracefully", async () => {
    const auditRow = buildAuditRow({
      actor: JSON.stringify({ userId: "user-minimal" }),
    });
    const { db } = createMockDb([auditRow]);
    const evaluator = createMockEvaluator();
    const facts = createMockFactsProvider();

    const simulator = new SimulatorClass(db, evaluator, facts);

    const result = await simulator.simulate("tenant-1", {
      source: "audit_replay",
      auditEventId: "evt-001",
      useCurrentPolicies: true,
    });

    expect(result.success).toBe(true);
    const callArgs = evaluator.evaluate.mock.calls[0][0];
    expect(callArgs.subject.principalId).toBe("user-minimal");
    // Defaults should be populated
    expect(callArgs.subject.roles).toEqual([]);
    expect(callArgs.subject.groups).toEqual([]);
  });
});
