"use client";
import { useEffect, useRef, useState, useId } from "react";
import {
  activityCollectionState,
  collectionActivityQuery,
  defaultActivityQuery,
  parseActivityQuery,
  type ActivityKind,
  type ActivitySavedViews,
} from "@athyper/contract-platform-activity";
import {
  parseCollectionState,
  type CollectionState,
} from "@athyper/contract-platform-collection";
import {
  AppliedFilters,
  Button,
  MenuItem,
  ObjectSearch,
  ViewSelector,
  PanelEmptyState,
  FilterChipGroup,
} from "@athyper/platform-ui";
import {
  FilterIcon,
  SlidersHorizontalIcon,
  SortIcon,
  GroupIcon,
  LayoutIcon,
} from "@athyper/platform-icons";
import {
  CollectionDensitySettings,
  CollectionGroupEditor,
  CollectionSortEditor,
  CollectionViewsManager,
  CollectionControlSections,
  CollectionDraftFooter,
  CollectionFilterEditor,
  type CollectionFilterDraft,
  filterValueFromInput,
  filterInputValue,
} from "@athyper/platform-collection-controls";
import { useEntityI18n } from "@athyper/platform-i18n/entity-react";
import { ActivityNotificationActions } from "./activity-notification-actions";
import { CollectionControlPanel } from "./collection-control-panel";
import { ManagementToolbar } from "./management-workspace";
import type { ShellActivityDataSource } from "./activity-center";

