import { describe, expect, it } from "vitest";
import {
  ATLAS_SPAN_ATTRIBUTE_KEYS,
  toSafeAtlasSpanAttributes,
} from "../atlas-telemetry.js";

describe("Atlas content-safe telemetry", () => {
  it("exports only the approved low-content attribute contract", () => {
    expect(ATLAS_SPAN_ATTRIBUTE_KEYS).toEqual([
      "atlas.plane",
      "atlas.public_model",
      "atlas.provider",
      "atlas.binding_id",
      "atlas.adapter_id",
      "atlas.persistence_enabled",
      "atlas.tool_execution_enabled",
      "atlas.outcome",
      "atlas.error_class",
      "atlas.provider_round",
    ]);
  });

  it("drops prompt, response, record, provider-body, identity, and secret fields", () => {
    const attributes = toSafeAtlasSpanAttributes({
      plane: "neon",
      publicModel: "atlas-fast",
      provider: "anthropic",
      ...({
        prompt: "sensitive prompt",
        response: "sensitive response",
        recordValue: "tenant record",
        providerBody: "native provider body",
        tenantId: "tenant-secret",
        principalId: "principal-secret",
        credential: "sk-ant-secret",
      } as Record<string, unknown>),
    });
    const serialized = JSON.stringify(attributes);

    expect(attributes).toMatchObject({
      "atlas.plane": "neon",
      "atlas.public_model": "atlas-fast",
      "atlas.provider": "anthropic",
    });
    for (const forbidden of [
      "sensitive prompt",
      "sensitive response",
      "tenant record",
      "native provider body",
      "tenant-secret",
      "principal-secret",
      "sk-ant-secret",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});
