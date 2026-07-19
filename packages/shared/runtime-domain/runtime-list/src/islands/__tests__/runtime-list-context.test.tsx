import { act } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RuntimeListClientAdapter } from "../../adapter/types";
import { DEFAULT_LAZY_LIST_CONTROLS } from "../../core/lazy-list";
import { DEFAULT_SEARCH_CONTROLS } from "../../core/search";
import type { RuntimeListLazyPresenterState, RuntimeListSearchPresenterState } from "../../core/types";
import {
  DEFAULT_RUNTIME_LIST_CACHE_POLICY,
  RuntimeListBrowserCache,
  RuntimeListBrowserCacheProvider,
} from "../../browser-cache";
import {
  RUNTIME_LIST_CACHE_DIAGNOSTIC_EVENT,
  RuntimeListClientProvider,
  useRuntimeListSearch,
} from "../runtime-list-context";

const adapter: RuntimeListClientAdapter = {
  entityCode: "journal_entry",
  features: {} as RuntimeListClientAdapter["features"],
  listBaseHref: "/app/journal_entry",
  detailHrefBase: "/app/journal_entry",
  newHref: "/app/journal_entry/new",
  recordsApiHref: "/api/runtime/v1/entities/journal_entry",
};

function rows(first: number, last: number) {
  return Array.from({ length: last - first + 1 }, (_, index) => ({
    id: String(first + index),
    description: `Journal entry ${first + index}`,
  }));
}

function searchState(timeoutMs = 10_000): RuntimeListSearchPresenterState {
  return {
    enabled: true,
    initialQuery: "",
    controls: { ...DEFAULT_SEARCH_CONTROLS, serverSearchTimeoutMs: timeoutMs },
    fields: [],
    isFullyLoaded: false,
    loadedCount: 20,
    total: 324,
  };
}

function lazyState(cacheKey: string): RuntimeListLazyPresenterState {
  return {
    enabled: true,
    initialRows: rows(1, 20),
    initialPagination: { page: 1, pageSize: 20, total: 324, totalPages: 17 },
    page: 1,
    pageSize: 20,
    rawSearchParams: { sort: "posted_at:desc" },
    cacheKey,
    descriptorHash: "descriptor-v1",
    scopeFingerprint: "scope-v1",
    cachePolicy: DEFAULT_RUNTIME_LIST_CACHE_POLICY,
    controls: { ...DEFAULT_LAZY_LIST_CONTROLS, maxLoadedRows: 200 },
  };
}

