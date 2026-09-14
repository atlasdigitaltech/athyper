import type { MetaEntityGraph } from "@athyper/server-contract-meta-entity-authoring";

/** Upgrade known default copy in an authoring graph before normal publication.
 * Exact matches preserve customized wording; published releases are never mutated.
 */
export function withBusinessPartnerLabels(
  source: MetaEntityGraph,
): MetaEntityGraph {
  if (source.entity.entityCode !== "business_partner")
    throw Error("Business Partner graph required");
  const graph = structuredClone(source);
  const surface = graph.surfaces?.find(
    (s) => s.surfaceKey === "intake_partner",
  );
  if (!surface) return graph;
  const surfaceSections = graph.surfaceSections?.map((section) => {
    if (
      section.entitySurfaceId === surface.id &&
      section.sectionKey === "role" &&
      section.title === "Choose a role"
    ) {
      const { title: _title, ...rest } = section;
      return rest;
    }
    return section;
  });
  const surfaceFieldBindings = graph.surfaceFieldBindings?.map((binding) => {
    if (binding.entitySurfaceId !== surface.id) return binding;
    const labelOverride =
      binding.bindingKey === "requested_role" &&
      binding.labelOverride === "Requested role"
        ? "Role"
        : binding.labelOverride;
    const lookup = binding.displayConfig?.["lookup"] as
      Record<string, unknown> | undefined;
    if (lookup?.["adapterKey"] !== "business_partner.intake")
      return { ...binding, labelOverride };
    for (const action of (lookup["actions"] as
      Record<string, unknown>[] | undefined) ?? []) {
      if (
        action["key"] === "create_supplier" &&
        action["label"] === "Onboard new supplier"
      )
        action["label"] = "New supplier request";
      if (
        action["key"] === "create_customer" &&
        action["label"] === "Onboard new customer"
      )
        action["label"] = "New customer request";
    }
    return { ...binding, labelOverride };
  });
  const flow = graph.flows?.find((f) => f.flowKey === "request_intake");
  const flowSteps = graph.flowSteps?.map((step) => {
    if (
      flow &&
      step.entityFlowId === flow.id &&
      step.stepKey === "partner" &&
      step.description ===
        "Choose a role and find an existing partner, or start a new onboarding request."
    )
      return {
        ...step,
        description:
          "Choose a role, then find an existing partner or request a new one.",
      };
    return step;
  });
  return { ...graph, surfaceSections, surfaceFieldBindings, flowSteps };
}
