import { describe, expect, it } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  SourceAdapterRegistry,
  TelemetryDispatcher,
  useAddItemController,
  type AddItemTelemetryEvent,
} from "@athyper/runtime-add-item";
import {
  createOpenPoLineAdapter,
  type OpenPoLineParentCtx,
  type OpenPoLineSelection,
} from "../open-po-line";

// ─────────────────────────────────────────────────────────────────────────────
// Phase 6 PR #2 integration smoke tests — covers the four acceptance
// dimensions from the plan plus three open_po_line-specific guards:
//
//   • Permission gating (picker hides when denied)
//   • Staleness `fail` strategy (concurrent qty change rejects commit)
//   • Side effects in the right order (reserve before link)
//   • Duplicate source-line guard (committer rejects staging the same PO
//     line twice in one session, even when the adapter doesn't catch it)
//   • Multi-line staging + commit (two PO lines in the same session)
//   • Match type binding (every committed line carries three_way)
//   • Validation rejects qty > remaining
// ─────────────────────────────────────────────────────────────────────────────

const PARENT_CTX: OpenPoLineParentCtx = {
  parentEntityCode: "purchase_invoice",
  parentRecordId: "inv-0042",
  lineEntityCode: "purchase_invoice_line",
  currencyCode: "USD",
};

function sample(over: Partial<OpenPoLineSelection> = {}): OpenPoLineSelection {
  return {
    poId: "po-1001",
    poNumber: "PO-1001",
    lineId: "po-1001-line-1",
    lineNumber: 1,
    description: "Bulk paper, A4",
    itemId: "item-paper",
    itemCode: "PAP-A4",
    baseUomCode: "BX",
    remainingQty: 25,
    unitPrice: 12.5,
    currencyCode: "USD",
    supplierId: "sup-1",
    supplierCode: "ACME",
    isOpen: true,
    chosenQty: 10,
    ...over,
  };
}

interface FakeWorld {
  lines: Map<string, OpenPoLineSelection>;
}

function worldKey(poId: string, lineId: string): string {
  return `${poId}:${lineId}`;
}

function makeWorld(lines: OpenPoLineSelection[]): FakeWorld {
  return {
    lines: new Map(lines.map((l) => [worldKey(l.poId, l.lineId), l] as const)),
  };
}

function setup(opts: {
  world?: FakeWorld;
  permissionCode?: string | undefined;
  stalenessStrategy?: "fail" | "warn" | "refresh";
  checkLive?: boolean;
} = {}) {
  const world = opts.world ?? makeWorld([sample()]);
  const telemetry = new TelemetryDispatcher();
  const events: AddItemTelemetryEvent[] = [];
  telemetry.subscribe((e) => events.push(e));

  const registry = new SourceAdapterRegistry({ telemetry });
  const adapter = createOpenPoLineAdapter({
    permissionCode:
      "permissionCode" in opts ? opts.permissionCode : "INVOICE.LINE.ADD_FROM_PO",
    stalenessStrategy: opts.stalenessStrategy,
    fetchLines: async () => ({ items: Array.from(world.lines.values()) }),
    checkLive:
      opts.checkLive === false
        ? undefined
        : async (poId, lineId) => world.lines.get(worldKey(poId, lineId)) ?? null,
  });
  registry.register(adapter);
  return { registry, adapter, telemetry, events, world };
}

describe("open_po_line — staging + commit + side effects", () => {
  it("stages two PO lines + commits both with reserve + link side effects per line", async () => {
    const lineA = sample({ lineId: "line-A", lineNumber: 1, remainingQty: 50, chosenQty: 20 });
    const lineB = sample({ lineId: "line-B", lineNumber: 2, remainingQty: 30, chosenQty: 15 });
    const world = makeWorld([lineA, lineB]);
    const ctx = setup({ world });

    const { result } = renderHook(() =>
      useAddItemController({
        registry: ctx.registry,
        parentCtx: PARENT_CTX,
        telemetry: ctx.telemetry,
      }),
    );

    const draftA = ctx.adapter.toDraftShape(lineA, PARENT_CTX);
    const draftB = ctx.adapter.toDraftShape(lineB, PARENT_CTX);
    act(() => {
      result.current.stageLine(ctx.adapter, draftA);
      result.current.stageLine(ctx.adapter, draftB);
    });
    expect(result.current.stagedLines.length).toBe(2);
    for (const entry of result.current.stagedLines) {
      expect(entry.line.matchType).toBe("three_way");
      expect(entry.line.sourceBinding.sourceType).toBe("open_po_line");
      expect(entry.line.sourceBinding.matchType).toBe("three_way");
    }

    let commitResult: Awaited<ReturnType<typeof result.current.commit>> | undefined;
    await act(async () => {
      commitResult = await result.current.commit();
    });
    expect(commitResult?.ok).toBe(true);
    if (commitResult?.ok) {
      expect(commitResult.committedLines.length).toBe(2);
      // Each line emits two side effects: reserve_remaining_quantity, then
      // link_source_line. Across two lines that's exactly four.
      expect(commitResult.sideEffects.length).toBe(4);
      const reservations = commitResult.sideEffects.filter(
        (e) => e.kind === "reserve_remaining_quantity",
      );
      const links = commitResult.sideEffects.filter((e) => e.kind === "link_source_line");
      expect(reservations.length).toBe(2);
      expect(links.length).toBe(2);
      // Reservation quantities match chosen qty.
      if (reservations[0]?.kind === "reserve_remaining_quantity") {
        expect(reservations[0].quantity).toBe(20);
      }
      // Per-line ordering: reserve comes before link within each line's
      // contribution (verified by side-effect index parity).
      expect(commitResult.sideEffects[0]?.kind).toBe("reserve_remaining_quantity");
      expect(commitResult.sideEffects[1]?.kind).toBe("link_source_line");
      expect(commitResult.sideEffects[2]?.kind).toBe("reserve_remaining_quantity");
      expect(commitResult.sideEffects[3]?.kind).toBe("link_source_line");
    }
  });
});

