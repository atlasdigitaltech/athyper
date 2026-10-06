import { expect, it } from "vitest";
import {
  coreFixtureId,
  coreFixtureRow,
} from "../../../../contracts/meta-entity-authoring/src/normalized-core.fixtures.js";
import {
  convertLegacyFieldChoices,
  compileNativeFieldChoices,
  type LegacyFieldChoices,
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
