import { describe, expect, it } from "vitest";
import {
  evaluateHostCapabilities,
  type CapabilityPlane,
  type HostCapabilityDefinition,
  type HostCompositionSnapshot,
} from "../capability-registry.js";

const capability: HostCapabilityDefinition = {
  id: "governance-compliance",
  featureFlag: "WAVE0_GOVERNANCE_ROUTES_ENABLED",
  service: "@athyper/server-platform-governance",
  repositoryProvider: "governance-exact-plane",
  entryPoint: "governance.routes",
  planes: ["studio", "neon", "mesh"],
  readinessChecks: {
    studio: "governance.studio",
    neon: "governance.neon",
    mesh: "governance.mesh",
  },
};

function snapshot(overrides: Partial<HostCompositionSnapshot> = {}): HostCompositionSnapshot {
  const planes = new Set<CapabilityPlane>(["studio", "neon", "mesh"]);
  return {
    enabledFlags: new Set([capability.featureFlag]),
    services: new Set([capability.service]),
    repositoryProviders: new Map([[capability.repositoryProvider, planes]]),
    entryPoints: new Set([capability.entryPoint]),
    activePlanes: planes,
    readiness: new Map([
      ["governance.studio", "healthy"],
      ["governance.neon", "healthy"],
      ["governance.mesh", "healthy"],
    ]),
    ...overrides,
  };
}

describe("host capability composition", () => {
  it("reports a disabled capability without requiring dependencies", () => {
    expect(evaluateHostCapabilities([capability], snapshot({ enabledFlags: new Set() }))).toEqual([
      { id: capability.id, state: "disabled", reasons: [] },
    ]);
  });

  it("fails closed when an enabled capability is missing a dependency", () => {
    const [assessment] = evaluateHostCapabilities([capability], snapshot({ services: new Set() }));
    expect(assessment).toMatchObject({ state: "dependency_missing" });
    expect(assessment?.reasons).toContain(`service: ${capability.service}`);
  });

  it("reports healthy only when the complete chain is healthy", () => {
    expect(evaluateHostCapabilities([capability], snapshot())).toEqual([
      { id: capability.id, state: "healthy", reasons: [] },
    ]);
  });

  it("rejects a capability requested on the wrong plane", () => {
    const neonOnly = { ...capability, planes: ["neon"] as const };
    const [assessment] = evaluateHostCapabilities([neonOnly], snapshot({ activePlanes: new Set(["studio"]) }));
    expect(assessment).toMatchObject({ state: "wrong_plane", reasons: ["unsupported plane: studio"] });
  });

  it("reports partial-plane composition instead of falling back", () => {
    const providerPlanes = new Set<CapabilityPlane>(["studio", "mesh"]);
    const [assessment] = evaluateHostCapabilities([capability], snapshot({
      repositoryProviders: new Map([[capability.repositoryProvider, providerPlanes]]),
    }));
    expect(assessment).toMatchObject({ state: "partial_plane" });
    expect(assessment?.reasons).toContain("repository provider missing plane: neon");
  });
});
