import { withBusinessPartnerComplianceRequirement } from "./business-partner-compliance-requirement.js";
import { withBusinessPartnerDataSurfaces } from "./business-partner-data-surfaces";
import { withBusinessPartnerFullProfile } from "./business-partner-full-profile";
import { withBusinessPartnerLabels } from "./business-partner-labels";
import { withIntakeChoiceSurface, businessPartnerRoleSurface, withBusinessPartnerLookup } from "./intake-choice-surfaces";
import { presentationUuid } from "./presentation-graph-helpers";
import type { MetaEntityGraph } from "@athyper/server-contract-meta-entity-authoring";
function id(key: string) {
  return presentationUuid(key);
}
/** Pilot configuration in the existing native flow tables; preserves unrelated authoring rows. */
export function withBusinessPartnerIntake(
  source: MetaEntityGraph,
): MetaEntityGraph {
  if (source.entity.entityCode !== "business_partner")
    throw Error("Business Partner graph required");
  const graph = withBusinessPartnerLookup(withIntakeChoiceSurface(source, businessPartnerRoleSurface));
  const entry = graph.operations.find(
    (o) => o.operationKey === "request_supplier" && o.status !== "deprecated",
  );
  const completion = graph.operations.find(
    (o) => o.operationKey === "case_submit" && o.status !== "deprecated",
  );
  if (!entry || !completion)
    throw Error("Published request entry and submit operations required");
  const existing = graph.flows?.find((f) => f.flowKey === "request_intake");
  const flowId = existing?.id ?? id("business_partner.flow.request_intake");
  const steps = [
    {
      key: "partner",
      title: "Partner",
      description:
        "Choose a role, then find an existing partner or request a new one.",
    },
    {
      key: "details",
      title: "Details",
      description:
        "Enter the details required for the selected role and organization.",
    },
    {
      key: "review",
      title: "Review & submit",
      description: "Check the request before submitting it for approval.",
    },
  ];
  const surfaces = [...(graph.surfaces ?? [])];
  const flowSteps = steps.map((step, position) => {
    const surfaceKey = `intake_${step.key}`;
    let surface = surfaces.find((s) => s.surfaceKey === surfaceKey);
    if (!surface) {
      surface = {
        id: id(`business_partner.surface.${surfaceKey}`),
        surfaceKey,
        surfaceKind: "form",
        title: step.title,
        status: "active",
      };
      surfaces.push(surface);
    }
    return {
      id: id(`business_partner.step.${step.key}`),
      entityFlowId: flowId,
      entitySurfaceId: surface.id!,
      stepKey: step.key,
      position: position * 10,
      titleOverride: step.title,
      description: step.description,
      isOptional: false,
    };
  });
  return withBusinessPartnerLabels({
    ...graph,
    surfaces,
    flows: [
      ...(graph.flows ?? []).filter((f) => f.flowKey !== "request_intake"),
      {
        id: flowId,
        flowKey: "request_intake",
        flowKind: "create",
        title: "New business partner request",
        navigationMode: "linear",
        entryOperationId: entry.id,
        completionOperationId: completion.id,
        allowDraftResume: true,
        status: "active",
      },
    ],
    flowSteps: [
      ...(graph.flowSteps ?? []).filter((s) => s.entityFlowId !== flowId),
      ...flowSteps,
    ],
  });
}

/** Ordered authoring pipeline. Supply the legacy form when creating native intake surfaces. */
export function provisionBusinessPartnerIntakeGraph(
  source: MetaEntityGraph,
  form?: Parameters<typeof withBusinessPartnerDataSurfaces>[1],
): MetaEntityGraph {
  if (source.entity.entityCode !== "business_partner") throw Error("Business Partner graph required");
  const graph = form ? withBusinessPartnerDataSurfaces(withBusinessPartnerIntake(source), form) : source;
  return withBusinessPartnerComplianceRequirement(withBusinessPartnerFullProfile(graph));
}
