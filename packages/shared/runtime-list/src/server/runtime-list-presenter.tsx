import { OrganizePalette } from "../islands/organize";
import { SelectionIsland } from "../islands/selection-island";
import { RuntimeListPaginationGate } from "../islands/runtime-list-pagination-gate";
import { RuntimeListFilterChips } from "./runtime-list-filter-chips";
import { RuntimeListScopeChips } from "./runtime-list-scope-chips";
import { RuntimeCompactList } from "./runtime-compact-list";
import { RuntimeExcelTable } from "./runtime-excel-table";
import { RuntimeListTable } from "./runtime-list-table";
import { RuntimeListPagination } from "./runtime-list-pagination";
import { RuntimeListEmpty } from "./runtime-list-empty";
import type { RuntimeListPresenterProps } from "../adapter/types";
import { runtimeListText } from "../core/resources";

export function RuntimeListPresenter(props: RuntimeListPresenterProps) {
  const {
    entityCode,
    rows,
    columns,
    allColumns,
    listState,
    activeFilters,
    pagination,
    page,
    pageSize,
    features,
    clientAdapter,
    searchValue,
    activeSort,
    groupField,
    listPresentation,
    density,
    slots,
    viewMode,
    accessScope,
    rawSearchParams,
    search,
  } = props;

  const isEmpty = rows.length === 0;
  const isUnavailable = listState?.status === "unavailable";
  return (
    <section className="flex flex-col gap-1.5">
      {slots?.aboveTable}

      <div className="flex flex-col gap-2">
        <RuntimeListScopeChips accessScope={accessScope} />

          {activeFilters.length > 0 && (
            <RuntimeListFilterChips
              filters={activeFilters}
              listBaseHref={clientAdapter.listBaseHref}
              rawSearchParams={rawSearchParams}
            />
          )}

          {isUnavailable ? (
            <RuntimeListEmpty
              title={runtimeListText.empty.recordsUnavailableTitle}
              message={listState?.message ?? runtimeListText.empty.recordsUnavailableMessage}
            />
          ) : viewMode === "list" ? (
            // List view: full table on desktop (md+), compact cards on mobile (<md).
            !isEmpty || search.enabled ? (
              <>
                {/* Desktop */}
                <div className="max-md:hidden">
                  <SelectionIsland
                    entityCode={entityCode}
                    rows={rows}
                    columns={columns}
                    features={features}
                    detailHrefBase={clientAdapter.detailHrefBase}
                    activeSort={activeSort}
                    groupField={groupField}
                    density={density}
                    page={page}
                    pageSize={pageSize}
                    total={pagination?.total}
                    listBaseHref={clientAdapter.listBaseHref}
                    rawSearchParams={rawSearchParams}
                  />
                </div>
                {/* Mobile */}
                <div className="md:hidden">
                  {isEmpty && !search.enabled ? (
                    <RuntimeListEmpty
                      title={runtimeListText.empty.noRecordsTitle}
                      message={
                        searchValue || activeFilters.length > 0
                          ? runtimeListText.empty.tryAdjustingSearchOrFilters
                          : runtimeListText.empty.noRecordsMessage
                      }
                    />
                  ) : (
                    <RuntimeCompactList
                      columns={columns}
                      allColumns={allColumns}
                      rows={rows}
                      density={density}
                      groupField={groupField}
                      listPresentation={listPresentation}
                      detailHrefBase={clientAdapter.detailHrefBase}
                      page={page}
                      pageSize={pageSize}
                      total={pagination?.total}
                      rawSearchParams={rawSearchParams}
                    />
                  )}
                </div>
              </>
            ) : (
              slots?.emptyState ?? (
                <RuntimeListEmpty
                  title={runtimeListText.empty.noRecordsTitle}
                  message={runtimeListText.empty.noRecordsMessage}
                />
              )
            )
          ) : isEmpty && !search.enabled ? (
            slots?.emptyState ?? (
              <RuntimeListEmpty
                title={runtimeListText.empty.noRecordsTitle}
                message={
                  searchValue || activeFilters.length > 0
                    ? runtimeListText.empty.tryAdjustingSearchOrFilters
                    : runtimeListText.empty.noRecordsMessage
                }
              />
            )
          ) : viewMode === "compact" ? (
            <RuntimeCompactList
              columns={columns}
              allColumns={allColumns}
              rows={rows}
              density={density}
              groupField={groupField}
              listPresentation={listPresentation}
              detailHrefBase={clientAdapter.detailHrefBase}
              page={page}
              pageSize={pageSize}
              total={pagination?.total}
              rawSearchParams={rawSearchParams}
            />
          ) : viewMode === "excel" ? (
            <RuntimeExcelTable
              entityCode={entityCode}
              columns={columns}
              allColumns={allColumns}
              rows={rows}
              density={density}
              activeSort={activeSort}
              groupField={groupField}
              selectable={features.bulkActions}
              listPresentation={listPresentation}
              listBaseHref={clientAdapter.listBaseHref}
              page={page}
              pageSize={pageSize}
              total={pagination?.total}
              rawSearchParams={rawSearchParams}
            />
          ) : (
            <RuntimeListTable
              columns={columns}
              rows={rows}
              density={density}
              activeSort={activeSort}
              groupField={groupField}
              listBaseHref={clientAdapter.listBaseHref}
              rawSearchParams={rawSearchParams}
            />
          )}

          {!isEmpty && !isUnavailable && (
            <RuntimeListPaginationGate>
              <RuntimeListPagination
                page={page}
                pageSize={pageSize}
                total={pagination?.total}
                totalPages={pagination?.totalPages}
                rowCount={rows.length}
                listBaseHref={clientAdapter.listBaseHref}
                rawSearchParams={rawSearchParams}
              />
            </RuntimeListPaginationGate>
          )}
        </div>

      {slots?.belowTable}
    </section>
  );
}

export function RuntimeListToolbar(props: RuntimeListPresenterProps) {
  const {
    columns,
    allColumns,
    defaultColumns,
    activeFilters,
    pageSize,
    features,
    clientAdapter,
    searchValue,
    activeSort,
    groupField,
    density,
    slots,
    viewMode,
    listPresentation,
    rawSearchParams,
    savedViews,
    activeSavedViewId,
    filterableFields,
    sortableFields,
    groupableFields,
    entityCode,
  } = props;

  return (
    <OrganizePalette
      entityCode={entityCode}
      searchValue={searchValue}
      pageSize={pageSize}
      listBaseHref={clientAdapter.listBaseHref}
      rawSearchParams={rawSearchParams}
      activeSort={activeSort}
      activeFilters={activeFilters}
      groupField={groupField}
      columns={columns}
      allColumns={allColumns}
      defaultColumns={defaultColumns}
      density={density}
      viewMode={viewMode}
      defaultViewMode={listPresentation.defaultViewMode}
      savedViews={savedViews}
      activeSavedViewId={activeSavedViewId}
      savedViewsApiHref={clientAdapter.savedViewsApiHref}
      fieldOptionsApiHrefBase={clientAdapter.fieldOptionsApiHrefBase}
      filterableFields={filterableFields}
      sortableFields={sortableFields}
      groupableFields={groupableFields}
      features={features}
      slots={slots}
    />
  );
}