function pageTwoResponse() {
  return new Response(JSON.stringify({
    records: rows(21, 40),
    pagination: { page: 2, page_size: 20, total: 324, total_pages: 17 },
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function Probe() {
  const { lazyList } = useRuntimeListSearch();
  return (
    <>
      <button type="button" onClick={lazyList.loadNextPage}>Load next page</button>
      <button type="button" onClick={lazyList.refreshCurrentPage}>Refresh current page</button>
      <span data-testid="state">{lazyList.state}</span>
      <span data-testid="row-count">{lazyList.activeRows.length}</span>
      <span data-testid="loaded-pages">{lazyList.loadedPageNumbers.join(",")}</span>
      <span data-testid="error-message">{lazyList.errorMessage ?? ""}</span>
      <span data-testid="cache-state">{lazyList.cacheState}</span>
      <span data-testid="revalidating">{String(lazyList.isRevalidating)}</span>
      <span data-testid="refresh-error">{lazyList.refreshErrorMessage ?? ""}</span>
    </>
  );
}

function cacheIdentity(cacheKey: string) {
  return {
    entityCode: adapter.entityCode,
    queryKey: cacheKey,
    descriptorHash: "descriptor-v1",
    scopeFingerprint: "scope-v1",
    policy: DEFAULT_RUNTIME_LIST_CACHE_POLICY,
  } as const;
}

function renderProvider({
  timeoutMs = 10_000,
  cacheKey = "runtime-list-context-test",
  cache = new RuntimeListBrowserCache(),
} = {}) {
  return render(
    <RuntimeListBrowserCacheProvider scopeIdentity="test-scope" instance={cache}>
      <RuntimeListClientProvider
        adapter={adapter}
        search={searchState(timeoutMs)}
        lazyList={lazyState(cacheKey)}
      >
        <Probe />
      </RuntimeListClientProvider>
    </RuntimeListBrowserCacheProvider>,
  );
}

describe("RuntimeListClientProvider lazy pagination", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("requests and appends a distinct second offset page", async () => {
    const fetchMock = vi.fn().mockResolvedValue(pageTwoResponse());
    vi.stubGlobal("fetch", fetchMock);
    renderProvider({ cacheKey: "runtime-list-success" });

    fireEvent.click(screen.getByRole("button", { name: "Load next page" }));
    expect(screen.getByTestId("state")).toHaveTextContent("loading");

    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("idle"));
    expect(screen.getByTestId("row-count")).toHaveTextContent("40");
    expect(screen.getByTestId("loaded-pages")).toHaveTextContent("1,2");

    const requestUrl = String(fetchMock.mock.calls[0]?.[0]);
    const params = new URL(requestUrl, "http://runtime.test").searchParams;
    expect(params.get("page")).toBe("2");
    expect(params.get("page_size")).toBe("20");
    expect(params.get("query_v1")).toBe("0");
  });

  it("leaves loading state after a timeout and allows retrying the same page", async () => {
    vi.useFakeTimers();
    const pendingUntilAbort = (_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        reject(new DOMException("Aborted", "AbortError"));
      }, { once: true });
    });
    const fetchMock = vi.fn()
      .mockImplementationOnce(pendingUntilAbort)
      .mockResolvedValueOnce(pageTwoResponse());
    vi.stubGlobal("fetch", fetchMock);
    renderProvider({ timeoutMs: 25, cacheKey: "runtime-list-timeout" });

    fireEvent.click(screen.getByRole("button", { name: "Load next page" }));
    expect(screen.getByTestId("state")).toHaveTextContent("loading");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(25);
    });
    expect(screen.getByTestId("state")).toHaveTextContent("error");
    expect(screen.getByTestId("error-message")).toHaveTextContent("Could not load more records.");

    fireEvent.click(screen.getByRole("button", { name: "Load next page" }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("state")).toHaveTextContent("idle");
    expect(screen.getByTestId("row-count")).toHaveTextContent("40");
  });

  it("reports a browser cache miss without changing the cold rows", async () => {
    const diagnostic = vi.fn();
    window.addEventListener(RUNTIME_LIST_CACHE_DIAGNOSTIC_EVENT, diagnostic);

    renderProvider({ cacheKey: "runtime-list-cache-miss" });

    await waitFor(() => expect(diagnostic).toHaveBeenCalled());
    const event = diagnostic.mock.calls[0]?.[0] as CustomEvent;
    expect(event.detail).toMatchObject({
      cache: "miss",
      entityCode: "journal_entry",
      pageCount: 0,
    });
    expect(event.detail).toHaveProperty("cacheKeyHash");
    expect(event.detail).not.toHaveProperty("cacheKey");
    expect(screen.getByTestId("row-count")).toHaveTextContent("20");
    window.removeEventListener(RUNTIME_LIST_CACHE_DIAGNOSTIC_EVENT, diagnostic);
  });

  it("reports and restores a fresh browser cache hit", async () => {
    const cacheKey = "runtime-list-cache-hit";
    const now = Date.now();
    const cache = new RuntimeListBrowserCache();
    cache.write(cacheIdentity(cacheKey), {
      pages: [[2, {
        rows: rows(21, 25),
        pagination: { page: 2, pageSize: 5, total: 324, totalPages: 65 },
        savedAt: now,
        lastAccessed: now,
      }]],
    }, { savedAt: now, now });
    const diagnostic = vi.fn();
    window.addEventListener(RUNTIME_LIST_CACHE_DIAGNOSTIC_EVENT, diagnostic);

    renderProvider({ cacheKey, cache });

    expect(screen.getByTestId("row-count")).toHaveTextContent("5");
    expect(screen.getByTestId("cache-state")).toHaveTextContent("fresh");
    expect(screen.getByTestId("revalidating")).toHaveTextContent("true");
    await waitFor(() => expect(screen.getByTestId("row-count")).toHaveTextContent("20"));
    expect(screen.getByTestId("revalidating")).toHaveTextContent("false");
    const event = diagnostic.mock.calls[0]?.[0] as CustomEvent;
    expect(event.detail).toMatchObject({ cache: "hit", freshness: "fresh", pageCount: 1 });
    window.removeEventListener(RUNTIME_LIST_CACHE_DIAGNOSTIC_EVENT, diagnostic);
  });

  it("reports an expired browser cache entry as stale", async () => {
    const cacheKey = "runtime-list-cache-stale";
    const cache = new RuntimeListBrowserCache();
    cache.write(cacheIdentity(cacheKey), {
      pages: [[2, {
        rows: rows(21, 40),
        savedAt: 1,
        lastAccessed: 1,
      }]],
    }, { savedAt: 1, now: 1 });
    const diagnostic = vi.fn();
    window.addEventListener(RUNTIME_LIST_CACHE_DIAGNOSTIC_EVENT, diagnostic);

    renderProvider({ cacheKey, cache });

    await waitFor(() => expect(diagnostic).toHaveBeenCalled());
    const event = diagnostic.mock.calls[0]?.[0] as CustomEvent;
    expect(event.detail).toMatchObject({ cache: "stale", freshness: "expired", pageCount: 0 });
    expect(screen.getByTestId("row-count")).toHaveTextContent("20");
    window.removeEventListener(RUNTIME_LIST_CACHE_DIAGNOSTIC_EVENT, diagnostic);
  });

  it("hydrates stale rows first and marks background revalidation", async () => {
    const cacheKey = "runtime-list-cache-warm-stale";
    const now = Date.now();
    const cache = new RuntimeListBrowserCache();
    const savedAt = now - 30_000;
    cache.write(cacheIdentity(cacheKey), {
      pages: [[3, {
        rows: rows(41, 45),
        pagination: { page: 3, pageSize: 5, total: 324, totalPages: 65 },
        savedAt,
        lastAccessed: savedAt,
      }]],
    }, { savedAt, now });

    renderProvider({ cacheKey, cache });

    expect(screen.getByTestId("row-count")).toHaveTextContent("5");
    expect(screen.getByTestId("cache-state")).toHaveTextContent("stale");
    expect(screen.getByTestId("revalidating")).toHaveTextContent("true");
    await waitFor(() => expect(screen.getByTestId("row-count")).toHaveTextContent("20"));
    expect(screen.getByTestId("revalidating")).toHaveTextContent("false");
  });

  it("keeps usable rows and reports a non-blocking current-page refresh error", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({
      message: "Refresh unavailable",
    }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    renderProvider({ cacheKey: "runtime-list-refresh-error" });
    fireEvent.click(screen.getByRole("button", { name: "Refresh current page" }));

    await waitFor(() => expect(screen.getByTestId("refresh-error")).toHaveTextContent("Refresh unavailable"));
    expect(screen.getByTestId("row-count")).toHaveTextContent("20");
    expect(screen.getByTestId("state")).toHaveTextContent("idle");
    expect(screen.getByTestId("revalidating")).toHaveTextContent("false");
  });
});
