import { describe, expect, it } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  SourceAdapterRegistry,
  TelemetryDispatcher,
  useAddItemController,
  type AddItemTelemetryEvent,
} from "@athyper/runtime-add-item";
import {
  createOpenServiceSheetLineAdapter,
  type OpenServiceSheetLineParentCtx,
  type OpenServiceSheetLineSelection,
} from "../open-service-sheet-line";

// ─────────────────────────────────────────────────────────────────────────────
// Phase 6 PR #5 integration smoke tests — covers Phase 6's four acceptance
// dimensions plus SES-specific guards:
//
//   • Permission gating
//   • Staleness `fail` for qty drift / certification revoked / fully-invoiced
//   • Staleness `warn` opt-in
//   • Reserve + link side-effect ordering (reserve targets service_sheet_line)
//   • Duplicate-source-line guard for SES lines
//   • Three-way match binding pinned
//   • Service-period preservation on both draft and sourceRef (the
//     SES-specific audit invariant)
//   • PO back-reference preserved
//   • Validation: qty > remaining, qty ≤ 0, non-certified, fully-invoiced,
//     period start after end
//   • Currency mismatch annotation
//   • Staleness opt-out (no checkLive)
// ─────────────────────────────────────────────────────────────────────────────

const PARENT_CTX: OpenServiceSheetLineParentCtx = {
  parentEntityCode: "purchase_invoice",
  parentRecordId: "inv-0042",
  lineEntityCode: "purchase_invoice_line",
  currencyCode: "USD",
};

function sample(over: Partial<OpenServiceSheetLineSelection> = {}): OpenServiceSheetLineSelection {
  return {
    serviceSheetId: "ses-3001",
    serviceSheetNumber: "SES-3001",
    certifiedDate: "2026-06-05",
    servicePeriodStart: "2026-05-01",
    servicePeriodEnd: "2026-05-31",
    lineId: "ses-3001-line-1",
    lineNumber: 1,
    poId: "po-1500",
    poNumber: "PO-1500",
    poLineId: "po-1500-line-1",
    poLineNumber: 1,
    itemId: "svc-consulting",
    itemCode: "CONS-SR",
    description: "Senior consulting (May 2026)",
    baseUomCode: "HOUR",
    certifiedQty: 160,
    remainingQty: 120,
    unitPrice: 175,
    currencyCode: "USD",
    supplierId: "sup-2",
    supplierCode: "ADVISORY",
    isCertified: true,
    isFullyInvoiced: false,
    chosenQty: 40,
    ...over,
  };
}

interface FakeWorld {
  lines: Map<string, OpenServiceSheetLineSelection>;
}

function worldKey(serviceSheetId: string, lineId: string): string {
  return `${serviceSheetId}:${lineId}`;
}

