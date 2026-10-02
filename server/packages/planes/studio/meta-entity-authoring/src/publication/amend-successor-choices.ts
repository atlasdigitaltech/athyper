import type { MetaEntityGraph } from "@athyper/server-contract-meta-entity-authoring";
import { buildSharedReferenceGraph } from "../authoring/graph-builder.js";
import type { SharedReferenceProduct } from "../authoring/product.js";
import { compileGraph } from "../deterministic.js";

/** Amend finite domains on a pinned successor. Never replaces permissions, storage, capabilities or unrelated presentation. */
export function amendSuccessorChoices(
  graph: MetaEntityGraph,
  product: SharedReferenceProduct,
): MetaEntityGraph {
  if (
    graph.entity.entityCode !== product.definition.entityCode ||
    graph.entity.entityClass !== "reference" ||
    graph.entity.ownershipModel !== "system" ||
    graph.runtimeProfiles?.length !== 1 ||
    graph.runtimeProfiles[0]?.storageSchema !== "shared" ||
    graph.runtimeProfiles[0]?.storageObject !==
      product.definition.storageObject ||
    graph.runtimeProfiles[0]?.writeMode !== "none"
  )
    throw Error("CHOICE_PRODUCT_SOURCE_MISMATCH");
  const proposed = buildSharedReferenceGraph(product.definition, "studio");
  const selected = product.definition.fields.filter((field) => field.choices);
  const keys = new Set(selected.map((field) => field.key));
  for (const field of selected) {
    const original = graph.fields.find((item) => item.fieldKey === field.key);
    if (
      !original ||
      !["string", "enum"].includes(original.dataType) ||
      original.storagePath !== field.key ||
      original.writeMode !== "read_only"
    )
      throw Error("CHOICE_PRODUCT_FIELD_MISMATCH");
  }
  const originalFields = new Map(
    graph.fields.map((field) => [field.id, field.fieldKey]),
  );
  const sourceFields = new Map(
    proposed.fields.map((field) => [field.fieldKey, field]),
  );
  const list = proposed.surfaces!.find(
    (surface) => surface.surfaceKind === "list",
  )!;
  const labels = list.layoutConfig!.localizedLabels as
    Record<string, any> | undefined;
  const choiceLabels = labels?.options;
  const updateLabels = (current: any) => ({
    ...(current ?? {}),
    options: { ...current?.options, ...choiceLabels },
    fields: current?.fields ?? {},
  });
  const amended: MetaEntityGraph = {
    ...structuredClone(graph),
    fields: graph.fields.map((field) =>
      keys.has(field.fieldKey)
        ? {
            ...field,
            dataType: "enum",
            typeConfig: sourceFields.get(field.fieldKey)!.typeConfig,
          }
        : field,
    ),
    surfaceFieldBindings: graph.surfaceFieldBindings?.map((binding) => {
      const key = originalFields.get(binding.entityFieldId);
      if (!key || !keys.has(key)) return binding;
      const source = proposed.surfaceFieldBindings!.find(
        (item) => item.entityFieldId === sourceFields.get(key)!.id,
      )!;
      return {
        ...binding,
        displayConfig: {
          ...binding.displayConfig,
          ...source.displayConfig,
          defaultVisible: binding.displayConfig?.defaultVisible ?? true,
        },
      };
    }),
    surfaces: graph.surfaces?.map((surface) => {
      const layout = surface.layoutConfig ?? {};
      if (surface.surfaceKind === "list")
        return {
          ...surface,
          layoutConfig: {
            ...layout,
            localizedLabels: updateLabels(layout.localizedLabels),
          },
        };
      if (surface.surfaceKind !== "detail") return surface;
      const presentation = layout.recordPresentation as
        Record<string, any> | undefined;
      if (!presentation) throw Error("CHOICE_PRODUCT_PRESENTATION_REQUIRED");
      const sourcePresentation = proposed.surfaces!.find(
        (item) => item.surfaceKind === "detail",
      )!.layoutConfig!.recordPresentation as Record<string, any>;
      return {
        ...surface,
        layoutConfig: {
          ...layout,
          recordPresentation: {
            ...presentation,
            localizedLabels: updateLabels(presentation.localizedLabels),
            badges: [
              ...(presentation.badges ?? []).filter(
                (badge: { field: string }) => !keys.has(badge.field),
              ),
              ...(sourcePresentation.badges ?? []),
            ],
          },
        },
      };
    }),
  };
  compileGraph(amended);
  return amended;
}
