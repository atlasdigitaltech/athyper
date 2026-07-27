import { describe, expect, it } from "vitest";
import {
  ModelCatalogSchema,
  providerDisplayName,
  resolveAtlasPublicModes,
  resolveAvailableDefaultModelId,
  type ModelCatalog,
  type ModelDescriptor,
} from "../../index";

function model(
  modelId: string,
  tier: ModelDescriptor["tier"],
  status: ModelDescriptor["status"] = "available",
  providerId = "provider-internal",
  selectionPolicy: ModelDescriptor["selection_policy"] = "normal",
): ModelDescriptor {
  return {
    provider_id: providerId,
    model_id: modelId,
    display_name: `Internal ${modelId}`,
    icon_key: providerId,
    tier,
    status,
    selection_policy: selectionPolicy,
    capabilities: {
      streaming: true,
      tools: false,
      vision: false,
      max_context_tokens: 1,
      max_output_tokens: 1,
    },
    cost: { input_per_mtok_usd: 99, output_per_mtok_usd: 199 },
  };
}

describe("Atlas public model modes", () => {
  it("uses a generic diagnostic label for an unknown provider", () => {
    expect(providerDisplayName("future-provider")).toBe("Model provider");
  });

  it("requires a bounded tenant-effective policy revision", () => {
    expect(ModelCatalogSchema.safeParse({
      default_model_id: "",
      models: [],
    }).success).toBe(false);
    expect(ModelCatalogSchema.safeParse({
      policy_revision: "policy-1",
      default_model_id: "",
      models: [],
    }).success).toBe(true);
  });

  it("maps the legacy smart tier to Atlas Best without exposing provider details", () => {
    const catalog: ModelCatalog = {
      policy_revision: "policy-1",
      default_model_id: "internal-balanced",
      models: [
        model("internal-fast", "fast"),
        model("internal-balanced", "balanced"),
        model("internal-smart", "smart"),
      ],
    };

    const modes = resolveAtlasPublicModes(catalog, "internal-smart");

    expect(modes.map(({ label }) => label)).toEqual([
      "Atlas Fast",
      "Atlas Balanced",
      "Atlas Best",
    ]);
    expect(modes[2]).toMatchObject({
      id: "best",
      modelId: "internal-smart",
      selected: true,
    });
    expect(JSON.stringify(modes)).not.toContain("provider-internal");
    expect(JSON.stringify(modes)).not.toContain("99");
  });

  it("uses an available binding instead of an unavailable declared default", () => {
    const catalog: ModelCatalog = {
      policy_revision: "policy-1",
      default_model_id: "restricted-default",
      models: [
        model("restricted-default", "balanced", "restricted"),
        model("available-fast", "fast"),
      ],
    };

    expect(resolveAvailableDefaultModelId(catalog)).toBe("available-fast");
  });

  it("never implicitly selects any explicit-only evaluation binding", () => {
    const catalog: ModelCatalog = {
      policy_revision: "policy-openai-eval",
      default_model_id: "provider-neutral-evaluation",
      models: [
        model(
          "provider-neutral-evaluation",
          "best",
          "available",
          "provider-internal",
          "explicit_only",
        ),
      ],
    };

    expect(resolveAvailableDefaultModelId(catalog)).toBeNull();
    expect(resolveAtlasPublicModes(catalog, null)[2]).toMatchObject({
      id: "best",
      status: "restricted",
      modelId: null,
      selected: false,
    });
    expect(resolveAtlasPublicModes(catalog, "provider-neutral-evaluation")[2]).toMatchObject({
      id: "best",
      status: "available",
      modelId: "provider-neutral-evaluation",
      selected: true,
    });
  });

  it("represents a mode without an available binding as disabled", () => {
    const catalog: ModelCatalog = {
      policy_revision: "policy-1",
      default_model_id: "fast",
      models: [
        model("fast", "fast"),
        model("future-best", "best", "coming_soon"),
      ],
    };

    expect(resolveAtlasPublicModes(catalog, "fast")[2]).toMatchObject({
      id: "best",
      status: "coming_soon",
      modelId: null,
      selected: false,
    });
  });
});
