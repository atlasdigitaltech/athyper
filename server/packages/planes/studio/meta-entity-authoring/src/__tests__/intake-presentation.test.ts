import { expect, it } from "vitest";
import type { MetaEntityGraph } from "@athyper/server-contract-meta-entity-authoring";
import { publishedBusinessPartnerIntakeOverlay } from "../intake-presentation.js";
it("refuses to report unchanged when the published graph has no intake surfaces", () => {
  expect(() =>
    publishedBusinessPartnerIntakeOverlay({
      entity: { entityCode: "business_partner" },
      surfaces: [],
    } as unknown as MetaEntityGraph),
  ).toThrow("INTAKE_SURFACES_NOT_PUBLISHED");
});
it("changes only presentation on the three intake surfaces and preserves author choices", () => {
  const graph = {
    entity: { entityCode: "business_partner" },
    surfaces: [
      "intake_partner",
      "intake_details",
      "intake_review",
      "other",
    ].map((surfaceKey) => ({ surfaceKey, layoutConfig: { existing: true } })),
  } as unknown as MetaEntityGraph;
  const before = structuredClone(graph);
  const next = publishedBusinessPartnerIntakeOverlay(graph);
  expect(graph).toEqual(before);
  expect(next.surfaces![1]!.layoutConfig).toMatchObject({
    existing: true,
    intakePresentation: { defaultLayout: "sections-content-guidance" },
  });
  expect(next.surfaces![3]).toBe(graph.surfaces![3]);
  expect(publishedBusinessPartnerIntakeOverlay(next)).toEqual(next);
});
