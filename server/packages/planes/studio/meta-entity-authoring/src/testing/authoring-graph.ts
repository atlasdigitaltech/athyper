import type { MetaEntityGraph } from "@athyper/server-contract-meta-entity-authoring";

/** Test-owned native graph; no dependency on removed product UI editors. */
export function authoringGraph(): MetaEntityGraph {
  return {
    contractSchema: "athyper.meta-entity-contract/2.1",
    entity: { entityCode: "sample" },
    runtimeProfiles: [
      {
        profileKey: "default",
        backingKind: "virtual",
        apiExposure: "catalog_only",
        readMode: "none",
        writeMode: "none",
      },
    ],
    fields: [
      {
        id: "field-name",
        fieldKey: "name",
        dataType: "string",
        typeConfig: { kind: "string" },
      },
    ],
    operations: [
      {
        operationKey: "read",
        operationKind: "read",
        label: "Read",
        auditEventCode: "sample.read",
      },
    ],
    surfaces: [
      {
        id: "surface-main",
        surfaceKey: "main",
        surfaceKind: "form",
        title: "Main",
      },
    ],
    surfaceSections: [
      {
        id: "section-main",
        entitySurfaceId: "surface-main",
        sectionKey: "main",
        title: "Main",
        position: 0,
      },
      {
        id: "section-last",
        entitySurfaceId: "surface-main",
        sectionKey: "last",
        title: "Last",
        position: 1,
      },
    ],
    surfaceFieldBindings: [
      {
        id: "placement-name",
        entitySurfaceId: "surface-main",
        entitySurfaceSectionId: "section-main",
        entityFieldId: "field-name",
        bindingKey: "name",
        position: 0,
      },
    ],
    flows: [
      {
        id: "flow",
        flowKey: "default",
        title: "Default",
        flowKind: "wizard",
        navigationMode: "linear",
      },
    ],
    flowSteps: [
      {
        id: "step",
        entityFlowId: "flow",
        entitySurfaceId: "surface-main",
        stepKey: "main",
        position: 0,
      },
    ],
  };
}

export function intakeGraph(): MetaEntityGraph {
  const graph = authoringGraph();
  return {
    ...graph,
    fields: [
      {
        id: "field-name",
        fieldKey: "requested_role",
        dataType: "string",
        typeConfig: { kind: "string" },
        valueOrigin: "runtime",
        writeMode: "mutable",
        cardinality: "one",
      },
    ],
    surfaces: [
      {
        id: "surface-main",
        surfaceKey: "intake",
        surfaceKind: "form",
        title: "Input",
        layoutConfig: {
          renderer: "intake",
          intakePresentation: {
            defaultLayout: "content",
            allowedLayouts: ["content", "sections-content-guidance"],
          },
        },
      },
    ],
    surfaceSections: graph.surfaceSections!.slice(0, 1),
    surfaceFieldBindings: [
      {
        ...graph.surfaceFieldBindings![0]!,
        widgetKey: "input",
        displayConfig: {
          widget: "text",
          valueKey: "requested_role",
          required: true,
        },
      },
    ],
  };
}
