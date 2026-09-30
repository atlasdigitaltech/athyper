import { describe, expect, it, vi } from "vitest";
import { parseCapabilityProfile, resolveCapabilityProfileDefaults } from "../capability-profile.js";
import { readFileSync } from "node:fs";
import { capabilityArtifactMembers, type EntityCapabilityAuthoringMember } from "../entity-capabilities.js";

const profile = () => ({ schema: "athyper.capability-profile/1", profileCode: "platform.collaboration.comments.standard", profileVersion: 1, capabilityKey: "comments",
  defaults: { defaultAudience: "private", allowedAudiences: ["public", "private"], maxTextLength: 5000 },
  permittedOverrides: { defaultAudience: { allowedValues: ["public", "private"] }, maxTextLength: { minimum: 1, maximum: 5000 }, allowedAudiences: { allowedSubset: ["public", "private"] } } });
const member = (overrides: unknown = {}) => ({ capabilityKey: "comments", declaration: { enabled: true }, profile: { code: profile().profileCode, version: 1 }, overrides });
it.each([[[]], [["general", "evidence"]]])("explicit and profile attachment modes agree with categories %j", (categories) => {
  // Parameterize category membership without modifying the immutable v1 source.
  const source = JSON.parse(readFileSync(new URL("../../../../../../metadata/profiles/collaboration/attachments/standard.v1.json", import.meta.url), "utf8"));
  source.defaults.categories = categories;
  const declaration = { enabled: true, serviceKey: "platform.attachments.v1", ownerEntityCode: "example_reference", load: "lazy", includeInAggregateData: false };
  const input = { capabilityKey: "attachments", declaration, profile: { code: source.profileCode, version: 1 }, profileDefinition: source } as EntityCapabilityAuthoringMember;
  const resolved = capabilityArtifactMembers("example_reference", [input]);
  const binding = resolved.operationBindings.attachmentBinding!;
  expect(binding.actions.some(action => action.key === "category")).toBe(categories.length > 0);
  if (categories.length) expect(binding.actions.find(action => action.key === "category")).toEqual({key:"category",permissionCode:"common.collaboration.attachment.create",handlerKey:"platform.attachments.category.v1",concurrency:"none",idempotency:"none"});
  expect(capabilityArtifactMembers("example_reference", [{ capabilityKey: "attachments", declaration, binding } as EntityCapabilityAuthoringMember])).toEqual(resolved);
});
describe("profile source resolution", () => {
  it("resolves deterministic defaults without mutating shared source", () => {
    const source = profile();
    const first = resolveCapabilityProfileDefaults(member({ defaultAudience: "public" }), () => source);
    expect(first.defaults.defaultAudience).toBe("public");
    expect(resolveCapabilityProfileDefaults(member(), () => source).defaults.defaultAudience).toBe("private");
    expect(source.defaults.defaultAudience).toBe("private");
    expect(parseCapabilityProfile(source)).toEqual(source);
  });
  it.each([{ maxTextLength: 5001 }, { maxTextLength: null }, { maxTextLength: 1.5 }, { unknown: true }, { allowedAudiences: ["external"] }, { allowedAudiences: ["public"] }, { features: {} }])("rejects invalid override %j", overrides => {
    expect(() => resolveCapabilityProfileDefaults(member(overrides), profile)).toThrow();
  });
  it("replaces arrays, not concatenates them", () => {
    expect(resolveCapabilityProfileDefaults(member({ allowedAudiences: ["private"] }), profile).defaults.allowedAudiences).toEqual(["private"]);
  });
  it("rejects conflicting mode before lookup", () => {
    const lookup = vi.fn(profile);
    expect(() => resolveCapabilityProfileDefaults({ ...member(), binding: {} }, lookup)).toThrowError(expect.objectContaining({ code: "CAPABILITY_AUTHORING_MODE_CONFLICT" }));
    expect(lookup).not.toHaveBeenCalled();
  });
  it("rejects wrong version or capability from resolver", () => {
    expect(() => resolveCapabilityProfileDefaults(member(), () => ({ ...profile(), profileVersion: 2 }))).toThrow();
    expect(() => resolveCapabilityProfileDefaults({ ...member(), capabilityKey: "attachments" }, profile)).toThrow();
  });
  it("does not allow security wiring or prototype properties in defaults", () => {
    expect(() => parseCapabilityProfile({ ...profile(), defaults: { ...profile().defaults, admissionResolverKey: "bypass" } })).toThrow();
    expect(() => resolveCapabilityProfileDefaults(member(JSON.parse('{"__proto__":{"polluted":true}}')), profile)).toThrow();
  });
});
