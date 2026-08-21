import type { VerifiedRequestContext } from "@athyper/svc-iam";
import { describe, expect, it, vi } from "vitest";
import {
  StrictConjunctiveAtlasToolFeatureAdapter,
} from "../atlas-tool-bootstrap.js";
import { ATLAS_RECORD_LOOKUP_FEATURE } from "../record-lookup.tool.js";

const context = {
  tenantId: "00000000-0000-4000-8000-000000000001",
} as VerifiedRequestContext;

describe("StrictConjunctiveAtlasToolFeatureAdapter", () => {
  it("requires every common and per-tool gate from the strict resolver", async () => {
    const isEnabledStrict = vi.fn(async (code: string) =>
      code !== "atlas_agent_tools_enabled"
    );
    const adapter = new StrictConjunctiveAtlasToolFeatureAdapter({
      isEnabledStrict,
    });

    await expect(
      adapter.isEnabled(context, "atlas.tools.catalog_help"),
    ).resolves.toBe(false);
    expect(isEnabledStrict.mock.calls.map(([code]) => code)).toEqual([
      "atlas_agent_enabled",
      "atlas_conversation_persistence_enabled",
      "atlas_agent_tools_enabled",
      "atlas.tools.catalog_help",
    ]);
    expect(isEnabledStrict.mock.calls.every(([, tenantId]) =>
      tenantId === context.tenantId
    )).toBe(true);
  });

  it("does not convert strict resolver failures into an allow", async () => {
    const adapter = new StrictConjunctiveAtlasToolFeatureAdapter({
      isEnabledStrict: vi.fn(async () => {
        throw new Error("control plane unavailable");
      }),
    });

    await expect(
      adapter.isEnabled(context, "atlas.tools.catalog_help"),
    ).rejects.toThrow("control plane unavailable");
  });

  it("requires catalog help before the staged record lookup gate", async () => {
    const isEnabledStrict = vi.fn(async (code: string) =>
      code !== "atlas.tools.catalog_help"
    );
    const adapter = new StrictConjunctiveAtlasToolFeatureAdapter({
      isEnabledStrict,
    });

    await expect(
      adapter.isEnabled(context, ATLAS_RECORD_LOOKUP_FEATURE),
    ).resolves.toBe(false);
    expect(isEnabledStrict.mock.calls.map(([code]) => code)).toEqual([
      "atlas_agent_enabled",
      "atlas_conversation_persistence_enabled",
      "atlas_agent_tools_enabled",
      "atlas.tools.catalog_help",
      "atlas.tools.record_lookup",
    ]);
  });
});
