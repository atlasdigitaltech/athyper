import type { MetaEntityGraph } from "@athyper/server-contract-meta-entity-authoring";
import { parseSharedReferenceProduct, type SharedReferenceProduct } from "../authoring/product.js";
import { buildSharedReferenceGraph } from "../authoring/graph-builder.js";
import { compileGraph, sha256 } from "../deterministic.js";

/** Draft-only, label-reference-only amendment. Never imports source capabilities,
 * permissions, runtime settings or default audiences into an existing release. */
export function amendSuccessorLocalization(graph: MetaEntityGraph, product: SharedReferenceProduct): MetaEntityGraph {
  const { capabilities, ...definition } = product.definition;
  const validated = parseSharedReferenceProduct({ ...product, definition }, capabilities);
  const runtime = graph.runtimeProfiles?.[0];
  if (graph.entity.entityCode !== definition.entityCode || graph.entity.entityClass !== "reference"
    || graph.entity.ownershipModel !== "system" || graph.runtimeProfiles?.length !== 1
    || runtime?.storageSchema !== "shared" || runtime.storageObject !== definition.storageObject
    || runtime.writeMode !== "none" || !runtime.storagePlane) throw Error("LOCALIZATION_PRODUCT_SOURCE_MISMATCH");
  const source = buildSharedReferenceGraph(validated.definition, runtime.storagePlane);
  if (sha256(graph.fields.map(field => field.fieldKey).sort()) !== sha256(validated.definition.fields.map(field => field.key).sort())
    || ["list", "detail"].some(kind => graph.surfaces?.filter(surface => surface.surfaceKind === kind).length !== 1))
    throw Error("LOCALIZATION_PRODUCT_SOURCE_MISMATCH");
  // Reject changed fallback labels, field identities or navigation structure.
  // The only allowed additions/replacements are validated localization references.
  const strip = (value: unknown): unknown => Array.isArray(value) ? value.map(strip)
    : value && typeof value === "object" ? Object.fromEntries(Object.entries(value)
      .filter(([key]) => key !== "localizedLabel" && key !== "localizedLabels").map(([key, child]) => [key, strip(child)])) : value;
  const amended = { ...structuredClone(graph), surfaces: graph.surfaces?.map(surface => {
    if (surface.surfaceKind !== "list" && surface.surfaceKind !== "detail") return structuredClone(surface);
    const proposed = source.surfaces?.find(item => item.surfaceKind === surface.surfaceKind);
    if (!proposed || proposed.title !== surface.title) throw Error("LOCALIZATION_LABEL_FALLBACK_MISMATCH");
    const originalLayout = surface.layoutConfig ?? {};
    const proposedLayout = proposed.layoutConfig ?? {};
    const fieldById = new Map(graph.fields.map(field => [field.id, field.fieldKey]));
    for (const binding of graph.surfaceFieldBindings?.filter(item => item.entitySurfaceId === surface.id) ?? []) {
      const field = validated.definition.fields.find(item => item.key === fieldById.get(binding.entityFieldId));
      if (!field || field.label !== binding.labelOverride) throw Error("LOCALIZATION_LABEL_FALLBACK_MISMATCH");
    }
    if (surface.surfaceKind === "list") {
      return { ...surface, layoutConfig: { ...originalLayout, localizedLabels: proposedLayout.localizedLabels } };
    } else {
      const original = originalLayout.recordPresentation as Record<string, unknown> | undefined;
      const proposedPresentation = proposedLayout.recordPresentation as Record<string, unknown>;
      if (!original || sha256(strip(original.sections)) !== sha256(strip(proposedPresentation.sections))
        || sha256(strip(original.navigation ?? null)) !== sha256(strip(proposedPresentation.navigation ?? null)))
        throw Error("LOCALIZATION_PRESENTATION_SOURCE_MISMATCH");
      return { ...surface, layoutConfig: { ...originalLayout, recordPresentation: { ...original,
        localizedLabels: proposedPresentation.localizedLabels, sections: proposedPresentation.sections,
        ...(proposedPresentation.navigation ? { navigation: proposedPresentation.navigation } : {}),
      } } };
    }
  }) };
  compileGraph(amended);
  return amended;
}
