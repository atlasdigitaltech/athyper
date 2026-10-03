import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { prepareReferenceRuntime } from "../../../../../../db/scripts/provisioning/prepare-reference-runtime.js";
import { resolveRecordHeader } from "@athyper/contract-platform-entity-runtime";

it.each([
  "country",
  "state_region",
  "currency",
  "language",
  "locale",
  "timezone",
])("lowers %s enum and Atlas metadata on all planes", (entity) => {
  for (const plane of ["neon", "studio", "mesh"] as const) {
    const candidate = prepareReferenceRuntime(
      fileURLToPath(
        new URL(
          `../../../../../../../metadata/entities/${entity}/`,
          import.meta.url,
        ),
      ),
      plane,
    );
    const descriptor = candidate.descriptor;
    const status = descriptor.fields.find((field) => field.key === "status")!;
    expect(status).toMatchObject({
      type: "enum",
      filterable: true,
      validation: {
        options: ["active", "deprecated"],
        optionLabels: { active: "Active", deprecated: "Deprecated" },
      },
      list: {
        semanticRole: "status",
        statusTones: { active: "success", deprecated: "warning" },
      },
    });
    expect(descriptor.ai?.enabled).toBe(true);
    for (const field of candidate.product.definition.fields.filter(field => field.keyReference)) {
      expect(descriptor.fields.find(item => item.key === field.key)?.keyReference).toEqual(field.keyReference);
      expect(descriptor.ai?.relationshipKeys).toContain(field.key);
    }
    const header = resolveRecordHeader(
      descriptor.recordPresentation!,
      { status: "active", name: "Example", code: "EX" },
      {
        entityLabel: "Reference",
        fallbackTitle: "Reference",
        choiceLabels: { status: { active: "Aktif" } },
      },
    );
    expect(header.badges).toEqual([{ label: "Aktif", tone: "success" }]);
    expect(
      resolveRecordHeader(
        descriptor.recordPresentation!,
        { name: "Example" },
        { entityLabel: "Reference", fallbackTitle: "Reference" },
      ).badges,
    ).toEqual([]);
    expect(candidate.status).toBe("unsigned_candidate");
  }
});
