import { describe, expect, it } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAddItemController } from "../AddItemController";
import { SourceAdapterRegistry } from "../../adapter/registry";
import { TelemetryDispatcher } from "../../telemetry";
import {
  createCatalogAdapter,
  createPoLineAdapter,
  type PoLineWorld,
  type SyntheticParentCtx,
} from "../../test-harness/synthetic-adapter";
import type { AddItemTelemetryEvent } from "../../telemetry/events";

function setup(opts: { stalenessStrategy?: "fail" | "warn" | "refresh"; failsCatalogFetch?: boolean } = {}) {
  const world: PoLineWorld = {
    remainingQty: new Map([
      ["po-1:line-1", 50],
      ["po-1:line-2", 20],
    ]),
  };
  const telemetry = new TelemetryDispatcher();
  const events: AddItemTelemetryEvent[] = [];
  telemetry.subscribe((e) => events.push(e));

  const registry = new SourceAdapterRegistry({ telemetry });
  const catalog = createCatalogAdapter({ failsOnFetch: opts.failsCatalogFetch });
  const po = createPoLineAdapter({ world, stalenessStrategy: opts.stalenessStrategy });
  registry.register(catalog);
  registry.register(po);

  const parentCtx: SyntheticParentCtx = { parentId: "invoice-1", currencyCode: "USD" };
  return { registry, parentCtx, telemetry, events, catalog, po, world };
}

describe("useAddItemController — availability + picker lifecycle", () => {
  it("lists adapters from the registry (no permission filter)", () => {
    const ctx = setup();
    const { result } = renderHook(() =>
      useAddItemController({ registry: ctx.registry, parentCtx: ctx.parentCtx, telemetry: ctx.telemetry }),
    );
    expect(result.current.availableAdapters.map((a) => a.manifest.id).sort()).toEqual([
      "catalog",
      "open_po_line",
    ]);
  });

  it("hides adapters whose permissionCode the user lacks", () => {
    const ctx = setup();
    const { result } = renderHook(() =>
      useAddItemController({
        registry: ctx.registry,
        parentCtx: ctx.parentCtx,
        hasPermission: (code) => code === "INVOICE.LINE.ADD_FROM_CATALOG",
      }),
    );
    expect(result.current.availableAdapters.map((a) => a.manifest.id)).toEqual(["catalog"]);
  });

  it("openPicker emits telemetry and updates activeAdapterId + status", () => {
    const ctx = setup();
    const { result } = renderHook(() =>
      useAddItemController({ registry: ctx.registry, parentCtx: ctx.parentCtx, telemetry: ctx.telemetry }),
    );
    act(() => {
      result.current.openPicker("catalog");
    });
    expect(result.current.activeAdapterId).toBe("catalog");
    expect(result.current.status).toBe("picking");
    const pickerOpenEvents = ctx.events.filter((e) => e.type === "picker.open");
    expect(pickerOpenEvents.length).toBe(1);
  });

  it("cancelPicker resets activeAdapterId without committing staged lines", () => {
    const ctx = setup();
    const { result } = renderHook(() =>
      useAddItemController({ registry: ctx.registry, parentCtx: ctx.parentCtx }),
    );
    act(() => {
      result.current.openPicker("catalog");
    });
    act(() => {
      result.current.cancelPicker();
    });
    expect(result.current.activeAdapterId).toBeNull();
    expect(result.current.status).toBe("idle");
    expect(result.current.stagedLines).toEqual([]);
  });
});

describe("useAddItemController — fetchActive telemetry", () => {
  it("emits picker.fetch.ok with itemCount + duration", async () => {
    const ctx = setup();
    const { result } = renderHook(() =>
      useAddItemController({ registry: ctx.registry, parentCtx: ctx.parentCtx, telemetry: ctx.telemetry }),
    );
    act(() => {
      result.current.openPicker("catalog");
    });
    await act(async () => {
      await result.current.fetchActive({});
    });
    const okEvents = ctx.events.filter((e) => e.type === "picker.fetch.ok");
    expect(okEvents.length).toBe(1);
    if (okEvents[0]?.type === "picker.fetch.ok") {
      expect(okEvents[0].adapterId).toBe("catalog");
      expect(okEvents[0].itemCount).toBe(2);
      expect(typeof okEvents[0].durationMs).toBe("number");
    }
  });

  it("emits picker.fetch.fail and re-throws when the adapter fetch rejects", async () => {
    const ctx = setup({ failsCatalogFetch: true });
    const { result } = renderHook(() =>
      useAddItemController({ registry: ctx.registry, parentCtx: ctx.parentCtx, telemetry: ctx.telemetry }),
    );
    act(() => {
      result.current.openPicker("catalog");
    });
    await act(async () => {
      await expect(result.current.fetchActive({})).rejects.toThrow(/Synthetic fetch failure/);
    });
    const failEvents = ctx.events.filter((e) => e.type === "picker.fetch.fail");
    expect(failEvents.length).toBe(1);
  });
});

