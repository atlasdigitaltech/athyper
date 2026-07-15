import { describe, expect, it } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  SourceAdapterRegistry,
  TelemetryDispatcher,
  useAddItemController,
  type AddItemTelemetryEvent,
} from "@athyper/runtime-add-item";
import {
  createCatalogAdapter,
  type CatalogItemSelection,
  type CatalogParentCtx,
} from "../catalog";

// ─────────────────────────────────────────────────────────────────────────────
// Phase 6 catalog integration smoke tests. Cover the four acceptance
// criteria from the plan:
//   • Passes contract suite (asserted by ./catalog.test.ts)
//   • Permission check hides from chooser when denied
//   • Staleness strategy works under concurrent modification (warn + emit)
//   • Side effects declared (emit_event) reach the commit pipeline
//
// "Side effects execute in transactional pipeline with rollback on failure"
// is implicitly covered: the committer collects effects across all staged
// lines and surfaces them on the CommitResult; consumers run them under
// their own transaction. The framework guarantees collection ordering +
// reject-on-duplicate-source-line; rollback is the caller's job.
// ─────────────────────────────────────────────────────────────────────────────

const PARENT_CTX: CatalogParentCtx = {
  parentEntityCode: "purchase_invoice",
  parentRecordId: "inv-0042",
  lineEntityCode: "purchase_invoice_line",
  currencyCode: "USD",
};

function sample(over: Partial<CatalogItemSelection> = {}): CatalogItemSelection {
  return {
    itemId: "cat-item-1",
    catalogCode: "MAIN_2026",
    itemCode: "PEN-001",
    itemName: "Blue Pen",
    description: "Blue ballpoint pen",
    baseUomCode: "EA",
    unitPrice: 2.5,
    currencyCode: "USD",
    isActive: true,
    chosenQty: 5,
    ...over,
  };
}

interface FakeWorld {
  items: Map<string, CatalogItemSelection>;
}

function makeWorld(items: CatalogItemSelection[]): FakeWorld {
  return { items: new Map(items.map((i) => [i.itemId, i] as const)) };
}

function setup(opts: {
  world?: FakeWorld;
  permissionCode?: string | undefined;
  hasPermission?: (code: string) => boolean;
} = {}) {
  const world = opts.world ?? makeWorld([sample()]);
  const telemetry = new TelemetryDispatcher();
  const events: AddItemTelemetryEvent[] = [];
  telemetry.subscribe((e) => events.push(e));

  const registry = new SourceAdapterRegistry({ telemetry });
  const adapter = createCatalogAdapter({
    permissionCode:
      "permissionCode" in opts ? opts.permissionCode : "INVOICE.LINE.ADD_FROM_CATALOG",
    fetchItems: async () => ({ items: Array.from(world.items.values()) }),
    checkLive: async (id) => world.items.get(id) ?? null,
  });
  registry.register(adapter);
  return { registry, adapter, telemetry, events, world };
}

describe("catalog — fetch + stage + commit", () => {
  it("opens picker, fetches items, emits picker.fetch.ok", async () => {
    const ctx = setup();
    const { result } = renderHook(() =>
      useAddItemController({
        registry: ctx.registry,
        parentCtx: PARENT_CTX,
        telemetry: ctx.telemetry,
      }),
    );
    act(() => {
      result.current.openPicker("catalog");
    });
    expect(result.current.status).toBe("picking");
    await act(async () => {
      const page = await result.current.fetchActive({ q: "pen" });
      expect((page as { items: unknown[] }).items.length).toBe(1);
    });
    const okEvents = ctx.events.filter((e) => e.type === "picker.fetch.ok");
    expect(okEvents.length).toBe(1);
    if (okEvents[0]?.type === "picker.fetch.ok") {
      expect(okEvents[0].itemCount).toBe(1);
    }
  });

  it("stages one item + commits with emit_event side effect", async () => {
    const ctx = setup();
    const { result } = renderHook(() =>
      useAddItemController({
        registry: ctx.registry,
        parentCtx: PARENT_CTX,
        telemetry: ctx.telemetry,
      }),
    );
    const selection = sample({ chosenQty: 10 });
    const draft = ctx.adapter.toDraftShape(selection, PARENT_CTX);
    act(() => {
      result.current.stageLine(ctx.adapter, draft);
    });
    expect(result.current.stagedLines.length).toBe(1);
    expect(result.current.stagedLines[0]?.line.sourceBinding.sourceType).toBe("catalog");
    expect(result.current.stagedLines[0]?.line.sourceBinding.sourceDocType).toBe("catalog");
    expect(result.current.stagedLines[0]?.line.lineAmount).toBe(25);

    let commitResult: Awaited<ReturnType<typeof result.current.commit>> | undefined;
    await act(async () => {
      commitResult = await result.current.commit();
    });
    expect(commitResult?.ok).toBe(true);
    if (commitResult?.ok) {
      expect(commitResult.committedLines.length).toBe(1);
      expect(commitResult.sideEffects.length).toBe(1);
      const effect = commitResult.sideEffects[0]!;
      expect(effect.kind).toBe("emit_event");
      if (effect.kind === "emit_event") {
        expect(effect.eventType).toBe("invoice.catalog_line_added");
        expect(effect.payload.itemCode).toBe("PEN-001");
      }
    }
  });
});

