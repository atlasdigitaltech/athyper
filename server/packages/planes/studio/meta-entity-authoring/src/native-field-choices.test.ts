import { expect, it } from "vitest";
import {
  coreFixtureId,
  coreFixtureRow,
} from "../../../../contracts/meta-entity-authoring/src/normalized-core.fixtures.js";
import {
  convertLegacyFieldChoices,
  compileNativeFieldChoices,
  type LegacyFieldChoices,
  type NativeFieldChoiceContext,
} from "./native-field-choices.js";
import { sha256 } from "./deterministic.js";
function fixture() {
  const source: LegacyFieldChoices = {
    options: [
      { value: "active", label: "Active" },
      { value: "pending", label: "Pending" },
    ],
    tones: { active: "success" },
  };
  const context = {
    field: coreFixtureRow("field", coreFixtureId(1), {
      fieldIdentityId: coreFixtureId(2),
      dataType: "enum",
      storageType: "text",
      cardinality: "one",
      valueOrigin: "stored",
      storageKind: "column",
      storagePath: "status",
      nullable: false,
      required: false,
      writeMode: "read_only",
      dataClassification: "public",
      defaultKind: "none",
      keyGeneration: "none",
      domainCode: "status",
    }),
    maximumChoices: 20,
    domainValues: ["active", "pending", "__proto__"],
    labelText: (id: string) => (id === coreFixtureId(3) ? "Active" : "Pending"),
  };
  const mapping = {
    sourceHash: sha256(source),
    choices: {
      active: { id: coreFixtureId(4), labelId: coreFixtureId(3) },
      pending: { id: coreFixtureId(5), labelId: coreFixtureId(6) },
    },
  };
  return { source, context, mapping };
}
it("round-trips ordered choices and the distinction between an absent and explicit tone", () => {
  const f = fixture(),
    rows = convertLegacyFieldChoices(f.source, f.context, f.mapping);
  expect(rows.map((r) => r.tone)).toEqual(["success", null]);
  expect(compileNativeFieldChoices([...rows].reverse(), f.context)).toEqual(
    f.source,
  );
  expect(
    compileNativeFieldChoices(
      rows.map((r) => ({ ...r, tone: "neutral" })),
      f.context,
    ).tones.pending,
  ).toBe("neutral");
});
it("rejects stale source, unknown properties, unsupported tones and label mismatch", () => {
  const f = fixture();
  expect(() =>
    convertLegacyFieldChoices(f.source, f.context, {
      ...f.mapping,
      sourceHash: "a".repeat(64),
    }),
  ).toThrow("NATIVE_CHOICES_SOURCE_HASH_MISMATCH");
  expect(() =>
    convertLegacyFieldChoices(
      f.source,
      { ...f.context, domainValues: null },
      f.mapping,
    ),
  ).toThrow("NATIVE_CHOICES_DOMAIN_EVIDENCE_REQUIRED");
  expect(() =>
    convertLegacyFieldChoices(
      f.source,
      { ...f.context, domainValues: ["active"] },
      f.mapping,
    ),
  ).toThrow("NATIVE_CHOICES_DOMAIN_VALUE_INVALID");
  const extra = { ...f.source, propertyBag: {} };
  expect(() =>
    convertLegacyFieldChoices(extra, f.context, {
      ...f.mapping,
      sourceHash: sha256(extra),
    }),
  ).toThrow("NATIVE_CHOICES_SOURCE_INVALID");
  expect(() =>
    convertLegacyFieldChoices(
      f.source,
      { ...f.context, labelText: () => "Incorrect" },
      f.mapping,
    ),
  ).toThrow("NATIVE_CHOICES_LABEL_SOURCE_MISMATCH");
  const tones = {
    ...f.source,
    tones: { active: "not-supported" },
  } as unknown as LegacyFieldChoices;
  expect(() =>
    convertLegacyFieldChoices(tones, f.context, {
      ...f.mapping,
      sourceHash: sha256(tones),
    }),
  ).toThrow();
});
it("rejects duplicate identities/values, gapped order and foreign fields", () => {
  const f = fixture(),
    rows = convertLegacyFieldChoices(f.source, f.context, f.mapping);
  expect(() =>
    compileNativeFieldChoices([rows[0]!, rows[0]!], f.context),
  ).toThrow("NATIVE_CHOICES_SCOPE_ORDER_INVALID");
  expect(() =>
    compileNativeFieldChoices(
      rows.map((r) => ({ ...r, position: r.position + 1 })),
      f.context,
    ),
  ).toThrow("NATIVE_CHOICES_SCOPE_ORDER_INVALID");
  expect(() =>
    compileNativeFieldChoices(
      rows.map((r) => ({ ...r, entityFieldId: coreFixtureId(50) })),
      f.context,
    ),
  ).toThrow("NATIVE_CHOICES_SCOPE_ORDER_INVALID");
  expect(() =>
    convertLegacyFieldChoices(f.source, f.context, {
      ...f.mapping,
      choices: {},
    }),
  ).toThrow("NATIVE_CHOICES_INVENTORY_INVALID");
});
it("handles prototype-like enum values as literal keys without changing object prototypes", () => {
  const f = fixture();
  const source: LegacyFieldChoices = {
    options: [{ value: "__proto__", label: "Active" }],
    tones: JSON.parse('{"__proto__":"warning"}'),
  };
  const rows = convertLegacyFieldChoices(source, f.context, {
    sourceHash: sha256(source),
    choices: Object.fromEntries([["__proto__", f.mapping.choices.active]]),
  });
  const result = compileNativeFieldChoices(rows, f.context);
  expect(Object.getPrototypeOf(result.tones)).toBe(Object.prototype);
  expect(Object.hasOwn(result.tones, "__proto__")).toBe(true);
  expect(result).toEqual(source);
});

