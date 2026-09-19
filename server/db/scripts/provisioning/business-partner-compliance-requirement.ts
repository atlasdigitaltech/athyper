import { createHash } from "node:crypto";
import type { MetaEntityGraph } from "@athyper/server-contract-meta-entity-authoring";
import { supplierRequirementFieldContract } from "@athyper/server-contract-master-data";

const id = (key: string) => {
  const h = createHash("sha256")
    .update(`bp.compliance-requirement.v1.${key}`)
    .digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
};

/** Native authoring; these canonical payload paths belong to the case snapshot, not master columns. */
export function withBusinessPartnerComplianceRequirement(
  source: MetaEntityGraph,
): MetaEntityGraph {
  if (source.entity.entityCode !== "business_partner")
    throw Error("Business Partner graph required");
  const copy = structuredClone(source);
  const graph = {
    ...copy,
    fields: [...copy.fields],
    surfaces: [...(copy.surfaces ?? [])],
    surfaceSections: [...(copy.surfaceSections ?? [])],
    surfaceFieldBindings: [...(copy.surfaceFieldBindings ?? [])],
  };
  const surface = graph.surfaces.find((s) => s.surfaceKey === "intake_details");
  if (!surface?.id) throw Error("Published intake details required");
  const sectionId = id("section");
  const position =
    graph.surfaceSections.find((s) => s.id === sectionId)?.position ??
    Math.max(
      0,
      ...graph.surfaceSections
        .filter((s) => s.entitySurfaceId === surface.id)
        .map((s) => s.position),
    ) + 10;
  graph.surfaceSections = [
    ...graph.surfaceSections.filter((s) => s.id !== sectionId),
    {
      id: sectionId,
      entitySurfaceId: surface.id,
      sectionKey: "request_governance",
      sectionKind: "section",
      collapsible: false,
      collapsedByDefault: false,
      layoutConfig: {},
      title: "Request governance",
      position,
      columnCount: 12,
    },
  ];
  const fields = [
    {
      valueKey: "requestedComplianceLevel",
      key: "details_requested_compliance_level",
      label: "Compliance requirement",
      widget: "select",
      required: true,
      lookup: {
        options: supplierRequirementFieldContract.allowedLevels.map(
          (value) => ({
            value,
            label: value[0]!.toUpperCase() + value.slice(1),
          }),
        ),
      },
      helpText:
        "Requested depth of onboarding governance, not a verified compliance result. Required before submission.",
    },
    {
      valueKey: "complianceRequirementReason",
      key: "details_compliance_requirement_reason",
      label: "Requirement reason",
      widget: "textarea",
      required: false,
      maxLength: supplierRequirementFieldContract.reasonMaxLength,
      variants: [
        {
          when: {
            field: "details_requested_compliance_level",
            operator: "equals",
            value: "basic",
          },
          required: true,
        },
      ],
      helpText:
        "Explain a Basic requirement or any change to a saved requirement.",
    },
  ];
  for (const [position, field] of fields.entries()) {
    const fieldId = id(field.key);
    graph.fields = [
      ...graph.fields.filter((f) => f.id !== fieldId),
      {
        id: fieldId,
        fieldKey: field.key,
        dataType: "string",
        typeConfig: { kind: "string" },
        valueOrigin: "runtime",
        writeMode: "mutable",
        cardinality: "one",
        dataClassification: "internal",
        status: "active",
      },
    ];
    const { key, label, ...displayConfig } = field;
    graph.surfaceFieldBindings = [
      ...graph.surfaceFieldBindings.filter(
        (b) => b.id !== id(`binding.${key}`),
      ),
      {
        id: id(`binding.${key}`),
        entitySurfaceId: surface.id,
        entitySurfaceSectionId: sectionId,
        entityFieldId: fieldId,
        bindingKey: key,
        position,
        labelOverride: label,
        columnSpan: 12,
        showRequiredIndicator: true,
        widgetKey: "input",
        status: "active",
        displayConfig: {
          ...displayConfig,
          payload: { target: "canonical", path: field.valueKey },
        },
      },
    ];
  }
  return graph;
}
