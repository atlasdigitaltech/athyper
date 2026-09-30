import { describe, expect, it, vi } from "vitest";
import type { PolicyDefinition } from "@athyper/server-contract-policy";
import { validateTaskEditPolicy } from "../task-edit-policy.js";
import { createPolicyAuthoringService } from "../policy-authoring-service.js";
import { createJsonRuleEvaluator } from "../json-rule-evaluator.js";

const definition = (): PolicyDefinition => ({ id: "edit-policy", name: "Edit policy", entityType: "workflow.task_edit",
  priority: 1, evaluationMode: "all", effectiveFrom: "2026-09-15", versionNo: 1,
  rules: [{ id: "bank-rule", priority: 1, condition: true, action: "require_workflow", metadata: {},
    actionConfig: { schema: "athyper.task-edit-result/1", paths: ["/bank"], effect: "full_reapproval" } }],
});
describe("task edit publication", () => {
  it("accepts typed collect-mode policies and leaves unrelated definitions alone", () => {
    expect(validateTaskEditPolicy(definition())).toEqual([]);
    expect(validateTaskEditPolicy({ ...definition(), entityType: "supplier", rules: [] })).toEqual([]);
  });
  it.each([
    (d: PolicyDefinition) => ({ ...d, evaluationMode: "first_match" as const }),
    (d: PolicyDefinition) => ({ ...d, entityType: "supplier" }),
    (d: PolicyDefinition) => ({ ...d, rules: [] }),
    (d: PolicyDefinition) => ({ ...d, rules: [...d.rules, ...d.rules] }),
    (d: PolicyDefinition) => ({ ...d, rules: d.rules.map(r => ({ ...r, action: "allow" as const })) }),
    (d: PolicyDefinition) => ({ ...d, rules: d.rules.map(r => ({ ...r, actionConfig: { ...r.actionConfig, effect: "selective_reapproval" } })) }),
    (d: PolicyDefinition) => ({ ...d, rules: d.rules.map(r => ({ ...r, actionConfig: { ...r.actionConfig, paths: ["/bank/constructor"] } })) }),
  ])("rejects unsafe publication", change => expect(validateTaskEditPolicy(change(definition())).length).toBeGreaterThan(0));
  it("enforces validation and nonempty evidence through the actual activation owner", async () => {
    let draft = definition();
    const activate = vi.fn(), saveTestResults = vi.fn();
    const service = createPolicyAuthoringService({ repository: {
      getDefinition: async () => draft, listTestCases: async () => [], saveTestResults, activate,
    } as never, signer: {} as never, evaluator: createJsonRuleEvaluator() });
    await expect(service.activate(draft.id, undefined)).rejects.toThrow("publication test evidence");
    draft = { ...draft, evaluationMode: "first_match" };
    await expect(service.activate(draft.id, undefined)).rejects.toThrow("collect all applicable outcomes");
    expect(activate).not.toHaveBeenCalled();
  });
});
