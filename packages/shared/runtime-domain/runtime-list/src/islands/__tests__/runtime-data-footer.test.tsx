import { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RuntimeListPagination } from "../../server/runtime-list-pagination";
import {
  RuntimeLazyLoadFooter,
  runtimeListPagePrefetchDelay,
} from "../runtime-lazy-load-footer";
import { DEFAULT_RUNTIME_LIST_CACHE_POLICY } from "../../browser-cache";

const { useRuntimeListSearchMock } = vi.hoisted(() => ({
  useRuntimeListSearchMock: vi.fn(),
}));

vi.mock("../runtime-list-context", () => ({
  useRuntimeListSearch: useRuntimeListSearchMock,
}));

const loadNextPage = vi.fn();
const runSearchAll = vi.fn();

function runtimeListSearchState({
  loadedRows = 20,
  total = 324,
  hasNextPage = true,
  loadedPageNumbers = [1],
  hasNextWindow = false,
  hasPreviousWindow = false,
  maxLoadedRowsReached = false,
  maxLoadedRows = 500,
  activeIsFullyLoaded = false,
  errorDirection,
  errorMessage = "",
  state = "idle",
}: {
  loadedRows?: number;
  total?: number;
  hasNextPage?: boolean;
  loadedPageNumbers?: number[];
  hasNextWindow?: boolean;
  hasPreviousWindow?: boolean;
  maxLoadedRowsReached?: boolean;
  maxLoadedRows?: number;
  activeIsFullyLoaded?: boolean;
  errorDirection?: "next" | "previous";
  errorMessage?: string;
  state?: "idle" | "loading" | "error";
} = {}) {
  return {
    lazyList: {
      activeRows: Array.from({ length: loadedRows }, (_, index) => ({ id: String(index + 1) })),
      activePagination: { total },
      activeIsFullyLoaded,
      loadedPageNumbers,
      hasNextWindow,
      hasPreviousWindow,
      maxLoadedRowsReached,
      hasNextPage,
      state,
      errorDirection,
      cachePolicy: DEFAULT_RUNTIME_LIST_CACHE_POLICY,
      controls: {
        lazyPrefetchDistancePx: 320,
        maxLoadedRows,
      },
      loadNextPage,
      loadPreviousWindow: vi.fn(),
      loadNextWindow: vi.fn(),
      errorMessage,
      ariaMessage: "",
    },
    search: {
      controls: { manualSearchAllDebounceMs: 0 },
    },
    runSearchAll,
  };
}

function renderLazyFooter({
  datasetLoadedRowCount = 20,
  total = 324,
  matchCount = 2,
}: {
  datasetLoadedRowCount?: number;
  total?: number;
  matchCount?: number;
} = {}) {
  return render(
    <RuntimeLazyLoadFooter
      sentinelRef={createRef<HTMLDivElement>()}
      query="balance"
      isServerSearch={false}
      page={1}
      pageSize={20}
      rowCount={matchCount}
      loadedRowCount={20}
      datasetLoadedRowCount={datasetLoadedRowCount}
      total={total}
      rawSearchParams={{}}
      attached
    />,
  );
}

