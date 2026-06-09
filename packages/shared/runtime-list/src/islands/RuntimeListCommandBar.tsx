"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, MoreVertical, Plus, RefreshCw } from "lucide-react";
import type { RuntimeListPresenterProps } from "../adapter/types";
import type { ResolvedToolbarAction } from "../core/types";
import { OrganizePaletteProvider } from "./organize/organizeState";
import { SearchControl } from "./organize/SearchControl";
import { FilterControl } from "./organize/FilterControl";
import { SortControl } from "./organize/SortControl";
import { GroupControl } from "./organize/GroupControl";
import { ColumnControl } from "./organize/ColumnControl";
import { SavedViewsControl } from "./organize/SavedViewsControl";
import { OrganizeSettingsControl } from "./organize/OrganizeSettingsControl";
import { PalettePanel } from "./organize/PalettePanel";
import { runtimeListText } from "../core/resources";

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
      <div className="flex min-w-0 flex-wrap items-center gap-3" data-runtime-list-command-bar>
        <ListNavigationSegment title={entityName} listHref={clientAdapter.listBaseHref} />

        {slots?.organizeLeading}

        <div className="ml-auto flex h-10 min-w-0 w-[16rem] items-center overflow-hidden rounded-lg border bg-background shadow-sm max-sm:order-3 max-sm:ml-0 max-sm:w-full max-sm:flex-none max-[820px]:order-3 max-[820px]:ml-0 max-[820px]:!w-full max-[820px]:flex-none sm:w-[18rem] md:w-[22rem] lg:w-[22rem] xl:w-[26rem]">
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

        <div className="flex shrink-0 items-center gap-2 max-sm:order-2 max-sm:ml-auto max-[820px]:order-2 max-[820px]:ml-auto">
          {createHref && (
            <a
              href={createHref}
              className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-foreground px-3 text-sm font-semibold leading-5 text-background shadow-sm transition-opacity hover:opacity-90"
            >
              <Plus aria-hidden="true" className="size-4" />
              {runtimeListText.actions.createNew}
            </a>
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
  const goBack = () => {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    window.location.assign(listHref);
  };

  return (
    <div className="flex h-10 min-w-0 shrink items-center overflow-hidden rounded-lg border bg-background shadow-sm max-sm:order-1 max-sm:flex-1 max-[820px]:order-1 max-[820px]:flex-1">
      <button
        type="button"
        aria-label="Back"
        title="Back"
        onClick={goBack}
        className="flex h-full w-9 shrink-0 items-center justify-center border-r border-r-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
      </button>
      <a
        href={listHref}
        title={`Go to ${title} list`}
        className="min-w-0 max-w-[16rem] truncate px-3 text-base font-semibold leading-5 text-foreground transition-colors hover:text-primary hover:underline sm:max-w-[20rem] lg:max-w-[24rem]"
      >
        {title}
      </a>
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
  const router = useRouter();
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const visibleActions = actions.filter((action) => !action.disabled);
  const reloadList = () => {
    setOpen(false);
    router.refresh();
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label="More actions"
        aria-expanded={open}
        title="More actions"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border bg-background text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground"
      >
        <MoreVertical aria-hidden="true" className="size-5" />
      </button>
      {open && (
        <PalettePanel anchorRef={buttonRef} title="More actions" width={280} onClose={() => setOpen(false)}>
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
                    <a
                      key={action.key}
                      href={action.href}
                      className="block border-t px-3 py-2.5 text-sm font-medium text-foreground first:border-t-0 hover:bg-muted/70"
                      onClick={() => setOpen(false)}
                    >
                      {action.label}
                    </a>
                  ))}
                </div>
              )}
            </section>

            <section className="space-y-1.5">
              <h3 className="px-0.5 text-xs font-medium text-muted-foreground">List</h3>
              <div className="overflow-hidden rounded-md border bg-background">
                <button
                  type="button"
                  onClick={reloadList}
                  className="flex min-h-10 w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-foreground hover:bg-muted/70"
                >
                  <RefreshCw aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">Reload list</span>
                </button>
              </div>
            </section>
          </div>
        </PalettePanel>
      )}
    </>
  );
}
