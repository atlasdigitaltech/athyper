import { describe, expect, it, vi } from "vitest";
import {
  CURRENT_FRAMEWORK_VERSION,
  SourceAdapterRegistry,
} from "../registry";
import { TelemetryDispatcher } from "../../telemetry";
import {
  createCatalogAdapter,
  createPoLineAdapter,
  type PoLineWorld,
} from "../../test-harness/synthetic-adapter";
import type { AddItemTelemetryEvent } from "../../telemetry/events";

function makeWorld(): PoLineWorld {
  return {
    remainingQty: new Map([
      ["po-1:line-1", 50],
      ["po-1:line-2", 20],
    ]),
  };
}

describe("SourceAdapterRegistry — happy path", () => {
  it("registers an adapter and emits adapter.register", () => {
    const telemetry = new TelemetryDispatcher();
    const events: AddItemTelemetryEvent[] = [];
    telemetry.subscribe((e) => events.push(e));

    const registry = new SourceAdapterRegistry({ telemetry });
    const result = registry.register(createCatalogAdapter());
    expect(result.ok).toBe(true);
    expect(registry.size).toBe(1);
    expect(registry.has("catalog")).toBe(true);
    expect(events.length).toBe(1);
    expect(events[0]?.type).toBe("adapter.register");
    if (events[0]?.type === "adapter.register") {
      expect(events[0].adapterId).toBe("catalog");
      expect(events[0].version).toBe(1);
    }
  });

  it("knownIds exposes the registered ids", () => {
    const registry = new SourceAdapterRegistry();
    registry.register(createCatalogAdapter());
    registry.register(createPoLineAdapter({ world: makeWorld() }));
    expect(Array.from(registry.knownIds()).sort()).toEqual([
      "catalog",
      "open_po_line",
    ]);
  });
});

describe("SourceAdapterRegistry — rejection paths", () => {
  it("rejects duplicate ids with code=duplicate_id", () => {
    const telemetry = new TelemetryDispatcher();
    const rejects: AddItemTelemetryEvent[] = [];
    telemetry.subscribe((e) => {
      if (e.type === "adapter.reject") rejects.push(e);
    });

    const registry = new SourceAdapterRegistry({ telemetry });
    registry.register(createCatalogAdapter());
    const second = registry.register(createCatalogAdapter());
    expect(second.ok).toBe(false);
    expect(second.error?.code).toBe("duplicate_id");
    expect(rejects.length).toBe(1);
    if (rejects[0]?.type === "adapter.reject") {
      expect(rejects[0].code).toBe("duplicate_id");
    }
  });

  it("rejects adapters declaring a higher framework version", () => {
    const registry = new SourceAdapterRegistry();
    const adapter = createCatalogAdapter();
    // Patch the manifest to require a future framework version.
    const patched = {
      ...adapter,
      manifest: {
        ...adapter.manifest,
        minFrameworkVersion: CURRENT_FRAMEWORK_VERSION + 1,
      },
    };
    const result = registry.register(patched);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("framework_version_too_low");
    expect(registry.size).toBe(0);
  });

  it("rejects manifest with invalid Zod shape", () => {
    const registry = new SourceAdapterRegistry();
    const adapter = createCatalogAdapter();
    const patched = {
      ...adapter,
      // Empty dedupeKeys is invalid per the schema.
      manifest: { ...adapter.manifest, dedupeKeys: [] as string[] },
    };
    const result = registry.register(patched);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("invalid_manifest");
  });
});

describe("SourceAdapterRegistry — permission gating", () => {
  it("hides adapters whose permissionCode the user lacks", () => {
    const registry = new SourceAdapterRegistry();
    registry.register(createCatalogAdapter());
    registry.register(createPoLineAdapter({ world: makeWorld() }));

    const visible = registry.list({
      hasPermission: (code) => code === "INVOICE.LINE.ADD_FROM_CATALOG",
    });
    expect(visible.map((a) => a.manifest.id)).toEqual(["catalog"]);
  });

  it("shows all adapters when no hasPermission is supplied", () => {
    const registry = new SourceAdapterRegistry();
    registry.register(createCatalogAdapter());
    registry.register(createPoLineAdapter({ world: makeWorld() }));
    const visible = registry.list();
    expect(visible.length).toBe(2);
  });

  it("shows adapters without a permissionCode unconditionally", () => {
    const adapter = createCatalogAdapter();
    const noPerm = {
      ...adapter,
      manifest: { ...adapter.manifest, permissionCode: undefined },
    };
    const registry = new SourceAdapterRegistry();
    registry.register(noPerm);
    const visible = registry.list({ hasPermission: () => false });
    expect(visible.length).toBe(1);
  });
});

describe("TelemetryDispatcher", () => {
  it("isolates listener throws so other listeners still see events", () => {
    const consoleErr = vi.spyOn(console, "error").mockImplementation(() => {});
    const dispatcher = new TelemetryDispatcher();
    const seen: number[] = [];
    dispatcher.subscribe(() => {
      throw new Error("boom");
    });
    dispatcher.subscribe((e) => seen.push(e.seq));
    dispatcher.emit({ type: "adapter.register", adapterId: "x", version: 1 });
    dispatcher.emit({ type: "picker.open", adapterId: "x" });
    expect(seen).toEqual([1, 2]);
    expect(consoleErr).toHaveBeenCalled();
    consoleErr.mockRestore();
  });

  it("unsubscribe stops receiving events", () => {
    const dispatcher = new TelemetryDispatcher();
    const seen: number[] = [];
    const off = dispatcher.subscribe((e) => seen.push(e.seq));
    dispatcher.emit({ type: "picker.open", adapterId: "x" });
    off();
    dispatcher.emit({ type: "picker.open", adapterId: "x" });
    expect(seen).toEqual([1]);
  });
});
