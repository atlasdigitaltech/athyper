import { describe, expect, it } from "vitest";
import { statusToneOverlay } from "../../scripts/db-verification/provisioning/status-tone-overlay.js";

const artifactKey = "business_partner/presentation.detail";
const baseline = [{ artifactKey, header: { statusField: "status", titleField: "name" }, navigation: { keep: true } }, { artifactKey: "other/core", fields: [] }];
const source = { artifactKey, header: { statusField: "status", statusTones: { active: "success", inactive: "neutral" }, titleField: "unpublished" }, navigation: { replace: true } };
describe("status-tone publication overlay", () => {
  it("changes only tones, preserving live metadata and input objects", () => {
    const original = structuredClone(baseline);
    const result = statusToneOverlay(baseline, [source]);
    expect(result).toEqual([{ ...baseline[0], header: { ...baseline[0].header, statusTones: source.header.statusTones } }, baseline[1]]);
    expect(baseline).toEqual(original);
    expect(statusToneOverlay(result, [source])).toEqual(result);
  });
  it("rejects expanded scope and incompatible header bindings", () => {
    expect(() => statusToneOverlay(baseline, [])).toThrow("SCOPE_INVALID");
    expect(() => statusToneOverlay(baseline, [source, source])).toThrow("SCOPE_INVALID");
    expect(() => statusToneOverlay([], [source])).toThrow("HEADER_MISMATCH");
    expect(() => statusToneOverlay(baseline, [{ ...source, header: { ...source.header, statusField: "other" } }])).toThrow("HEADER_MISMATCH");
  });
  it("rejects unsupported tones", () => {
    for (const statusTones of [null, [], {}, { active: "green" }, { ACTIVE: "success" }])
      expect(() => statusToneOverlay(baseline, [{ ...source, header: { ...source.header, statusTones } }])).toThrow("CONTRACT_INVALID");
  });
});