describe("open_po_line — permission gating", () => {
  it("hides open_po_line from availableAdapters when permission is denied", () => {
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

  it("surfaces open_po_line when permission check returns true", () => {
    const ctx = setup();
    const { result } = renderHook(() =>
      useAddItemController({
        registry: ctx.registry,
        parentCtx: PARENT_CTX,
        hasPermission: (code) => code === "INVOICE.LINE.ADD_FROM_PO",
      }),
    );
    expect(result.current.availableAdapters.map((a) => a.manifest.id)).toEqual(["open_po_line"]);
  });
});

describe("open_po_line — staleness fail strategy (default)", () => {
  it("rejects commit when staged qty exceeds live remainingQty", async () => {
    const line = sample({ lineId: "line-1", remainingQty: 50, chosenQty: 40 });
    const world = makeWorld([line]);
    const ctx = setup({ world });
    const { result } = renderHook(() =>
      useAddItemController({
        registry: ctx.registry,
        parentCtx: PARENT_CTX,
        telemetry: ctx.telemetry,
      }),
    );

    const draft = ctx.adapter.toDraftShape(line, PARENT_CTX);
    act(() => {
      result.current.stageLine(ctx.adapter, draft);
    });

    // Concurrent invoicing: another user just took 30 of the 50, leaving 20.
    world.lines.set(worldKey(line.poId, line.lineId), { ...line, remainingQty: 20 });

    let commitResult: Awaited<ReturnType<typeof result.current.commit>> | undefined;
    await act(async () => {
      commitResult = await result.current.commit();
    });
    expect(commitResult?.ok).toBe(false);
    if (commitResult && !commitResult.ok) {
      expect(commitResult.error).toMatch(/stale/i);
    }
    const staleEvents = ctx.events.filter((e) => e.type === "commit.stale");
    expect(staleEvents.length).toBe(1);
    if (staleEvents[0]?.type === "commit.stale") {
      expect(staleEvents[0].strategy).toBe("fail");
    }
    // Staged line preserved so the user can adjust and retry.
    expect(result.current.stagedLines.length).toBe(1);
  });

  it("rejects commit when the PO line was closed since staging", async () => {
    const line = sample({ lineId: "line-1", isOpen: true, chosenQty: 5 });
    const world = makeWorld([line]);
    const ctx = setup({ world });
    const { result } = renderHook(() =>
      useAddItemController({
        registry: ctx.registry,
        parentCtx: PARENT_CTX,
        telemetry: ctx.telemetry,
      }),
    );
    const draft = ctx.adapter.toDraftShape(line, PARENT_CTX);
    act(() => {
      result.current.stageLine(ctx.adapter, draft);
    });
    world.lines.set(worldKey(line.poId, line.lineId), { ...line, isOpen: false });

    let commitResult: Awaited<ReturnType<typeof result.current.commit>> | undefined;
    await act(async () => {
      commitResult = await result.current.commit();
    });
    expect(commitResult?.ok).toBe(false);
  });
});

describe("open_po_line — staleness warn strategy", () => {
  it("commits the line + emits commit.stale without rejecting", async () => {
    const line = sample({ lineId: "line-1", remainingQty: 50, chosenQty: 40 });
    const world = makeWorld([line]);
    const ctx = setup({ world, stalenessStrategy: "warn" });
    const { result } = renderHook(() =>
      useAddItemController({
        registry: ctx.registry,
        parentCtx: PARENT_CTX,
        telemetry: ctx.telemetry,
      }),
    );
    const draft = ctx.adapter.toDraftShape(line, PARENT_CTX);
    act(() => {
      result.current.stageLine(ctx.adapter, draft);
    });
    world.lines.set(worldKey(line.poId, line.lineId), { ...line, remainingQty: 20 });

    let commitResult: Awaited<ReturnType<typeof result.current.commit>> | undefined;
    await act(async () => {
      commitResult = await result.current.commit();
    });
    expect(commitResult?.ok).toBe(true);
    if (commitResult?.ok) {
      expect(commitResult.committedLines.length).toBe(1);
    }
    const staleEvents = ctx.events.filter((e) => e.type === "commit.stale");
    expect(staleEvents.length).toBe(1);
    if (staleEvents[0]?.type === "commit.stale") {
      expect(staleEvents[0].strategy).toBe("warn");
    }
  });
});

describe("open_po_line — duplicate-source-line guard", () => {
  it("commit rejects the second staging of the same PO line in one session", async () => {
    const line = sample({ lineId: "line-1", remainingQty: 50, chosenQty: 5 });
    const ctx = setup({ world: makeWorld([line]) });
    const { result } = renderHook(() =>
      useAddItemController({
        registry: ctx.registry,
        parentCtx: PARENT_CTX,
        telemetry: ctx.telemetry,
      }),
    );

    const draftA = ctx.adapter.toDraftShape(line, PARENT_CTX);
    const draftB = ctx.adapter.toDraftShape(line, PARENT_CTX); // same identity
    act(() => {
      result.current.stageLine(ctx.adapter, draftA);
      result.current.stageLine(ctx.adapter, draftB);
    });
    expect(result.current.stagedLines.length).toBe(2);

    let commitResult: Awaited<ReturnType<typeof result.current.commit>> | undefined;
    await act(async () => {
      commitResult = await result.current.commit();
    });
    expect(commitResult?.ok).toBe(false);
    if (commitResult && !commitResult.ok) {
      expect(commitResult.error).toMatch(/Duplicate link_source_line/);
      expect(commitResult.failedAtIndex).toBe(1);
    }
  });
});

describe("open_po_line — validation", () => {
  it("rejects qty greater than remainingQty at validateSelection", () => {
    const ctx = setup();
    const result = ctx.adapter.validateSelection(
      sample({ remainingQty: 10, chosenQty: 15 }),
      PARENT_CTX,
    );
    expect(result.ok).toBe(false);
    expect(result.issues?.[0]?.message).toMatch(/exceeds remaining 10/);
  });

  it("rejects qty <= 0 at validateSelection", () => {
    const ctx = setup();
    const result = ctx.adapter.validateSelection(sample({ chosenQty: 0 }), PARENT_CTX);
    expect(result.ok).toBe(false);
  });

  it("rejects closed PO lines at validateSelection", () => {
    const ctx = setup();
    const result = ctx.adapter.validateSelection(sample({ isOpen: false }), PARENT_CTX);
    expect(result.ok).toBe(false);
  });
});

describe("open_po_line — currency mismatch annotation", () => {
  it("records currencyMismatch + parentCurrency when adapter is asked to apply parent context across currencies", () => {
    const ctx = setup();
    const eurLine = sample({ currencyCode: "EUR" });
    const draft = ctx.adapter.toDraftShape(eurLine, PARENT_CTX);
    const applied = ctx.adapter.applyParentContext(draft, PARENT_CTX);
    expect(applied.sourceBinding.sourceRef).toMatchObject({
      parentCurrency: "USD",
      currencyMismatch: true,
      currencyAtSelection: "EUR",
    });
  });
});

describe("open_po_line — staleness opt-out (no checkLive)", () => {
  it("commits without staleness checks when checkLive is omitted", async () => {
    const line = sample({ lineId: "line-1", remainingQty: 50, chosenQty: 40 });
    const world = makeWorld([line]);
    const ctx = setup({ world, checkLive: false });
    const { result } = renderHook(() =>
      useAddItemController({
        registry: ctx.registry,
        parentCtx: PARENT_CTX,
        telemetry: ctx.telemetry,
      }),
    );
    const draft = ctx.adapter.toDraftShape(line, PARENT_CTX);
    act(() => {
      result.current.stageLine(ctx.adapter, draft);
    });
    // Mutate world — adapter without checkLive cannot see the change.
    world.lines.set(worldKey(line.poId, line.lineId), { ...line, remainingQty: 1 });
    let commitResult: Awaited<ReturnType<typeof result.current.commit>> | undefined;
    await act(async () => {
      commitResult = await result.current.commit();
    });
    expect(commitResult?.ok).toBe(true);
    expect(ctx.events.filter((e) => e.type === "commit.stale").length).toBe(0);
  });
});
