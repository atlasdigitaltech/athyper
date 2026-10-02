import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  parseSharedReferenceProduct,
  compileSharedReferenceProduct,
} from "./product.js";
const root = new URL(
  "../../../../../../../metadata/products/shared/entities/",
  import.meta.url,
);
const source = (entity = "country") =>
  JSON.parse(readFileSync(new URL(`${entity}/definition.json`, root), "utf8"));
describe("shared reference choices", () => {
  it.each([
    "country",
    "state_region",
    "currency",
    "language",
    "locale",
    "timezone",
  ])(
    "publishes %s through the same reference path on every plane",
    (entity) => {
      const product = parseSharedReferenceProduct(source(entity));
      for (const plane of ["studio", "neon", "mesh"] as const) {
        const { graph } = compileSharedReferenceProduct(product, plane);
        const status = graph.fields.find(
          (field) => field.fieldKey === "status",
        )!;
        expect(status).toMatchObject({
          dataType: "enum",
          typeConfig: { kind: "enum", domain_code: "shared.ref_status_d" },
          writeMode: "read_only",
        });
        expect(
          graph.surfaceFieldBindings?.filter(
            (binding) => binding.entityFieldId === status.id,
          ),
        ).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              displayConfig: expect.objectContaining({
                semanticRole: "status",
                statusTones: { active: "success", deprecated: "warning" },
                lookup: {
                  options: [
                    { value: "active", label: "Active" },
                    { value: "deprecated", label: "Deprecated" },
                  ],
                },
              }),
            }),
          ]),
        );
        const presentation = graph.surfaces?.find(
          (surface) => surface.surfaceKind === "detail",
        )?.layoutConfig?.recordPresentation as any;
        expect(presentation.badges).toEqual([
          {
            field: "status",
            tones: { active: "success", deprecated: "warning" },
          },
        ]);
        expect(
          presentation.localizedLabels.options.status.active.defaultText,
        ).toBe("Active");
        expect(
          graph.operations.map((operation) => operation.operationKey),
        ).toEqual(["list", "read"]);
      }
    },
  );
  it("retains the subdivision composite natural key", () => {
    const { graph } = compileSharedReferenceProduct(
      parseSharedReferenceProduct(source("state_region")),
      "neon",
    );
    const key = graph.keys?.find((key) => key.keyKey === "code")!;
    expect(
      graph.keyFields
        ?.filter((field) => field.entityKeyId === key.id)
        .map(
          (binding) =>
            graph.fields.find((field) => field.id === binding.entityFieldId)
              ?.fieldKey,
        ),
    ).toEqual(["country_code", "code"]);
  });
  it.each([
    "missing-domain",
    "duplicate-choice",
    "invalid-tone",
    "status-string",
  ])("rejects %s before publication", (failure) => {
    const input = source();
    const status = input.definition.fields.find(
      (field: any) => field.key === "status",
    );
    if (failure === "missing-domain") delete status.domainCode;
    if (failure === "duplicate-choice") status.choices.push(status.choices[0]);
    if (failure === "invalid-tone") status.choices[0].tone = "arbitrary-css";
    if (failure === "status-string") status.type = "string";
    expect(() => parseSharedReferenceProduct(input)).toThrow();
  });
});
