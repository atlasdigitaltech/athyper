import { describe, expect, it } from "vitest";
import {
  compileEntityIntakeFlows,
  compileEntityIntakeSurfaces,
  intakeConditionMatches,
} from "@athyper/contract-platform-entity-runtime";
import {
  configurationEdit,
  permissionDiagnosis,
} from "./composition-configuration";
import type { Json } from "./workbench-model";
import { configurationFixture } from "./composition-configuration.fixture";
describe("qualified configuration", () => {
  it("compiles a required rule while preserving all unrelated configuration", () => {
    const next = configurationEdit(
      configurationFixture,
      "surfaceFieldBindings",
      "placement-role",
      "required",
      true,
    );
    const compiled = compileEntityIntakeSurfaces(next);
    expect(JSON.stringify(compiled)).toContain('"required":true');
    expect(next.fields).toEqual(configurationFixture.fields);
    expect(next.flowSteps).toEqual(configurationFixture.flowSteps);
    expect(next).not.toBe(configurationFixture);
  });
  it("round-trips executable intake flow options through the production compiler", () => {
    let next = configurationEdit(
      configurationFixture,
      "flows",
      "flow",
      "navigationMode",
      "free",
    );
    next = configurationEdit(next, "flows", "flow", "allowDraftResume", false);
    next = configurationEdit(next, "flowSteps", "step", "isOptional", true);
    const flow = compileEntityIntakeFlows(next)[0]!;
    expect(flow.navigation).toBe("free");
    expect(flow.allowDraftResume).toBe(false);
    expect(flow.steps[0]!.optional).toBe(true);
    expect(intakeConditionMatches(flow.steps[0]!.completionCondition, {})).toBe(
      false,
    );
    expect(next.fields).toEqual(configurationFixture.fields);
  });
  it("refuses unqualified properties, types, broken identities and unsupported flows", () => {
    expect(() =>
      configurationEdit(
        configurationFixture,
        "flows",
        "flow",
        "entryOperationId",
        "other",
      ),
    ).toThrow();
    expect(() =>
      configurationEdit(
        configurationFixture,
        "flows",
        "flow",
        "allowDraftResume",
        "false",
      ),
    ).toThrow();
    expect(() =>
      configurationEdit(
        configurationFixture,
        "flows",
        "flow",
        "navigationMode",
        "script",
      ),
    ).toThrow();
    expect(() =>
      configurationEdit(
        { ...configurationFixture, operations: [] },
        "flows",
        "flow",
        "title",
        "New",
      ),
    ).toThrow();
    expect(() =>
      configurationEdit(
        {
          ...configurationFixture,
          flows: [
            ...(configurationFixture.flows as Json[]),
            ...(configurationFixture.flows as Json[]),
          ],
        },
        "flows",
        "flow",
        "title",
        "New",
      ),
    ).toThrow();
  });
  it("diagnoses plane-specific requirements without fabricating authorization", () => {
    const g = {
      ...configurationFixture,
      operationPermissions: [
        {
          entityOperationId: "create",
          targetPlane: "neon",
          permissionCode: "neon.bp.create",
        },
        {
          entityOperationId: "create",
          targetPlane: "mesh",
          permissionCode: "mesh.bp.create",
        },
      ],
      operationRules: [
        {
          entityOperationId: "create",
          planeCode: "neon",
          decision: "deny",
          reasonCode: "blocked",
        },
      ],
    };
    expect(permissionDiagnosis(g, "create", "neon").permissions).toEqual([
      "neon.bp.create",
    ]);
    expect(permissionDiagnosis(g, "create", "mesh").rules).toEqual([]);
    expect(permissionDiagnosis(g, "create", "neon").findings.join()).toContain(
      "deny rule",
    );
    expect(permissionDiagnosis(g, "create", "neon").mfa).toBe(true);
    expect(permissionDiagnosis(g, "missing", "neon").findings.join()).toContain(
      "identity",
    );
    expect(permissionDiagnosis(g, "create", "neon")).not.toHaveProperty(
      "allowed",
    );
  });
});