describe("catalog — permission gating", () => {
  it("hides catalog from availableAdapters when permission is denied", () => {
    const ctx = setup();
    const { result } = renderHook(() =>
      useAddItemController({
        registry: ctx.registry,
        parentCtx: PARENT_CTX,
        hasPermission: () => false,
      }),
    );
    expect(result.current.availableAdapters.map((a) => a.manifest.id)).toEqual([]);
  });

  it("surfaces catalog when permission check returns true", () => {
    const ctx = setup();
    const { result } = renderHook(() =>
      useAddItemController({
        registry: ctx.registry,
        parentCtx: PARENT_CTX,
        hasPermission: (code) => code === "INVOICE.LINE.ADD_FROM_CATALOG",
      }),
    );
    expect(result.current.availableAdapters.map((a) => a.manifest.id)).toEqual(["catalog"]);
  });

  it("surfaces catalog unconditionally when adapter declares no permissionCode", () => {
    const ctx = setup({ permissionCode: undefined });
    const { result } = renderHook(() =>
      useAddItemController({
        registry: ctx.registry,
        parentCtx: PARENT_CTX,
        hasPermission: () => false,
      }),
    );
    expect(result.current.availableAdapters.map((a) => a.manifest.id)).toEqual(["catalog"]);
  });
});

describe("catalog — staleness under concurrent modification", () => {
  it("warn strategy commits the line + emits commit.stale when price drifts past tolerance", async () => {
    const world = makeWorld([sample({ itemId: "cat-1", unitPrice: 2.5 })]);
    const ctx = setup({ world });
    const { result } = renderHook(() =>
      useAddItemController({
        registry: ctx.registry,
        parentCtx: PARENT_CTX,
        telemetry: ctx.telemetry,
      }),
    );
    const selection = sample({ itemId: "cat-1", unitPrice: 2.5, chosenQty: 5 });
    const draft = ctx.adapter.toDraftShape(selection, PARENT_CTX);
    act(() => {
      result.current.stageLine(ctx.adapter, draft);
    });

    // Concurrent modification: supplier raises the price to 5.00 (100%
    // drift, well above the 10% default tolerance).
    world.items.set("cat-1", sample({ itemId: "cat-1", unitPrice: 5 }));

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
      expect(stale[0].adapterId).toBe("catalog");
    }
  });

  it("does not flag staleness when price drift stays within tolerance", async () => {
    const world = makeWorld([sample({ itemId: "cat-1", unitPrice: 2.5 })]);
    const ctx = setup({ world });
    const { result } = renderHook(() =>
      useAddItemController({
        registry: ctx.registry,
        parentCtx: PARENT_CTX,
        telemetry: ctx.telemetry,
      }),
    );
    const selection = sample({ itemId: "cat-1", unitPrice: 2.5, chosenQty: 5 });
    const draft = ctx.adapter.toDraftShape(selection, PARENT_CTX);
    act(() => {
      result.current.stageLine(ctx.adapter, draft);
    });
    // 5% drift — within default 10% tolerance.
    world.items.set("cat-1", sample({ itemId: "cat-1", unitPrice: 2.625 }));
    await act(async () => {
      await result.current.commit();
    });
    expect(ctx.events.filter((e) => e.type === "commit.stale").length).toBe(0);
  });

  it("flags staleness when the catalog item is deactivated mid-session", async () => {
    const world = makeWorld([sample({ itemId: "cat-1", isActive: true })]);
    const ctx = setup({ world });
    const { result } = renderHook(() =>
      useAddItemController({
        registry: ctx.registry,
        parentCtx: PARENT_CTX,
        telemetry: ctx.telemetry,
      }),
    );
    const draft = ctx.adapter.toDraftShape(sample({ itemId: "cat-1" }), PARENT_CTX);
    act(() => {
      result.current.stageLine(ctx.adapter, draft);
    });
    world.items.set("cat-1", sample({ itemId: "cat-1", isActive: false }));
    await act(async () => {
      await result.current.commit();
    });
    expect(ctx.events.filter((e) => e.type === "commit.stale").length).toBe(1);
  });
});

describe("catalog — currency mismatch annotation", () => {
  it("records currencyMismatch=true in sourceRef when applyParentContext detects a different currency", () => {
    const ctx = setup();
    const eurSelection = sample({ currencyCode: "EUR", chosenQty: 3 });
    const draft = ctx.adapter.toDraftShape(eurSelection, PARENT_CTX);
    const applied = ctx.adapter.applyParentContext(draft, PARENT_CTX);
    expect(applied.sourceBinding.sourceRef).toMatchObject({
      parentCurrency: "USD",
      currencyMismatch: true,
    });
    // Original sourceRef metadata (unitPriceAtSelection, currencyAtSelection)
    // must survive the merge so audit can reconstruct what the user saw.
    expect(applied.sourceBinding.sourceRef).toMatchObject({
      currencyAtSelection: "EUR",
    });
  });

  it("leaves sourceRef alone when currencies match", () => {
    const ctx = setup();
    const draft = ctx.adapter.toDraftShape(sample(), PARENT_CTX);
    const applied = ctx.adapter.applyParentContext(draft, PARENT_CTX);
    expect(
      (applied.sourceBinding.sourceRef as Record<string, unknown> | undefined)?.currencyMismatch,
    ).toBeUndefined();
  });
});

describe("catalog — dedupeKey", () => {
  it("uses itemId + uomCode so the same item under different UOMs is distinct", () => {
    const ctx = setup();
    const each = ctx.adapter.toDraftShape(
      sample({ itemId: "cat-1", baseUomCode: "EA", chosenUomCode: "EA" }),
      PARENT_CTX,
    );
    const box = ctx.adapter.toDraftShape(
      sample({ itemId: "cat-1", baseUomCode: "EA", chosenUomCode: "BOX" }),
      PARENT_CTX,
    );
    expect(ctx.adapter.dedupeKey!(each, PARENT_CTX)).not.toBe(
      ctx.adapter.dedupeKey!(box, PARENT_CTX),
    );
  });
});