describe("runtime data footer", () => {
  beforeEach(() => {
    loadNextPage.mockReset();
    runSearchAll.mockReset();
    useRuntimeListSearchMock.mockReturnValue(runtimeListSearchState());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps intent prefetch behind user interaction and gives viewport prefetch a quiet window", () => {
    expect(runtimeListPagePrefetchDelay("intent")).toBe(750);
    expect(runtimeListPagePrefetchDelay("viewport")).toBe(5_000);
    expect(runtimeListPagePrefetchDelay("eager")).toBe(1_500);
  });

  it("attaches incomplete loaded-search status and actions to the table", () => {
    const { container } = renderLazyFooter();

    const footer = container.querySelector<HTMLElement>("[data-runtime-data-footer]");
    expect(footer).toHaveAttribute("data-attached", "true");
    expect(footer).toHaveClass(
      "sticky",
      "left-0",
      "w-[100cqw]",
      "md:bottom-0",
      "md:rounded-t-none",
    );
    expect(screen.getByText("2 matches in loaded rows")).toHaveClass("text-sm", "leading-5");
    expect(screen.getByText("More matches may exist.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Search in all 324 records" }));
    expect(runSearchAll).toHaveBeenCalledWith(expect.objectContaining({ reason: "manual" }));

    fireEvent.click(screen.getByRole("button", { name: "Load more rows" }));
    expect(loadNextPage).toHaveBeenCalledOnce();
  });

  it("shows completion and removes redundant actions when every record is loaded", () => {
    useRuntimeListSearchMock.mockReturnValue(runtimeListSearchState({
      loadedRows: 324,
      total: 324,
      hasNextPage: false,
    }));

    renderLazyFooter({ datasetLoadedRowCount: 324, matchCount: 12 });

    expect(screen.getByText("12 matches in loaded rows")).toBeInTheDocument();
    expect(screen.getByText("Searched all records")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Search in all/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Load more rows" })).not.toBeInTheDocument();
  });

  it("communicates loading and temporarily disables footer actions", () => {
    useRuntimeListSearchMock.mockReturnValue(runtimeListSearchState({ state: "loading" }));

    renderLazyFooter();

    expect(screen.getByText("Loading more rows...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Search in all 324 records" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Load more rows" })).toBeDisabled();
  });

  it("does not automatically retry an errored request while the sentinel remains visible", () => {
    const observerConstructor = vi.fn();
    vi.stubGlobal("IntersectionObserver", observerConstructor);
    useRuntimeListSearchMock.mockReturnValue(runtimeListSearchState({ state: "error" }));

    render(
      <RuntimeLazyLoadFooter
        sentinelRef={{ current: document.createElement("div") }}
        query=""
        isServerSearch={false}
        page={1}
        pageSize={20}
        rowCount={20}
        loadedRowCount={20}
        datasetLoadedRowCount={20}
        total={324}
        rawSearchParams={{}}
        attached
      />,
    );

    expect(observerConstructor).not.toHaveBeenCalled();
    expect(loadNextPage).not.toHaveBeenCalled();
  });

  it("uses the configured window capacity for the final partial window page count", () => {
    useRuntimeListSearchMock.mockReturnValue(runtimeListSearchState({
      loadedRows: 124,
      total: 324,
      hasNextPage: false,
      loadedPageNumbers: [11, 12, 13, 14, 15, 16, 17],
      hasPreviousWindow: true,
      maxLoadedRows: 200,
    }));

    render(
      <RuntimeLazyLoadFooter
        sentinelRef={createRef<HTMLDivElement>()}
        query=""
        isServerSearch={false}
        page={1}
        pageSize={20}
        rowCount={124}
        loadedRowCount={124}
        datasetLoadedRowCount={124}
        total={324}
        rawSearchParams={{}}
        attached
      />,
    );

    expect(screen.getByText("Showing 201-324 of 324 records")).toBeInTheDocument();
    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
    expect(screen.getByText("Next").tagName).toBe("SPAN");
  });

  it("uses readable persistent guidance when the loaded-row window limit is reached", () => {
    useRuntimeListSearchMock.mockReturnValue(runtimeListSearchState({
      loadedRows: 200,
      total: 324,
      hasNextPage: false,
      loadedPageNumbers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      hasNextWindow: true,
      maxLoadedRowsReached: true,
      maxLoadedRows: 200,
    }));

    render(
      <RuntimeLazyLoadFooter
        sentinelRef={createRef<HTMLDivElement>()}
        query=""
        isServerSearch={false}
        page={1}
        pageSize={20}
        rowCount={200}
        loadedRowCount={200}
        datasetLoadedRowCount={200}
        total={324}
        rawSearchParams={{}}
        attached
      />,
    );

    expect(screen.getByText(
      "200 rows loaded. Use filters or search, or select Next for more.",
    )).toHaveClass("text-sm", "leading-5");
  });

  it("suppresses a stale next-window error after the complete terminal range is visible", () => {
    useRuntimeListSearchMock.mockReturnValue(runtimeListSearchState({
      loadedRows: 124,
      total: 324,
      hasNextPage: false,
      loadedPageNumbers: [11, 12, 13, 14, 15, 16, 17],
      hasPreviousWindow: true,
      maxLoadedRows: 200,
      activeIsFullyLoaded: true,
      state: "error",
      errorDirection: "next",
      errorMessage: "Could not load the next records.",
    }));

    render(
      <RuntimeLazyLoadFooter
        sentinelRef={createRef<HTMLDivElement>()}
        query=""
        isServerSearch={false}
        page={1}
        pageSize={20}
        rowCount={124}
        loadedRowCount={124}
        datasetLoadedRowCount={124}
        total={324}
        rawSearchParams={{}}
        attached
      />,
    );

    expect(screen.getByText("Showing 201-324 of 324 records")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText("Could not load the next records.")).not.toBeInTheDocument();
  });

  it("keeps a previous-window failure visible at the terminal range", () => {
    useRuntimeListSearchMock.mockReturnValue(runtimeListSearchState({
      loadedRows: 124,
      total: 324,
      hasNextPage: false,
      loadedPageNumbers: [11, 12, 13, 14, 15, 16, 17],
      hasPreviousWindow: true,
      maxLoadedRows: 200,
      activeIsFullyLoaded: true,
      state: "error",
      errorDirection: "previous",
      errorMessage: "Could not load the previous records.",
    }));

    render(
      <RuntimeLazyLoadFooter
        sentinelRef={createRef<HTMLDivElement>()}
        query=""
        isServerSearch={false}
        page={1}
        pageSize={20}
        rowCount={124}
        loadedRowCount={124}
        datasetLoadedRowCount={124}
        total={324}
        rawSearchParams={{}}
        attached
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Could not load the previous records.");
  });

  it("uses the same attached chrome for classic pagination", () => {
    const { container } = render(
      <RuntimeListPagination
        page={2}
        pageSize={20}
        total={100}
        totalPages={5}
        rowCount={20}
        listBaseHref="/app/test_entity"
        rawSearchParams={{}}
        attached
      />,
    );

    const footer = container.querySelector<HTMLElement>("[data-runtime-data-footer]");
    const controls = container.querySelector<HTMLElement>("[data-runtime-pagination-controls]");
    expect(footer).toHaveAttribute("data-attached", "true");
    expect(footer).toHaveClass("sticky", "left-0", "w-[100cqw]", "md:bottom-0");
    expect(controls).toHaveClass(
      "grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]",
      "md:flex",
    );
    expect(screen.getByText("Showing 21-40 of 100 records")).toHaveClass("text-sm", "leading-5");
    expect(screen.getByText("Page 2 of 5")).toHaveClass("justify-self-center", "text-sm", "leading-5");
    expect(screen.getByRole("link", { name: "Previous" })).toHaveClass("justify-self-end", "text-sm", "leading-5");
    expect(screen.getByRole("link", { name: "Next" })).toHaveClass("justify-self-start");
  });

  it("keeps detached pagination in normal flow at the content width", () => {
    const { container } = render(
      <RuntimeListPagination
        page={1}
        pageSize={20}
        total={20}
        totalPages={1}
        rowCount={20}
        listBaseHref="/app/test_entity"
        rawSearchParams={{}}
      />,
    );

    const footer = container.querySelector<HTMLElement>("[data-runtime-data-footer]");
    expect(footer).toHaveAttribute("data-attached", "false");
    expect(footer).toHaveClass("relative", "w-full");
    expect(footer).not.toHaveClass("sticky");
    expect(footer).not.toHaveClass("left-0");
    expect(footer).not.toHaveClass("w-[100cqw]");
    expect(footer).not.toHaveClass("md:bottom-0");
  });

  it("preserves the centered mobile slots when Previous is disabled", () => {
    render(
      <RuntimeListPagination
        page={1}
        pageSize={20}
        total={324}
        totalPages={17}
        rowCount={20}
        listBaseHref="/app/test_entity"
        rawSearchParams={{}}
        attached
      />,
    );

    const previous = screen.getByText("Previous");
    expect(previous.tagName).toBe("SPAN");
    expect(previous).toHaveClass("justify-self-end");
    expect(screen.getByText("Page 1 of 17")).toHaveClass("justify-self-center");
    expect(screen.getByRole("link", { name: "Next" })).toHaveClass("justify-self-start");
  });
});
