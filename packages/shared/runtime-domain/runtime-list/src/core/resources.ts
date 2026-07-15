export const runtimeListText = {
  actions: {
    apply: "Apply",
    clear: "Clear",
    createNew: "Create",
    loadMoreRows: "Load more rows",
    next: "Next",
    previous: "Previous",
    searchInAllRecords: (total?: number) => (
      total !== undefined
        ? `Search in all ${formatRuntimeListCount(total)} records`
        : "Search in all records"
    ),
    tryAgain: "Try again",
  },

  aria: {
    loadMoreRecords: "Load more records",
    removeFilter: (label: string) => `Remove filter: ${label}`,
    selectAllRows: "Select all rows",
    selectRow: (label: string | number) => `Select row ${label}`,
  },

  empty: {
    noRecordsMessage: "No records exist in this scope yet.",
    noRecordsTitle: "No records found",
    recordsUnavailableMessage: "Records could not be loaded in the active scope.",
    recordsUnavailableTitle: "Records unavailable",
    tryAdjustingSearchOrFilters: "Try adjusting the search or active filters.",
  },

  search: {
    checkingAllRecords: "Checking all records...",
    couldNotSearchInAllRecords: "Could not search in all records - showing loaded data only.",
    minQueryLength: (minLength: number) => `Type at least ${minLength} characters to search in all records`,
    noMatchesInLoadedRows: "No matches in loaded rows.",
    noRecordsMatch: (query: string) => `No records match "${query}".`,
    noRecordsToDisplay: "No records to display.",
    placeholder: "Search...",
    searchedAllRecords: "Searched all records",
    searchedAllRecordsLoadedRows: (rowCount: number) => (
      `Searched all records. Loaded ${formatRuntimeListCount(rowCount)} ${rowCount === 1 ? "row" : "rows"}.`
    ),
    searchReturnedStatus: (status: number) => `Search returned ${status}`,
    searchUnavailableTryAgain: "Search unavailable - try again",
    searchInAllRecordsUnavailable: "Search in all records is not available for this workspace",
  },

  summary: {
    loadedRecords: (rowCount: number) => (
      `Loaded ${formatRuntimeListCount(rowCount)} ${rowCount === 1 ? "record" : "records"}`
    ),
    loadedRowsUseFilters: (rowCount: number) => (
      `Loaded ${formatRuntimeListCount(rowCount)} rows. Use filters or search to narrow results, or click Next to view more.`
    ),
    matchesInLoadedRows: (matchCount: number) => (
      `${formatRuntimeListCount(matchCount)} ${matchCount === 1 ? "match" : "matches"} in loaded rows`
    ),
    moreMatchesMayExist: "More matches may exist.",
    page: (page: number, totalPages?: number) => (
      totalPages ? `Page ${page} of ${totalPages}` : `Page ${page}`
    ),
    recordsAndSource: (count: number, source: string) => (
      count > 0 ? `${formatRuntimeListCount(count)} records - ${source}` : source
    ),
    searchInAllForCompleteResults: (total?: number) => (
      total !== undefined
        ? `Search in all ${formatRuntimeListCount(total)} records for complete results.`
        : "Search in all records for complete results."
    ),
    showingMatchCount: (rowCount: number) => (
      `Showing ${formatRuntimeListCount(rowCount)} ${rowCount === 1 ? "match" : "matches"}`
    ),
    showingMatchRange: (start: number, end: number, total: number) => (
      `Showing ${formatRuntimeListCount(start)}-${formatRuntimeListCount(end)} of ${formatRuntimeListCount(total)} ${total === 1 ? "match" : "matches"}`
    ),
    showingRecordCount: (rowCount: number) => (
      `Showing ${formatRuntimeListCount(rowCount)} records`
    ),
    showingRecordRange: (start: number, end: number, total: number) => (
      `Showing ${formatRuntimeListCount(start)}-${formatRuntimeListCount(end)} of ${formatRuntimeListCount(total)} records`
    ),
    selectedCount: (count: number) => `${formatRuntimeListCount(count)} selected`,
  },

  system: {
    accessScopeUnavailable: "Access scope could not be resolved.",
    couldNotLoadMoreRecords: "Could not load more records.",
    couldNotLoadNextRecords: "Could not load the next records.",
    entityDescriptorUnavailable: "Entity descriptor could not be loaded.",
    loadingMoreRows: "Loading more rows...",
    loadingPage: (page: number) => `Loading page ${page}.`,
    loadingRows: (range: string) => `Loading ${range}...`,
    loadedPage: (page: number) => `Loaded page ${page}.`,
    loadedRowsOnward: (start: number, rowCount: number) => (
      `Loaded rows ${formatRuntimeListCount(start)} onward. ${formatRuntimeListCount(rowCount)} rows visible.`
    ),
    loadingRowsOnward: (start: number) => `Loading rows ${formatRuntimeListCount(start)} onward.`,
    pageReturnedStatus: (page: number, status: number) => `Page ${page} returned ${status}`,
    unexpectedListLoadError: "An unexpected error occurred while loading this list.",
  },
} as const;

export function formatRuntimeListCount(value: number): string {
  return value.toLocaleString("en-US");
}
