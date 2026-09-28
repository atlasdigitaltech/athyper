import { describe, expect, it, vi } from "vitest";
import { capabilityAuthoringMode } from "../capability-authoring-mode.js";
import { capabilityArtifactMembers } from "../entity-capabilities.js";

describe("capability source authoring modes", () => {
  const declaration = { enabled: true };
  it.each([
    [{ declaration: { enabled: false } }, "disabled"],
    [{ declaration, binding: {} }, "explicit"],
    [{ declaration, profile: { code: "standard", version: 1 } }, "profile"],
    [{ declaration, profile: { code: "standard", version: 1 }, overrides: {} }, "profile"],
  ])("accepts one source mode: %j", (source, mode) => {
    expect(capabilityAuthoringMode(source, "fixture.comments")).toBe(mode);
  });
  it.each([
    { declaration, binding: {}, profile: {} },
    { declaration, binding: null, profile: null },
    { declaration, binding: undefined, profile: {} },
    { declaration, overrides: {} },
    { declaration, binding: {}, overrides: {} },
    { declaration },
    { declaration: { enabled: false }, binding: {} },
    { declaration: { enabled: false }, profile: {} },
    { declaration: { enabled: false }, overrides: {} },
  ])("rejects conflicting/missing forms before resolution: %j", source => {
    const resolve = vi.fn();
    expect(() => { capabilityAuthoringMode(source, "fixture.comments"); resolve(); })
      .toThrowError(expect.objectContaining({ code: "CAPABILITY_AUTHORING_MODE_CONFLICT" }));
    expect(resolve).not.toHaveBeenCalled();
  });
  it("preserves field errors for unambiguous explicit and disabled declarations", () => {
    for (const member of [
      { capabilityKey: "comments", declaration: { enabled: true }, binding: {} },
      { capabilityKey: "comments", declaration: { enabled: false, serviceKey: "forbidden" } },
    ]) expect(() => capabilityArtifactMembers("fixture", [member as never]))
      .toThrowError(expect.objectContaining({ code: "ENTITY_CAPABILITY_INVALID" }));
  });
});
