/**
 * PolicyEngine.evaluate — unit tests.
 *
 * All DB calls mocked. Tests cover the evaluation algorithm:
 *   - No policies match  → action "none", permitted true
 *   - first_match mode   → stops at first matching rule
 *   - accumulate mode    → deny wins over warn/allow
 *   - deny outcome       → permitted false
 *   - require_workflow   → permitted true but route must submit to workflow
 *   - JSONLogic condition → rules only fire when conditions match
 */

import { describe, it, expect } from "vitest";
import { PolicyEngine } from "../engine.js";
import { makeMockDb, makeMockLogger } from "../../../../test-utils/src/index.js";
import {
  TENANT_ID,
  PRINCIPAL_ID,
  ENTITY_ID,
  POLICY_DEF_ID,
  POLICY_RULE_ID,
} from "../../../../test-utils/src/fixtures.js";

const BASE_PARAMS = {
  tenantId: TENANT_ID,
  entityType: "document.purchase_invoice",
  entityId: ENTITY_ID,
  payload: { amount: 500, status: "draft" },
  requestedBy: PRINCIPAL_ID,
};

// ── Definition + rule helpers ─────────────────────────────────────────────────

function makeDefinitionRow(
  evaluationMode = "first_match",
  overrides: Record<string, unknown> = {},
) {
  return {
    id: POLICY_DEF_ID,
    name: "AP Invoice Policy",
    tenant_id: TENANT_ID,
    entity_type: "document.purchase_invoice",
    is_active: true,
    priority: 100,
    effective_from: "2020-01-01",
    effective_until: null,
    evaluation_mode: evaluationMode,
    ...overrides,
  };
}

