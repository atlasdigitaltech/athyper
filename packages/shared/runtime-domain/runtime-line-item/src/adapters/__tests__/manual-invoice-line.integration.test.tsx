import { describe, expect, it } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  SourceAdapterRegistry,
  TelemetryDispatcher,
  useAddItemController,
  type AddItemTelemetryEvent,
} from "@athyper/runtime-add-item";
import {
  createManualInvoiceLineAdapter,
  type ManualInvoiceLineParentCtx,
} from "../manual-invoice-line";

// ─────────────────────────────────────────────────────────────────────────────
// Phase 5 integration smoke test — simulates the LinesGrid "create invoice
// → add 3 manual lines → commit" flow at the controller layer.
//
// What this proves (without needing a browser E2E):
//   • Adapter registers cleanly with the SourceAdapterRegistry
//   • Multiple lines can be staged in a single session against the same
//     adapter (the multi-source staging path collapsed to single-source)
//   • Every committed line carries the manual_invoice_line sourceBinding
//     with the parent doc id and entity code
//   • Telemetry emits adapter.register + commit.ok with the right counts
//   • Staged set clears after a successful commit (parent restarts clean)
// ─────────────────────────────────────────────────────────────────────────────

const PARENT_CTX: ManualInvoiceLineParentCtx = {
  parentEntityCode: "purchase_invoice",
  parentRecordId: "inv-0042",
  lineEntityCode: "purchase_invoice_line",
  currencyCode: "USD",
};

function setup() {
  const telemetry = new TelemetryDispatcher();
  const events: AddItemTelemetryEvent[] = [];
  telemetry.subscribe((e) => events.push(e));

  const registry = new SourceAdapterRegistry({ telemetry });
  const adapter = createManualInvoiceLineAdapter();
  const registerResult = registry.register(adapter);
  return { telemetry, events, registry, adapter, registerResult };
}

describe("manual_invoice_line — Phase 5 invoice add-line smoke test", () => {
  it("registers cleanly + emits adapter.register", () => {
    const ctx = setup();
    expect(ctx.registerResult.ok).toBe(true);
    expect(ctx.events.some((e) => e.type === "adapter.register")).toBe(true);
  });

  it("stages and commits 3 manual lines, each carrying sourceBinding", async () => {
    const ctx = setup();
    const { result } = renderHook(() =>
      useAddItemController({
        registry: ctx.registry,
        parentCtx: PARENT_CTX,
        telemetry: ctx.telemetry,
      }),
    );

    // Stage three manual lines via the composer-equivalent flow.
    const payloads = [
      { description: "Office supplies", quantity: 5, unitPrice: 12, lineAmount: 60 },
      { description: "Software license", quantity: 1, unitPrice: 199, lineAmount: 199 },
      { description: "Shipping", quantity: 1, unitPrice: 45, lineAmount: 45 },
    ];

    act(() => {
      for (let i = 0; i < payloads.length; i += 1) {
        const selection = {
          draftId: `draft-${i + 1}`,
          payload: payloads[i]!,
        };
        const draft = ctx.adapter.toDraftShape(selection, PARENT_CTX);
        result.current.stageLine(ctx.adapter, draft);
      }
    });

    expect(result.current.stagedLines.length).toBe(3);
    for (const entry of result.current.stagedLines) {
      expect(entry.adapterId).toBe("manual_invoice_line");
      expect(entry.line.sourceBinding.sourceType).toBe("manual_invoice_line");
      expect(entry.line.sourceBinding.sourceDocType).toBe("purchase_invoice");
      expect(entry.line.sourceBinding.sourceDocId).toBe("inv-0042");
    }

    let commitResult: Awaited<ReturnType<typeof result.current.commit>> | undefined;
    await act(async () => {
      commitResult = await result.current.commit();
    });

    expect(commitResult?.ok).toBe(true);
    if (commitResult?.ok) {
      expect(commitResult.committedLines.length).toBe(3);
      expect(commitResult.adapterIds).toEqual(["manual_invoice_line"]);
      // Manual adapter declares no side effects — no reserve, no link, no event.
      expect(commitResult.sideEffects).toEqual([]);

      // Every committed line preserves description + quantity + sourceBinding.
      for (let i = 0; i < 3; i += 1) {
        const line = commitResult.committedLines[i]!;
        expect(line.description).toBe(payloads[i]!.description);
        expect(line.quantity).toBe(payloads[i]!.quantity);
        expect(line.sourceBinding.sourceType).toBe("manual_invoice_line");
      }
    }

    // Staged set clears so the user can keep typing without manual reset.
    expect(result.current.stagedLines).toEqual([]);

    const commitOk = ctx.events.filter((e) => e.type === "commit.ok");
    expect(commitOk.length).toBe(1);
    if (commitOk[0]?.type === "commit.ok") {
      expect(commitOk[0].lineCount).toBe(3);
      expect(commitOk[0].adapterIds).toEqual(["manual_invoice_line"]);
    }
  });

  it("removeStagedLine drops one staged entry without affecting the others", () => {
    const ctx = setup();
    const { result } = renderHook(() =>
      useAddItemController({
        registry: ctx.registry,
        parentCtx: PARENT_CTX,
      }),
    );

    const draftA = ctx.adapter.toDraftShape(
      { draftId: "draft-a", payload: { description: "A" } },
      PARENT_CTX,
    );
    const draftB = ctx.adapter.toDraftShape(
      { draftId: "draft-b", payload: { description: "B" } },
      PARENT_CTX,
    );
    let firstId = "";
    act(() => {
      firstId = result.current.stageLine(ctx.adapter, draftA);
      result.current.stageLine(ctx.adapter, draftB);
    });
    expect(result.current.stagedLines.length).toBe(2);
    act(() => {
      result.current.removeStagedLine(firstId);
    });
    expect(result.current.stagedLines.length).toBe(1);
    expect(result.current.stagedLines[0]?.line.description).toBe("B");
  });

  it("commit with no staged lines emits commit.ok with zero counts", async () => {
    const ctx = setup();
    const { result } = renderHook(() =>
      useAddItemController({
        registry: ctx.registry,
        parentCtx: PARENT_CTX,
        telemetry: ctx.telemetry,
      }),
    );
    let commitResult: Awaited<ReturnType<typeof result.current.commit>> | undefined;
    await act(async () => {
      commitResult = await result.current.commit();
    });
    expect(commitResult?.ok).toBe(true);
    if (commitResult?.ok) {
      expect(commitResult.committedLines.length).toBe(0);
    }
  });
});
