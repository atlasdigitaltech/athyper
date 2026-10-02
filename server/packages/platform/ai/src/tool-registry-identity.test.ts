import { expect, it } from "vitest";
import type { AtlasRegisteredTool } from "@athyper/server-contract-ai";
import { AtlasToolRegistry } from "./tool-service.js";
function tool(version = "1"): AtlasRegisteredTool {
  return { manifest: { schema: "atlas-tool-manifest/1", toolCode: "entity_read_record", version,
    displayName: "Read", description: "Read admitted fields", access: "read", risk: "low",
    allowedPlanes: ["neon"], requiredPermissions: ["neon.ai.agent.use"], featureKey: "atlas",
    inputSchema: { type: "object", properties: { id: { type: "string" } } }, resultSchema: { type: "object" },
    timeoutMs: 5000, maxResultBytes: 1000, confirmation: "none" },
    readHandler: { execute: async () => ({ data: {}, sources: [] }) },
  };
}
it("resolves exact versions and planes without implying runtime authorization", () => {
  const registry = new AtlasToolRegistry([tool(), tool("2")]);
  const identity = registry.resolveManifest("entity_read_record", "1", "neon");
  expect(identity.manifestHash).toMatch(/^[a-f0-9]{64}$/);
  expect(identity).not.toHaveProperty("allowed");
  expect(registry.resolveManifest("entity_read_record", "2", "neon").manifestHash).not.toBe(identity.manifestHash);
  expect(() => registry.resolveManifest("entity_read_record", "latest", "neon")).toThrow();
  expect(() => registry.resolveManifest("entity_read_record", "1", "mesh")).toThrow();
  expect(() => new AtlasToolRegistry([tool(), tool()])).toThrow(/Duplicate/);
});
it("pins manifest content while preserving registered handlers and prevents mutation through registry results", () => {
  const original = tool(), registry = new AtlasToolRegistry([original]);
  const before = registry.resolveManifest("entity_read_record", "1", "neon");
  (original.manifest.requiredPermissions as string[]).push("additional.permission");
  (original.manifest.inputSchema as Record<string,unknown>).extra = true;
  expect(registry.resolveManifest("entity_read_record", "1", "neon")).toEqual(before);
  expect(registry.resolve("entity_read_record", "1").readHandler).toBe(original.readHandler);
  expect(() => (before.manifest.allowedPlanes as string[]).push("mesh")).toThrow();
  expect(Object.isFrozen((before.manifest.inputSchema.properties as Record<string,unknown>).id)).toBe(true);
});
it("canonicalizes object key order but distinguishes schema changes", () => {
  const first = tool(), second = tool();
  const reordered = { ...second, manifest: { ...second.manifest, inputSchema: { properties: { id: { type: "string" } }, type: "object" } } };
  const resolve = (t: AtlasRegisteredTool) => new AtlasToolRegistry([t]).resolveManifest("entity_read_record", "1", "neon");
  expect(resolve(first).manifestHash).toBe(resolve(reordered).manifestHash);
  expect(resolve({ ...second, manifest: { ...second.manifest, resultSchema: { type: "array" } } }).resultSchemaHash).not.toBe(resolve(first).resultSchemaHash);
});
