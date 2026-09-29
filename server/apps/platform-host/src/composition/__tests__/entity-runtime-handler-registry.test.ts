import { describe, expect, it, vi } from "vitest";
import { createEntityRuntimeHandlerRegistry } from "../shared/entity-runtime/handler-registry.js";

describe("entity runtime handler registry", () => {
  it("leaves retired and unknown handlers unresolved", () => {
    const registry = createEntityRuntimeHandlerRegistry({});
    for (const key of [
      "neon.bp.capability.supplier.v1",
      "neon.bp.capability.customer.v1",
      "unregistered.handler.v1",
    ]) expect(registry.get(key)).toBeUndefined();
  });

  it("selects only the exact registered key without executing a command", () => {
    const execute = vi.fn(async () => ({}));
    const handler = { execute };
    const registry = createEntityRuntimeHandlerRegistry({
      registries: [{
        get: key => key === "entity.record.example.v1" ? handler : undefined,
      }],
    });
    expect(registry.get("entity.record.example.v1")).toBe(handler);
    expect(registry.get("entity.record.example.v2")).toBeUndefined();
    expect(execute).not.toHaveBeenCalled();
  });

  it("does not consult compatibility fallback for a registered handler", () => {
    const handler = { execute: vi.fn(async () => ({})) };
    const fallback = vi.fn(() => undefined);
    const registry = createEntityRuntimeHandlerRegistry({
      registries: [{ get: key => key === "registered" ? handler : undefined }],
      fallback,
    });
    expect(registry.get("registered")).toBe(handler);
    expect(fallback).not.toHaveBeenCalled();
    expect(registry.get("unknown")).toBeUndefined();
    expect(fallback).toHaveBeenCalledWith("unknown");
  });
});
