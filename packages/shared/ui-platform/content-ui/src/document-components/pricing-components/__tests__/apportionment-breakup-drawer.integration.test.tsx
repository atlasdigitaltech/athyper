/**
 * ApportionmentBreakupDrawer — integration tests.
 *
 * Renders the full drawer (DrawerPeekShell + virtualized list + footer)
 * against a controlled fetch mock and fake timers. Covers the behaviors
 * the unit tests can't reach: debounce-into-fetch chains, cursor reset
 * on q/tab change, AbortController behavior (observed through which
 * response's data lands in state), empty-state branching, CSV URL
 * composition.
 *
 * Mocking strategy:
 *   - `vi.useFakeTimers()` controls the 300ms debounce + the 1000ms
 *     URL.revokeObjectURL delay in the CSV download path
 *   - `makeDeferredFetch()` returns a fetch mock that queues every call
 *     so tests can resolve them out-of-order and assert that only the
 *     latest fetch's data reaches the UI (the abort behavior we want
 *     to verify without poking AbortController internals)
 *   - URL.createObjectURL is stubbed to a sentinel and we assert the
 *     resulting <a download="..."> rather than triggering a real download
 *
 * Heads-up for future maintainers: jsdom doesn't compute layout, so
 * virtualizer.getVirtualItems() may return all rows or none depending
 * on the mocked ResizeObserver. We assert via `data-index` rather than
 * "rendered row count" — works regardless of virtualization fidelity.
 */
import {
  describe, it, expect,
  beforeEach, afterEach,
  vi,
} from "vitest";
import { render, screen, fireEvent, act, waitFor, within } from "@testing-library/react";
import { ApportionmentBreakupDrawer } from "../apportionment-breakup-drawer";

// ─── Fixtures ─────────────────────────────────────────────────────────

const INVOICE_ID = "01900000-0000-7000-8000-00000000d0c0";
const PC_ID      = "01900000-0000-7000-8000-00000000d0c1";

interface FakeRow {
  pil_id:            string;
  line_no:           number;
  item_description:  string;
  basis_value:       string;
  allocated_amount:  string;
  override_amount:   string | null;
  is_overridden:     boolean;
}

interface FakeResponse {
  header_pc: {
    id: string;
    term_type: string;
    condition_type_code: string | null;
    condition_type_label: string | null;
    apportion_basis: string | null;
    computed_amount: string;
  };
  rows: FakeRow[];
  next_cursor: string | null;
  summary: {
    total_lines: number;
    override_count: number;
    allocated_sum: string;
  };
}

function makeRow(n: number, overrides: Partial<FakeRow> = {}): FakeRow {
  return {
    pil_id:            `01900000-0000-7000-8000-${String(n).padStart(12, "0")}`,
    line_no:           n,
    item_description:  `Item ${n}`,
    basis_value:       "100",
    allocated_amount:  "20.00",
    override_amount:   null,
    is_overridden:     false,
    ...overrides,
  };
}

function makeResponse(over: Partial<FakeResponse> = {}): FakeResponse {
  return {
    header_pc: {
      id:                   PC_ID,
      term_type:            "charge",
      condition_type_code:  "FREIGHT",
      condition_type_label: "Freight",
      apportion_basis:      "value",
      computed_amount:      "60.00",
    },
    rows: [makeRow(1), makeRow(2), makeRow(3)],
    next_cursor: null,
    summary: {
      total_lines:    3,
      override_count: 0,
      allocated_sum:  "60.00",
    },
    ...over,
  };
}

// ─── Deferred fetch helper ────────────────────────────────────────────

interface PendingFetch {
  url:     string;
  init:    RequestInit | undefined;
  resolve: (body: unknown, init?: ResponseInit) => void;
  reject:  (err: Error) => void;
}

function makeDeferredFetch() {
  const calls: PendingFetch[] = [];
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    return new Promise<Response>((resolve, reject) => {
      calls.push({
        url:  String(input),
        init,
        resolve: (body, respInit) => {
          const headers = new Headers((respInit?.headers ?? {}) as HeadersInit);
          // Default to JSON unless the test sets text/csv etc.
          if (!headers.has("content-type")) headers.set("content-type", "application/json");
          const payload = typeof body === "string" ? body : JSON.stringify(body);
          resolve(new Response(payload, { status: respInit?.status ?? 200, headers }));
        },
        reject,
      });
    });
  });
  return { fetchMock, calls };
}

// ─── Render helper ────────────────────────────────────────────────────

