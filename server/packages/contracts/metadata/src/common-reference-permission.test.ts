import { expect, it } from "vitest";
import {
  COMMON_REFERENCE_VIEW_PERMISSION as code,
  assertCommonReferenceGraph,
} from "./common-reference-permission.js";
function fixture() {
  return {
    entity: {
      entityCode: "synthetic_reference",
      entityClass: "reference",
      ownershipModel: "system",
    },
    runtimeProfiles: [
      {
        storageSchema: "shared",
        backingKind: "table",
        readMode: "generic",
        writeMode: "none",
        storagePlane: "studio",
        referenceCapabilityKey: code,
        referenceCapabilityVersion: 1,
      },
    ],
    referenceCapability: code,
    surfaces: [{ surfaceKind: "list", isDefault: true }],
    fields: [
      {
        valueOrigin: "stored",
        writeMode: "read_only",
        dataClassification: "public",
      },
    ],
    operations: [
      { id: "operation", operationKey: "read", operationKind: "read" },
    ],
    operationPermissions: [
      {
        entityOperationId: "operation",
        permissionCode: code,
        permissionKind: "capability",
        targetPlane: "studio",
      },
    ],
    operationScopeBindings: [
      {
        entityOperationId: "operation",
        targetPlane: "studio",
        scopeKind: "tenant",
        coordinateSource: "tenant_context",
        missingValueBehavior: "deny",
      },
    ],
  };
}
it("requires explicit native enrollment and keeps the legacy surface check as default", () => {
  const graph = fixture();
  expect(() =>
    assertCommonReferenceGraph(graph, "studio", "native-runtime"),
  ).not.toThrow();
  expect(() => assertCommonReferenceGraph(graph, "studio")).toThrow(
    "COMMON_REFERENCE_ENROLLMENT_REQUIRED",
  );
});
it("rejects broken native pins, mixed enrollment, mutable fields and weakened scopes", () => {
  for (const mutate of [
    (g: ReturnType<typeof fixture>) => {
      g.runtimeProfiles[0]!.referenceCapabilityVersion = 2;
    },
    (g: ReturnType<typeof fixture>) => {
      g.runtimeProfiles[0]!.referenceCapabilityKey = "other";
    },
    (g: ReturnType<typeof fixture>) => {
      g.referenceCapability = "other";
    },
    (g: ReturnType<typeof fixture>) => {
      Object.assign(g.surfaces[0]!, {
        layoutConfig: { referenceCapability: code },
      });
    },
    (g: ReturnType<typeof fixture>) => {
      g.fields[0]!.writeMode = "mutable";
    },
    (g: ReturnType<typeof fixture>) => {
      g.operationScopeBindings[0]!.missingValueBehavior = "allow";
    },
    (g: ReturnType<typeof fixture>) => {
      g.operationPermissions[0]!.permissionCode = "other";
    },
  ]) {
    const g = fixture();
    mutate(g);
    expect(() =>
      assertCommonReferenceGraph(g, "studio", "native-runtime"),
    ).toThrow();
  }
});
