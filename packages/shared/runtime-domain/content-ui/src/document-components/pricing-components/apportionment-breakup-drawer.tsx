/**
 * @athyper/content-ui — ApportionmentBreakupDrawer
 *
 * v3.1 Phase 4. The forensic audit view for one header-scope PC's
 * apportionment across N lines. Replaces the inline 500-row projection
 * table that previously expanded inside the HeaderScopePcStrip — on a
 * large invoice that table was unreadable and re-rendered every line
 * already visible in the line drawers.
 *
 * Surfaces:
 *   - Tab strip:      All N · Overrides M
 *   - Virtualizable rows (plain rendering today; switch to TanStack
 *     Virtual when invoices regularly cross ~500 line items)
 *   - "Load more" footer for cursor-based pagination
 *   - "Open line" jump back to that line's drawer (consumer wires)
 *
 * Deliberately stays read-only. Overrides happen at the line drawer;
 * deleting an apportionment happens at the header strip. The drawer
 * only renders + navigates.
 */
"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ArrowUpRight, Download, Search, X } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { DrawerPeekShell } from "@athyper/platform-ui/surfaces/shells";
import { cn } from "@athyper/platform-theme/utils";
import { CurrencyTriad } from "../money/currency-triad";

/**
 * Initial row-height estimate used by the virtualizer before the first
 * `measureElement` measurement lands. Once mounted, each row's height
 * is observed via the wrapper's ResizeObserver (set up by
 * tanstack/react-virtual when `measureElement` is passed as a ref) and
 * the layout reflows accordingly.
 *
 * Biased toward the single-line case so first paint is close to final
 * for typical short descriptions:
 *   text-sm content     ~20px line-height
 *   py-2 padding         16px (8 top + 8 bottom)
 *   border-b              1px
 *   = ~37px single-line, ~58px two-line (worst case under line-clamp-2)
 *
 * 44 splits the difference — small first-paint offset for two-line
 * rows, small first-paint offset for one-line rows. No correctness
 * impact either way; ResizeObserver corrects within ~1 frame.
 */
const ROW_HEIGHT_ESTIMATE = 44;

export interface ApportionmentBreakupDrawerProps {
  /** Open / close from the parent (HeaderScopePcStrip + a pcId state). */
  open:          boolean;
  onOpenChange:  (open: boolean) => void;

  /** The PI that owns the header PC. */
  invoiceId:     string;
  /** The header-scope PC we're breaking out. */
  headerPcId:    string | null;

  /** Document currency triad — passed through for triad rendering. */
  currencyCode:     string;
  baseCurrencyCode: string;
  exchangeRate:     number;

  /**
   * Optional jump callback — clicking a row's "Open line" affordance
   * closes the drawer + tells the consumer to expand that line. No-op
   * when omitted.
   */
  onJumpToLine?: (lineId: string) => void;
}

// ─── API types (mirror the BFF response shape) ────────────────────────

interface ApportionmentRow {
  pil_id:            string;
  line_no:           number;
  item_description:  string;
  basis_value:       string;
  allocated_amount:  string;
  override_amount:   string | null;
  is_overridden:     boolean;
}

interface ApportionmentSummary {
  total_lines:    number;
  override_count: number;
  allocated_sum:  string;
}

interface ApportionmentHeader {
  id:                   string;
  term_type:            string;
  condition_type_code:  string | null;
  condition_type_label: string | null;
  apportion_basis:      string | null;
  computed_amount:      string;
}

interface ApportionmentResponse {
  header_pc:    ApportionmentHeader;
  rows:         ApportionmentRow[];
  next_cursor:  string | null;
  summary:      ApportionmentSummary;
}

type Tab = "all" | "overrides" | "top";

// ─── Drawer ───────────────────────────────────────────────────────────

