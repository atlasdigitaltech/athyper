import type { MetaEntityGraph } from "@athyper/server-contract-meta-entity-authoring";

const presentations = {
  intake_partner: { defaultLayout: "content", allowedLayouts: ["content"] },
  intake_details: {
    defaultLayout: "sections-content-guidance",
    allowedLayouts: [
      "content",
      "sections-content",
      "sections-content-guidance",
    ],
    guidance: {
      title: "Guidance",
      description:
        "Use the selected section to complete the information required for this request.",
    },
  },
  intake_review: { defaultLayout: "content", allowedLayouts: ["content"] },
} as const;

/** Presentation-only product overlay; preserve explicit author choices. */
export function withBusinessPartnerIntakePresentations(
  source: MetaEntityGraph,
): MetaEntityGraph {
  if (source.entity.entityCode !== "business_partner")
    throw Error("Business Partner graph required");
  return {
    ...source,
    surfaces: source.surfaces?.map((surface) => {
      const presentation =
        presentations[surface.surfaceKey as keyof typeof presentations];
      if (
        !presentation ||
        surface.layoutConfig?.intakePresentation !== undefined
      )
        return surface;
      return {
        ...surface,
        layoutConfig: {
          ...surface.layoutConfig,
          intakePresentation: presentation,
        },
      };
    }),
  };
}

/** A publication request must not report success when its prerequisite surfaces
 * are missing. Provisioning may legitimately call the permissive overlay earlier. */
export function publishedBusinessPartnerIntakeOverlay(
  source: MetaEntityGraph,
): MetaEntityGraph {
  if (
    Object.keys(presentations).some(
      (key) =>
        !source.surfaces?.some(
          (s) => s.surfaceKey === key && s.status !== "deprecated",
        ),
    )
  ) {
    throw Error("DEV_PUBLICATION_INTAKE_SURFACES_NOT_PUBLISHED");
  }
  return withBusinessPartnerIntakePresentations(source);
}
