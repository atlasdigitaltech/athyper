import { describe, expect, it } from "vitest";

import { runtimeDescriptorParity } from "../runtime-descriptor-parity";

describe("runtime descriptor bootstrap parity", () => {
  it("ignores only declared timestamp, hash, and cache-state fields", () => {
    const base = descriptor();
    const next = structuredClone(base);
    next.audit.compiledAt = "2030-01-01T00:00:00.000Z";
    next.audit.descriptorHash = "new-hash";
    expect(runtimeDescriptorParity(next, base)).toBe(true);
  });

  it("fails parity for capability or contract drift", () => {
    const base = descriptor();
    const next = structuredClone(base);
    next.capabilities.canEdit = false;
    expect(runtimeDescriptorParity(next, base)).toBe(false);
  });
});

function descriptor() {
  return {
    contractVersion: "meta-entity-runtime/v1.1" as const,
    entityCode: "purchase_order",
    entityName: "Purchase order",
    routeSlug: "purchase-order",
    createMode: "FORM_ONLY" as const,
    numberingStrategy: "none" as const,
    renderer: "document" as const,
    capabilities: {
      canRead: true, canCreate: true, canEdit: true, canDelete: false,
      canSearch: true, canFilter: true, canSort: true,
    },
    surfaces: [], fields: [], fieldGroups: [], operations: [], relations: [],
    source: { entityId: "entity-1", versionId: "version-1", versionHash: "version" },
    policy: { hasFieldSecurity: false }, lifecycleStateMasks: [],
    audit: { compiledAt: "2026-01-01T00:00:00.000Z", descriptorHash: "old-hash" },
  };
}
