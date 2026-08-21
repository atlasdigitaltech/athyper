import { describe, expect, it } from "vitest";
import { makeMockDb } from "../../../test-utils/src/index.js";
import { ENTITY_ID, TENANT_ID } from "../../../test-utils/src/fixtures.js";
import { GateEvaluator } from "../gate-evaluator.js";
import { WorkflowRuntimeError } from "../runtime-errors.js";

describe("GateEvaluator", () => {
  it("allows execution when no gate is configured", async () => {
    const evaluator = new GateEvaluator();

    await expect(evaluator.evaluate({
      db: makeMockDb() as never,
      tenantId: TENANT_ID,
      entityName: "purchase_invoice",
      entityId: ENTITY_ID,
      payload: {},
      gate: null,
    })).resolves.toEqual({ allowed: true, reasons: [] });
  });

  it("returns condition_not_matched when conditions fail", async () => {
    const evaluator = new GateEvaluator();

    await expect(evaluator.evaluate({
      db: makeMockDb() as never,
      tenantId: TENANT_ID,
      entityName: "purchase_invoice",
      entityId: ENTITY_ID,
      payload: { amount: 50 },
      gate: {
        transitionId: "transition-1",
        conditions: { ">=": [{ var: "amount" }, 100] },
      },
    })).resolves.toEqual({ allowed: false, reasons: ["condition_not_matched"] });
  });

  it("returns missing_required_operation when a required operation has not run", async () => {
    const evaluator = new GateEvaluator();

    await expect(evaluator.evaluate({
      db: makeMockDb() as never,
      tenantId: TENANT_ID,
      entityName: "purchase_invoice",
      entityId: ENTITY_ID,
      payload: {},
      gate: {
        transitionId: "transition-1",
        requiredOperations: ["match_invoice"],
      },
    })).resolves.toEqual({ allowed: false, reasons: ["missing_required_operation:match_invoice"] });
  });

  it("returns a clear not-implemented error for threshold rules", async () => {
    const evaluator = new GateEvaluator();
    const db = makeMockDb();

    await expect(evaluator.assertAllowed({
      db: db as never,
      tenantId: TENANT_ID,
      entityName: "purchase_invoice",
      entityId: ENTITY_ID,
      payload: {},
      gate: {
        transitionId: "transition-1",
        conditions: { "==": [{ var: "ready" }, true] },
        thresholdRules: [{ field: "amount", op: ">=", value: 1000 }],
      },
    })).rejects.toMatchObject<Partial<WorkflowRuntimeError>>({
      code: "GATE_NOT_IMPLEMENTED",
      message: "Threshold rules are not yet supported. Remove the threshold_rules gate condition or contact support.",
      statusCode: 422,
      details: {
        transition_id: "transition-1",
        prior_reasons: ["condition_not_matched"],
      },
    });
  });
});