export function ApportionmentBreakupDrawer({
  open,
  onOpenChange,
  invoiceId,
  headerPcId,
  currencyCode,
  baseCurrencyCode,
  exchangeRate,
  onJumpToLine,
}: ApportionmentBreakupDrawerProps) {
  const [tab, setTab]                   = useState<Tab>("all");
  const [rows, setRows]                 = useState<ApportionmentRow[]>([]);
  const [cursor, setCursor]             = useState<string | null>(null);
  const [header, setHeader]             = useState<ApportionmentHeader | null>(null);
  const [summary, setSummary]           = useState<ApportionmentSummary | null>(null);
  const [isLoading, setIsLoading]       = useState(false);
  const [error, setError]               = useState<string | null>(null);
  // v3.1 Phase 5c — separate loading + error state for CSV export so
  // an export failure doesn't blow away the rendered rows.
  const [isExporting, setIsExporting]   = useState(false);
  const [exportError, setExportError]   = useState<string | null>(null);

  // v3.1 Phase 5e — server-side search. `qInput` echoes back the user's
  // keystrokes immediately (responsive feel); `qDebounced` drives the
  // actual fetch after 300ms of inactivity. Both are local state — the
  // drawer is not URL-controlled today (matches the tab state pattern).
  // We don't use useDebouncedValue here because `commitQNow` (Enter) and
  // `clearQ` (× button) need to write `qDebounced` directly to bypass
  // the timer; the hook stays available for components that don't need
  // those manual escapes.
  const [qInput, setQInput]             = useState("");
  const [qDebounced, setQDebounced]     = useState("");
  useEffect(() => {
    const id = window.setTimeout(() => setQDebounced(qInput.trim()), 300);
    return () => window.clearTimeout(id);
  }, [qInput]);

  // Active request controller. Every fetchPage call aborts the previous
  // request before issuing its own — guarantees response order matches
  // user intent regardless of typing speed or Load More clicks during a
  // pending request.
  const activeRequestRef = useRef<AbortController | null>(null);
  useEffect(() => () => activeRequestRef.current?.abort(), []);

  // v3.1 Phase 5d — virtualized row rendering. The scroll container
  // wraps BOTH the sticky column header and the row list so the header
  // anchors via `sticky top-0` while the body scrolls under it. Empty
  // state is rendered as a sibling of the virtualized list (never
  // inside) — count:0 + getVirtualItems returns nothing, so we'd lose
  // the "No apportionment rows yet" message.
  //
  // v3.1 Phase 5g — switched from fixed-height to dynamic-height
  // rendering via `measureElement`. Row heights now vary between
  // single-line (~40px) and two-line (~58px) depending on the wrapped
  // `item_description`. `estimateSize` is the initial guess used for
  // layout before the first measurement lands; once mounted, each row's
  // ResizeObserver (set up by tanstack/react-virtual under the hood when
  // measureElement is passed as a ref) gives the precise height. The
  // estimate is biased slightly above the single-line case (44px) so
  // first-paint scroll geometry is close to final.
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count:            rows.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize:     () => ROW_HEIGHT_ESTIMATE,
    overscan:         8,
  });
  const virtualRows = rowVirtualizer.getVirtualItems();

  // Fetch first page (cursor=null) or next page (cursor=last). Cancels
  // any prior in-flight request before issuing the new one — protects
  // against fast typing, tab+Load More races, and stale-response
  // ordering bugs.
  const fetchPage = useCallback(async (nextCursor: string | null) => {
    if (!headerPcId) return;
    activeRequestRef.current?.abort();
    const controller = new AbortController();
    activeRequestRef.current = controller;

    setIsLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ tab, limit: "50" });
      if (nextCursor) qs.set("cursor", nextCursor);
      if (qDebounced)  qs.set("q",      qDebounced);
      const res = await fetch(
        `/api/finance/ap/invoices/${encodeURIComponent(invoiceId)}`
        + `/pricing-components/${encodeURIComponent(headerPcId)}`
        + `/apportionment?${qs.toString()}`,
        { method: "GET", credentials: "include", signal: controller.signal },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { message?: string; error?: string } | null;
        throw new Error(body?.message ?? body?.error ?? `Apportionment fetch failed (${res.status}).`);
      }
      const data = (await res.json()) as ApportionmentResponse;
      // Defensive: re-check abort between fetch-resolved and setState in
      // case a newer request fired during the JSON parse.
      if (controller.signal.aborted) return;
      setHeader(data.header_pc);
      setSummary(data.summary);
      setCursor(data.next_cursor);
      setRows((prev) => nextCursor ? [...prev, ...data.rows] : data.rows);
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      // Only clear loading if this controller is still the active one;
      // otherwise a newer fetch is already driving the indicator.
      if (activeRequestRef.current === controller) {
        activeRequestRef.current = null;
        setIsLoading(false);
      }
    }
  }, [headerPcId, invoiceId, tab, qDebounced]);

  // Reset state + refetch the first page when the drawer opens, the
  // user switches PCs, the tab changes, or the debounced search query
  // changes. Wraps a ref to the latest fetchPage so this effect's
  // deps stay narrow (no fetchPage identity churn → no double-fetch).
  //
  // History: prior to v3.1 Phase 5h this was two effects — one reset +
  // bumpReq, one fetch on reqGeneration — which fired TWO initial
  // fetches per mount because the reset effect's `bumpReq` and the
  // fetch effect's `fetchPage` identity changed in separate render
  // passes. Merging the two halves the network load with no behavioral
  // change.
  const fetchPageRef = useRef(fetchPage);
  useEffect(() => { fetchPageRef.current = fetchPage; }, [fetchPage]);
  useEffect(() => {
    if (!open || !headerPcId) return;
    setRows([]);
    setCursor(null);
    setHeader(null);
    setSummary(null);
    setError(null);
    void fetchPageRef.current(null);
  }, [open, headerPcId, tab, qDebounced]);

  // v3.1 Phase 5c — CSV download. Honors the current tab (so "Overrides"
  // exports only the overridden slice) and pulls the filename from the
  // upstream Content-Disposition. Falls back to blob + anchor download
  // rather than nav so the drawer stays open and the user sees their
  // download trigger.
  const downloadCsv = useCallback(async () => {
    if (!headerPcId) return;
    setIsExporting(true);
    setExportError(null);
    try {
      const qs = new URLSearchParams({ tab, format: "csv" });
      if (qDebounced) qs.set("q", qDebounced);
      const res = await fetch(
        `/api/finance/ap/invoices/${encodeURIComponent(invoiceId)}`
        + `/pricing-components/${encodeURIComponent(headerPcId)}`
        + `/apportionment?${qs.toString()}`,
        { method: "GET", credentials: "include" },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { message?: string; error?: string } | null;
        const code = body?.error ?? `HTTP_${res.status}`;
        throw new Error(
          code === "EXPORT_FORBIDDEN"
            ? "Your role does not include permission to export apportionment data."
            : (body?.message ?? `Apportionment export failed (${res.status}).`),
        );
      }
      // Try to parse a filename from Content-Disposition; fall back to a
      // safe default if the server didn't set it (or the browser strips
      // the header).
      const cd = res.headers.get("content-disposition") ?? "";
      const filenameMatch = cd.match(/filename="?([^";]+)"?/i);
      const filename = filenameMatch?.[1] ?? `apportionment-${headerPcId.slice(0, 8)}.csv`;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Revoke after the click so Safari has time to start the download
      // — same idiom used elsewhere for blob downloads.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsExporting(false);
    }
  }, [headerPcId, invoiceId, tab, qDebounced]);

  // v3.1 Phase 5e — Enter pressed in the search input forces an immediate
  // refetch (bypasses the 300ms debounce). Common UX pattern: type a few
  // chars, hit Enter to commit.
  const commitQNow = useCallback(() => {
    const next = qInput.trim();
    if (next !== qDebounced) setQDebounced(next);
  }, [qInput, qDebounced]);

  const clearQ = useCallback(() => {
    setQInput("");
    setQDebounced("");
  }, []);

  const title = useMemo(() => {
    if (!header) return "Apportionment";
    const label = header.condition_type_label ?? header.condition_type_code ?? "Header component";
    return `${label} — apportionment`;
  }, [header]);

  const subtitle = useMemo(() => {
    if (!header || !summary) return null;
    const basis = header.apportion_basis ?? "value";
    return `by ${basis} · across ${summary.total_lines} line${summary.total_lines === 1 ? "" : "s"}`;
  }, [header, summary]);

  return (
    <DrawerPeekShell
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      subtitle={subtitle}
      defaultWidth={720}
      widthKey="apportionment-breakup"
      subHeader={
        // Tabs (filter by category) sit side-by-side with the search input
        // (filter by description / line number) — both are filters on the
        // same underlying row set, so grouping them on one row reflects
        // the mental model.
        <div className="flex items-center justify-between gap-3 px-3 py-1 border-t border-border/60 bg-muted/30">
          <TabStrip
            tab={tab}
            onTabChange={setTab}
            totalLines={summary?.total_lines ?? null}
            overrideCount={summary?.override_count ?? null}
            // Top tab only when the parent PC's basis produces a useful
            // ordering. `equal` gives every line the same basis_value (1)
            // so sorting by it shows the All list in pil_id tiebreaker
            // order — hide the tab rather than mislead. Unknown basis is
            // also hidden defensively.
            showTopTab={
              header?.apportion_basis === "value"
              || header?.apportion_basis === "quantity"
              || header?.apportion_basis === "weight"
            }
          />
          <SearchInput
            value={qInput}
            onChange={setQInput}
            onCommit={commitQNow}
            onClear={clearQ}
          />
        </div>
      }
    >
      <div className="flex h-full flex-col">
        {error && (
          <div className="m-3 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        )}

        {/* Single scroll container holding BOTH the sticky column header
            and the virtualized list. Sticky positioning only works when
            the header lives in the same overflow:auto ancestor as the
            scrolling content, so we deliberately bundle them here. The
            empty-state branch is a SIBLING of the virtualized list — if
            it lived inside the absolute-positioned inner div, an empty
            result set would render nothing visible (the virtualizer
            with count:0 returns []). */}
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-auto"
          data-document-runtime-surface="apportionment_breakup_body"
        >
          {/* Sticky column header. Same grid template as Row so cells
              line up vertically; sticky top-0 keeps it pinned during
              fast scroll on long apportionment lists. */}
          <div className={cn(
            "sticky top-0 z-10",
            "grid grid-cols-[3rem_minmax(0,1fr)_7rem_7rem_7rem_5rem] items-center gap-2",
            "px-3 py-2 border-b border-border bg-muted/40",
            "text-[11px] font-semibold uppercase tracking-wide text-muted-foreground",
          )}>
            <div>Line</div>
            <div>Item</div>
            <div className="text-right">Basis</div>
            <div className="text-right">Allocated</div>
            <div className="text-right">Override</div>
            <div aria-hidden />
          </div>

          {rows.length === 0 && !isLoading && !error ? (
            <div className="px-3 py-8 text-center text-xs text-muted-foreground italic">
              {qDebounced ? (
                <>No matches for &ldquo;{qDebounced}&rdquo;.</>
              ) : tab === "overrides" ? (
                "No lines have been manually overridden."
              ) : (
                "No apportionment rows for this header component yet."
              )}
            </div>
          ) : (
            <div
              style={{
                height:   `${rowVirtualizer.getTotalSize()}px`,
                position: "relative",
                width:    "100%",
              }}
            >
              {virtualRows.map((vRow) => {
                const row = rows[vRow.index]!;
                // Wrapper div is the measureElement target. Two concerns
                // are separated:
                //   - positioning + GPU compositing live on the wrapper
                //     (absolute + translate3d + will-change)
                //   - row visuals (grid layout, padding, amber tint)
                //     live on Row, which stays virtualization-unaware
                //     for unit testability
                // ResizeObserver attached by tanstack/react-virtual (via
                // the ref callback) measures the wrapper's height — which
                // equals the Row's natural height since no explicit height
                // is set on either. data-index lets the virtualizer
                // re-associate measurements with the right row on
                // re-render.
                return (
                  <div
                    key={row.pil_id}
                    ref={rowVirtualizer.measureElement}
                    data-index={vRow.index}
                    style={{
                      position:   "absolute",
                      top:        0,
                      left:       0,
                      right:      0,
                      transform:  `translate3d(0, ${vRow.start}px, 0)`,
                      willChange: "transform",
                    }}
                  >
                    <Row
                      row={row}
                      currencyCode={currencyCode}
                      baseCurrencyCode={baseCurrencyCode}
                      exchangeRate={exchangeRate}
                      onJumpToLine={onJumpToLine ? () => {
                        onJumpToLine(row.pil_id);
                        onOpenChange(false);
                      } : undefined}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer — load-more + summary chip + (deferred) export. */}
        <div className={cn(
          "flex items-center justify-between gap-3 border-t border-border bg-muted/40",
          "px-3 py-2 text-xs",
        )}>
          <div className="flex items-baseline gap-2 text-muted-foreground">
            {summary && (
              <>
                <span>{rows.length} of {summary.total_lines} shown</span>
                {summary.override_count > 0 && (
                  <>
                    <span aria-hidden>·</span>
                    <span>{summary.override_count} overridden</span>
                  </>
                )}
                <span aria-hidden>·</span>
                <span>
                  allocated{" "}
                  <CurrencyTriad
                    amount={parseFloat(summary.allocated_sum)}
                    currencyCode={currencyCode}
                    baseCurrencyCode={baseCurrencyCode}
                    exchangeRate={exchangeRate}
                  />
                </span>
              </>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => { void downloadCsv(); }}
              disabled={isExporting || rows.length === 0}
              title={
                rows.length === 0
                  ? "Nothing to export — load apportionment rows first."
                  : "Download this apportionment as a CSV. Respects the active tab; gated by purchase_invoice.export."
              }
              className={cn(
                "inline-flex items-center gap-1 rounded-md border border-border px-2 py-1",
                "text-xs font-medium text-foreground hover:bg-muted/60 disabled:opacity-40 disabled:pointer-events-none",
              )}
            >
              <Download className="h-3 w-3" aria-hidden />
              {isExporting ? "Exporting…" : "CSV"}
            </button>
            {cursor && (
              <button
                type="button"
                onClick={() => fetchPage(cursor)}
                disabled={isLoading}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md border border-border px-2 py-1",
                  "font-medium text-foreground hover:bg-muted/60 disabled:opacity-40",
                )}
              >
                {isLoading ? "Loading…" : "Load more"}
              </button>
            )}
          </div>
        </div>
        {/* Export error — kept separate from the row-fetch error so a
            403 on download doesn't blow away the rendered table. */}
        {exportError && (
          <div className="mx-3 mb-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {exportError}
          </div>
        )}
      </div>
    </DrawerPeekShell>
  );
}

// ─── Tab strip ────────────────────────────────────────────────────────

function TabStrip({
  tab,
  onTabChange,
  totalLines,
  overrideCount,
  /**
   * Whether to show the "Top" tab (sort by basis value DESC). Hidden
   * when the header PC's apportion_basis is `equal` because every line
   * has basis_value = 1 and the sort is degenerate — Top would just
   * show the All list in pil_id tiebreaker order, which is misleading.
   */
  showTopTab,
}: {
  tab:           Tab;
  onTabChange:   (t: Tab) => void;
  totalLines:    number | null;
  overrideCount: number | null;
  showTopTab:    boolean;
}) {
  // Row chrome (padding, border-top, bg) lives on the parent wrapper in
  // the drawer's subHeader so the search input shares the same row.
  return (
    <div className="flex items-center gap-1">
      <TabButton
        active={tab === "all"}
        onClick={() => onTabChange("all")}
        label="All"
        count={totalLines}
      />
      <TabButton
        active={tab === "overrides"}
        onClick={() => onTabChange("overrides")}
        label="Overrides"
        count={overrideCount}
        tint={overrideCount != null && overrideCount > 0 ? "amber" : null}
      />
      {showTopTab && (
        <TabButton
          active={tab === "top"}
          onClick={() => onTabChange("top")}
          label="Top"
          count={null}
        />
      )}
    </div>
  );
}

// ─── Search input ─────────────────────────────────────────────────────
//
// Debounced search box. `value` is the raw input (drives the immediate
// echo); the parent decides when to commit (`onCommit` for Enter,
// implicit via the parent's debounce effect). `onClear` resets both
// raw and debounced state — exposed so the × button never leaves a
// stale debounced value around after the user empties the input.
//
// Placeholder is intentionally short — the input is narrow (14rem) so
// long copy would truncate; "Search description or line #" fits and
// names the two semantics the server actually supports.

function SearchInput({
  value,
  onChange,
  onCommit,
  onClear,
}: {
  value:    string;
  onChange: (next: string) => void;
  onCommit: () => void;
  onClear:  () => void;
}) {
  return (
    <div className="relative w-56">
      <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onCommit(); } }}
        placeholder="Search description or line #"
        aria-label="Search apportionment"
        className={cn(
          "h-7 w-full rounded-md border border-border bg-background pl-7 pr-7",
          "text-xs placeholder:text-muted-foreground/60",
          "focus:outline-none focus:ring-1 focus:ring-ring",
        )}
      />
      {value.length > 0 && (
        <button
          type="button"
          onClick={onClear}
          title="Clear search"
          aria-label="Clear search"
          className={cn(
            "absolute right-1 top-1/2 inline-flex h-5 w-5 -translate-y-1/2 items-center justify-center",
            "rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60",
          )}
        >
          <X className="h-3 w-3" aria-hidden />
        </button>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
  count,
  tint = null,
}: {
  active:  boolean;
  onClick: () => void;
  label:   string;
  count:   number | null;
  tint?:   "amber" | null;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium",
        active
          ? "bg-background text-foreground border border-border"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      <span>{label}</span>
      {count != null && (
        <span
          className={cn(
            "inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] tabular-nums",
            tint === "amber"
              ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
              : "bg-muted text-muted-foreground",
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}

// ─── Row ──────────────────────────────────────────────────────────────

function Row({
  row,
  currencyCode,
  baseCurrencyCode,
  exchangeRate,
  onJumpToLine,
}: {
  row:              ApportionmentRow;
  currencyCode:     string;
  baseCurrencyCode: string;
  exchangeRate:     number;
  onJumpToLine?:    () => void;
}) {
  const allocated = parseFloat(row.allocated_amount);
  const override  = row.override_amount != null ? parseFloat(row.override_amount) : null;

  return (
    <div
      className={cn(
        "grid grid-cols-[3rem_minmax(0,1fr)_7rem_7rem_7rem_5rem] items-center gap-2",
        "px-3 py-2 text-sm border-b border-border/40",
        row.is_overridden && "bg-amber-500/5",
      )}
    >
      <div className="text-xs tabular-nums text-muted-foreground">{row.line_no}</div>
      {/* Description wraps to a 2nd line when long (line-clamp-2 + ellipsis
          on overflow). Hover `title` keeps the full text accessible for
          line-3+ content. Virtualization uses measureElement so variable
          row heights (single-line ≈ 40px, two-line ≈ 60px) flow correctly. */}
      <div className="min-w-0 line-clamp-2 break-words" title={row.item_description}>
        {row.item_description}
      </div>
      <div className="text-right text-xs tabular-nums text-muted-foreground">
        {row.basis_value}
      </div>
      <div className="text-right text-sm tabular-nums font-medium">
        <CurrencyTriad
          amount={allocated}
          currencyCode={currencyCode}
          baseCurrencyCode={baseCurrencyCode}
          exchangeRate={exchangeRate}
        />
      </div>
      <div className="text-right text-sm tabular-nums">
        {override != null ? (
          <span className="font-medium text-amber-700 dark:text-amber-400">
            <CurrencyTriad
              amount={override}
              currencyCode={currencyCode}
              baseCurrencyCode={baseCurrencyCode}
              exchangeRate={exchangeRate}
            />
          </span>
        ) : (
          <span className="text-muted-foreground/50">—</span>
        )}
      </div>
      <div className="flex justify-end">
        {onJumpToLine && (
          <button
            type="button"
            onClick={onJumpToLine}
            title="Open line drawer"
            aria-label="Open line drawer"
            className={cn(
              "inline-flex h-6 w-6 items-center justify-center rounded-md border border-border",
              "text-muted-foreground hover:text-foreground hover:bg-muted/60",
            )}
          >
            <ArrowUpRight className="h-3 w-3" aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}

// (useReducerInc removed in v3.1 Phase 5h — merged reset + fetch into
//  a single effect with a fetchPageRef. See the "Reset state +
//  refetch" effect comment for the why.)
