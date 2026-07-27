import type {
  ModelCatalog,
  ModelDescriptor,
  ModelTier,
} from "./model-descriptor";

export type AtlasPublicModeId = "fast" | "balanced" | "best";

export interface AtlasPublicMode {
  id: AtlasPublicModeId;
  label: string;
  description: string;
  status: ModelDescriptor["status"];
  /**
   * Opaque public model ID sent to the server. Provider and upstream model
   * details deliberately remain outside the customer-facing contract.
   */
  modelId: string | null;
  selected: boolean;
}

export const ATLAS_PUBLIC_MODE_ORDER: readonly AtlasPublicModeId[] = [
  "fast",
  "balanced",
  "best",
];

export function toAtlasPublicModeId(tier: ModelTier): AtlasPublicModeId {
  return tier === "smart" ? "best" : tier;
}

export function atlasPublicModeLabel(mode: AtlasPublicModeId): string {
  switch (mode) {
    case "fast":
      return "Atlas Fast";
    case "balanced":
      return "Atlas Balanced";
    case "best":
      return "Atlas Best";
  }
}

export function atlasPublicModeDescription(mode: AtlasPublicModeId): string {
  switch (mode) {
    case "fast":
      return "Quick answers for straightforward questions";
    case "balanced":
      return "A balanced choice for everyday work";
    case "best":
      return "Deeper reasoning for more complex questions";
  }
}

/**
 * Builds one customer-visible choice per Atlas mode. If a legacy catalog
 * contains several providers for the same tier, the server default wins,
 * followed by the first available binding. Vendor details never escape this
 * resolver.
 */
export function resolveAtlasPublicModes(
  catalog: ModelCatalog,
  currentModelId: string | null,
): AtlasPublicMode[] {
  return ATLAS_PUBLIC_MODE_ORDER.map((mode) => {
    const candidates = catalog.models.filter(
      (model) => toAtlasPublicModeId(model.tier) === mode,
    );
    const available = candidates.filter((model) => model.status === "available");
    const selectedCandidate = available.find(
      (model) => model.model_id === currentModelId,
    );
    const defaultCandidate = available.find(
      (model) =>
        model.model_id === catalog.default_model_id
        && isImplicitSelectionAllowed(model),
    );
    const resolved =
      selectedCandidate
      ?? defaultCandidate
      ?? available.find(isImplicitSelectionAllowed)
      ?? candidates.find(isImplicitSelectionAllowed);

    return {
      id: mode,
      label: atlasPublicModeLabel(mode),
      description: atlasPublicModeDescription(mode),
      status: resolved?.status ?? "restricted",
      modelId: resolved?.status === "available" ? resolved.model_id : null,
      selected: selectedCandidate !== undefined,
    };
  });
}

export function resolveAvailableDefaultModelId(
  catalog: ModelCatalog,
): string | null {
  const declaredDefault = catalog.models.find(
    (model) =>
      model.model_id === catalog.default_model_id
      && model.status === "available"
      && isImplicitSelectionAllowed(model),
  );
  return declaredDefault?.model_id
    ?? catalog.models.find(
      (model) =>
        model.status === "available"
        && isImplicitSelectionAllowed(model),
    )?.model_id
    ?? null;
}

function isImplicitSelectionAllowed(model: ModelDescriptor): boolean {
  return model.selection_policy === "normal";
}
