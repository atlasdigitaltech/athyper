import { describe, expect, it, vi } from "vitest";
import type { AiLogger } from "../../ai-runtime.types.js";
import { CapabilityRegistry } from "../../capability-registry.js";
import {
  AtlasToolRegistry,
  AtlasToolRegistryError,
  CapabilityRegistryToolImplementationBindingAdapter,
} from "../atlas-tool-registry.js";
import {
  ATLAS_TOOL_READ_ACTION,
  atlasCatalogHelpManifest,
  atlasCatalogHelpRegistration,
} from "../catalog-help.tool.js";
import type {
  AtlasReadOnlyToolHandler,
  AtlasToolManifestV1,
  AtlasToolRegistration,
} from "../atlas-tool.types.js";

function logger(): AiLogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

function adapter(
  capabilityRegistry: CapabilityRegistry,
  handler: AtlasReadOnlyToolHandler,
) {
  return new CapabilityRegistryToolImplementationBindingAdapter(
    capabilityRegistry,
    [{
      actionCode: ATLAS_TOOL_READ_ACTION,
      implementationBinding:
        atlasCatalogHelpManifest.implementation.binding,
      handler,
    }],
  );
}

describe("AtlasToolRegistry", () => {
  it("bridges a declaration-only capability action without widening legacy execution", () => {
    const capabilities = new CapabilityRegistry(logger());
    capabilities.declareGovernedAction(ATLAS_TOOL_READ_ACTION);

    expect(capabilities.hasActionCode(ATLAS_TOOL_READ_ACTION)).toBe(true);
    expect(capabilities.get(ATLAS_TOOL_READ_ACTION)).toBeNull();
    expect(capabilities.list()).not.toContain(ATLAS_TOOL_READ_ACTION);

    const registry = new AtlasToolRegistry(
      [atlasCatalogHelpRegistration],
      adapter(capabilities, atlasCatalogHelpRegistration.handler),
    );
    expect(registry.get(atlasCatalogHelpManifest.name)?.manifest).toEqual(
      atlasCatalogHelpManifest,
    );
  });

  it("requires closed governance fields and an exact implementation/handler binding", () => {
    const capabilities = new CapabilityRegistry(logger());
    capabilities.declareGovernedAction(ATLAS_TOOL_READ_ACTION);
    const replacement = vi.fn(async () => ({ data: {} }));

    expect(() => new AtlasToolRegistry(
      [atlasCatalogHelpRegistration],
      adapter(capabilities, replacement),
    )).toThrowError(AtlasToolRegistryError);

    const malformed = structuredClone(
      atlasCatalogHelpManifest,
    ) as AtlasToolManifestV1 & { remoteUrl?: string };
    malformed.remoteUrl = "https://attacker.invalid/tool";
    const registration: AtlasToolRegistration = {
      ...atlasCatalogHelpRegistration,
      manifest: malformed,
    };
    expect(() => new AtlasToolRegistry(
      [registration],
      adapter(capabilities, registration.handler),
    )).toThrow(/unknown field/);
  });

  it("rejects duplicate provider-visible names", () => {
    const capabilities = new CapabilityRegistry(logger());
    capabilities.declareGovernedAction(ATLAS_TOOL_READ_ACTION);

    expect(() => new AtlasToolRegistry(
      [atlasCatalogHelpRegistration, atlasCatalogHelpRegistration],
      adapter(capabilities, atlasCatalogHelpRegistration.handler),
    )).toThrowError(expect.objectContaining({
      code: "DUPLICATE_TOOL",
    }));
  });

  it("rejects input schemas that are incompatible with strict provider tools", () => {
    const capabilities = new CapabilityRegistry(logger());
    capabilities.declareGovernedAction(ATLAS_TOOL_READ_ACTION);
    const manifest = structuredClone(
      atlasCatalogHelpManifest,
    ) as AtlasToolManifestV1;
    (manifest.inputSchema as { required: string[] }).required = [];
    const registration: AtlasToolRegistration = {
      ...atlasCatalogHelpRegistration,
      manifest,
    };

    expect(() => new AtlasToolRegistry(
      [registration],
      adapter(capabilities, registration.handler),
    )).toThrow(/strict schemas must require every declared property/);
  });

  it("makes idempotency, confirmation, step-up, dual-control, audit and evidence explicit", () => {
    expect(atlasCatalogHelpManifest).toMatchObject({
      access: "read_only",
      idempotency: {
        mode: "required",
        key: "run_id+tool_call_id",
        conflict: "same_input_hash_only",
      },
      confirmation: { mode: "none" },
      stepUp: { mode: "none" },
      dualControl: { mode: "none" },
      implementation: {
        kind: "code",
        binding: "atlas.catalog.help.v1",
      },
      audit: {
        lifecycle: "proposed_executing_terminal",
        arguments: "sha256",
        results: "sha256",
        contentStorage: "forbidden",
      },
      evidence: {
        mode: "code_source",
        requireVersion: true,
        requireChecksumForCode: true,
      },
      dataAccess: { mode: "none" },
    });
  });
});