type Panel = "filters" | "sort" | "group" | "display" | "views";
const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
export function ActivityQueryControls({
  kind,
  data,
  compact = false,
}: {
  kind: ActivityKind;
  data: ShellActivityDataSource;
  compact?: boolean;
}) {
  const configuration = data.collections?.[kind]?.configuration,
    q = data.queries?.[kind] ?? defaultActivityQuery(kind),
    info = data.queryInfo?.[kind];
  const [panel, setPanel] = useState<Panel>(),
    [draft, setDraft] = useState<CollectionState>(),
    // Typed filter text, kept so values are not reformatted while editing.
    [filterDraft, setFilterDraft] = useState<readonly CollectionFilterDraft[]>(),
    // Display: following the app density, until the person chooses one.
    [followApp, setFollowApp] = useState<boolean>(),
    [search, setSearch] = useState(""),
    [error, setError] = useState<string>(),
    [preview, setPreview] = useState<number>(),
    [name, setName] = useState(""),
    [busy, setBusy] = useState(false),
    [legacy, setLegacy] = useState<{ name: string; query: unknown }[]>([]);
  const searchId = useId();
  const intl = useEntityI18n();
  // Set by the shared controls panel: closes an overlay, keeps a pinned panel.
  const finish = useRef<(open: boolean) => void>(undefined);
  const input = useRef<HTMLInputElement>(null),
    legacyKey = info?.viewScope
      ? `athyper.activity.views.v1:${info.viewScope}:${kind}`
      : undefined;
  let state: CollectionState | undefined;
  try {
    if (configuration) state = activityCollectionState(kind, q, configuration);
  } catch {}
  const serialized = JSON.stringify(state);
  useEffect(() => setSearch(state?.query ?? ""), [serialized]);
  useEffect(() => {
    setPanel(undefined);
    setDraft(undefined);
    setFilterDraft(undefined);
    setError(undefined);
  }, [kind]);
  useEffect(() => {
    setLegacy([]);
    if (!legacyKey) return;
    try {
      const value = JSON.parse(localStorage.getItem(legacyKey) ?? "[]");
      if (Array.isArray(value)) setLegacy(value.slice(0, 30));
    } catch {}
  }, [legacyKey]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        e.key === "/" &&
        !(
          e.target instanceof HTMLElement &&
          (e.target.isContentEditable ||
            /INPUT|SELECT|TEXTAREA/.test(e.target.tagName))
        )
      ) {
        e.preventDefault();
        input.current?.focus();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);
  useEffect(() => {
    if (!draft || !panel || !configuration) return;
    const controller = new AbortController();
    setPreview(undefined);
    const timer = setTimeout(() => {
      try {
        const valid = parseCollectionState(draft, configuration.fields);
        void data
          .onPreviewQuery?.(
            kind,
            collectionActivityQuery(kind, valid, q.timeZone),
            controller.signal,
          )
          .then((count) => {
            if (!controller.signal.aborted) setPreview(count);
          })
          .catch((e) => {
            if (!controller.signal.aborted) setError(String(e.message ?? e));
          });
      } catch (e) {
        setError((e as Error).message);
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [draft, panel, configuration, kind, q.timeZone, data.onPreviewQuery]);
  if (!configuration)
    return data.loading ? (
      <p role="status">{intl.message("activity.controls.loadingConfig")}</p>
    ) : (
      <PanelEmptyState
        icon={<FilterIcon />}
        title={intl.message("activity.controls.configUnavailable")}
        description={
          data.collectionErrors?.[kind] ??
          intl.message("activity.controls.configAsk")
        }
      />
    );
  if (!state || data.collectionErrors?.[kind])
    return (
      <PanelEmptyState
        icon={<FilterIcon />}
        title={intl.message("activity.controls.incompatible")}
        action={
          <Button
            onClick={() =>
              data.onQueryChange?.(
                kind,
                collectionActivityQuery(
                  kind,
                  configuration.defaultState,
                  q.timeZone,
                ),
              )
            }
          >
            {intl.message("activity.controls.resetView")}
          </Button>
        }
      />
    );
  const current = state,
    views = data.savedViews?.[kind],
    working = draft ?? current;
  const apply = (next: CollectionState) => {
    try {
      const value = parseCollectionState(next, configuration.fields);
      data.onQueryChange?.(
        kind,
        collectionActivityQuery(kind, value, q.timeZone),
      );
      // A pinned panel stays open on the refreshed state; inline panel filters close.
      setDraft(undefined);
      setFilterDraft(undefined);
      if (compact) setPanel(undefined);
      setError(undefined);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const close = () => {
    finish.current = undefined;
    setFollowApp(undefined);
    setPanel(undefined);
    setDraft(undefined);
    setFilterDraft(undefined);
  };
  const open = (key: Panel) => {
    setDraft(structuredClone(current));
    setFilterDraft(undefined);
    setFollowApp(undefined);
    setError(undefined);
    setPanel(key);
  };
  const patch = (value: Partial<CollectionState>) => {
    setError(undefined);
    if (value.filters) setFilterDraft(undefined);
    setDraft({ ...working, ...value });
  };
  const command = async (value: Record<string, unknown>) => {
    setBusy(true);
    setError(undefined);
    try {
      return await data.onViewCommand?.(kind, value);
    } catch (e) {
      setError(intl.message("activity.controls.reloadAgain", { message: (e as Error).message }));
    } finally {
      setBusy(false);
    }
  };
  const active = views?.views.find(
    (v) => v.compatible && same(v.state.collection, current),
  );
  // A view's own filters (for example open task statuses) are the view, not
  // filters the person applied: only additions are shown as chips.
  const baseFilters = (active?.state.collection ?? configuration.defaultState).filters;
  const added = current.filters.filter(
    (filter) => !baseFilters.some((base) => JSON.stringify(base) === JSON.stringify(filter)),
  );
  // Apply from the panel: an overlay closes, a pinned panel stays open.
  const finishApply = () => {
    apply(working);
    if (finish.current) finish.current(false);
    else setPanel(undefined);
  };
  const footer = (
    <CollectionDraftFooter
      count={preview}
      dirty={!same(working, current)}
      error={error}
      onCancel={() => setPanel(undefined)}
      onReset={() => patch(configuration.defaultState)}
      onApply={finishApply}
    />
  );
  const fields = configuration.fields.filter((f) => f.operators.length);
  const choicesFor = (field: (typeof fields)[number]) =>
    field.choices?.length
      ? field.choices
      : field.choiceSource
        ? (field.key === "entity" ? info?.facets?.entities : info?.facets?.types)?.map(
            (value) => ({ value, label: value }),
          )
        : undefined;
  type FilterFields = Parameters<typeof CollectionFilterEditor>[0]["fields"];
  // Collection fields in the shape the shared filter editor reads.
  const editorFields = fields.map((field) => ({
    ...field,
    filterOperators: field.operators,
    filterOptions: choicesFor(field),
  })) as unknown as FilterFields;
  const toDraft = (list: CollectionState["filters"]): CollectionFilterDraft[] =>
    list.map((filter, index) => ({
      id: `applied-${index}`,
      field: filter.field,
      operator: filter.operator,
      value: filterInputValue(filter, fields.find((f) => f.key === filter.field)?.valueKind),
    }));
  // Rows still awaiting a value are not filters yet.
  const fromDraft = (list: readonly CollectionFilterDraft[]): CollectionState["filters"] =>
    list
      .filter((item) => item.value.trim() || item.operator === "is_null" || item.operator === "is_not_null")
      .map((item) => {
        const field = fields.find((f) => f.key === item.field);
        const value = filterValueFromInput(item.operator, item.value, field?.valueKind, field ? choicesFor(field) : undefined);
        return { field: item.field, operator: item.operator, ...(value === undefined ? {} : { value }) };
      });
  const ready = working.filters.length;
  const filters = (
    <CollectionFilterEditor
      fields={editorFields}
      quickKeys={configuration.quickFields}
      draft={filterDraft ?? toDraft(working.filters)}
      onDraftChange={(next) => {
        setError(undefined);
        setFilterDraft(next);
        setDraft({ ...working, filters: fromDraft(next) });
      }}
      footer={
        <CollectionDraftFooter
          className="a-entity-list__filter-actions"
          dirty={!same(working, current)}
          error={error}
          summary={
            <strong>
              {ready
                ? intl.message("list.footer.filtersReady", { count: ready })
                : intl.message("list.footer.filtersCleared")}
              {preview !== undefined ? ` · ${preview} matching` : ""}
            </strong>
          }
          resetDisabled={same(working.filters, baseFilters)}
          onReset={() => {
            setFilterDraft(undefined);
            patch({ filters: baseFilters });
          }}
          onApply={finishApply}
          resetLabel={intl.message("activity.controls.resetFilters")}
          applyLabel={intl.message("activity.controls.applyFilters")}
        />
      }
    />
  );
  const importLegacy = async () => {
    let pending = [...legacy];
    for (const v of legacy) {
      try {
        const state = activityCollectionState(
          kind,
          parseActivityQuery(kind, v.query),
          configuration,
        );
        const result = await command({
          action: "create",
          name: v.name,
          importKey: JSON.stringify([v.name, state]),
          visibility: "personal",
          state: {
            schemaVersion: configuration.viewVersion,
            collection: state,
          },
        });
        if (!result) return;
        pending = pending.filter((x) => x !== v);
        setLegacy(pending);
        if (legacyKey)
          localStorage.setItem(legacyKey, JSON.stringify(pending));
      } catch (e) {
        setError((e as Error).message);
        return;
      }
    }
    if (legacyKey) localStorage.removeItem(legacyKey);
    setLegacy([]);
  };
  // Sort, Group by, Display and Views: the shared collection sections, as on entity lists.
  const defaults = configuration.defaultState;
  const sectionFooter = (keys: { reset: string; apply: string }, summary: string, resetTo: Partial<CollectionState>, resetDisabled: boolean) => (
    <CollectionDraftFooter
      dirty={!same(working, current)}
      error={error}
      summary={<strong>{summary}</strong>}
      resetDisabled={resetDisabled}
      onReset={() => patch(resetTo)}
      onApply={finishApply}
      resetLabel={intl.message(keys.reset)}
      applyLabel={intl.message(keys.apply)}
    />
  );
  const sort = (
    <CollectionSortEditor
      fields={configuration.fields.filter((f) => f.sortable)}
      draft={working.sort}
      onDraftChange={(next) => patch({ sort: next })}
      footer={sectionFooter(
        { reset: "collection.sort.reset", apply: "collection.sort.apply" },
        intl.message("list.footer.sortReady", { count: working.sort.length }),
        { sort: defaults.sort },
        same(working.sort, defaults.sort),
      )}
    />
  );
  const groupField = configuration.fields.find((f) => f.key === working.group);
  const group = (
    <CollectionGroupEditor
      fields={configuration.fields.filter((f) => f.groupable)}
      value={working.group}
      onChange={(next) => patch({ group: next })}
      footer={sectionFooter(
        { reset: "collection.group.reset", apply: "collection.group.apply" },
        groupField
          ? intl.message("list.footer.groupReady", { field: groupField.label })
          : intl.message("list.footer.groupCleared"),
        { group: defaults.group },
        working.group === defaults.group,
      )}
    />
  );
  // Density follows the app (Utilities) until the person picks one, as on entity lists.
  const baseDensity = (active?.state.collection ?? defaults).density;
  const appDensity = ((): CollectionState["density"] => {
    const value = typeof document === "undefined" ? undefined : document.documentElement.dataset.density;
    return value === "compact" || value === "spacious" ? value : "comfortable";
  })();
  const follow = followApp ?? working.density === baseDensity;
  const display = (
    <CollectionDensitySettings
      appDensity={appDensity}
      follow={follow}
      onFollowChange={(next) => {
        setFollowApp(next);
        patch({ density: next ? baseDensity : appDensity });
      }}
      density={working.density}
      onDensityChange={(density) => patch({ density })}
      footer={
        <CollectionDraftFooter
          dirty={!same(working, current)}
          error={error}
          summary={<strong>{intl.message("list.footer.displayReady")}</strong>}
          onReset={() => {
            setFollowApp(undefined);
            patch({ density: baseDensity });
          }}
          onApply={finishApply}
          resetLabel={intl.message("collection.display.reset")}
          applyLabel={intl.message("collection.display.save")}
        />
      }
    />
  );
  const applyView = (state: CollectionState) => {
    apply(state);
    if (finish.current) finish.current(false);
    else setPanel(undefined);
  };
  const viewState = { schemaVersion: configuration.viewVersion, collection: current };
  const scopeOf = (scope: string): "system" | "personal" | "shared" =>
    scope === "system" || scope === "shared" ? scope : "personal";
  const manage = (
    <CollectionViewsManager
      rows={[
        {
          id: "system",
          name: intl.message("collection.views.systemDefault"),
          scope: "system",
          published: true,
          personalDefault: views?.personalDefault === "system",
          sharedDefault: views?.sharedDefault === "system",
        },
        ...(views?.views ?? []).map((v) => ({
          id: v.id,
          name: v.name,
          scope: scopeOf(v.scope),
          compatible: v.compatible,
          personalDefault: views?.personalDefault === v.id,
          sharedDefault: views?.sharedDefault === v.id,
        })),
      ]}
      currentId={active?.id ?? (same(current, defaults) ? "system" : "")}
      busy={busy}
      message={error ? <span role="alert">{error}</span> : undefined}
      createShared={views?.capabilities.createShared}
      manageShared={views?.capabilities.manageShared}
      saveSummary={intl.message("activity.controls.saveSummary")}
      onApply={(id) => {
        const view = views?.views.find((v) => v.id === id);
        applyView(view?.compatible ? view.state.collection : defaults);
      }}
      onSave={(viewName, visibility) => command({ action: "create", name: viewName, visibility, state: viewState })}
      onMakeDefault={(id) => void command({ action: "default", id, target: "personal" })}
      {...(views?.capabilities.setSharedDefault
        ? { onSetSharedDefault: (id: string) => void command({ action: "default", id, target: "shared" }) }
        : {})}
      onCopy={(id) => void command({ action: "copy", id })}
      onRename={async (id, viewName) =>
        Boolean(await command({ action: "update", id, version: views?.views.find((v) => v.id === id)?.version, name: viewName }))
      }
      onUpdate={(id) =>
        void command({ action: "update", id, version: views?.views.find((v) => v.id === id)?.version, state: viewState })
      }
      onDelete={(id) => void command({ action: "delete", id })}
      extra={
        <>
          {error ? (
            <Button variant="ghost" size="small" disabled={busy} onClick={() => void command({ action: "reload" })}>
              {intl.message("activity.controls.reloadViews")}
            </Button>
          ) : null}
          {legacy.length ? (
            <section>
              <p className="a-entity-list__view-summary">
                {intl.message("activity.controls.browserViews", { count: legacy.length })}
              </p>
              <Button variant="secondary" size="small" disabled={busy} onClick={() => void importLegacy()}>
                {intl.message("activity.controls.importBrowser")}
              </Button>
            </section>
          ) : null}
        </>
      }
    />
  );
  // Same sections, text and badges as entity lists (list.controls.*).
  const options = [
    { key: "filters" as const, Icon: FilterIcon, count: added.length || undefined },
    { key: "sort" as const, Icon: SortIcon },
    { key: "group" as const, Icon: GroupIcon },
    { key: "display" as const, Icon: LayoutIcon },
    { key: "views" as const, Icon: LayoutIcon },
  ].map((item) => ({
    ...item,
    label: intl.message(`list.controls.${item.key}.tab`),
    title: intl.message(`list.controls.${item.key}.title`),
    description: intl.message(`list.controls.${item.key}.description`, {
      entity: configuration.title,
    }),
  }));
  return (
    <div
      className={`athyper-activity-query${compact ? " athyper-activity-query--compact" : ""}`}
      data-controls-open={panel ? "" : undefined}
    >
      <ManagementToolbar>
        {/* Below 40rem (always in the activity centre) views are reached from Controls, as on entity lists. */}
        <div data-slot="view" className="athyper-activity-query__view">
          <ViewSelector
            name={
              active?.name ??
              (same(current, configuration.defaultState)
                ? intl.message("activity.controls.systemDefault")
                : intl.message("activity.controls.custom"))
            }
          >
            {views?.views
              .filter((v) => v.compatible)
              .map((v) => (
                <MenuItem key={v.id} onClick={() => apply(v.state.collection)}>
                  {v.name}
                </MenuItem>
              ))}
            <MenuItem onClick={() => apply(configuration.defaultState)}>
              {intl.message("activity.controls.systemDefault")}
            </MenuItem>
            <MenuItem onClick={() => open("views")}>{intl.message("activity.controls.manageViews")}</MenuItem>
          </ViewSelector>
        </div>
        <form
          data-slot="search"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            apply({ ...current, query: search });
          }}
        >
          <ObjectSearch
            id={searchId}
            ref={input}
            label={intl.message("activity.controls.search")}
            placeholder={compact ? intl.message("activity.controls.searchShort") : intl.message("activity.controls.searchLong")}
            value={search}
            onValueChange={(value) => {
              setSearch(value);
              if (!value) apply({ ...current, query: "" });
            }}
          />
        </form>
        <div data-slot="actions">
          <Button
            variant="secondary"
            className="athyper-activity-query__action"
            aria-label={intl.message("activity.controls.filters")}
            title={intl.message("activity.controls.filters")}
            aria-expanded={compact ? panel === "filters" : undefined}
            onClick={() => (panel === "filters" ? close() : open("filters"))}
          >
            <FilterIcon size={16} />
            <span className="athyper-activity-query__label">{intl.message("activity.controls.filters")}</span>
            {added.length ? (
              <span className="athyper-activity-query__badge" aria-hidden="true">
                {added.length}
              </span>
            ) : null}
          </Button>
          <Button
            variant="secondary"
            className="athyper-activity-query__action"
            aria-label={intl.message("activity.controls.controls")}
            title={intl.message("activity.controls.controls")}
            aria-expanded={compact ? Boolean(panel && panel !== "filters") : undefined}
            onClick={() => (panel && panel !== "filters" ? close() : open("sort"))}
          >
            <SlidersHorizontalIcon size={16} />
            <span className="athyper-activity-query__label">{intl.message("activity.controls.controls")}</span>
          </Button>
        </div>
      </ManagementToolbar>
      <div className="a-panel-chip-row athyper-activity-query__summary">
      <FilterChipGroup
        label={intl.message("activity.controls.views")}
        value={active?.id ?? ""}
        onValueChange={(id) => {
          const v = views?.views.find((v) => v.id === id);
          if (v?.compatible) apply(v.state.collection);
        }}
        items={(views?.views ?? [])
          .filter((v) => v.scope === "system" && v.compatible)
          .map((v) => ({ value: v.id, label: v.name }))}
      />
      {kind === "notifications" ? <ActivityNotificationActions data={data} /> : null}
      </div>
      {added.length ? (
        <AppliedFilters
          chips={added.map((f, i) => {
            const field = configuration.fields.find((x) => x.key === f.field);
            return {
              key: String(i),
              label: `${field?.label ?? f.field}: ${filterValueLabel(field, f.value)}`,
              onRemove: () =>
                apply({
                  ...current,
                  filters: current.filters.filter((item) => item !== f),
                }),
            };
          })}
          // Clearing returns to the view's own filters; it never removes them.
          onClear={() => apply({ ...current, filters: baseFilters })}
        />
      ) : null}
      {panel ? (
        compact ? (
          // Inline in the activity centre (it already owns the side slot): the
          // same sections, tabs, editors and footers as the controls panel.
          <div
            className="a-collection-controls athyper-activity-query__filters"
            onKeyDown={(event) => {
              if (event.key !== "Escape" || event.defaultPrevented) return;
              event.preventDefault();
              close();
            }}
          >
            <CollectionControlSections
              active={panel}
              onSelect={setPanel}
              options={options}
              sections={{ filters, sort, group, display, views: manage }}
              tabsLabel={intl.message("list.controls.tabs")}
            />
          </div>
        ) : (
          <CollectionControlPanel
            id={`activity-controls-${kind}`}
            active={panel}
            onSelect={setPanel}
            onOpenChange={(open) => {
              if (!open) close();
            }}
            options={options}
            entity={configuration.title}
            context={{
              label: configuration.title,
              ...(info?.matchingCount !== undefined
                ? { detail: intl.message(kind === "notifications" ? "activity.controls.notificationCount" : "activity.controls.taskCount", { count: info.matchingCount }) }
                : {}),
            }}
            sections={(done) => {
              finish.current = done;
              return { filters, sort, group, display, views: manage };
            }}
          />
        )
      ) : null}
      {error && !panel ? <p role="alert">{error}</p> : null}
    </div>
  );
}

/** People read choice labels, never stored values ("In progress", not "in_progress"). */
function filterValueLabel(
  field: { readonly choices?: readonly { readonly value: string | number | boolean; readonly label: string }[] } | undefined,
  value: unknown,
): string {
  const values = Array.isArray(value) ? value : String(value).split(",");
  return values
    .map((item) => {
      const text = String(item).trim();
      return (
        field?.choices?.find((choice) => String(choice.value) === text)?.label ??
        text.replace(/[_.-]+/g, " ").replace(/^./, (letter) => letter.toUpperCase())
      );
    })
    .join(", ");
}