async function graphFixture(name = "country") {
  const { readFileSync } = await import("node:fs");
  const { emptyReferenceMembers } =
    await import("@athyper/server-contract-meta-entity-authoring");
  const { parseSharedReferenceProduct, compileSharedReferenceProduct } =
    await import("./authoring/product.js");
  const { createLegacyNativeFieldChoicesAdapter } =
    await import("./native-field-choices.js");
  const { layoutFixtureRow } =
    await import("../../../../contracts/meta-entity-authoring/src/normalized-layout.fixtures.js");
  const product = parseSharedReferenceProduct(
    JSON.parse(
      readFileSync(
        new URL(
          "../../../../../../metadata/entities/common/reference/" +
            name +
            "/definition.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ),
  );
  const original = compileSharedReferenceProduct(product, "studio").graph;
  const source = {
    ...original,
    contractSchema: "athyper.meta-entity-contract/2.3" as const,
    referenceMembers: emptyReferenceMembers(),
    surfaceFieldBindings: original.surfaceFieldBindings!.map((b, i) => ({
      ...b,
      id: coreFixtureId(7000 + i),
    })),
  };
  const declaration = source.surfaceFieldBindings.find(
    (b) => b.displayConfig?.lookup,
  )!;
  const selected = {
    options: (
      declaration.displayConfig!.lookup as {
        options: LegacyFieldChoices["options"];
      }
    ).options,
    tones: declaration.displayConfig!.statusTones,
  } as LegacyFieldChoices;
  const context: NativeFieldChoiceContext = {
    ...fixture().context,
    field: {
      ...fixture().context.field,
      id: declaration.entityFieldId!,
      domainCode: null,
    },
    domainValues: null,
  };
  const labels = Object.fromEntries(
    selected.options.map((o, i) => [coreFixtureId(8000 + i), o.label]),
  );
  const choices = Object.fromEntries(
    selected.options.map((o, i) => [
      o.value,
      { id: coreFixtureId(9000 + i), labelId: coreFixtureId(8000 + i) },
    ]),
  );
  const admittedContext = {
    ...context,
    labelText: (id: string) => labels[id]!,
  };
  const input = {
    source,
    sourceHash: sha256(source),
    resource: {
      owner: "test",
      key: "field-choices",
      version: 1,
      hash: "a".repeat(64),
    },
    dependencies: [],
    mappings: { [context.field.id]: { context: admittedContext, choices } },
  };
  const adapter = createLegacyNativeFieldChoicesAdapter(input);
  const prepared = adapter.forward(source);
  const target = {
    ...prepared,
    contractSchema: "athyper.meta-entity-contract/2.4" as const,
    fields: [context.field],
    runtimeProfiles: [],
    surfaces: [],
    surfaceSections: [],
    surfaceFieldBindings: source.surfaceFieldBindings.map((b, i) =>
      layoutFixtureRow("binding", b.id!, {
        entitySurfaceId: b.entitySurfaceId!,
        entityFieldId: b.entityFieldId!,
        bindingKey: "fixture_" + i,
        bindingKind: "field",
        position: i + 1,
        columnSpan: 1,
      }),
    ),
    authoringSource: {
      entityId: coreFixtureId(100),
      tenantId: null,
      sourceKind: "product" as const,
      authoringSchemaHash: "b".repeat(64),
    },
  };
  return { input, source, adapter, prepared, target, context };
}
for (const name of ["country", "state_region"])
  it(
    "accounts for actual " +
      name +
      " repeated choice displays without consuming unrelated paths",
    async () => {
      const f = await graphFixture(name);
      expect(f.adapter.reverse(f.prepared, f.target)).toEqual(f.source);
      expect(f.prepared.referenceMembers!.members.fieldChoice).toHaveLength(2);
      for (const b of f.prepared.surfaceFieldBindings!.filter(
        (b) => b.entityFieldId === f.context.field.id,
      )) {
        expect(b.displayConfig).not.toHaveProperty("lookup");
        expect(b.displayConfig).not.toHaveProperty("statusTones");
        expect(b.displayConfig).toHaveProperty("semanticRole", "status");
      }
      const target = structuredClone(f.target);
      (
        target.referenceMembers!.members.fieldChoice[0] as { tone: string }
      ).tone = "danger";
      const restored = f.adapter.reverse(f.prepared, target);
      for (const b of restored.surfaceFieldBindings!.filter(
        (b) => b.entityFieldId === f.context.field.id,
      ))
        expect(
          (b.displayConfig!.statusTones as Record<string, string>).active,
        ).toBe("danger");
    },
  );
it("rejects conflicting declarations, overwritten members, unsupported lookups and target scope loss", async () => {
  const { createLegacyNativeFieldChoicesAdapter } =
    await import("./native-field-choices.js");
  const f = await graphFixture();
  const source = structuredClone(f.source);
  const bindings = source.surfaceFieldBindings.filter(
    (b) => b.displayConfig?.lookup,
  );
  (bindings[1]!.displayConfig as { statusTones: object }).statusTones = {
    active: "danger",
    deprecated: "warning",
  };
  expect(() =>
    createLegacyNativeFieldChoicesAdapter({
      ...f.input,
      source,
      sourceHash: sha256(source),
    }),
  ).toThrow("NATIVE_CHOICES_CORRELATED_SOURCE_CONFLICT");
  const lookup = structuredClone(f.source);
  (
    lookup.surfaceFieldBindings.find((b) => b.displayConfig?.lookup)!
      .displayConfig!.lookup as Record<string, unknown>
  ).provider = "unknown";
  expect(() =>
    createLegacyNativeFieldChoicesAdapter({
      ...f.input,
      source: lookup,
      sourceHash: sha256(lookup),
    }),
  ).toThrow("NATIVE_CHOICES_LOOKUP_UNSUPPORTED");
  const collision = {
    ...f.input,
    mappings: {
      [f.context.field.id]: {
        ...f.input.mappings[f.context.field.id]!,
        choices: Object.fromEntries(
          Object.entries(f.input.mappings[f.context.field.id]!.choices).map(
            ([k, v]) => [k, { ...v, id: coreFixtureId(1) }],
          ),
        ),
      },
    },
  };
  expect(() => createLegacyNativeFieldChoicesAdapter(collision)).toThrow(
    "NATIVE_CHOICES_CORRELATED_SOURCE_CONFLICT",
  );
  expect(() =>
    f.adapter.reverse(f.prepared, { ...f.target, surfaceFieldBindings: [] }),
  ).toThrow("NATIVE_CHOICES_BINDING_SCOPE_INVALID");
  const target = structuredClone(f.target);
  (target.referenceMembers!.members as { fieldChoice: unknown }).fieldChoice =
    [];
  expect(() => f.adapter.reverse(f.prepared, target)).toThrow(
    "NATIVE_CHOICES_INVENTORY_INVALID",
  );
  expect(() =>
    f.adapter.forward({
      ...f.source,
      entity: { ...f.source.entity, entityCode: "stale" },
    }),
  ).toThrow("NATIVE_CHOICES_SOURCE_HASH_MISMATCH");
});
