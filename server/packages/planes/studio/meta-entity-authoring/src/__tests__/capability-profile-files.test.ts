import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, it, vi } from "vitest";
import { resolveCapabilityProfileDefaults } from "@athyper/server-contract-publication";
import { createCapabilityProfileFileResolver } from "../authoring/capability-profile-files.js";

const root = fileURLToPath(new URL("../../../../../../../metadata/profiles/collaboration/", import.meta.url));
it("loads locked source profiles and rejects unknown versions", () => {
  const resolve = createCapabilityProfileFileResolver(root);
  const profile = resolve("platform.collaboration.attachments.standard", 1);
  expect(profile.defaults.maxFileBytes).toBe(5242880);
  expect(() => resolve(profile.profileCode, 2)).toThrow("CAPABILITY_PROFILE_VERSION_UNKNOWN");
  (profile.defaults as Record<string, unknown>).maxFileBytes = 1;
  expect(resolve(profile.profileCode, 1).defaults.maxFileBytes).toBe(5242880);
});
it("shares defaults without leaking owner or overrides across entities", () => {
  const lookup = createCapabilityProfileFileResolver(root);
  for (const ownerEntityCode of ["country", "example_reference"]) {
    const result = resolveCapabilityProfileDefaults({ capabilityKey: "comments",
      declaration: { enabled: true, ownerEntityCode },
      profile: { code: "platform.collaboration.comments.standard", version: 1 },
      overrides: { maxTextLength: 1000 } }, lookup);
    expect(result.defaults.maxTextLength).toBe(1000);
    expect(result.defaults).not.toHaveProperty("ownerEntityCode");
  }
  expect(lookup("platform.collaboration.comments.standard", 1).defaults.maxTextLength).toBe(5000);
});
it("fails closed when locked source bytes drift", async () => {
  vi.resetModules();
  vi.doMock("node:fs", async importOriginal => {
    const actual = await importOriginal<typeof import("node:fs")>();
    return { ...actual, readFileSync: (path: string, options?: never) => {
      const value = readFileSync(path, options);
      return path.endsWith("comments/standard.v1.json") ? Buffer.from(`${value.toString()} `) : value;
    } };
  });
  try {
    const { createCapabilityProfileFileResolver: load } = await import("../authoring/capability-profile-files.js");
    expect(() => load(root)).toThrow("CAPABILITY_PROFILE_SOURCE_DRIFT");
  } finally { vi.doUnmock("node:fs"); vi.resetModules(); }
});
