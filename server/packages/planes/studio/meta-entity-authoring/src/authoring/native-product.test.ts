import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { parseSharedReferenceProduct } from "./product.js";
import {
  buildNativeReferenceProduct,
  type NativeReferenceProductInput,
} from "./native-product.js";
function fixture(name: string) {
  const product = parseSharedReferenceProduct(
    JSON.parse(
      readFileSync(
        new URL(
          "../../../../../../../metadata/entities/common/reference/" +
            name +
            "/definition.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ),
  );
  const input: NativeReferenceProductInput = {
    product,
    entityId: randomUUID(),
    changeSetId: randomUUID(),
    authorId: randomUUID(),
    createdAt: "2026-10-09T00:00:00.000Z",
    authoringSchemaHash: "a".repeat(64),
    catalogue: {
      hash: "b".repeat(64),
      plane: "studio",
      schema: "shared",
      object: product.definition.storageObject,
      columns: product.definition.fields.map((f) => ({
        path: f.key,
        storageType:
          f.type === "datetime"
            ? "timestamptz"
            : f.type === "enum"
              ? "text"
              : f.type === "string"
                ? "text"
                : f.type,
        nullable: !f.required,
        supportedDataTypes: [f.type],
        cardinalities: ["one"],
      })),
    },
    components: {
      list: randomUUID(),
      detail: randomUUID(),
      displays: Object.fromEntries(
        ["list", "detail"].map((surface) => [
          surface,
          Object.fromEntries(
            ["string", "enum", "boolean", "datetime"].map((type) => [
              type,
              randomUUID(),
            ]),
          ),
        ]),
      ) as NativeReferenceProductInput["components"]["displays"],
    },
    targets: [],
  };
  input.targets = product.definition.fields.flatMap((f) =>
    f.keyReference
      ? [
          {
            entityId:
              f.keyReference.targetEntity === product.definition.entityCode
                ? input.entityId
                : randomUUID(),
            entityCode: f.keyReference.targetEntity,
            keyKey: "code",
            fieldKeys: f.keyReference.fields.map((m) => m.target),
            labelFieldKey: f.keyReference.labelField,
          },
        ]
      : [],
  );
  return input;
}
it.each(["country", "state_region"])(
  "assembles complete native %s from the maintained definition",
  (name) => {
    const input = fixture(name),
      graph = buildNativeReferenceProduct(input);
    expect(graph.fields).toHaveLength(input.product.definition.fields.length);
    expect(graph.fieldIdentities).toHaveLength(graph.fields.length);
    expect(graph.surfaceSections).toHaveLength(
      input.product.definition.sections.length,
    );
    expect(graph.ai.field).toHaveLength(
      input.product.definition.ai!.summaryFieldKeys.length,
    );
    expect(graph.ai.reference).toHaveLength(
      input.product.definition.ai!.relationshipKeys.length,
    );
    expect(
      graph.surfaceFieldBindings.some(
        (b) =>
          graph.fields.find((f) => f.id === b.entityFieldId)!.dataType ===
          "uuid",
      ),
    ).toBe(false);
    expect(graph.runtimeProfiles[0]!.storageCatalogueHash).toBe(
      input.catalogue.hash,
    );
    expect(graph.authoringSource.entityId).toBe(input.entityId);
    expect(
      graph.fieldIdentities!.every(
        (i) =>
          i.createdBy === input.authorId &&
          i.introducedChangeSetId === input.changeSetId,
      ),
    ).toBe(true);
  },
);
it("rejects missing reference contracts, storage mismatch and visible UUID", () => {
  const missing = fixture("state_region");
  missing.targets = [];
  expect(() => buildNativeReferenceProduct(missing)).toThrow("relation-target");
  const mismatch = fixture("country");
  mismatch.catalogue = { ...mismatch.catalogue, columns: [] };
  expect(() => buildNativeReferenceProduct(mismatch)).toThrow("storage-field");
  const visible = fixture("country");
  Object.assign(visible.product.definition, { columns: ["id"] });
  expect(() => buildNativeReferenceProduct(visible)).toThrow("visible-uuid");
});
