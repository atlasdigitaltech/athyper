import { withBusinessPartnerLabels } from "./business-partner-labels";
import type { MetaEntityGraph } from "@athyper/server-contract-meta-entity-authoring";

/** Targeted authoring migration: retain every unrelated row and JSON property. */
export function withBusinessPartnerEntryPolicy(
  source: MetaEntityGraph,
): MetaEntityGraph {
  const graph = structuredClone(source);
  if (graph.entity.entityCode !== "business_partner")
    throw Error("Business Partner graph required");
  const entry = graph.operations.find(
    (op) =>
      op.operationKey === "request_supplier" && op.status !== "deprecated",
  );
  if (
    !entry ||
    !graph.operationPermissions?.some(
      (p) =>
        p.entityOperationId === entry.id &&
        p.permissionCode === "neon.relationship.entity_case.create" &&
        p.targetPlane === "neon",
    )
  )
    throw Error("Expected Business Partner request operation binding required");
  let policies = 0;
  for (const host of graph.surfaces ?? []) {
    const experience = host.layoutConfig?.["experience"] as
      Record<string, unknown> | undefined;
    if (
      !experience ||
      !graph.surfaceOperations?.some(
        (b) =>
          b.entitySurfaceId === host.id &&
          b.entityOperationId === entry.id &&
          b.placementKey === "new_supplier_request",
      )
    )
      continue;
    experience["operationEntryPolicies"] = {
      ...((experience["operationEntryPolicies"] as Record<string, unknown>) ??
        {}),
      request_supplier: "permission_only",
    };
    policies++;
  }
  if (policies !== 1)
    throw Error("Exactly one request navigation host required");
  const surface = graph.surfaces?.find(
    (s) => s.surfaceKey === "intake_partner",
  );
  if (!surface) throw Error("Intake partner surface required");
  const binding = graph.surfaceFieldBindings?.find(
    (b) => b.entitySurfaceId === surface.id && b.widgetKey === "entity_lookup",
  );
  const lookup = binding?.displayConfig?.["lookup"] as
    Record<string, unknown> | undefined;
  if (!lookup || lookup["adapterKey"] !== "business_partner.intake")
    throw Error("Business Partner intake lookup required");
  lookup["messages"] = {
    ...((lookup["messages"] as Record<string, unknown>) ?? {}),
    emptyTitle: "No business partners to display",
    emptyDescription: "You can request a new partner below.",
    noMatchesTitle: "No matching business partners found",
    noMatchesDescription: "Try another search term or adjust your filters.",
    selectMultiple: "Use selected partners",
  };
  lookup["emptyMessage"] = "No matching business partners found.";
  for (const action of (lookup["actions"] as Record<string, unknown>[]) ?? []) {
    if (action["kind"] === "select") action["label"] = "Use selected partner";
  }
  const flow = graph.flows?.find((f) => f.flowKey === "request_intake");
  return withBusinessPartnerLabels({
    ...graph,
    surfaceSections: graph.surfaceSections?.map((section) =>
      section.entitySurfaceId === surface.id &&
      section.sectionKey === "partner_search"
        ? {
            ...section,
            description:
              "Check existing suppliers and customers before requesting a new partner.",
          }
        : section,
    ),
    flowSteps: graph.flowSteps?.map((step) =>
      step.entityFlowId === flow?.id && step.stepKey === "partner"
        ? {
            ...step,
            description:
              "Choose a role, then find an existing partner or request a new one.",
          }
        : step,
    ),
  });
}
