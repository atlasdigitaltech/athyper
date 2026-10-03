import { expect, it } from "vitest";
import type { CompiledEntityArtifactV2 } from "@athyper/server-contract-publication";
import { validateCompiledRuntimeContracts } from "./compiled-runtime-contract.js";
import { validateRequiredParentContracts } from "./required-parent-contract.js";
import type { EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";
import { readFileSync } from "node:fs";
it("rejects parent-scoped split publication without a signed enforcing runtime member", () => {
  const core = {
    artifactType: "core",
    artifactKey: "line/core",
    entityCode: "line",
    content: {
      directoryScope: {
        schemaVersion: 1,
        mode: "tenant",
        parent: { entityCode: "shipment", relationshipKey: "lines" },
      },
    },
  } as unknown as CompiledEntityArtifactV2;
  expect(() => validateCompiledRuntimeContracts([core])).toThrow(
    "COMPILED_ENTITY_PARENT_RUNTIME_REQUIRED",
  );
});

function pair(parentCode: string, childCode: string) {
  const field = (key: string, type = "uuid") => ({
    key,
    type,
    storagePath: key,
    required: true,
    writableOn: [],
  });
  const parent = {
    entityCode: parentCode,
    planeKey: "neon",
    storage: { idField: "id", tenantField: "tenant_id" },
    fields: [field("id"), field("tenant_id"), field("name", "string")],
    operations: { read: { code: "read" } },
    recordPresentation: {
      titleField: "name",
      entityRelationships: [
        {
          key: "lines",
          targetEntity: childCode,
          fields: [{ source: "id", target: "owner_id" }],
          tenant: { source: "tenant_id", target: "tenant_id" },
          readOperation: "list",
        },
      ],
    },
  };
  const child = {
    entityCode: childCode,
    planeKey: "neon",
    storage: { idField: "id", tenantField: "tenant_id" },
    fields: [field("id"), field("tenant_id"), field("owner_id")],
    operations: { read: { code: "read" }, list: { code: "list" } },
    directoryScope: {
      schemaVersion: 1,
      mode: "tenant",
      parent: { entityCode: parentCode, relationshipKey: "lines" },
    },
  };
  return {
    parent,
    child,
    validate: () =>
      validateRequiredParentContracts([
        parent,
        child,
      ] as unknown as EntityRuntimeDescriptor[]),
  };
}
it.each([
  ["account_root", "account_line"],
  ["shipment", "shipment_item"],
])(
  "qualifies explicit immutable owner projections for %s/%s",
  (parentCode, childCode) => {
    const f = pair(parentCode, childCode);
    expect(f.validate).not.toThrow();
    f.child.fields[2]!.required = false;
    expect(f.validate).toThrow("PARENT_FIELD_MAPPING_INVALID");
    f.child.fields[2]!.required = true;
    f.child.fields[2]!.type = "string";
    expect(f.validate).toThrow("PARENT_FIELD_MAPPING_INVALID");
  },
);
it("rejects absent parents, mismatched tenants, wrong children, absent read operations and nested parents", () => {
  const f = pair("shipment", "shipment_item");
  expect(() =>
    validateRequiredParentContracts([
      f.child,
    ] as unknown as EntityRuntimeDescriptor[]),
  ).toThrow("PARENT_CONTRACT_REQUIRED");
  f.parent.recordPresentation.entityRelationships[0]!.tenant.target =
    "other_tenant";
  expect(f.validate).toThrow("PARENT_OWNER_MAPPING_REQUIRED");
  f.parent.recordPresentation.entityRelationships[0]!.tenant.target =
    "tenant_id";
  f.parent.recordPresentation.entityRelationships[0]!.targetEntity =
    "other_line";
  expect(f.validate).toThrow("PARENT_RELATIONSHIP_REQUIRED");
  f.parent.recordPresentation.entityRelationships[0]!.targetEntity =
    "shipment_item";
  Object.assign(f.parent, { directoryScope: f.child.directoryScope });
  expect(f.validate).toThrow("PARENT_CONTRACT_REQUIRED");
});
it("the seven BP authoring removals carry explicit scope and cannot publish without enforcing runtime members", () => {
  const root = new URL("../../../../../", import.meta.url);
  const load = (path: string) =>
    JSON.parse(readFileSync(new URL(path, root), "utf8"));
  const correction = load(
    "docs/reviews/bp-child-read-cleanup-template-20261003.json",
  );
  const parent = load("metadata/entities/mdg/bp/business_partner/core.json");
  const registry = load("metadata/review/registry-catalog.json");
  expect(correction.permissions).toHaveLength(7);
  for (const row of correction.permissions) {
    const core = load(`metadata/entities/mdg/bp/${row.entityCode}/core.json`);
    const operation = load(
      `metadata/entities/mdg/bp/${row.entityCode}/operation.json`,
    );
    expect(core.directoryScope.parent).toEqual(row.expectedParent);
    expect(
      operation.operations.find((op: { key: string }) => op.key === "read")
        .permissionCode,
    ).toBeUndefined();
    expect(JSON.stringify(operation)).not.toContain(`"${row.code}"`);
    expect(
      registry.entries.some(
        (entry: { kind: string; key: string }) =>
          entry.kind === "permission" && entry.key === row.code,
      ),
    ).toBe(false);
    const relationship = parent.entityRelationships.find(
      (r: { targetEntity: string }) => r.targetEntity === row.entityCode,
    );
    expect(relationship.key).toBe(row.expectedParent.relationshipKey);
    for (const key of ["tenant_id", "business_partner_id"]) {
      const field = core.fields.find((f: { key: string }) => f.key === key);
      expect(field.nullable).toBe(false);
      expect(field.writePolicy).toBe("system_managed");
      expect(field.uiFacets.visibility).toBe("hidden");
    }
    expect(() =>
      validateCompiledRuntimeContracts([{ ...core, content: core }]),
    ).toThrow("PARENT_RUNTIME_REQUIRED");
  }
});

it("requires an enforcing runtime for field-scoped split sources", () => {
  const core = { artifactType: "core", artifactKey: "shipment/core", entityCode: "shipment", content: {
    directoryScope: { schemaVersion: 1, mode: "organization", fieldBinding: { resolver: "neon.directory.fields.v1", organizationField: "org_id" } },
  } } as unknown as CompiledEntityArtifactV2;
  expect(() => validateCompiledRuntimeContracts([core])).toThrow("COMPILED_ENTITY_DIRECTORY_RUNTIME_REQUIRED");
});