function makeWorld(lines: OpenServiceSheetLineSelection[]): FakeWorld {
  return {
    lines: new Map(lines.map((l) => [worldKey(l.serviceSheetId, l.lineId), l] as const)),
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
  const adapter = createOpenServiceSheetLineAdapter({
    permissionCode:
      "permissionCode" in opts
        ? opts.permissionCode
        : "INVOICE.LINE.ADD_FROM_SERVICE_SHEET",
    stalenessStrategy: opts.stalenessStrategy,
    fetchLines: async () => ({ items: Array.from(world.lines.values()) }),
    checkLive:
      opts.checkLive === false
        ? undefined
        : async (sid, lid) => world.lines.get(worldKey(sid, lid)) ?? null,
  });
  registry.register(adapter);
  return { registry, adapter, telemetry, events, world };
}

describe("open_service_sheet_line — staging + commit + side effects", () => {
  it("stages two SES lines + commits with reserve + link side effects per line", async () => {
    const lineA = sample({
      lineId: "line-A",
      lineNumber: 1,
      remainingQty: 100,
      chosenQty: 40,
    });
    const lineB = sample({
      lineId: "line-B",
      lineNumber: 2,
      poLineId: "po-1500-line-2",
      poLineNumber: 2,
      itemCode: "CONS-JR",
      baseUomCode: "DAY",
      certifiedQty: 22,
      remainingQty: 18,
      unitPrice: 800,
      chosenQty: 5,
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
      expect(entry.line.sourceBinding.sourceType).toBe("open_service_sheet_line");
      expect(entry.line.sourceBinding.sourceDocType).toBe("service_sheet");
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
      // Reserve targets the SES line, not the PO.
      if (commitResult.sideEffects[0]?.kind === "reserve_remaining_quantity") {
        expect(commitResult.sideEffects[0].entityCode).toBe("service_sheet_line");
        expect(commitResult.sideEffects[0].recordId).toBe("ses-3001");
        expect(commitResult.sideEffects[0].lineId).toBe("line-A");
        expect(commitResult.sideEffects[0].quantity).toBe(40);
      }
    }
  });
});

describe("open_service_sheet_line — permission gating", () => {
  it("hides open_service_sheet_line from availableAdapters when permission is denied", () => {
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

  it("surfaces open_service_sheet_line when permission check returns true", () => {
    const ctx = setup();
    const { result } = renderHook(() =>
      useAddItemController({
        registry: ctx.registry,
        parentCtx: PARENT_CTX,
        hasPermission: (code) => code === "INVOICE.LINE.ADD_FROM_SERVICE_SHEET",
      }),
    );
    expect(result.current.availableAdapters.map((a) => a.manifest.id)).toEqual([
      "open_service_sheet_line",
    ]);
  });
});

describe("open_service_sheet_line — staleness fail strategy (default)", () => {
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
    // Concurrent invoicing reduced live remaining to 20.
    world.lines.set(worldKey(line.serviceSheetId, line.lineId), {
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

  it("rejects commit when SES line certification was revoked since staging", async () => {
    const line = sample({ lineId: "line-1", isCertified: true });
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
    world.lines.set(worldKey(line.serviceSheetId, line.lineId), {
      ...line,
      isCertified: false,
    });
    let commitResult: Awaited<ReturnType<typeof result.current.commit>> | undefined;
    await act(async () => {
      commitResult = await result.current.commit();
    });
    expect(commitResult?.ok).toBe(false);
  });

  it("rejects commit when SES line was fully invoiced since staging", async () => {
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
    world.lines.set(worldKey(line.serviceSheetId, line.lineId), {
      ...line,
      isFullyInvoiced: true,
    });
    let commitResult: Awaited<ReturnType<typeof result.current.commit>> | undefined;
    await act(async () => {
      commitResult = await result.current.commit();
    });
    expect(commitResult?.ok).toBe(false);
  });
});

describe("open_service_sheet_line — staleness warn strategy (opt-in)", () => {
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
    world.lines.set(worldKey(line.serviceSheetId, line.lineId), {
      ...line,
      remainingQty: 20,
    });
    let commitResult: Awaited<ReturnType<typeof result.current.commit>> | undefined;
    await act(async () => {
      commitResult = await result.current.commit();
    });
    expect(commitResult?.ok).toBe(true);
    const stale = ctx.events.filter((e) => e.type === "commit.stale");
    expect(stale.length).toBe(1);
    if (stale[0]?.type === "commit.stale") {
      expect(stale[0].strategy).toBe("warn");
    }
  });
});

describe("open_service_sheet_line — duplicate-source-line guard", () => {
  it("commit rejects the second staging of the same SES line in one session", async () => {
    const line = sample({ lineId: "line-1", remainingQty: 50, chosenQty: 5 });
    const ctx = setup({ world: makeWorld([line]) });
    const { result } = renderHook(() =>
      useAddItemController({
        registry: ctx.registry,
        parentCtx: PARENT_CTX,
      }),
    );
    const draftA = ctx.adapter.toDraftShape(line, PARENT_CTX);
    const draftB = ctx.adapter.toDraftShape(line, PARENT_CTX);
    act(() => {
      result.current.stageLine(ctx.adapter, draftA);
      result.current.stageLine(ctx.adapter, draftB);
    });
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

describe("open_service_sheet_line — validation", () => {
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

  it("rejects non-certified SES lines", () => {
    const ctx = setup();
    const r = ctx.adapter.validateSelection(sample({ isCertified: false }), PARENT_CTX);
    expect(r.ok).toBe(false);
    expect(r.issues?.some((i) => /not certified/.test(i.message))).toBe(true);
  });

  it("rejects fully-invoiced SES lines", () => {
    const ctx = setup();
    const r = ctx.adapter.validateSelection(sample({ isFullyInvoiced: true }), PARENT_CTX);
    expect(r.ok).toBe(false);
    expect(r.issues?.some((i) => /already fully invoiced/.test(i.message))).toBe(true);
  });

  it("rejects service period whose end precedes start", () => {
    const ctx = setup();
    const r = ctx.adapter.validateSelection(
      sample({ servicePeriodStart: "2026-05-31", servicePeriodEnd: "2026-05-01" }),
      PARENT_CTX,
    );
    expect(r.ok).toBe(false);
    expect(r.issues?.some((i) => /precedes start/.test(i.message))).toBe(true);
  });
});

describe("open_service_sheet_line — service-period + PO back-reference preservation", () => {
  it("preserves servicePeriodStart / servicePeriodEnd / certifiedDate on the draft for accrual", () => {
    const ctx = setup();
    const draft = ctx.adapter.toDraftShape(sample(), PARENT_CTX);
    expect(draft.servicePeriodStart).toBe("2026-05-01");
    expect(draft.servicePeriodEnd).toBe("2026-05-31");
    expect(draft.certifiedDate).toBe("2026-06-05");
  });

  it("preserves poId / poLineId / poNumber / poLineNumber on the draft for three-way matching", () => {
    const ctx = setup();
    const draft = ctx.adapter.toDraftShape(sample(), PARENT_CTX);
    expect(draft.poId).toBe("po-1500");
    expect(draft.poLineId).toBe("po-1500-line-1");
    expect(draft.poNumber).toBe("PO-1500");
    expect(draft.poLineNumber).toBe(1);
  });

  it("records full SES audit chain in sourceBinding.sourceRef (service period + PO ref + certifiedQty)", () => {
    const ctx = setup();
    const draft = ctx.adapter.toDraftShape(sample(), PARENT_CTX);
    expect(draft.sourceBinding.sourceRef).toMatchObject({
      serviceSheetNumber: "SES-3001",
      certifiedDate: "2026-06-05",
      servicePeriodStart: "2026-05-01",
      servicePeriodEnd: "2026-05-31",
      poId: "po-1500",
      poLineId: "po-1500-line-1",
      poLineNumber: 1,
      certifiedQtyAtSelection: 160,
      remainingQtyAtSelection: 120,
    });
  });
});

describe("open_service_sheet_line — currency mismatch annotation", () => {
  it("records currencyMismatch + parentCurrency when applyParentContext detects cross-currency", () => {
    const ctx = setup();
    const gbpLine = sample({ currencyCode: "GBP" });
    const draft = ctx.adapter.toDraftShape(gbpLine, PARENT_CTX);
    const applied = ctx.adapter.applyParentContext(draft, PARENT_CTX);
    expect(applied.sourceBinding.sourceRef).toMatchObject({
      parentCurrency: "USD",
      currencyMismatch: true,
      currencyAtSelection: "GBP",
    });
  });
});

describe("open_service_sheet_line — staleness opt-out (no checkLive)", () => {
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
    world.lines.set(worldKey(line.serviceSheetId, line.lineId), {
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
