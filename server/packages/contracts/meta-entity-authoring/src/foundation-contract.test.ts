import { describe, expect, it } from "vitest";
import {
  validateFoundationNode,
  ownedLabelsContract,
  ownedLabelMappings,
  parseOwnedLabels,
  assertOwnedLabelsComplete,
  contractJsonSchema,
  type OwnedLabelGraph,
} from "./foundation-contract.js";
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const context = {
  entityId: id(1),
  changeSetId: id(2),
  tenantId: null,
  supportedLocales: ["en", "ms"],
};
const graph = (): OwnedLabelGraph => ({
  contract: "entity.authoring-owned-labels/1",
  entityId: id(1),
  changeSetId: id(2),
  tenantId: null,
  defaultLocale: "en",
  requiredLocales: ["en", "ms"],
  labels: [
    {
      id: id(3),
      labelKey: "reference.name",
      defaultText: "Name",
      sourceKind: "owned",
      sharedLabelKey: null,
      sharedResourceKey: null,
      sharedResourceVersion: null,
      sharedResourceHash: null,
    },
  ],
  translations: [{ id: id(4), labelId: id(3), localeCode: "ms", text: "Nama" }],
});
describe("F0 closed owned-label contract (INV-001/006/007)", () => {
  it("has a column mapping for every selected member property", () => {
    for (const branch of ["labels", "translations"] as const) {
      expect(
        Object.keys(
          ownedLabelsContract.properties[branch].items.properties,
        ).sort(),
      ).toEqual(Object.keys(ownedLabelMappings[branch].columns).sort());
    }
    expect(contractJsonSchema(ownedLabelsContract)).toMatchObject({
      additionalProperties: false,
      required: expect.arrayContaining(["tenantId", "labels"]),
    });
  });
  it("accepts owned rows and complete translations", () => {
    expect(parseOwnedLabels(graph(), context)).toEqual(graph());
    assertOwnedLabelsComplete(graph(), context);
  });
  it.each([
    [
      "unknown branch",
      (g: any) => {
        g.operations = [];
      },
      "FOUNDATION_UNSUPPORTED_PROPERTY",
    ],
    [
      "unknown property",
      (g: any) => {
        g.labels[0].typeConfig = {};
      },
      "FOUNDATION_UNSUPPORTED_PROPERTY",
    ],
    [
      "absent nullable value",
      (g: any) => {
        delete g.labels[0].sharedLabelKey;
      },
      "FOUNDATION_REQUIRED_PROPERTY",
    ],
    [
      "shared variant",
      (g: any) => {
        g.labels[0].sourceKind = "shared";
      },
      "FOUNDATION_UNSUPPORTED_VALUE",
    ],
    [
      "blank text",
      (g: any) => {
        g.labels[0].defaultText = " ";
      },
      "FOUNDATION_VALUE_INVALID",
    ],
    [
      "foreign draft",
      (g: any) => {
        g.changeSetId = id(9);
      },
      "FOUNDATION_OWNERSHIP_MISMATCH",
    ],
    [
      "foreign tenant",
      (g: any) => {
        g.tenantId = id(9);
      },
      "FOUNDATION_OWNERSHIP_MISMATCH",
    ],
    [
      "duplicate label",
      (g: any) => {
        g.labels.push({ ...g.labels[0] });
      },
      "FOUNDATION_DUPLICATE_LABEL",
    ],
    [
      "orphan translation",
      (g: any) => {
        g.translations[0].labelId = id(9);
      },
      "FOUNDATION_REFERENCE_INVALID",
    ],
    [
      "default translation",
      (g: any) => {
        g.translations[0].localeCode = "en";
      },
      "FOUNDATION_TRANSLATION_LOCALE_INVALID",
    ],
    [
      "duplicate translation",
      (g: any) => {
        g.translations.push({ ...g.translations[0], id: id(9) });
      },
      "FOUNDATION_DUPLICATE_TRANSLATION",
    ],
    [
      "unsupported locale",
      (g: any) => {
        g.requiredLocales.push("xx");
      },
      "FOUNDATION_LOCALE_UNSUPPORTED",
    ],
  ])("rejects %s", (_name, mutate, code) => {
    const value = structuredClone(graph());
    mutate(value);
    expect(() => parseOwnedLabels(value, context)).toThrow(code);
  });
  it("permits incomplete translation drafts but blocks compilation", () => {
    const draft = { ...graph(), translations: [] };
    expect(parseOwnedLabels(draft, context)).toEqual(draft);
    expect(() => assertOwnedLabelsComplete(draft, context)).toThrow(
      "FOUNDATION_TRANSLATION_REQUIRED",
    );
  });
});

it("rejects non-JSON authoring shapes instead of changing them during serialization", () => {
  const node = {
    type: "object",
    properties: { values: { type: "array", items: { type: "string" } } },
  } as const;
  for (const values of [
    new Array(1),
    Object.assign(["valid"], { extra: true }),
  ])
    expect(() => validateFoundationNode(node, { values }, "")).toThrow();
  expect(() =>
    validateFoundationNode(
      node,
      Object.assign(new Date(), { values: ["valid"] }),
      "",
    ),
  ).toThrow();
  const accessor = {
    get values() {
      throw Error("GETTER_MUST_NOT_EXECUTE");
    },
  };
  expect(() => validateFoundationNode(node, accessor, "")).toThrow(
    "FOUNDATION_VALUE_INVALID",
  );
  const hidden = Object.defineProperty({}, "values", {
    value: ["valid"],
    enumerable: false,
  });
  expect(() => validateFoundationNode(node, hidden, "")).toThrow();
  expect(() =>
    validateFoundationNode(
      node,
      { values: ["valid"], [Symbol("extra")]: true },
      "",
    ),
  ).toThrow();
});
