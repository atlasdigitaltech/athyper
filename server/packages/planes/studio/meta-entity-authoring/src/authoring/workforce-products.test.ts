import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import {
  compileTableEntityProduct,
  parseTableEntityProduct,
} from "./table-product.js";
import {
  parseEntityRelationships,
  qualifyEntityRelationship,
} from "@athyper/contract-platform-entity-runtime";

const source = (entity: string) =>
  JSON.parse(
    readFileSync(
      new URL(
        `../../../../../../../metadata/products/shared/entities/${entity}/definition.json`,
        import.meta.url,
      ),
      "utf8",
    ),
  );

for (const entity of [
  "person",
  "employee",
  "external_worker",
  "address",
  "person_address_use",
]) {
  it(`compiles the ${entity} read candidate with explicit Neon storage and no premature write admission`, () => {
    const product = parseTableEntityProduct(source(entity));
    const { graph, artifact } = compileTableEntityProduct(product, "neon");
    expect(product.planes).toEqual(["neon"]);
    expect(graph.runtimeProfiles![0]).toMatchObject({
      storagePlane: "neon",
      storageSchema: "master",
      storageObject: entity,
      writeMode: "none",
    });
    expect(artifact.descriptor.entity.entityCode).toBe(entity);
    expect(graph.fields.every((field) => field.writeMode === "read_only")).toBe(
      true,
    );
    expect(graph.operations.map((operation) => operation.operationKey)).toEqual(
      ["list", "read"],
    );
    expect(
      graph.operationPermissions!.every(
        (binding) => binding.permissionCode === `neon.workforce.${entity}.read`,
      ),
    ).toBe(true);
    expect(() => compileTableEntityProduct(product, "studio")).toThrow(
      "TARGET_EXCLUDED",
    );
  });
}

it("keeps personal data and legacy employment copies out of the Employee read candidate", () => {
  const fields = source("employee").definition.fields.map(
    (field: { fieldKey: string }) => field.fieldKey,
  );
  expect(fields).toContain("person_id");
  for (const field of [
    "first_name",
    "last_name",
    "email",
    "phone",
    "department",
    "title",
    "hire_date",
    "termination_date",
  ])
    expect(fields).not.toContain(field);
  const person = source("person").definition;
  for (const key of [
    "first_name",
    "last_name",
    "primary_email",
    "primary_phone",
  ])
    expect(
      person.fields.find(
        (field: { fieldKey: string }) => field.fieldKey === key,
      ).dataClassification,
    ).toBe("pii");
});

it("qualifies Person's child relationships against actual tenant and uniqueness declarations", () => {
  const parent = parseTableEntityProduct(source("person")).definition;
  const layout = parent.surfaces!.find(
    (surface) => surface.surfaceKind === "detail",
  )!.layoutConfig!;
  const presentation = layout.recordPresentation as {
    entityRelationships: unknown;
  };
  const relations = parseEntityRelationships(presentation.entityRelationships);
  const shape = (code: string) => {
    const graph = parseTableEntityProduct(source(code)).definition;
    return {
      entityCode: code,
      plane: "neon",
      tenantField: "tenant_id",
      fields: Object.fromEntries(
        graph.fields.map((field) => [field.fieldKey, field.dataType]),
      ),
      operations: graph.operations.map((operation) => operation.operationKey),
      uniqueKeys: (graph.keys ?? []).map((key) =>
        graph
          .keyFields!.filter((field) => field.entityKeyId === key.id)
          .sort((a, b) => a.position - b.position)
          .map(
            (binding) =>
              graph.fields.find((field) => field.id === binding.entityFieldId)!
                .fieldKey,
          ),
      ),
    };
  };
  for (const relation of relations)
    expect(() =>
      qualifyEntityRelationship(
        shape("person"),
        shape(relation.targetEntity),
        relation,
      ),
    ).not.toThrow();
  expect(
    relations.find((relation) => relation.key === "addresses")!.cardinality,
  ).toBe("many");
});

it("declares tenant-qualified UUID relationships instead of accepting a naked record ID", () => {
  for (const code of ["employee", "external_worker", "person_address_use"]) {
    const graph = parseTableEntityProduct(source(code)).definition;
    const references = graph.fields.filter(field => field.dataType === "uuid" && field.typeConfig.keyReference);
    expect(references.length).toBeGreaterThan(0);
    for (const field of references) {
      const reference = field.typeConfig.keyReference as { fields: { source: string; target: string }[] };
      expect(reference.fields).toContainEqual({ source: "tenant_id", target: "tenant_id" });
      expect(graph.fieldReferenceBindings!.find(binding => binding.entityFieldId === field.id)?.referenceKind).toBe("entity_relation");
    }
  }
});

it("publishes Address status choices matching its DDL lifecycle", () => {
  const address = source("address").definition;
  const choices = address.surfaceFieldBindings.find(
    (binding: { bindingKey: string }) => binding.bindingKey === "list_status",
  ).displayConfig.lookup.options;
  expect(choices.map((choice: { value: string }) => choice.value)).toEqual([
    "draft",
    "active",
    "retired",
    "merged",
  ]);
});