function makeRuleRow(action: string, conditions: unknown = null, overrides: Record<string, unknown> = {}) {
  return {
    id: POLICY_RULE_ID,
    policy_id: POLICY_DEF_ID,
    priority: 1,
    conditions,
    action,
    score: null,
    confidence: null,
    explanation: null,
    approvers: null,
    sla_hours: null,
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("PolicyEngine.evaluate", () => {

  it("returns action=none and permitted=true when no policies exist", async () => {
    const db = makeMockDb({
      tables: {
        "control.policy_definition as pd": [],
        "control.policy_rule as pr":       [],
        "log.policy_evaluation_log":       [],
      },
    });
    const engine = new PolicyEngine({ db: db as never });

    const result = await engine.evaluate(BASE_PARAMS);

    expect(result.action).toBe("none");
    expect(result.permitted).toBe(true);
    expect(result.outcomes).toHaveLength(0);
    expect(result.winning).toBeUndefined();
  });

  it("first_match mode: only the highest-priority matching rule fires", async () => {
    const db = makeMockDb({
      tables: {
        "control.policy_definition as pd": [makeDefinitionRow("first_match")],
        "control.policy_rule as pr": [
          makeRuleRow("allow", null, { id: "rule-1", priority: 1 }),
          makeRuleRow("deny",  null, { id: "rule-2", priority: 2 }),
        ],
        "log.policy_evaluation_log": [],
      },
    });
    const engine = new PolicyEngine({ db: db as never });

    const result = await engine.evaluate(BASE_PARAMS);

    // Only the first rule fires (first_match stops after rule-1)
    expect(result.action).toBe("allow");
    expect(result.outcomes).toHaveLength(1);
    expect(result.outcomes[0]!.ruleId).toBe("rule-1");
  });

  it("accumulate mode: deny wins over allow", async () => {
    const db = makeMockDb({
      tables: {
        "control.policy_definition as pd": [makeDefinitionRow("accumulate")],
        "control.policy_rule as pr": [
          makeRuleRow("allow", null, { id: "rule-allow", priority: 1 }),
          makeRuleRow("deny",  null, { id: "rule-deny",  priority: 2 }),
        ],
        "log.policy_evaluation_log": [],
      },
    });
    const engine = new PolicyEngine({ db: db as never });

    const result = await engine.evaluate(BASE_PARAMS);

    expect(result.action).toBe("deny");
    expect(result.permitted).toBe(false);
    expect(result.outcomes).toHaveLength(2);
  });

  it("accumulate mode: require_workflow wins over warn", async () => {
    const db = makeMockDb({
      tables: {
        "control.policy_definition as pd": [makeDefinitionRow("accumulate")],
        "control.policy_rule as pr": [
          makeRuleRow("warn",             null, { id: "rule-warn", priority: 1 }),
          makeRuleRow("require_workflow", null, { id: "rule-wf",   priority: 2 }),
        ],
        "log.policy_evaluation_log": [],
      },
    });
    const engine = new PolicyEngine({ db: db as never });

    const result = await engine.evaluate(BASE_PARAMS);

    expect(result.action).toBe("require_workflow");
    expect(result.permitted).toBe(true); // require_workflow is not a deny
  });

  it("deny makes permitted=false", async () => {
    const db = makeMockDb({
      tables: {
        "control.policy_definition as pd": [makeDefinitionRow("first_match")],
        "control.policy_rule as pr": [makeRuleRow("deny", null)],
        "log.policy_evaluation_log": [],
      },
    });
    const engine = new PolicyEngine({ db: db as never });

    const result = await engine.evaluate(BASE_PARAMS);

    expect(result.permitted).toBe(false);
  });

  it("rule with JSONLogic condition only fires when condition matches", async () => {
    const db = makeMockDb({
      tables: {
        "control.policy_definition as pd": [makeDefinitionRow("first_match")],
        "control.policy_rule as pr": [
          // Only fires when amount > 10000
          makeRuleRow("deny", { ">": [{ var: "amount" }, 10000] }),
        ],
        "log.policy_evaluation_log": [],
      },
    });
    const engine = new PolicyEngine({ db: db as never });

    // amount = 500 → condition does NOT match → action "none"
    const resultLow = await engine.evaluate({ ...BASE_PARAMS, payload: { amount: 500 } });
    expect(resultLow.action).toBe("none");

    // amount = 50000 → condition matches → deny
    const resultHigh = await engine.evaluate({ ...BASE_PARAMS, payload: { amount: 50000 } });
    expect(resultHigh.action).toBe("deny");
  });

  it("winning outcome is the one with the highest-precedence action", async () => {
    const db = makeMockDb({
      tables: {
        "control.policy_definition as pd": [makeDefinitionRow("accumulate")],
        "control.policy_rule as pr": [
          makeRuleRow("escalate", null, { id: "r1", priority: 1 }),
          makeRuleRow("allow",    null, { id: "r2", priority: 2 }),
          makeRuleRow("warn",     null, { id: "r3", priority: 3 }),
        ],
        "log.policy_evaluation_log": [],
      },
    });
    const engine = new PolicyEngine({ db: db as never });

    const result = await engine.evaluate(BASE_PARAMS);

    expect(result.winning?.ruleId).toBe("r3"); // warn has higher precedence than escalate
  });

  it("evaluation log failure does not surface as an error", async () => {
    const logger = makeMockLogger();
    const db = makeMockDb({
      tables: {
        "control.policy_definition as pd": [makeDefinitionRow("first_match")],
        "control.policy_rule as pr":       [makeRuleRow("allow", null)],
        // Simulate log insert failure by making insertInto throw
        "log.policy_evaluation_log": [],
      },
    });
    // Override insertInto to throw for the log table
    const origInsertInto = (db as Record<string, unknown>).insertInto as (t: string) => unknown;
    (db as Record<string, unknown>).insertInto = (table: string) => {
      if (table.includes("policy_evaluation_log")) {
        throw new Error("DB write failed");
      }
      return origInsertInto(table);
    };
    const engine = new PolicyEngine({ db: db as never, logger });

    // Should not throw even though the log insert fails
    const result = await engine.evaluate(BASE_PARAMS);

    expect(result.action).toBe("allow");
    expect(logger.error).toHaveBeenCalledWith("policy_log_failed", expect.any(Object));
  });

  it("org context is injected into JSONLogic payload", async () => {
    const db = makeMockDb({
      tables: {
        "control.policy_definition as pd": [makeDefinitionRow("first_match")],
        "control.policy_rule as pr": [
          // Fires only when company_code_id is present
          makeRuleRow("deny", { "!==": [{ var: "company_code_id" }, null] }),
        ],
        "log.policy_evaluation_log": [],
      },
    });
    const engine = new PolicyEngine({ db: db as never });

    // Without companyCodeId → condition false → no match
    const noOrgResult = await engine.evaluate(BASE_PARAMS);
    expect(noOrgResult.action).toBe("none");

    // With companyCodeId → condition true → deny
    const orgResult = await engine.evaluate({
      ...BASE_PARAMS,
      companyCodeId: "cc-001",
    });
    expect(orgResult.action).toBe("deny");
  });

  it("returns evaluationMs as a non-negative number", async () => {
    const db = makeMockDb({
      tables: {
        "control.policy_definition as pd": [],
        "log.policy_evaluation_log":       [],
      },
    });
    const engine = new PolicyEngine({ db: db as never });

    const result = await engine.evaluate(BASE_PARAMS);

    expect(result.evaluationMs).toBeGreaterThanOrEqual(0);
  });
});
