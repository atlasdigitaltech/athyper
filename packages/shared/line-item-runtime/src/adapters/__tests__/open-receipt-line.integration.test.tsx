import { describe, expect, it } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  SourceAdapterRegistry,
  TelemetryDispatcher,
  useAddItemController,
  type AddItemTelemetryEvent,
} from "@athyper/runtime-add-item";
import {
  createOpenReceiptLineAdapter,
  type OpenReceiptLineParentCtx,
  type OpenReceiptLineSelection,
} from "../open-receipt-line";

// ─────────────────────────────────────────────────────────────────────────────
// Phase 6 PR #4 integration smoke tests — covers the plan's four acceptance
// dimensions plus receipt-specific guards:
//
//   • Permission gating
//   • Staleness `fail` under concurrent invoicing (remainingQty drops)
//   • Staleness fail when isFullyInvoiced flips true mid-session
//   • Staleness fail when isAccepted flips false mid-session
//   • Staleness `warn` (opt-in)
//   • Side-effect ordering: reserve → link per line, across multiple lines
//   • Duplicate-source-line guard for receipt lines
//   • Three-way match binding pinned on every committed line
//   • PO back-reference preserved in sourceRef
//   • Validation rejects: qty > remaining, qty ≤ 0, non-accepted, fully-invoiced
//   • Currency mismatch annotation
//   • Staleness opt-out (no checkLive)
// ─────────────────────────────────────────────────────────────────────────────

const PARENT_CTX: OpenReceiptLineParentCtx = {
  parentEntityCode: "purchase_invoice",
  parentRecordId: "inv-0042",
  lineEntityCode: "purchase_invoice_line",
  currencyCode: "USD",
};

function sample(over: Partial<OpenReceiptLineSelection> = {}): OpenReceiptLineSelection {
  return {
    receiptId: "grn-2001",
    receiptNumber: "GRN-2001",
    receiptDate: "2026-06-01",
    lineId: "grn-2001-line-1",
    lineNumber: 1,
    poId: "po-1001",
    poNumber: "PO-1001",
    poLineId: "po-1001-line-1",
    poLineNumber: 1,
    itemId: "item-paper",
    itemCode: "PAP-A4",
    description: "Bulk paper, A4",
    baseUomCode: "BX",
    acceptedQty: 30,
    remainingQty: 25,
    unitPrice: 12.5,
    currencyCode: "USD",
    supplierId: "sup-1",
    supplierCode: "ACME",
    isAccepted: true,
    isFullyInvoiced: false,
    chosenQty: 10,
    ...over,
  };
}

interface FakeWorld {
  lines: Map<string, OpenReceiptLineSelection>;
}

function worldKey(receiptId: string, lineId: string): string {
  return `${receiptId}:${lineId}`;
}

function makeWorld(lines: OpenReceiptLineSelection[]): FakeWorld {
  return {
    lines: new Map(lines.map((l) => [worldKey(l.receiptId, l.lineId), l] as const)),
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
  const adapter = createOpenReceiptLineAdapter({
    permissionCode:
      "permissionCode" in opts ? opts.permissionCode : "INVOICE.LINE.ADD_FROM_RECEIPT",
    stalenessStrategy: opts.stalenessStrategy,
    fetchLines: async () => ({ items: Array.from(world.lines.values()) }),
    checkLive:
      opts.checkLive === false
        ? undefined
        : async (rid, lid) => world.lines.get(worldKey(rid, lid)) ?? null,
  });
  registry.register(adapter);
  return { registry, adapter, telemetry, events, world };
}

describe("open_receipt_line — staging + commit + side effects", () => {
  it("stages two receipt lines + commits both with reserve + link side effects per line", async () => {
    const lineA = sample({
      lineId: "line-A",
      lineNumber: 1,
      remainingQty: 50,
      chosenQty: 20,
    });
    const lineB = sample({
      lineId: "line-B",
      lineNumber: 2,
      poLineId: "po-1001-line-2",
      poLineNumber: 2,
      remainingQty: 30,
      chosenQty: 15,
    });
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
      expect(entry.line.sourceBinding.sourceType).toBe("open_receipt_line");
      expect(entry.line.sourceBinding.sourceDocType).toBe("goods_receipt");
      expect(entry.line.sourceBinding.matchType).toBe("three_way");
    }

    let commitResult: Awaited<ReturnType<typeof result.current.commit>> | undefined;
    await act(async () => {
      commitResult = await result.current.commit();
    });
    expect(commitResult?.ok).toBe(true);
    if (commitResult?.ok) {
      expect(commitResult.committedLines.length).toBe(2);
      // 2 lines × (reserve + link) = 4 side effects.
      expect(commitResult.sideEffects.length).toBe(4);
      expect(commitResult.sideEffects[0]?.kind).toBe("reserve_remaining_quantity");
      expect(commitResult.sideEffects[1]?.kind).toBe("link_source_line");
      expect(commitResult.sideEffects[2]?.kind).toBe("reserve_remaining_quantity");
      expect(commitResult.sideEffects[3]?.kind).toBe("link_source_line");
      // Reserve targets the GRN line, not the PO line.
      if (commitResult.sideEffects[0]?.kind === "reserve_remaining_quantity") {
        expect(commitResult.sideEffects[0].entityCode).toBe("goods_receipt_line");
        expect(commitResult.sideEffects[0].recordId).toBe("grn-2001");
        expect(commitResult.sideEffects[0].lineId).toBe("line-A");
        expect(commitResult.sideEffects[0].quantity).toBe(20);
      }
    }
  });
});

