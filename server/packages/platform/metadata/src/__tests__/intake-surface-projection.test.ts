import { describe, it, expect } from "vitest";
import { compileEntityIntakeSurfaces } from "../intake-surface-projection";
import { readFileSync } from "node:fs";
import {
  intakeSurfaceValues,
  validateIntakeSurface,
  parseEntityIntakeSurfaces,
} from "@athyper/contract-platform-entity-runtime";
const graphs = JSON.parse(
  readFileSync(
    new URL("./fixtures/intake-choice-graphs.json", import.meta.url),
    "utf8",
  ),
);
function graph(entityCode = "supplier_invoice"): Record<string, any> {
  return structuredClone(graphs[entityCode]);
}
const invoiceClassificationSurface = compileEntityIntakeSurfaces(graph())[0]!;
describe("existing authoring surface lowering", () => {
  it.each(["supplier_invoice", "business_partner"])(
    "compiles %s runtime-only fields without storage",
    (code) => {
      const g = graph(code);
      const surfaces = compileEntityIntakeSurfaces(
        g as unknown as Record<string, unknown>,
      );
      expect(surfaces).toHaveLength(1);
      expect(surfaces[0]!.sections[0]!.fields[0]!.control).toBe("choiceCards");
      expect(
        g.fields.every(
          (f: any) => f.valueOrigin === "runtime" && !f.storagePath,
        ),
      ).toBe(true);
    },
  );
  it("rejects unknown widgets and broken references", () => {
    const g = graph();
    expect(() =>
      compileEntityIntakeSurfaces({
        ...g,
        surfaceFieldBindings: g.surfaceFieldBindings!.map((b: any) => ({
          ...b,
          widgetKey: "script",
        })),
      }),
    ).toThrow(/WIDGET/);
    expect(() => compileEntityIntakeSurfaces({ ...g, fields: [] })).toThrow(
      /CHOICE_FIELD/,
    );
    expect(() =>
      compileEntityIntakeSurfaces({ ...g, surfaceSections: [] }),
    ).toThrow(/REFERENCE/);
  });
  it("rejects duplicate ordering and option values", () => {
    const g = graph();
    expect(() =>
      compileEntityIntakeSurfaces({
        ...g,
        surfaceSections: g.surfaceSections!.map((s: any) => ({
          ...s,
          position: 0,
        })),
      }),
    ).toThrow(/POSITION/);
    const s = structuredClone(invoiceClassificationSurface);
    const choice = s.sections[0]!.fields[0]!;
    if (choice.control !== "choiceCards") throw Error("Choice fixture expected");
    (choice.options as any[]).push(choice.options[0]);
    expect(() => parseEntityIntakeSurfaces([s])).toThrow(/duplicate/);
  });
  it("sanitizes inactive values and rejects unknown conditions", () => {
    const s = structuredClone(invoiceClassificationSurface) as any;
    s.sections[0].fields[0].options[0].availableWhen = {
      field: "invoice_basis",
      operator: "equals",
      value: "purchase_order",
    };
    s.sections[0].fields[0].options[0].unavailableReason =
      "Select a purchase order basis.";
    const surface = parseEntityIntakeSurfaces([s])[0]!;
    const answers = {
      invoice_type: "standard",
      invoice_basis: "non_po",
      supplier_relationship: "existing",
      injected: "bad",
    };
    expect(intakeSurfaceValues(surface, answers)).toEqual({
      invoice_basis: "non_po",
      supplier_relationship: "existing",
    });
    expect(validateIntakeSurface(surface, answers).invoice_type).toMatch(
      /no longer/,
    );
    s.sections[0].fields[0].options[0].availableWhen.field = "missing";
    expect(() => parseEntityIntakeSurfaces([s])).toThrow(/unknown condition/);
  });
  it("rejects cyclic dependencies", () => {
    const s = structuredClone(invoiceClassificationSurface) as any;
    s.sections[0].fields[0].visibleWhen = {
      field: "invoice_basis",
      operator: "present",
    };
    s.sections[1].fields[0].visibleWhen = {
      field: "invoice_type",
      operator: "present",
    };
    expect(() => parseEntityIntakeSurfaces([s])).toThrow(/cyclic/);
  });
});

it("compiles bounded presentation presets from field binding metadata", () => {
  const g = graph("business_partner");
  g.surfaceFieldBindings[0].displayConfig = {
    ...g.surfaceFieldBindings[0].displayConfig,
    layout: "grid",
    optionColumns: 2,
    density: "compact",
  };
  const field = compileEntityIntakeSurfaces(g)[0]!.sections[0]!.fields[0]!;
  if (field.control !== "choiceCards") throw Error("Choice fixture expected");
  expect(field.presentation).toEqual({
    layout: "grid",
    optionColumns: 2,
    density: "compact",
  });
  const defaultField = compileEntityIntakeSurfaces(graph("business_partner"))[0]!.sections[0]!.fields[0]!;
  if(defaultField.control !== "choiceCards") throw Error("Choice fixture expected");
  expect(defaultField.presentation).toBeUndefined();
});
it.each([
  { layout: "masonry" },
  { optionColumns: 3 },
  { optionColumns: "2" },
  { density: "tiny" },
  { layout: "stacked", optionColumns: 2 },
])("rejects unsupported choice presentation %j", (config) => {
  const g = graph("business_partner");
  Object.assign(g.surfaceFieldBindings[0].displayConfig, config);
  expect(() => compileEntityIntakeSurfaces(g)).toThrow(/choice|stacked/);
});
