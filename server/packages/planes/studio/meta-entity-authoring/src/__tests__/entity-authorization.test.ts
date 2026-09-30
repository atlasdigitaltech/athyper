import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import type { MetaEntityGraph } from "@athyper/server-contract-meta-entity-authoring";
import { compileGraph, validateGraph } from "../deterministic.js";

const profile = JSON.parse(
  readFileSync(
    new URL(
      "../../../../../../../packages/contracts/platform/fixtures/entity-authorization/company-invoice.v1.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
function graph(): MetaEntityGraph {
  return {
    contractSchema: "athyper.meta-entity-contract/2.1",
    entity: { entityCode: profile.entityCode },
    runtimeProfiles: [
      {
        profileKey: "default",
        backingKind: "virtual",
        apiExposure: "catalog_only",
        readMode: "none",
        writeMode: "none",
      },
    ],
    fields: profile.fieldPolicies
      .flatMap((group: { fields: string[] }) => group.fields)
      .map((key: string) => ({
        id: `field-${key}`,
        fieldKey: key,
        dataType: "string",
        typeConfig: { kind: "string" },
      })),
    operations: profile.operations.map(
      (op: { key: string; effect: string }) => ({
        id: `op-${op.key}`,
        operationKey: op.key,
        operationKind: op.effect === "write" ? "update" : "read",
        label: op.key,
        auditEventCode: `invoice.${op.key}`,
      }),
    ),
    operationPermissions: profile.operations.map(
      (op: { key: string; permissionCode: string }) => ({
        entityOperationId: `op-${op.key}`,
        targetPlane: "neon",
        permissionCode: op.permissionCode,
        permissionKind: "entity_operation",
      }),
    ),
    operationScopeBindings: profile.operations
      .filter((op: { scope: string }) => op.scope === "company.record.v1")
      .map((op: { key: string; target: string }) => ({
        entityOperationId: `op-${op.key}`,
        bindingKey: `${op.key}_company`,
        targetPlane: "neon",
        decisionMode: "authorize",
        scopeKind: "company_code",
        coordinateSource:
          op.target === "existing" ? "record_field" : "request_field",
        coordinateKey: "company_code_id",
      })),
    surfaces: [
      {
        surfaceKey: "detail",
        surfaceKind: "detail",
        title: "Invoice",
        layoutConfig: { authorization: profile },
      },
    ],
  };
}
it("publishes a validated authorization profile and includes it in deterministic hashes", () => {
  const source = graph();
  expect(validateGraph(source).issues).toEqual([]);
  const first = compileGraph(source);
  expect(first.descriptor.authorization).toEqual(profile);
  const reordered = {
    ...profile,
    ...Object.fromEntries(Object.entries(profile).reverse()),
  };
  expect(
    compileGraph({
      ...source,
      surfaces: [
        { ...source.surfaces![0]!, layoutConfig: { authorization: reordered } },
      ],
    }).descriptorHash,
  ).toBe(first.descriptorHash);
});
it("rejects a missing exact-plane permission before publication", () => {
  const source = graph();
  const invalid = {
    ...source,
    operationPermissions: source.operationPermissions!.slice(1),
  };
  expect(validateGraph(invalid).issues).toContainEqual(
    expect.objectContaining({ code: "ENTITY_AUTHORIZATION_INVALID" }),
  );
  expect(() => compileGraph(invalid)).toThrow("META_ENTITY_GRAPH_INVALID");
});
it("rejects duplicate active profiles and preserves entities without a profile", () => {
  const source = graph();
  expect(() =>
    compileGraph({
      ...source,
      surfaces: [
        ...source.surfaces!,
        { ...source.surfaces![0]!, surfaceKey: "other" },
      ],
    }),
  ).toThrow();
  expect(
    compileGraph({ ...source, surfaces: [] }).descriptor,
  ).not.toHaveProperty("authorization");
});

it("native graph compilation preserves versioned runtime references and rejects incomplete coverage", () => {
  const source = graph();
  const layout = source.surfaces![0]!.layoutConfig! as Record<string,unknown>;
  const runtime = { schemaVersion:1, runtimeVersion:"entity-authorization.v1", bindings:profile.operations.map((operation:{key:string;scope:string;requiresPreflight:boolean}) => ({operation:operation.key,handler:`invoice.${operation.key}.v1`,resolver:operation.scope,...(operation.requiresPreflight?{preflight:`invoice.${operation.key}.preflight.v1`}:{})})) };
  layout["authorizationRuntime"] = runtime;
  expect(compileGraph(source).descriptor["authorizationRuntime"]).toEqual({...runtime,bindings:[...runtime.bindings].sort((a,b)=>a.operation.localeCompare(b.operation))});
  runtime.bindings.pop();
  expect(validateGraph(source).issues.some(issue => issue.code === "ENTITY_AUTHORIZATION_INVALID")).toBe(true);
  expect(() => compileGraph(source)).toThrow("META_ENTITY_GRAPH_INVALID");
});
