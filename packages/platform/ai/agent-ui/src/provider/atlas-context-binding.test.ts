import { describe, expect, it } from "vitest";
import {
  AtlasContextBindingRegistry,
  normalizeAtlasContextBinding,
} from "./atlas-context-binding";

describe("AtlasContextBindingRegistry", () => {
  it("restores the page binding when a nested surface unregisters", () => {
    const registry = new AtlasContextBindingRegistry();
    const page = registry.register(
      { entityType: "company-code", entityId: "page-1" },
      "/app/company_code/page-1",
    );
    const nested = registry.register(
      { entityType: "company_code", entityId: "dialog-2" },
      "/app/company_code/page-1",
    );

    expect(registry.snapshot("/app/company_code/page-1")).toEqual({
      entityType: "company_code",
      entityId: "dialog-2",
    });
    registry.unregister(nested);
    expect(registry.snapshot("/app/company_code/page-1")).toEqual({
      entityType: "company_code",
      entityId: "page-1",
    });
    registry.unregister(page);
    expect(registry.snapshot("/app/company_code/page-1")).toBeNull();
  });

  it("does not reuse a binding after navigation", () => {
    const registry = new AtlasContextBindingRegistry();
    registry.register(
      { entityType: "company_code", entityId: "cc-1" },
      "/app/company_code/cc-1",
    );

    expect(registry.snapshot("/app/company_code/cc-2")).toBeNull();
    registry.clear();
    expect(registry.snapshot("/app/company_code/cc-1")).toBeNull();
  });

  it.each([
    { entityType: "../tenant", entityId: "cc-1" },
    { entityType: "company_code", entityId: "contains spaces" },
    { entityType: "x".repeat(65), entityId: "cc-1" },
    { entityType: "company_code", entityId: "x".repeat(129) },
  ])("rejects malformed or oversized identifiers", (binding) => {
    expect(() => normalizeAtlasContextBinding(binding)).toThrow(
      /malformed or oversized/,
    );
  });
});