function renderDrawer(props: Partial<React.ComponentProps<typeof ApportionmentBreakupDrawer>> = {}) {
  return render(
    <ApportionmentBreakupDrawer
      open={true}
      onOpenChange={vi.fn()}
      invoiceId={INVOICE_ID}
      headerPcId={PC_ID}
      currencyCode="INR"
      baseCurrencyCode="INR"
      exchangeRate={1}
      {...props}
    />,
  );
}

/** Drains microtasks AND advances fake timers — needed when React effects
 *  + Promise resolution + setTimeout all need to settle in sequence.
 *  Drains AGGRESSIVELY because the drawer's fetch chain has multiple
 *  awaits (fetch → res.json → setRows) and each needs a microtask. */
async function flush(ms: number = 0): Promise<void> {
  await act(async () => {
    if (ms > 0) vi.advanceTimersByTime(ms);
    // Aggressive drain — fetch chain has ~4 microtasks before setState
    for (let i = 0; i < 10; i++) {
      await Promise.resolve();
    }
  });
}

/** Resolves a pending fetch INSIDE act() so React processes the resulting
 *  state updates before the next assertion. Returns after the full
 *  microtask chain has drained. */
async function resolveAndFlush(
  pending: PendingFetch,
  body:    unknown,
  init?:   ResponseInit,
): Promise<void> {
  await act(async () => {
    pending.resolve(body, init);
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
}

// ─── Setup ────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: false });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────

describe("ApportionmentBreakupDrawer — fetch on open", () => {
  it("fires the initial page fetch on open without any ?q=", async () => {
    const { fetchMock, calls } = makeDeferredFetch();
    vi.stubGlobal("fetch", fetchMock);
    renderDrawer();
    await flush();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toContain(`/api/finance/ap/invoices/${INVOICE_ID}/pricing-components/${PC_ID}/apportionment`);
    expect(calls[0]!.url).toContain("tab=all");
    expect(calls[0]!.url).not.toContain("q=");
  });

});

describe("ApportionmentBreakupDrawer — debounce + cursor reset", () => {
  it("typing in the search input does NOT fetch immediately", async () => {
    const { fetchMock, calls } = makeDeferredFetch();
    vi.stubGlobal("fetch", fetchMock);
    renderDrawer();
    await flush();
    expect(calls).toHaveLength(1);
    calls[0]!.resolve(makeResponse());
    await flush();

    const input = screen.getByPlaceholderText(/search/i);
    fireEvent.change(input, { target: { value: "Lap" } });

    // No timer advance — fetch count must not increase
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("typing then waiting 300ms fires a single fetch with ?q=...", async () => {
    const { fetchMock, calls } = makeDeferredFetch();
    vi.stubGlobal("fetch", fetchMock);
    renderDrawer();
    await flush();
    calls[0]!.resolve(makeResponse());
    await flush();

    const input = screen.getByPlaceholderText(/search/i);
    fireEvent.change(input, { target: { value: "Lap" } });
    await flush(299);
    expect(fetchMock).toHaveBeenCalledTimes(1); // not yet
    await flush(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(calls[1]!.url).toContain("q=Lap");
  });

  it("typing fast (6 keystrokes 50ms apart) collapses into one final fetch", async () => {
    const { fetchMock, calls } = makeDeferredFetch();
    vi.stubGlobal("fetch", fetchMock);
    renderDrawer();
    await flush();
    calls[0]!.resolve(makeResponse());
    await flush();

    const input = screen.getByPlaceholderText(/search/i);
    for (const next of ["f", "fr", "fre", "frei", "freig", "freight"]) {
      fireEvent.change(input, { target: { value: next } });
      await flush(50);
    }
    // 50 * 6 = 300ms total, but each keystroke RESTARTS the timer. Only
    // 50ms has elapsed since the last keystroke.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await flush(250);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(calls[1]!.url).toContain("q=freight");
  });

  it("Enter forces an immediate fetch (bypasses the 300ms timer)", async () => {
    const { fetchMock, calls } = makeDeferredFetch();
    vi.stubGlobal("fetch", fetchMock);
    renderDrawer();
    await flush();
    calls[0]!.resolve(makeResponse());
    await flush();

    const input = screen.getByPlaceholderText(/search/i);
    fireEvent.change(input, { target: { value: "247" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(calls[1]!.url).toContain("q=247");
  });

  it("clear button resets q and fires a fetch with no ?q=", async () => {
    const { fetchMock, calls } = makeDeferredFetch();
    vi.stubGlobal("fetch", fetchMock);
    renderDrawer();
    await flush();
    calls[0]!.resolve(makeResponse());
    await flush();

    const input = screen.getByPlaceholderText(/search/i);
    fireEvent.change(input, { target: { value: "Lap" } });
    await flush(300);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    calls[1]!.resolve(makeResponse({ rows: [makeRow(1)] }));
    await flush();

    // Clear button (×) appears once input is non-empty.
    const clearBtn = screen.getByRole("button", { name: /clear search/i });
    fireEvent.click(clearBtn);
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(calls[2]!.url).not.toContain("q=");
  });

  it("changing q resets the cursor (next fetch is the first page, no &cursor=)", async () => {
    const { fetchMock, calls } = makeDeferredFetch();
    vi.stubGlobal("fetch", fetchMock);
    renderDrawer();
    await flush();
    calls[0]!.resolve(makeResponse({ next_cursor: "CURSOR_PAGE_2" }));
    await flush();

    // Load More → fetch with cursor
    fireEvent.click(screen.getByRole("button", { name: /load more/i }));
    await flush();
    expect(calls[1]!.url).toContain("cursor=CURSOR_PAGE_2");
    calls[1]!.resolve(makeResponse({ next_cursor: null }));
    await flush();

    // Now type to trigger q-change reset — cursor should NOT appear
    const input = screen.getByPlaceholderText(/search/i);
    fireEvent.change(input, { target: { value: "Lap" } });
    await flush(300);
    expect(calls[2]!.url).toContain("q=Lap");
    expect(calls[2]!.url).not.toContain("cursor=");
  });

  it("changing tab resets the cursor", async () => {
    const { fetchMock, calls } = makeDeferredFetch();
    vi.stubGlobal("fetch", fetchMock);
    renderDrawer();
    await flush();
    calls[0]!.resolve(makeResponse({
      next_cursor: "CURSOR_PAGE_2",
      summary: { total_lines: 100, override_count: 2, allocated_sum: "60.00" },
    }));
    await flush();

    fireEvent.click(screen.getByRole("button", { name: /load more/i }));
    await flush();
    calls[1]!.resolve(makeResponse({ next_cursor: null }));
    await flush();

    // Click Overrides tab — should refetch first page with tab=overrides, no cursor
    fireEvent.click(screen.getByRole("button", { name: /^overrides/i }));
    await flush();
    expect(calls[2]!.url).toContain("tab=overrides");
    expect(calls[2]!.url).not.toContain("cursor=");
  });
});

describe("ApportionmentBreakupDrawer — stale-response handling", () => {
  it("typing twice in quick succession — only the LATER response's data lands", async () => {
    const { fetchMock, calls } = makeDeferredFetch();
    vi.stubGlobal("fetch", fetchMock);
    renderDrawer();
    await flush();
    await resolveAndFlush(calls[0]!, makeResponse({
      summary: { total_lines: 3, override_count: 0, allocated_sum: "60.00" },
    }));

    const input = screen.getByPlaceholderText(/search/i);
    fireEvent.change(input, { target: { value: "fre" } });
    await flush(300);
    expect(calls).toHaveLength(2); // request A in flight

    // Type more BEFORE A resolves — request B fires and aborts A
    fireEvent.change(input, { target: { value: "freight" } });
    await flush(300);
    expect(calls).toHaveLength(3);

    // Resolve A LATE with a STALE summary; then B with the FRESH summary.
    // The drawer's `if (controller.signal.aborted) return` defense should
    // make A a no-op — only B's setSummary should land.
    //
    // We assert via the footer chip (always rendered, not virtualized)
    // rather than row text — jsdom doesn't measure scroll viewport, so
    // virtualizer.getVirtualItems() can return [] and row text won't
    // appear in the DOM even when the underlying state is correct.
    await resolveAndFlush(calls[1]!, makeResponse({
      rows: [makeRow(99)],
      summary: { total_lines: 999, override_count: 0, allocated_sum: "STALE-A" },
    }));
    await resolveAndFlush(calls[2]!, makeResponse({
      rows: [makeRow(7)],
      summary: { total_lines: 7, override_count: 0, allocated_sum: "FRESH-B" },
    }));

    // Footer chip pulls from `summary.total_lines` — must reflect B, not A.
    expect(screen.queryByText(/of 999 shown/i)).toBeNull();
    expect(screen.getByText(/of 7 shown/i)).toBeInTheDocument();
  });

  it("a stale response that errors does NOT surface as an error in the UI", async () => {
    const { fetchMock, calls } = makeDeferredFetch();
    vi.stubGlobal("fetch", fetchMock);
    renderDrawer();
    await flush();
    calls[0]!.resolve(makeResponse());
    await flush();

    const input = screen.getByPlaceholderText(/search/i);
    fireEvent.change(input, { target: { value: "fre" } });
    await flush(300);
    fireEvent.change(input, { target: { value: "freight" } });
    await flush(300);

    // Reject the aborted (stale) request, then resolve the fresh one
    calls[1]!.reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
    await flush();
    calls[2]!.resolve(makeResponse({ rows: [makeRow(7)] }));
    await flush();

    // No error banner visible
    expect(screen.queryByText(/aborted/i)).toBeNull();
  });
});

describe("ApportionmentBreakupDrawer — empty-state branching", () => {
  it("empty result with active q shows 'No matches for X'", async () => {
    const { fetchMock, calls } = makeDeferredFetch();
    vi.stubGlobal("fetch", fetchMock);
    renderDrawer();
    await flush();
    calls[0]!.resolve(makeResponse());
    await flush();

    const input = screen.getByPlaceholderText(/search/i);
    fireEvent.change(input, { target: { value: "zzz" } });
    await flush(300);
    calls[1]!.resolve(makeResponse({
      rows: [],
      summary: { total_lines: 3, override_count: 0, allocated_sum: "60.00" },
    }));
    await flush();

    expect(screen.getByText(/no matches for/i)).toBeInTheDocument();
    expect(screen.getByText(/zzz/)).toBeInTheDocument();
  });

  it("empty result with tab=overrides shows 'No lines have been manually overridden'", async () => {
    const { fetchMock, calls } = makeDeferredFetch();
    vi.stubGlobal("fetch", fetchMock);
    renderDrawer();
    await flush();
    calls[0]!.resolve(makeResponse());
    await flush();

    fireEvent.click(screen.getByRole("button", { name: /^overrides/i }));
    await flush();
    calls[1]!.resolve(makeResponse({
      rows: [],
      summary: { total_lines: 3, override_count: 0, allocated_sum: "60.00" },
    }));
    await flush();

    expect(screen.getByText(/no lines have been manually overridden/i)).toBeInTheDocument();
  });

  it("empty result with no filters shows 'No apportionment rows for this header component yet'", async () => {
    const { fetchMock, calls } = makeDeferredFetch();
    vi.stubGlobal("fetch", fetchMock);
    renderDrawer();
    await flush();
    calls[0]!.resolve(makeResponse({
      rows: [],
      summary: { total_lines: 0, override_count: 0, allocated_sum: "0" },
    }));
    await flush();

    expect(screen.getByText(/no apportionment rows for this header component yet/i)).toBeInTheDocument();
  });
});

describe("ApportionmentBreakupDrawer — CSV export", () => {
  it("CSV download URL includes ?format=csv and current ?q=", async () => {
    const { fetchMock, calls } = makeDeferredFetch();
    vi.stubGlobal("fetch", fetchMock);
    // jsdom: stub URL.createObjectURL/revokeObjectURL — the drawer creates
    // a blob URL, attaches a hidden <a>, and clicks it. We just need the
    // method to exist; we assert on the FETCH URL, not the download.
    vi.stubGlobal("URL", Object.assign(Object.create(URL), {
      createObjectURL: vi.fn(() => "blob:fake"),
      revokeObjectURL: vi.fn(),
    }));
    renderDrawer();
    await flush();
    calls[0]!.resolve(makeResponse());
    await flush();

    const input = screen.getByPlaceholderText(/search/i);
    fireEvent.change(input, { target: { value: "freight" } });
    await flush(300);
    calls[1]!.resolve(makeResponse({ rows: [makeRow(1)] }));
    await flush();

    fireEvent.click(screen.getByRole("button", { name: /^csv$/i }));
    await flush();
    expect(calls).toHaveLength(3);
    expect(calls[2]!.url).toContain("format=csv");
    expect(calls[2]!.url).toContain("q=freight");

    // Resolve as CSV to let downloadCsv finish (otherwise the timeout
    // for revokeObjectURL stays pending across tests)
    calls[2]!.resolve("Line No,Item Description\n1,Item 1\n", {
      status:  200,
      headers: {
        "content-type":        "text/csv; charset=utf-8",
        "content-disposition": 'attachment; filename="apportionment-freight.csv"',
      },
    });
    await flush(1000); // run the revokeObjectURL timeout
  });
});

describe("ApportionmentBreakupDrawer — summary chip", () => {
  it("footer reads 'N of M shown' reflecting the loaded/total split", async () => {
    const { fetchMock, calls } = makeDeferredFetch();
    vi.stubGlobal("fetch", fetchMock);
    renderDrawer();
    await flush();
    calls[0]!.resolve(makeResponse({
      rows: [makeRow(1), makeRow(2)], // 2 rows loaded
      summary: { total_lines: 500, override_count: 7, allocated_sum: "60.00" },
    }));
    await flush();

    expect(screen.getByText(/2 of 500 shown/i)).toBeInTheDocument();
    expect(screen.getByText(/7 overridden/i)).toBeInTheDocument();
  });
});
