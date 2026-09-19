import { describe, expect, it } from "vitest";
import { compileEntityIntakeFlows } from "../intake-projection.js";
import { parseEntityIntakeFlows } from "@athyper/contract-platform-entity-runtime";
function graph(entityCode = "business_partner") {
  return {
    entity: { entityCode },
    operations: [
      { id: "start", operationKey: "case_create" },
      { id: "finish", operationKey: "case_submit" },
    ],
    surfaces: [
      {
        id: "a",
        surfaceKey: "identity",
        title: entityCode === "product" ? "Classification" : "Partner",
      },
      { id: "b", surfaceKey: "details", title: "Details" },
      { id: "c", surfaceKey: "review", title: "Review" },
    ],
    flows: [
      {
        id: "flow",
        flowKey: "request_intake",
        flowKind: "create",
        title: `New ${entityCode} request`,
        entryOperationId: "start",
        completionOperationId: "finish",
        allowDraftResume: false,
      },
    ],
    flowSteps: [
      {
        entityFlowId: "flow",
        entitySurfaceId: "c",
        stepKey: "review",
        position: 30,
      },
      {
        entityFlowId: "flow",
        entitySurfaceId: "a",
        stepKey: "identity",
        position: 10,
      },
      {
        entityFlowId: "flow",
        entitySurfaceId: "b",
        stepKey: "details",
        position: 20,
      },
    ],
  };
}
describe("native intake projection", () => {
  it.each(["business_partner", "product"])(
    "compiles and round-trips the same flow model for %s",
    (entity) => {
      const flows = compileEntityIntakeFlows(graph(entity));
      expect(flows[0]!.steps.map((s) => s.key)).toEqual([
        "identity",
        "details",
        "review",
      ]);
      expect(flows[0]!.entryOperation).toBe("case_create");
      expect(parseEntityIntakeFlows(JSON.parse(JSON.stringify(flows)))).toEqual(
        flows,
      );
    },
  );
  it("rejects missing surfaces and operations", () => {
    expect(() =>
      compileEntityIntakeFlows({ ...graph(), surfaces: [] }),
    ).toThrow("INTAKE_SURFACE_REQUIRED");
    expect(() =>
      compileEntityIntakeFlows({ ...graph(), operations: [] }),
    ).toThrow("INTAKE_OPERATION_REQUIRED");
  });
  it("rejects dangling steps, duplicate order and unsupported conditions", () => {
    const g = graph();
    expect(() => compileEntityIntakeFlows({ ...g, flows: [] })).toThrow(
      "INTAKE_ORPHAN_STEP",
    );
    expect(() =>
      compileEntityIntakeFlows({
        ...g,
        flowSteps: g.flowSteps.map((s) => ({ ...s, position: 1 })),
      }),
    ).toThrow("INTAKE_STEP_ORDER_INVALID");
    expect(() =>
      compileEntityIntakeFlows({
        ...g,
        flowSteps: g.flowSteps.map((s) => ({
          ...s,
          entryCondition: { script: "return true" },
        })),
      }),
    ).toThrow("Invalid intake condition");
  });
  it("supports only validated conditions and preserves optional steps", () => {
    const g = graph();
    g.flowSteps[1] = {
      ...g.flowSteps[1]!,
      entryCondition: { field: "role", operator: "equals", value: "supplier" },
      isOptional: true,
    } as any;
    expect(compileEntityIntakeFlows(g)[0]!.steps[0]).toMatchObject({
      optional: true,
      entryCondition: { field: "role", operator: "equals", value: "supplier" },
    });
  });
});
