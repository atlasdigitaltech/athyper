"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, MoreVertical, Plus, RefreshCw } from "lucide-react";
import { Button } from "@athyper/platform-ui";
import type { RuntimeListPresenterProps } from "../adapter/types";
import type { ResolvedToolbarAction } from "../core/types";
import { SearchControl } from "./organize/search-control";
import { FilterControl } from "./organize/filter-control";
import { OrganizePaletteProvider } from "./organize/organize-state";
import { SortControl } from "./organize/sort-control";
import { GroupControl } from "./organize/group-control";
import { ColumnControl } from "./organize/column-control";
import { SavedViewsControl } from "./organize/saved-views-control";
import { OrganizeSettingsControl } from "./organize/organize-settings-control";
import { PalettePanel } from "./organize/palette-panel";
import { runtimeListText } from "../core/resources";
import { useRuntimeListSearch } from "./runtime-list-context";

type RuntimeListCommandBarProps = Pick<
  RuntimeListPresenterProps,
  | "entityName"
  | "searchValue"
  | "pageSize"
  | "activeSort"
  | "activeFilters"
  | "groupField"
  | "columns"
  | "allColumns"
  | "defaultColumns"
  | "density"
  | "viewMode"
  | "listPresentation"
  | "savedViews"
  | "activeSavedViewId"
  | "filterableFields"
  | "sortableFields"
  | "groupableFields"
  | "features"
  | "clientAdapter"
  | "rawSearchParams"
  | "createHref"
  | "toolbarActions"
  | "slots"
>;

export function RuntimeListCommandBar(props: RuntimeListCommandBarProps) {
  const {
    entityName,
    searchValue,
    pageSize,
    activeSort,
    groupField,
    columns,
    allColumns,
    defaultColumns,
    density,
    viewMode,
    listPresentation,
    savedViews,
    activeSavedViewId,
    filterableFields,
    sortableFields,
    groupableFields,
    features,
    clientAdapter,
    rawSearchParams,
    createHref,
    toolbarActions,
    slots,
  } = props;

  return (
    <OrganizePaletteProvider>
      <div
        className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 md:grid-cols-[auto_minmax(0,1fr)_auto] md:gap-3"
        data-runtime-list-command-bar
      >
        <ListNavigationSegment title={entityName} listHref={clientAdapter.listBaseHref} />

        {slots?.organizeLeading}

        <div className="col-span-2 row-start-2 flex h-10 min-w-0 w-full items-center overflow-hidden rounded-lg border bg-background shadow-sm md:col-span-1 md:col-start-2 md:row-start-1 md:max-w-sm md:justify-self-end">
          <SearchControl
            searchValue={searchValue}
            pageSize={pageSize}
            listBaseHref={clientAdapter.listBaseHref}
            rawSearchParams={rawSearchParams}
            size="command"
            chrome="merged"
          />
          <span aria-hidden="true" className="self-stretch w-px bg-border" />
          <div className="flex h-full shrink-0 items-center gap-1 px-1">
            <FilterControl
              fieldOptionsApiHrefBase={clientAdapter.fieldOptionsApiHrefBase}
              filterableFields={filterableFields}
              listBaseHref={clientAdapter.listBaseHref}
              rawSearchParams={rawSearchParams}
              buttonSize="compact"
            />
            <OrganizeSettingsControl
              activeSort={activeSort}
              sortableFields={sortableFields}
              groupField={groupField}
              groupableFields={groupableFields}
              visibleColumns={columns}
              allColumns={allColumns}
              density={density}
              viewMode={viewMode}
              features={features}
              listBaseHref={clientAdapter.listBaseHref}
              rawSearchParams={rawSearchParams}
              buttonSize="compact"
            />
            {features.savedViews && (
              <SavedViewsControl
                entityCode={clientAdapter.entityCode}
                savedViews={savedViews}
                activeSavedViewId={activeSavedViewId}
                savedViewsApiHref={clientAdapter.savedViewsApiHref}
                activeSort={activeSort}
                filterableFields={filterableFields}
                columns={columns}
                allColumns={allColumns}
                defaultColumns={defaultColumns}
                groupField={groupField}
                viewMode={viewMode}
                defaultViewMode={listPresentation.defaultViewMode}
                density={density}
                listBaseHref={clientAdapter.listBaseHref}
                rawSearchParams={rawSearchParams}
                enabled={features.savedViews}
                buttonSize="compact"
              />
            )}
            {slots?.organizeTrailing}
          </div>
        </div>

        <div className="col-start-2 row-start-1 flex shrink-0 items-center gap-2 md:col-start-3">
          {createHref && (
            <Button
              asChild
              variant="primary"
              size="lg"
              className="w-10 shrink-0 px-0 md:w-auto md:px-4"
            >
              <Link href={createHref}>
                <Plus aria-hidden="true" className="size-4" />
                <span className="hidden md:inline">{runtimeListText.actions.createNew}</span>
              </Link>
            </Button>
          )}

          <RuntimeListMoreMenu actions={toolbarActions} />
        </div>

        <HiddenArrangeDrawers
          activeSort={activeSort}
          sortableFields={sortableFields}
          groupField={groupField}
          groupableFields={groupableFields}
          columns={columns}
          allColumns={allColumns}
          defaultColumns={defaultColumns}
          features={features}
          listBaseHref={clientAdapter.listBaseHref}
          rawSearchParams={rawSearchParams}
        />
      </div>
    </OrganizePaletteProvider>
  );
}