describe("open_receipt_line — permission gating", () => {
  it("hides open_receipt_line from availableAdapters when permission is denied", () => {
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

  it("surfaces open_receipt_line when permission check returns true", () => {
    const ctx = setup();
    const { result } = renderHook(() =>
      useAddItemController({
        registry: ctx.registry,
        parentCtx: PARENT_CTX,
        hasPermission: (code) => code === "INVOICE.LINE.ADD_FROM_RECEIPT",
      }),
    );
    expect(result.current.availableAdapters.map((a) => a.manifest.id)).toEqual([
      "open_receipt_line",
    ]);
  });
});

describe("open_receipt_line — staleness fail strategy (default)", () => {
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

    // Concurrent invoicing: somebody else just invoiced 30, leaving 20.
    world.lines.set(worldKey(line.receiptId, line.lineId), {
      ...line,
      remainingQty: 20,
    });

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
    expect(result.current.stagedLines.length).toBe(1);
  });

  it("rejects commit when the receipt line was fully invoiced since staging", async () => {
    const line = sample({ lineId: "line-1", isFullyInvoiced: false });
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
    world.lines.set(worldKey(line.receiptId, line.lineId), {
      ...line,
      isFullyInvoiced: true,
    });

    let commitResult: Awaited<ReturnType<typeof result.current.commit>> | undefined;
    await act(async () => {
      commitResult = await result.current.commit();
    });
    expect(commitResult?.ok).toBe(false);
    expect(ctx.events.filter((e) => e.type === "commit.stale").length).toBe(1);
  });

  it("rejects commit when the receipt line was un-accepted since staging", async () => {
    const line = sample({ lineId: "line-1", isAccepted: true });
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
    world.lines.set(worldKey(line.receiptId, line.lineId), {
      ...line,
      isAccepted: false,
    });
    let commitResult: Awaited<ReturnType<typeof result.current.commit>> | undefined;
    await act(async () => {
      commitResult = await result.current.commit();
    });
    expect(commitResult?.ok).toBe(false);
  });
});

describe("open_receipt_line — staleness warn strategy (opt-in)", () => {
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
    world.lines.set(worldKey(line.receiptId, line.lineId), {
      ...line,
      remainingQty: 20,
    });
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
  });
});

describe("open_receipt_line — duplicate-source-line guard", () => {
  it("commit rejects the second staging of the same receipt line in one session", async () => {
    const line = sample({ lineId: "line-1", remainingQty: 50, chosenQty: 5 });
    const ctx = setup({ world: makeWorld([line]) });
    const { result } = renderHook(() =>
      useAddItemController({
        registry: ctx.registry,
        parentCtx: PARENT_CTX,
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

describe("open_receipt_line — validation", () => {
  it("rejects qty greater than remainingQty", () => {
    const ctx = setup();
    const r = ctx.adapter.validateSelection(
      sample({ remainingQty: 10, chosenQty: 15 }),
      PARENT_CTX,
    );
    expect(r.ok).toBe(false);
    expect(r.issues?.[0]?.message).toMatch(/exceeds open 10/);
  });

  it("rejects qty <= 0", () => {
    const ctx = setup();
    const r = ctx.adapter.validateSelection(sample({ chosenQty: 0 }), PARENT_CTX);
    expect(r.ok).toBe(false);
  });

  it("rejects non-accepted receipt lines", () => {
    const ctx = setup();
    const r = ctx.adapter.validateSelection(sample({ isAccepted: false }), PARENT_CTX);
    expect(r.ok).toBe(false);
    expect(r.issues?.some((i) => /not accepted/.test(i.message))).toBe(true);
  });

  it("rejects fully-invoiced receipt lines", () => {
    const ctx = setup();
    const r = ctx.adapter.validateSelection(sample({ isFullyInvoiced: true }), PARENT_CTX);
    expect(r.ok).toBe(false);
    expect(r.issues?.some((i) => /already fully invoiced/.test(i.message))).toBe(true);
  });
});

describe("open_receipt_line — PO back-reference + accepted-qty in sourceRef", () => {
  it("preserves poId / poLineId / poNumber / poLineNumber on the draft for three-way matching", () => {
    const ctx = setup();
    const draft = ctx.adapter.toDraftShape(sample(), PARENT_CTX);
    expect(draft.poId).toBe("po-1001");
    expect(draft.poLineId).toBe("po-1001-line-1");
    expect(draft.poNumber).toBe("PO-1001");
    expect(draft.poLineNumber).toBe(1);
  });

  it("records poId / poLineId / acceptedQtyAtSelection / receiptDate in sourceBinding.sourceRef for audit", () => {
    const ctx = setup();
    const draft = ctx.adapter.toDraftShape(sample(), PARENT_CTX);
    expect(draft.sourceBinding.sourceRef).toMatchObject({
      poId: "po-1001",
      poLineId: "po-1001-line-1",
      poLineNumber: 1,
      acceptedQtyAtSelection: 30,
      remainingQtyAtSelection: 25,
      receiptDate: "2026-06-01",
      receiptNumber: "GRN-2001",
    });
  });
});

describe("open_receipt_line — currency mismatch annotation", () => {
  it("records currencyMismatch + parentCurrency when applyParentContext detects cross-currency", () => {
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

describe("open_receipt_line — staleness opt-out (no checkLive)", () => {
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
    // Mutate world — adapter without checkLive can't see the change.
    world.lines.set(worldKey(line.receiptId, line.lineId), {
      ...line,
      remainingQty: 1,
    });
    let commitResult: Awaited<ReturnType<typeof result.current.commit>> | undefined;
    await act(async () => {
      commitResult = await result.current.commit();
    });
    expect(commitResult?.ok).toBe(true);
    expect(ctx.events.filter((e) => e.type === "commit.stale").length).toBe(0);
  });
});
