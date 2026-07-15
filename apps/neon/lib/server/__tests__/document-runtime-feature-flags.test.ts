import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveDocumentOpenRollout } from "../document-runtime-feature-flags";

const internalSession = {
  activeOrg: "internal",
  organizations: { internal: { tenantId: "tenant-internal", tenantCode: "athyper" } },
};
const externalSession = {
  activeOrg: "customer",
  organizations: { customer: { tenantId: "tenant-customer", tenantCode: "customer" } },
};

afterEach(() => vi.unstubAllEnvs());

describe("resolveDocumentOpenRollout", () => {
  it("enables rules only for internal tenants at the initial stage", () => {
    vi.stubEnv("DOCUMENT_OPEN_ROLLOUT_STAGE", "rules_internal");
    vi.stubEnv("DOCUMENT_OPEN_INTERNAL_TENANTS", "athyper");
    expect(resolveDocumentOpenRollout({ session: internalSession, entityCode: "purchase_order" }))
      .toMatchObject({ cohort: "internal", openRulesBootstrap: true, openChildMetadataBootstrap: false, openDescriptorCacheV2: false });
    expect(resolveDocumentOpenRollout({ session: externalSession, entityCode: "purchase_order" }))
      .toMatchObject({ cohort: "control", openRulesBootstrap: false, openChildMetadataBootstrap: false, openDescriptorCacheV2: false });
  });

  it("uses a stable tenant/entity bucket for descriptor canaries", () => {
    vi.stubEnv("DOCUMENT_OPEN_ROLLOUT_STAGE", "descriptor_25");
    const first = resolveDocumentOpenRollout({ session: externalSession, entityCode: "purchase_order" });
    const second = resolveDocumentOpenRollout({ session: externalSession, entityCode: "purchase_order" });
    expect(second.bucket).toBe(first.bucket);
    expect(first.openRulesBootstrap).toBe(true);
    expect(first.openChildMetadataBootstrap).toBe(true);
    expect(first.openDescriptorCacheV2).toBe(first.bucket < 25);
    expect(first.shadowRuntimeBootstrap).toBe(first.openDescriptorCacheV2);
  });

  it("shadows internal bootstrap before full rollout and stops legacy fan-out at full", () => {
    vi.stubEnv("DOCUMENT_OPEN_ROLLOUT_STAGE", "child_internal");
    vi.stubEnv("DOCUMENT_OPEN_INTERNAL_TENANTS", "athyper");
    expect(resolveDocumentOpenRollout({ session: internalSession, entityCode: "purchase_order" }))
      .toMatchObject({ openDescriptorCacheV2: true, shadowRuntimeBootstrap: true });
    vi.stubEnv("DOCUMENT_OPEN_ROLLOUT_STAGE", "full");
    expect(resolveDocumentOpenRollout({ session: externalSession, entityCode: "purchase_order" }))
      .toMatchObject({ openDescriptorCacheV2: true, shadowRuntimeBootstrap: false });
  });

  it("keeps individual flags as kill switches at full rollout", () => {
    vi.stubEnv("DOCUMENT_OPEN_ROLLOUT_STAGE", "full");
    vi.stubEnv("DOCUMENT_OPEN_RULES_BOOTSTRAP", "false");
    vi.stubEnv("DOCUMENT_OPEN_CHILD_METADATA_BOOTSTRAP", "false");
    vi.stubEnv("DOCUMENT_OPEN_DESCRIPTOR_CACHE_V2", "false");
    expect(resolveDocumentOpenRollout({ session: externalSession, entityCode: "purchase_order" }))
      .toMatchObject({ openRulesBootstrap: false, openChildMetadataBootstrap: false, openDescriptorCacheV2: false });
  });

  it("allows explicit overrides while the staged rollout is off", () => {
    vi.stubEnv("DOCUMENT_OPEN_ROLLOUT_STAGE", "off");
    vi.stubEnv("DOCUMENT_OPEN_RULES_BOOTSTRAP", "true");
    expect(resolveDocumentOpenRollout({ session: externalSession, entityCode: "purchase_order" }))
      .toMatchObject({ openRulesBootstrap: true, openChildMetadataBootstrap: false, openDescriptorCacheV2: false });
  });

  it("adds guard telemetry metadata to every rollout decision", () => {
    const result = resolveDocumentOpenRollout({ session: externalSession, entityCode: "purchase_order" });
    expect(result.guard).toMatchObject({ disabled: false, reason: null });
    expect(typeof result.guard.disabledUntil).toBe("number");
  });

  it("supports automatic rollback by one rollout stage on hard gate breach", () => {
    vi.stubEnv("DOCUMENT_OPEN_ROLLOUT_AUTO", "true");
    vi.stubEnv("DOCUMENT_OPEN_ROLLOUT_STAGE", "descriptor_25");
    vi.stubEnv(
      "DOCUMENT_OPEN_ROLLOUT_PROGRESS_SNAPSHOT",
      JSON.stringify({ minimumSamples: 10_000, metrics: { open_warm_p95_ms: 2_500, open_compatibility_fallback_count: 0 } }),
    );
    const result = resolveDocumentOpenRollout({ session: externalSession, entityCode: "purchase_order" });
    expect(result.stage).toBe("child_internal");
  });
});

  it("advances rollout stage from environment snapshot when auto mode is enabled", () => {
    vi.stubEnv("DOCUMENT_OPEN_ROLLOUT_STAGE", "rules_internal");
    vi.stubEnv("DOCUMENT_OPEN_ROLLOUT_AUTO", "true");
    vi.stubEnv(
      "DOCUMENT_OPEN_ROLLOUT_PROGRESS_SNAPSHOT",
      JSON.stringify({ minimumSamples: 1000, metrics: { open_warm_p95_ms: 600, open_compatibility_fallback_count: 0 } }),
    );
    const result = resolveDocumentOpenRollout({ session: internalSession, entityCode: "purchase_order" });
    expect(result.stage).toBe("child_internal");
  });