describe("useAddItemController — multi-source staging", () => {
  it("stages lines from two different adapters in one session and commits both", async () => {
    const ctx = setup({ stalenessStrategy: "fail" });
    const { result } = renderHook(() =>
      useAddItemController({ registry: ctx.registry, parentCtx: ctx.parentCtx, telemetry: ctx.telemetry }),
    );

    const catalogLine = ctx.catalog.toDraftShape(
      { itemId: "item-1", description: "Pen", unitPrice: 2.5 },
      ctx.parentCtx,
    );
    const poLine = ctx.po.toDraftShape(
      { poId: "po-1", lineId: "line-1", description: "PO 1 line 1", remainingQty: 50, unitPrice: 100, chosenQty: 5 },
      ctx.parentCtx,
    );

    act(() => {
      result.current.stageLine(ctx.catalog, catalogLine);
      result.current.stageLine(ctx.po, poLine);
    });
    expect(result.current.stagedLines.length).toBe(2);
    expect(result.current.stagedLines.map((s) => s.adapterId).sort()).toEqual([
      "catalog",
      "open_po_line",
    ]);

    let commitResult: Awaited<ReturnType<typeof result.current.commit>> | undefined;
    await act(async () => {
      commitResult = await result.current.commit();
    });
    expect(commitResult?.ok).toBe(true);
    if (commitResult?.ok) {
      expect(commitResult.committedLines.length).toBe(2);
      expect(commitResult.adapterIds.sort()).toEqual(["catalog", "open_po_line"]);
    }
    expect(result.current.stagedLines).toEqual([]);

    const okEvents = ctx.events.filter((e) => e.type === "commit.ok");
    expect(okEvents.length).toBe(1);
    if (okEvents[0]?.type === "commit.ok") {
      expect(okEvents[0].lineCount).toBe(2);
    }
  });

  it("removeStagedLine drops one entry by id", () => {
    const ctx = setup();
    const { result } = renderHook(() =>
      useAddItemController({ registry: ctx.registry, parentCtx: ctx.parentCtx }),
    );
    const draftA = ctx.catalog.toDraftShape(
      { itemId: "item-1", description: "Pen", unitPrice: 2.5 },
      ctx.parentCtx,
    );
    const draftB = ctx.catalog.toDraftShape(
      { itemId: "item-2", description: "Notebook", unitPrice: 9.95 },
      ctx.parentCtx,
    );
    let firstId = "";
    act(() => {
      firstId = result.current.stageLine(ctx.catalog, draftA);
      result.current.stageLine(ctx.catalog, draftB);
    });
    expect(result.current.stagedLines.length).toBe(2);
    act(() => {
      result.current.removeStagedLine(firstId);
    });
    expect(result.current.stagedLines.length).toBe(1);
    expect(result.current.stagedLines[0]?.line.itemId).toBe("item-2");
  });
});

describe("useAddItemController — stalenessStrategy: fail", () => {
  it("rejects the commit when a staged PO line is no longer valid", async () => {
    const ctx = setup({ stalenessStrategy: "fail" });
    const { result } = renderHook(() =>
      useAddItemController({ registry: ctx.registry, parentCtx: ctx.parentCtx, telemetry: ctx.telemetry }),
    );
    const poLine = ctx.po.toDraftShape(
      { poId: "po-1", lineId: "line-1", description: "x", remainingQty: 50, unitPrice: 100, chosenQty: 30 },
      ctx.parentCtx,
    );
    act(() => {
      result.current.stageLine(ctx.po, poLine);
    });
    // Simulate the PO line being partially invoiced by someone else.
    ctx.world.remainingQty.set("po-1:line-1", 10);

    let commitResult: Awaited<ReturnType<typeof result.current.commit>> | undefined;
    await act(async () => {
      commitResult = await result.current.commit();
    });
    expect(commitResult?.ok).toBe(false);
    if (commitResult && !commitResult.ok) {
      expect(commitResult.error).toMatch(/stale/i);
    }
    const stale = ctx.events.filter((e) => e.type === "commit.stale");
    expect(stale.length).toBe(1);
    if (stale[0]?.type === "commit.stale") {
      expect(stale[0].strategy).toBe("fail");
    }
    const failed = ctx.events.filter((e) => e.type === "commit.fail");
    expect(failed.length).toBe(1);
    // Staged lines preserved so the user can resolve and retry.
    expect(result.current.stagedLines.length).toBe(1);
  });
});

describe("useAddItemController — stalenessStrategy: warn", () => {
  it("commits the line + emits commit.stale (no commit.fail)", async () => {
    const ctx = setup({ stalenessStrategy: "warn" });
    const { result } = renderHook(() =>
      useAddItemController({ registry: ctx.registry, parentCtx: ctx.parentCtx, telemetry: ctx.telemetry }),
    );
    const poLine = ctx.po.toDraftShape(
      { poId: "po-1", lineId: "line-1", description: "x", remainingQty: 50, unitPrice: 100, chosenQty: 30 },
      ctx.parentCtx,
    );
    act(() => {
      result.current.stageLine(ctx.po, poLine);
    });
    ctx.world.remainingQty.set("po-1:line-1", 10);

    let commitResult: Awaited<ReturnType<typeof result.current.commit>> | undefined;
    await act(async () => {
      commitResult = await result.current.commit();
    });
    expect(commitResult?.ok).toBe(true);
    if (commitResult?.ok) {
      expect(commitResult.committedLines.length).toBe(1);
    }
    const stale = ctx.events.filter((e) => e.type === "commit.stale");
    expect(stale.length).toBe(1);
    if (stale[0]?.type === "commit.stale") {
      expect(stale[0].strategy).toBe("warn");
    }
    const ok = ctx.events.filter((e) => e.type === "commit.ok");
    expect(ok.length).toBe(1);
  });
});

describe("useAddItemController — stageLine sourceBinding guard", () => {
  it("throws when staging a line whose sourceBinding does not match the adapter", () => {
    const ctx = setup();
    const { result } = renderHook(() =>
      useAddItemController({ registry: ctx.registry, parentCtx: ctx.parentCtx }),
    );
    const catalogLine = ctx.catalog.toDraftShape(
      { itemId: "item-1", description: "Pen", unitPrice: 2.5 },
      ctx.parentCtx,
    );
    expect(() => {
      // Try to stage the catalog line as if it were a PO line.
      result.current.stageLine(ctx.po, catalogLine);
    }).toThrow(/sourceBinding\.sourceType/);
  });
});