function ListNavigationSegment({
  title,
  listHref,
}: {
  title:    string;
  listHref: string;
}) {
  const router = useRouter();
  const goBack = () => {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    router.push(listHref);
  };

  return (
    <div className="col-start-1 row-start-1 flex h-10 min-w-0 items-center overflow-hidden rounded-lg border bg-background shadow-sm">
      <button
        type="button"
        aria-label="Back"
        title="Back"
        onClick={goBack}
        className="flex h-full w-9 shrink-0 items-center justify-center border-r border-r-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
      </button>
      <Link
        href={listHref}
        title={`Go to ${title} list`}
        className="min-w-0 max-w-[16rem] truncate px-3 text-base font-semibold leading-5 text-foreground transition-colors hover:text-primary hover:underline sm:max-w-[20rem] lg:max-w-[24rem]"
      >
        {title}
      </Link>
    </div>
  );
}

function HiddenArrangeDrawers({
  activeSort,
  sortableFields,
  groupField,
  groupableFields,
  columns,
  allColumns,
  defaultColumns,
  features,
  listBaseHref,
  rawSearchParams,
}: Pick<
  RuntimeListCommandBarProps,
  | "activeSort"
  | "sortableFields"
  | "groupField"
  | "groupableFields"
  | "columns"
  | "allColumns"
  | "defaultColumns"
  | "features"
  | "rawSearchParams"
> & {
  listBaseHref: string;
}) {
  return (
    <>
      <SortControl
        activeSort={activeSort}
        sortableFields={sortableFields}
        listBaseHref={listBaseHref}
        rawSearchParams={rawSearchParams}
        multiSort={Boolean(features.multiSort)}
        maxSortLevels={features.maxSortLevels}
        trigger="hidden"
      />
      <GroupControl
        groupField={groupField}
        groupableFields={groupableFields}
        visibleColumns={columns}
        listBaseHref={listBaseHref}
        rawSearchParams={rawSearchParams}
        enabled={features.grouping}
        trigger="hidden"
      />
      <ColumnControl
        columns={columns}
        allColumns={allColumns}
        defaultColumns={defaultColumns}
        listBaseHref={listBaseHref}
        rawSearchParams={rawSearchParams}
        enabled={features.columnCustomization}
        trigger="hidden"
      />
    </>
  );
}

function RuntimeListMoreMenu({ actions }: { actions: ResolvedToolbarAction[] }) {
  const { lazyList } = useRuntimeListSearch();
  const [open, setOpen] = useState(false);
  const isRefreshing = lazyList.isRevalidating;
  const visibleActions = actions.filter((action) => !action.disabled);
  const reloadList = () => {
    if (isRefreshing) return;
    setOpen(false);
    lazyList.refreshCurrentPage();
  };

  return (
    <>
      <PalettePanel
        open={open}
        onOpenChange={setOpen}
        title="More actions"
        width={280}
        trigger={(
          <Button
            variant="ghost"
            size="lg"
            aria-label="More actions"
            aria-expanded={open}
            title="More actions"
            className="size-10 shrink-0 p-0"
          >
            <MoreVertical aria-hidden="true" className="size-5" />
          </Button>
        )}
      >
          <div className="space-y-3">
            <section className="space-y-1.5">
              <h3 className="px-0.5 text-xs font-medium text-muted-foreground">Entity operations</h3>
              {visibleActions.length === 0 ? (
                <p className="rounded-md border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
                  No entity operations available.
                </p>
              ) : (
                <div className="overflow-hidden rounded-md border bg-background">
                  {visibleActions.map((action) => (
                    <Button
                      key={action.key}
                      asChild
                      variant="ghost"
                      size="md"
                      className="w-full justify-start rounded-none border-t px-3 py-2.5 text-left text-foreground first:border-t-0"
                    >
                      <Link href={action.href} onClick={() => setOpen(false)}>{action.label}</Link>
                    </Button>
                  ))}
                </div>
              )}
            </section>

            <section className="space-y-1.5">
              <h3 className="px-0.5 text-xs font-medium text-muted-foreground">List</h3>
              <div className="overflow-hidden rounded-md border bg-background">
                <Button
                  type="button"
                  onClick={reloadList}
                  disabled={isRefreshing}
                  aria-busy={isRefreshing}
                  variant="ghost"
                  size="md"
                  className="min-h-10 w-full justify-start rounded-none px-3 py-2 text-left text-foreground"
                >
                  <RefreshCw
                    aria-hidden="true"
                    className={`size-4 shrink-0 text-muted-foreground ${isRefreshing ? "animate-spin" : ""}`}
                  />
                  <span className="min-w-0 flex-1 truncate">
                    {isRefreshing ? "Reloading list…" : "Reload list"}
                  </span>
                </Button>
              </div>
            </section>
          </div>
      </PalettePanel>
    </>
  );
}
