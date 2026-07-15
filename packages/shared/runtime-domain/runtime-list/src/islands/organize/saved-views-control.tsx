"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bookmark, Check, Lock, RotateCcw, Save, Star, Trash2, Users, X } from "lucide-react";
import type {
  ResolvedColumn,
  RuntimeField,
  SaveableListState,
  SortEntry,
  ViewDensity,
  ViewMode,
} from "../../core/types";
import { LIST_URL_PARAMS as P } from "../../core/types";
import { describeFilterParamValue } from "../../core/url-state";
import type { SavedView, SavedViewScope, SavedViewState } from "../../adapter/types";
import { PaletteButton } from "./palette-button";
import { PaletteDrawer } from "./palette-drawer";
import { buildSaveableListState, parseFilterDraft, serializeOrganizeState, sortEntriesToParam } from "./organize-url";
import { useOrganizePanel } from "./organize-state";
import { ORGANIZE_INPUT_CLASS, ORGANIZE_SECTION_LABEL_CLASS } from "./palette-styles";

interface SavedViewsControlProps {
  entityCode:        string;
  savedViews:       SavedView[];
  activeSavedViewId:string | null;
  savedViewsApiHref?: string | null;
  activeSort:       SortEntry[];
  filterableFields: RuntimeField[];
  columns:          ResolvedColumn[];
  allColumns:       ResolvedColumn[];
  defaultColumns:   ResolvedColumn[];
  groupField?:      string;
  viewMode:         ViewMode;
  defaultViewMode?: ViewMode;
  density:          ViewDensity;
  listBaseHref:     string;
  rawSearchParams:  Record<string, string | string[] | undefined>;
  enabled:          boolean;
  buttonSize?:      "default" | "compact";
}

type SavedViewsTab = "available" | "save";

interface NormalizedViewState {
  filters:  Record<string, string[]>;
  sort:     SortEntry[];
  columns:  string[];
  group?:   string;
  viewMode: ViewMode;
  density:  ViewDensity;
}

interface ChangeSummary {
  sections:    ChangeSection[];
  changeCount: number;
}

interface ChangeSection {
  key:    string;
  label:  string;
  items:  ChangeItem[];
  reset?: ChangeReset;
}

interface ChangeItem {
  kind:  "added" | "removed" | "changed";
  label: string;
  reset: ChangeReset;
}

type ChangeReset =
  | { type: "filter"; field: string; value: string; action: "add" | "remove" }
  | { type: "filters" }
  | { type: "group" }
  | { type: "sort"; entry?: SortEntry; action: "remove" | "restore" | "reset" }
  | { type: "columns"; column?: string; action: "remove" | "restore" | "reset" }
  | { type: "density" }
  | { type: "viewMode" };

export function SavedViewsControl({
  entityCode,
  savedViews,
  activeSavedViewId,
  savedViewsApiHref,
  activeSort,
  filterableFields,
  columns,
  allColumns,
  defaultColumns,
  groupField,
  viewMode,
  defaultViewMode,
  density,
  listBaseHref,
  rawSearchParams,
  enabled,
  buttonSize = "default",
}: SavedViewsControlProps) {
  const router = useRouter();
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panel = useOrganizePanel("savedViews");
  const [localViews, setLocalViews] = useState<SavedView[]>(savedViews);
  const [name, setName] = useState("");
  const [saveScope, setSaveScope] = useState<SavedViewScope>("private");
  const [saving, setSaving] = useState(false);
  const [deletingViewId, setDeletingViewId] = useState<string | null>(null);
  const [defaultingViewId, setDefaultingViewId] = useState<string | null>(null);
  const [clearingDefault, setClearingDefault] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SavedView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [defaultError, setDefaultError] = useState<string | null>(null);
  const [optimisticActiveViewId, setOptimisticActiveViewId] = useState<string | null | undefined>(undefined);
  const [activeTab, setActiveTab] = useState<SavedViewsTab>("available");

  useEffect(() => {
    setLocalViews(savedViews);
  }, [savedViews]);

  useEffect(() => {
    setOptimisticActiveViewId(undefined);
  }, [activeSavedViewId]);

  if (!enabled) return null;

  const filterDraft = parseFilterDraft(rawSearchParams, filterableFields);
  const defaultView = localViews.find((view) => view.is_default);
  const canUseSystemView = hasResettableViewState(rawSearchParams, activeSavedViewId);
  const systemViewRequested = firstParamValue(rawSearchParams[P.VIEW_ID]) === SYSTEM_VIEW_ID;
  const canApplySystemView = canUseSystemView && !systemViewRequested;
  const displayActiveSavedViewId = optimisticActiveViewId === undefined ? activeSavedViewId : optimisticActiveViewId;
  const systemViewActive = optimisticActiveViewId === null
    ? true
    : optimisticActiveViewId === undefined
      ? !activeSavedViewId && (systemViewRequested || !canUseSystemView)
      : false;
  const defaultColumnNames = defaultColumns.map((column) => column.name);
  const currentViewState = normalizeViewState(buildSaveableListState({
    activeSort,
    filters: filterDraft,
    columns: columns.map((column) => column.name),
    group: groupField,
    viewMode,
    density,
  }), defaultColumnNames, defaultViewMode ?? "list");
  const baselineViewId = displayActiveSavedViewId ?? firstParamValue(rawSearchParams[P.BASE_VIEW_ID]) ?? null;
  const baselineView = baselineViewId ? localViews.find((view) => view.id === baselineViewId) ?? null : null;
  const baselineState = baselineView
    ? normalizeSavedViewState(baselineView, defaultColumnNames, defaultViewMode ?? "list")
    : buildSystemViewState(defaultColumnNames, defaultViewMode ?? "list");
  const changeSummary = buildChangeSummary({
    baseline: baselineState,
    current:  currentViewState,
    filterableFields,
    allColumns,
  });
  const saveTabVisible = Boolean(savedViewsApiHref) && changeSummary.changeCount > 0;
  const renderedActiveTab: SavedViewsTab = saveTabVisible ? activeTab : "available";
  const baselineLabel = baselineView?.name ?? "System view";
  const defaults = {
    columns:  defaultColumnNames,
    viewMode: defaultViewMode ?? "list",
  };

  const togglePanel = () => {
    if (!panel.open) {
      setActiveTab(saveTabVisible && !baselineView ? "save" : "available");
    }
    panel.toggle();
  };

  const applyView = (id: string, options: { close: boolean } = { close: true }) => {
    setOptimisticActiveViewId(id);
    router.push(serializeOrganizeState(listBaseHref, rawSearchParams, {
      ...buildDefaultViewOverrides(rawSearchParams),
      [P.VIEW_ID]: id,
    }));
    if (options.close) panel.close();
  };

  const closePanel = () => {
    setDeleteTarget(null);
    panel.close();
  };

  const useSystemView = (options: { close: boolean } = { close: true }) => {
    setOptimisticActiveViewId(null);
    router.push(serializeOrganizeState(listBaseHref, rawSearchParams, {
      ...buildDefaultViewOverrides(rawSearchParams),
      [P.VIEW_ID]: SYSTEM_VIEW_ID,
    }));
    if (options.close) panel.close();
  };

  const resetChange = (reset: ChangeReset) => {
    router.push(serializeOrganizeState(
      listBaseHref,
      rawSearchParams,
      buildResetOverrides(reset, currentViewState, baselineState, defaults),
    ));
  };

  const setDefaultView = async (view: SavedView) => {
    if (!savedViewsApiHref || normalizeScope(view) === "system") return;
    setDefaultingViewId(view.id);
    setDefaultError(null);
    try {
      await writeDefaultView(savedViewsApiHref, entityCode, view.id);
      setLocalViews((prev) => markDefaultView(prev, view.id));
      applyView(view.id, { close: false });
    } catch (defaultViewError) {
      setDefaultError(defaultViewError instanceof Error ? defaultViewError.message : "Could not set this default view.");
    } finally {
      setDefaultingViewId(null);
    }
  };

  const makeSystemDefault = async () => {
    if (!savedViewsApiHref || !defaultView) return;
    setClearingDefault(true);
    setDefaultError(null);
    try {
      const response = await fetch(savedViewDefaultHref(savedViewsApiHref, entityCode), {
        method: "DELETE",
        credentials: "same-origin",
        headers: csrfHeader(),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(readMessage(body) ?? `Default reset returned ${response.status}`);
      }
      setLocalViews((prev) => markDefaultView(prev, null));
      useSystemView({ close: false });
    } catch (clearDefaultError) {
      setDefaultError(clearDefaultError instanceof Error ? clearDefaultError.message : "Could not make the system view your default.");
    } finally {
      setClearingDefault(false);
    }
  };

  const requestDeleteView = (view: SavedView) => {
    if (!savedViewsApiHref || !view.can_delete || normalizeScope(view) === "system") return;
    setDeleteError(null);
    setDeleteTarget(view);
  };

  const deleteView = async () => {
    const view = deleteTarget;
    if (!view || !savedViewsApiHref || normalizeScope(view) === "system") return;
    setDeletingViewId(view.id);
    setDeleteError(null);
    try {
      const response = await fetch(savedViewResourceHref(savedViewsApiHref, entityCode, view.id), {
        method: "DELETE",
        credentials: "same-origin",
        headers: csrfHeader(),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(readMessage(body) ?? `Delete returned ${response.status}`);
      }

      setLocalViews((prev) => prev.filter((item) => item.id !== view.id));
      setDeleteTarget(null);
      if (activeSavedViewId === view.id) {
        router.push(serializeOrganizeState(listBaseHref, rawSearchParams, buildDefaultViewOverrides(rawSearchParams)));
        panel.close();
      }
    } catch (deleteViewError) {
      setDeleteError(deleteViewError instanceof Error ? deleteViewError.message : "Could not delete this view.");
    } finally {
      setDeletingViewId(null);
    }
  };

  const saveCurrentView = async () => {
    const trimmedName = name.trim();
    if (!trimmedName || !savedViewsApiHref) return;
    setSaving(true);
    setError(null);
    const state: SaveableListState = buildSaveableListState({
      activeSort,
      filters: filterDraft,
      columns: columns.map((column) => column.name),
      group: groupField,
      viewMode,
      density,
    });
    const config = {
      _v: 1,
      entity: entityCode,
      surface: `${entityCode}.list`,
      ...state,
    };

    try {
      const response = await fetch(savedViewsApiHref, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          ...csrfHeader(),
        },
        body: JSON.stringify({
          entityCode,
          entity_code: entityCode,
          name: trimmedName,
          scope: saveScope,
          is_default: false,
          is_shared: saveScope === "shared",
          state,
          config,
        }),
      });
      const body = await response.json().catch(() => null) as Partial<SavedView> | null;
      if (!response.ok || !body?.id || !body.name) {
        throw new Error(readMessage(body) ?? `Save returned ${response.status}`);
      }
      let saved: SavedView = {
        id:         body.id,
        name:       body.name,
        is_default: body.is_default,
        is_shared:  body.is_shared ?? saveScope === "shared",
        can_delete: body.can_delete ?? true,
        scope:      body.scope ?? (body.is_shared ?? saveScope === "shared" ? "shared" : "private"),
        created_at: body.created_at,
        updated_at: body.updated_at,
        owner_name: body.owner_name,
        state,
        config:     body.config ?? config,
      };
      setLocalViews((prev) => {
        const nextViews = [
          saved,
          ...prev.filter((view) => view.id !== saved.id),
        ];
        return nextViews;
      });
      setName("");
      router.push(serializeOrganizeState(listBaseHref, rawSearchParams, {
        ...buildDefaultViewOverrides(rawSearchParams),
        [P.VIEW_ID]: saved.id,
      }));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save this view.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PaletteButton
        ref={buttonRef}
        icon={Bookmark}
        label="Saved views"
        active={Boolean(activeSavedViewId)}
        dirty={changeSummary.changeCount > 0}
        expanded={panel.open}
        size={buttonSize}
        onClick={togglePanel}
      />
      {panel.open && (
        <PaletteDrawer anchorRef={buttonRef} title="Saved Views" icon={Bookmark} onClose={closePanel}>
          <div className="flex flex-col gap-4">
            {saveTabVisible && (
              <div
                role="tablist"
                aria-label="Saved view options"
                className="grid grid-cols-2 rounded-md border bg-muted/30 p-1"
              >
                <SavedViewTabButton
                  active={renderedActiveTab === "available"}
                  icon={Bookmark}
                  label="Available Views"
                  onClick={() => setActiveTab("available")}
                />
                <SavedViewTabButton
                  active={renderedActiveTab === "save"}
                  icon={Save}
                  label="Save Current View"
                  onClick={() => setActiveTab("save")}
                />
              </div>
            )}

            {renderedActiveTab === "available" ? (
              <section className="space-y-2">
                <h3 className="text-sm font-medium text-foreground">Available views</h3>

                <div className="overflow-hidden rounded-md border bg-background">
                  <SystemViewRow
                    active={systemViewActive}
                    isDefault={!defaultView}
                    disabled={!canApplySystemView}
                    settingDefault={clearingDefault}
                    canSetDefault={Boolean(savedViewsApiHref)}
                    onSelect={useSystemView}
                    onSetDefault={() => void makeSystemDefault()}
                  />
                  {localViews.map((view) => (
                    <SavedViewRow
                      key={view.id}
                      view={view}
                      active={displayActiveSavedViewId === view.id}
                      first={false}
                      deleting={deletingViewId === view.id}
                      settingDefault={defaultingViewId === view.id}
                      canSetDefault={Boolean(savedViewsApiHref) && normalizeScope(view) !== "system"}
                      canDelete={Boolean(savedViewsApiHref) && Boolean(view.can_delete)}
                      onSelect={() => applyView(view.id)}
                      onSetDefault={() => void setDefaultView(view)}
                      onDelete={() => requestDeleteView(view)}
                    />
                  ))}
                </div>
                {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
                {defaultError && <p className="text-sm text-destructive">{defaultError}</p>}
              </section>
            ) : (
              <form className="space-y-4" onSubmit={(event) => {
                event.preventDefault();
                void saveCurrentView();
              }}>
                <div>
                  <h3 className="text-sm font-medium text-foreground">Save this view</h3>
                </div>

                <ChangeReview
                  summary={changeSummary}
                  baselineLabel={baselineLabel}
                  onResetChange={resetChange}
                />

                <label className="block space-y-1.5">
                  <span className={ORGANIZE_SECTION_LABEL_CLASS}>View name</span>
                  <input
                    type="text"
                    value={name}
                    placeholder="e.g. Active liabilities"
                    onChange={(event) => setName(event.currentTarget.value)}
                    className={ORGANIZE_INPUT_CLASS}
                  />
                </label>

                <div className="space-y-1.5">
                  <span className={ORGANIZE_SECTION_LABEL_CLASS}>Scope</span>
                  <div className="grid grid-cols-2 overflow-hidden rounded-md border bg-background">
                    <ScopeButton
                      active={saveScope === "private"}
                      icon={Lock}
                      label="Private"
                      onClick={() => setSaveScope("private")}
                    />
                    <ScopeButton
                      active={saveScope === "shared"}
                      icon={Users}
                      label="Shared"
                      onClick={() => setSaveScope("shared")}
                    />
                  </div>
                </div>

                {error && <p className="text-sm text-destructive">{error}</p>}

                <button
                  type="submit"
                  disabled={saving || !name.trim() || changeSummary.changeCount === 0}
                  className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md bg-foreground px-3 text-sm font-medium text-background transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Save aria-hidden="true" className="size-4" />
                  {saving ? "Saving..." : "Save View"}
                </button>
              </form>
            )}
            {deleteTarget && (
              <DeleteSavedViewDialog
                view={deleteTarget}
                deleting={deletingViewId === deleteTarget.id}
                onCancel={() => {
                  if (!deletingViewId) setDeleteTarget(null);
                }}
                onConfirm={() => void deleteView()}
              />
            )}
          </div>
        </PaletteDrawer>
      )}
    </>
  );
}

function SavedViewTabButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active:  boolean;
  icon:    typeof Bookmark;
  label:   string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={[
        "inline-flex h-9 min-w-0 items-center justify-center gap-2 rounded px-2 text-sm font-medium transition-colors",
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:bg-background/70 hover:text-foreground",
      ].join(" ")}
    >
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      <span className="min-w-0 truncate">{label}</span>
    </button>
  );
}

function ChangeReview({
  summary,
  baselineLabel,
  onResetChange,
}: {
  summary:       ChangeSummary;
  baselineLabel: string;
  onResetChange: (reset: ChangeReset) => void;
}) {
  return (
    <section className="space-y-3 rounded-md border bg-background p-3">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <h4 className="text-sm font-medium text-foreground">Changes</h4>
        <span className="min-w-0 truncate text-xs text-muted-foreground">From {baselineLabel}</span>
      </div>
      <div className="space-y-2">
        {summary.sections.map((section) => (
          <div key={section.key} className="space-y-1.5">
            <div className="flex min-w-0 items-center justify-between gap-2">
              <h5 className="text-xs font-medium text-muted-foreground">{section.label}</h5>
              {section.reset && (
                <button
                  type="button"
                  onClick={() => onResetChange(section.reset!)}
                  aria-label={`Clear all ${section.label.toLowerCase()} changes`}
                  className="inline-flex h-7 shrink-0 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X aria-hidden="true" className="size-3.5" />
                  Clear all
                </button>
              )}
            </div>
            <div className="space-y-1">
              {section.items.map((item, index) => (
                <div
                  key={`${section.key}-${index}-${item.label}`}
                  className="flex min-h-7 min-w-0 items-center gap-2 rounded-md bg-muted/50 px-2 py-1 text-sm text-foreground"
                >
                  <span
                    aria-hidden="true"
                    className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded border bg-background px-1 text-xs font-medium text-muted-foreground"
                  >
                    {changeSymbol(item.kind)}
                  </span>
                  <span className="min-w-0 truncate">{item.label}</span>
                  <button
                    type="button"
                    title="Remove this change"
                    aria-label={`Remove change: ${item.label}`}
                    onClick={() => onResetChange(item.reset)}
                    className="ml-auto inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <X aria-hidden="true" className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function SystemViewRow({
  active,
  isDefault,
  disabled,
  settingDefault,
  canSetDefault,
  onSelect,
  onSetDefault,
}: {
  active:         boolean;
  isDefault:      boolean;
  disabled:       boolean;
  settingDefault: boolean;
  canSetDefault:  boolean;
  onSelect:       () => void;
  onSetDefault:   () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      onClick={() => {
        if (!disabled) onSelect();
      }}
      onKeyDown={(event) => {
        if (disabled) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      className={[
        "flex min-h-11 w-full items-center gap-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "bg-muted/70 text-foreground" : "hover:bg-muted/50",
        disabled ? "cursor-default" : "cursor-pointer",
      ].join(" ")}
    >
      <div className="flex min-h-11 min-w-0 flex-1 items-center gap-3 px-3 py-1.5 text-left">
        <span className={[
          "inline-flex size-8 shrink-0 items-center justify-center rounded-md border",
          active ? "border-foreground bg-foreground text-background" : "text-muted-foreground",
        ].join(" ")}>
          <RotateCcw aria-hidden="true" className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-foreground">System view</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <span>System</span>
            {isDefault && <span className="rounded-full border px-1.5 py-0.5">Default</span>}
          </span>
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-1 pr-3">
        {active && <Check aria-hidden="true" className="size-4" />}
        {canSetDefault && (
          <button
            type="button"
            title={isDefault ? "System view is your default" : "Make system view my default"}
            aria-label={isDefault ? "System view is your default view" : "Make system view my default view"}
            aria-pressed={isDefault}
            disabled={settingDefault || isDefault}
            onClick={(event) => {
              event.stopPropagation();
              onSetDefault();
            }}
            onKeyDown={(event) => event.stopPropagation()}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Star
              aria-hidden="true"
              className="size-4"
              fill={isDefault ? "currentColor" : "none"}
            />
          </button>
        )}
        <button
          type="button"
          title="System view cannot be deleted"
          aria-label="System view cannot be deleted"
          disabled
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          className="inline-flex h-8 w-8 cursor-not-allowed items-center justify-center rounded-md text-muted-foreground/40 opacity-60"
        >
          <Trash2 aria-hidden="true" className="size-4" />
        </button>
      </div>
    </div>
  );
}

function SavedViewRow({
  view,
  active,
  first,
  deleting,
  settingDefault,
  canSetDefault,
  canDelete,
  onSelect,
  onSetDefault,
  onDelete,
}: {
  view:      SavedView;
  active:    boolean;
  first:     boolean;
  deleting:  boolean;
  settingDefault: boolean;
  canSetDefault: boolean;
  canDelete: boolean;
  onSelect:  () => void;
  onSetDefault: () => void;
  onDelete:  () => void;
}) {
  const scope = normalizeScope(view);
  const Icon = scope === "system" ? Bookmark : scope === "shared" ? Users : Lock;

  return (
    <div
      role="button"
      tabIndex={deleting ? -1 : 0}
      aria-disabled={deleting}
      onClick={() => {
        if (!deleting) onSelect();
      }}
      onKeyDown={(event) => {
        if (deleting) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      className={[
        "flex min-h-11 w-full cursor-pointer items-center gap-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        first ? "" : "border-t",
        active ? "bg-muted/70 text-foreground" : "hover:bg-muted/50",
        deleting ? "cursor-not-allowed opacity-50" : "",
      ].filter(Boolean).join(" ")}
    >
      <div className="flex min-h-11 min-w-0 flex-1 items-center gap-3 px-3 py-1.5 text-left">
        <span className={[
          "inline-flex size-8 shrink-0 items-center justify-center rounded-md border",
          active ? "border-foreground bg-foreground text-background" : "text-muted-foreground",
        ].join(" ")}>
          <Icon aria-hidden="true" className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-foreground">{view.name}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <span>{scopeLabel(scope)}</span>
            {view.is_default && <span className="rounded-full border px-1.5 py-0.5">Default</span>}
          </span>
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-1 pr-3">
        {active && <Check aria-hidden="true" className="size-4" />}
        {canSetDefault && (
          <button
            type="button"
            title={view.is_default ? `${view.name} is your default` : `Make ${view.name} my default`}
            aria-label={view.is_default ? `${view.name} is your default view` : `Make ${view.name} my default view`}
            aria-pressed={Boolean(view.is_default)}
            disabled={deleting || settingDefault || view.is_default}
            onClick={(event) => {
              event.stopPropagation();
              onSetDefault();
            }}
            onKeyDown={(event) => event.stopPropagation()}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Star
              aria-hidden="true"
              className="size-4"
              fill={view.is_default ? "currentColor" : "none"}
            />
          </button>
        )}
        <button
          type="button"
          title={canDelete ? `Delete ${view.name}` : "Only the owner can delete this view"}
          aria-label={canDelete ? `Delete ${view.name}` : "This view cannot be deleted"}
          disabled={deleting || !canDelete}
          onClick={(event) => {
            event.stopPropagation();
            if (canDelete) onDelete();
          }}
          onKeyDown={(event) => event.stopPropagation()}
          className={[
            "inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            canDelete
              ? "text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              : "cursor-not-allowed text-muted-foreground/40 opacity-60",
          ].join(" ")}
        >
          <Trash2 aria-hidden="true" className="size-4" />
        </button>
      </div>
    </div>
  );
}

function DeleteSavedViewDialog({
  view,
  deleting,
  onCancel,
  onConfirm,
}: {
  view:      SavedView;
  deleting:  boolean;
  onCancel:  () => void;
  onConfirm: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const titleId = `delete-saved-view-title-${view.id}`;
  const descriptionId = `delete-saved-view-description-${view.id}`;

  useEffect(() => {
    cancelRef.current?.focus();

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !deleting) {
        event.preventDefault();
        onCancel();
      }
    };

    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [deleting, onCancel]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Cancel delete saved view"
        disabled={deleting}
        onClick={onCancel}
        className="absolute inset-0 cursor-default bg-foreground/35"
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="relative w-full max-w-sm rounded-md border bg-popover p-4 text-popover-foreground shadow-2xl"
      >
        <h3 id={titleId} className="text-sm font-medium text-foreground">Delete saved view?</h3>
        <p id={descriptionId} className="mt-2 text-sm text-muted-foreground">
          Delete "{view.name}"? This cannot be undone.
        </p>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            disabled={deleting}
            onClick={onCancel}
            className="inline-flex h-9 items-center justify-center rounded-md border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={deleting}
            onClick={onConfirm}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-destructive px-3 text-sm font-medium text-destructive-foreground transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Trash2 aria-hidden="true" className="size-4" />
            {deleting ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ScopeButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active:  boolean;
  icon:    typeof Lock;
  label:   string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={[
        "inline-flex h-9 items-center justify-center gap-2 text-sm font-medium transition-colors",
        active ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground",
      ].join(" ")}
    >
      <Icon aria-hidden="true" className="size-4" />
      {label}
    </button>
  );
}

function normalizeScope(view: Partial<SavedView> | null | undefined): SavedViewScope {
  if (view?.scope === "system") return "system";
  if (view?.scope === "shared" || view?.is_shared) return "shared";
  return "private";
}

function scopeLabel(scope: SavedViewScope): string {
  if (scope === "system") return "System";
  if (scope === "shared") return "Shared view";
  return "Private view";
}

function buildSystemViewState(defaultColumns: string[], defaultViewMode: ViewMode): NormalizedViewState {
  return {
    filters:  {},
    sort:     [],
    columns:  defaultColumns,
    viewMode: defaultViewMode,
    density:  "compact",
  };
}

function normalizeSavedViewState(
  view:            SavedView,
  defaultColumns:  string[],
  defaultViewMode: ViewMode,
): NormalizedViewState {
  return normalizeViewState(view.state ?? view.config, defaultColumns, defaultViewMode);
}

function normalizeViewState(
  state:           SavedViewState | null | undefined,
  defaultColumns:  string[],
  defaultViewMode: ViewMode,
): NormalizedViewState {
  const raw = isPlainRecord(state) ? state : {};
  const columns = uniqueStrings(readStringArray(raw["columns"]));
  return {
    filters:  readFilterState(raw["filters"]),
    sort:     readSortEntries(raw["sort"]),
    columns:  columns.length > 0 ? columns : defaultColumns,
    group:    readOptionalString(raw["group"]),
    viewMode: isViewMode(raw["viewMode"]) ? raw["viewMode"] : defaultViewMode,
    density:  isViewDensity(raw["density"]) ? raw["density"] : "compact",
  };
}

function buildChangeSummary({
  baseline,
  current,
  filterableFields,
  allColumns,
}: {
  baseline:         NormalizedViewState;
  current:          NormalizedViewState;
  filterableFields: RuntimeField[];
  allColumns:       ResolvedColumn[];
}): ChangeSummary {
  const fieldLabels = buildFieldLabelMap(filterableFields, allColumns);
  const filterFieldByName = new Map(filterableFields.map((field) => [field.name, field]));
  const sections: ChangeSection[] = [];

  const filterItems = buildFilterChangeItems(baseline.filters, current.filters, fieldLabels, filterFieldByName);
  if (filterItems.length > 0) {
    sections.push({ key: "filters", label: "Filters", items: filterItems, reset: { type: "filters" } });
  }

  const groupItems = buildSingleFieldChange(baseline.group, current.group, fieldLabels);
  if (groupItems.length > 0) {
    sections.push({ key: "group", label: "Group", items: groupItems, reset: { type: "group" } });
  }

  const sortItems = buildSortChangeItems(baseline.sort, current.sort, fieldLabels);
  if (sortItems.length > 0) {
    sections.push({ key: "sort", label: "Sort", items: sortItems, reset: { type: "sort", action: "reset" } });
  }

  const columnItems = buildColumnChangeItems(baseline.columns, current.columns, fieldLabels);
  if (columnItems.length > 0) {
    sections.push({ key: "columns", label: "Columns", items: columnItems, reset: { type: "columns", action: "reset" } });
  }

  if (baseline.density !== current.density) {
    sections.push({
      key:   "density",
      label: "Density",
      reset: { type: "density" },
      items: [{
        kind:  "changed",
        label: `${densityLabel(baseline.density)} -> ${densityLabel(current.density)}`,
        reset: { type: "density" },
      }],
    });
  }

  if (baseline.viewMode !== current.viewMode) {
    sections.push({
      key:   "view",
      label: "View",
      reset: { type: "viewMode" },
      items: [{
        kind:  "changed",
        label: `${viewModeLabel(baseline.viewMode)} -> ${viewModeLabel(current.viewMode)}`,
        reset: { type: "viewMode" },
      }],
    });
  }

  return {
    sections,
    changeCount: sections.reduce((count, section) => count + section.items.length, 0),
  };
}

function buildFilterChangeItems(
  baseline:          Record<string, string[]>,
  current:           Record<string, string[]>,
  fieldLabels:       Map<string, string>,
  filterFieldByName: Map<string, RuntimeField>,
): ChangeItem[] {
  const items: ChangeItem[] = [];
  const fieldNames = uniqueStrings([...Object.keys(baseline), ...Object.keys(current)])
    .sort((a, b) => fieldLabel(a, fieldLabels).localeCompare(fieldLabel(b, fieldLabels)));

  for (const fieldName of fieldNames) {
    const before = uniqueStrings(baseline[fieldName] ?? []);
    const after = uniqueStrings(current[fieldName] ?? []);
    const beforeSet = new Set(before);
    const afterSet = new Set(after);
    const runtimeField = filterFieldByName.get(fieldName);
    const label = fieldLabel(fieldName, fieldLabels);

    for (const value of after) {
      if (!beforeSet.has(value)) {
        items.push({
          kind:  "added",
          label: `${label}: ${formatFilterValue(runtimeField, value)}`,
          reset: { type: "filter", field: fieldName, value, action: "remove" },
        });
      }
    }
    for (const value of before) {
      if (!afterSet.has(value)) {
        items.push({
          kind:  "removed",
          label: `${label}: ${formatFilterValue(runtimeField, value)}`,
          reset: { type: "filter", field: fieldName, value, action: "add" },
        });
      }
    }
  }

  return items;
}

function buildSingleFieldChange(
  baseline:    string | undefined,
  current:     string | undefined,
  fieldLabels: Map<string, string>,
): ChangeItem[] {
  if (baseline === current) return [];
  if (!baseline && current) return [{ kind: "added", label: fieldLabel(current, fieldLabels), reset: { type: "group" } }];
  if (baseline && !current) return [{ kind: "removed", label: fieldLabel(baseline, fieldLabels), reset: { type: "group" } }];
  if (baseline && current) {
    return [{
      kind:  "changed",
      label: `${fieldLabel(baseline, fieldLabels)} -> ${fieldLabel(current, fieldLabels)}`,
      reset: { type: "group" },
    }];
  }
  return [];
}

function buildSortChangeItems(
  baseline:    SortEntry[],
  current:     SortEntry[],
  fieldLabels: Map<string, string>,
): ChangeItem[] {
  if (sortEntriesEqual(baseline, current)) return [];
  const items: ChangeItem[] = [];
  const beforeKeys = new Set(baseline.map(sortEntryKey));
  const afterKeys = new Set(current.map(sortEntryKey));

  for (const entry of current) {
    if (!beforeKeys.has(sortEntryKey(entry))) {
      items.push({
        kind:  "added",
        label: formatSortEntry(entry, fieldLabels),
        reset: { type: "sort", entry, action: "remove" },
      });
    }
  }
  for (const entry of baseline) {
    if (!afterKeys.has(sortEntryKey(entry))) {
      items.push({
        kind:  "removed",
        label: formatSortEntry(entry, fieldLabels),
        reset: { type: "sort", entry, action: "restore" },
      });
    }
  }

  if (items.length === 0) {
    items.push({
      kind:  "changed",
      label: `${formatSortList(baseline, fieldLabels)} -> ${formatSortList(current, fieldLabels)}`,
      reset: { type: "sort", action: "reset" },
    });
  }

  return items;
}

function buildColumnChangeItems(
  baseline:    string[],
  current:     string[],
  fieldLabels: Map<string, string>,
): ChangeItem[] {
  if (stringArraysEqual(baseline, current)) return [];
  const items: ChangeItem[] = [];
  const beforeSet = new Set(baseline);
  const afterSet = new Set(current);

  for (const name of current) {
    if (!beforeSet.has(name)) {
      items.push({
        kind:  "added",
        label: fieldLabel(name, fieldLabels),
        reset: { type: "columns", column: name, action: "remove" },
      });
    }
  }
  for (const name of baseline) {
    if (!afterSet.has(name)) {
      items.push({
        kind:  "removed",
        label: fieldLabel(name, fieldLabels),
        reset: { type: "columns", column: name, action: "restore" },
      });
    }
  }

  if (items.length === 0) {
    items.push({ kind: "changed", label: "Column order changed", reset: { type: "columns", action: "reset" } });
  }

  return items;
}

function buildFieldLabelMap(
  filterableFields: RuntimeField[],
  allColumns:       ResolvedColumn[],
): Map<string, string> {
  const labels = new Map<string, string>();
  for (const column of allColumns) labels.set(column.name, column.label);
  for (const field of filterableFields) labels.set(field.name, field.label);
  return labels;
}

function formatFilterValue(field: RuntimeField | undefined, value: string): string {
  const directLabel = field?.filter?.valueLabelMap?.[value] ??
    field?.options?.find((option) => option.value === value)?.label;
  return directLabel ?? describeFilterParamValue(value);
}

function formatSortEntry(entry: SortEntry, fieldLabels: Map<string, string>): string {
  return `${fieldLabel(entry.key, fieldLabels)} ${entry.dir === "desc" ? "descending" : "ascending"}`;
}

function formatSortList(entries: SortEntry[], fieldLabels: Map<string, string>): string {
  return entries.length > 0
    ? entries.map((entry) => formatSortEntry(entry, fieldLabels)).join(", ")
    : "None";
}

function fieldLabel(name: string, fieldLabels: Map<string, string>): string {
  return fieldLabels.get(name) ?? humanizeFieldName(name);
}

function humanizeFieldName(name: string): string {
  return name
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function densityLabel(value: ViewDensity): string {
  if (value === "compact") return "Compact";
  if (value === "spacious") return "Spacious";
  return "Comfortable";
}

function viewModeLabel(value: ViewMode): string {
  if (value === "compact") return "Compact";
  if (value === "board") return "Board";
  if (value === "dashboard") return "Dashboard";
  if (value === "excel") return "Excel";
  return "List";
}

function changeSymbol(kind: ChangeItem["kind"]): string {
  if (kind === "added") return "+";
  if (kind === "removed") return "-";
  return "->";
}

function readFilterState(value: unknown): Record<string, string[]> {
  if (!isPlainRecord(value)) return {};
  const filters: Record<string, string[]> = {};
  for (const [fieldName, rawValues] of Object.entries(value)) {
    if (!fieldName.trim()) continue;
    const values = uniqueStrings(Array.isArray(rawValues)
      ? rawValues.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : typeof rawValues === "string" && rawValues.trim()
        ? [rawValues.trim()]
        : []);
    if (values.length > 0) filters[fieldName] = values;
  }
  return filters;
}

function readSortEntries(value: unknown): SortEntry[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const entries: SortEntry[] = [];
  for (const item of value) {
    if (!isPlainRecord(item)) continue;
    const key = readOptionalString(item["key"]);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    entries.push({
      key,
      dir: item["dir"] === "desc" ? "desc" : "asc",
    });
  }
  return entries;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim());
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

function sortEntryKey(entry: SortEntry): string {
  return `${entry.key}:${entry.dir}`;
}

function sortEntriesEqual(a: SortEntry[], b: SortEntry[]): boolean {
  return stringArraysEqual(a.map(sortEntryKey), b.map(sortEntryKey));
}

function stringArraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
}

function isViewMode(value: unknown): value is ViewMode {
  return value === "list" || value === "compact" || value === "board" || value === "dashboard" || value === "excel";
}

function isViewDensity(value: unknown): value is ViewDensity {
  return value === "compact" || value === "comfortable" || value === "spacious";
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function buildResetOverrides(
  reset:    ChangeReset,
  current:  NormalizedViewState,
  baseline: NormalizedViewState,
  defaults: { columns: string[]; viewMode: ViewMode },
): Record<string, string | null> {
  if (reset.type === "filters") {
    const fieldNames = uniqueStrings([...Object.keys(current.filters), ...Object.keys(baseline.filters)]);
    return Object.fromEntries(fieldNames.map((field) => {
      const values = baseline.filters[field] ?? [];
      return [`${P.FILTER_PFX}${field}`, values.length > 0 ? values.join(",") : null];
    }));
  }

  if (reset.type === "filter") {
    const currentValues = current.filters[reset.field] ?? [];
    const nextValues = reset.action === "remove"
      ? currentValues.filter((value) => value !== reset.value)
      : uniqueStrings([...currentValues, reset.value]);
    return { [`${P.FILTER_PFX}${reset.field}`]: nextValues.length > 0 ? nextValues.join(",") : null };
  }

  if (reset.type === "group") {
    return { [P.GROUP]: baseline.group ?? null };
  }

  if (reset.type === "sort") {
    const nextSort = reset.action === "remove" && reset.entry
      ? current.sort.filter((entry) => sortEntryKey(entry) !== sortEntryKey(reset.entry!))
      : baseline.sort;
    return { [P.SORT]: sortEntriesToParam(nextSort) };
  }

  if (reset.type === "columns") {
    const nextColumns = reset.action === "remove" && reset.column
      ? current.columns.filter((name) => name !== reset.column)
      : reset.action === "restore" && reset.column
        ? restoreColumnOrder(current.columns, baseline.columns, reset.column)
        : baseline.columns;
    return { [P.COLUMNS]: columnsParamValue(nextColumns, defaults.columns) };
  }

  if (reset.type === "density") {
    return { [P.DENSITY]: baseline.density === "compact" ? null : baseline.density };
  }

  return {
    [P.VIEW_MODE]: baseline.viewMode === defaults.viewMode ? null : baseline.viewMode,
  };
}

function restoreColumnOrder(current: string[], baseline: string[], column: string): string[] {
  if (current.includes(column)) return current;
  const baselineIndex = baseline.indexOf(column);
  if (baselineIndex < 0) return [...current, column];

  const next = [...current];
  const insertBefore = baseline.slice(baselineIndex + 1).find((name) => next.includes(name));
  if (!insertBefore) return [...next, column];
  next.splice(next.indexOf(insertBefore), 0, column);
  return next;
}

function columnsParamValue(columns: string[], defaultColumns: string[]): string | null {
  return stringArraysEqual(columns, defaultColumns) ? null : columns.join(",");
}

function savedViewResourceHref(baseHref: string, entityCode: string, viewId: string): string {
  return `${baseHref.replace(/\/$/, "")}/${encodeURIComponent(entityCode)}/${encodeURIComponent(viewId)}`;
}

function savedViewDefaultHref(baseHref: string, entityCode: string): string {
  return `${baseHref.replace(/\/$/, "")}/${encodeURIComponent(entityCode)}/default`;
}

async function writeDefaultView(baseHref: string, entityCode: string, viewId: string): Promise<void> {
  const response = await fetch(`${savedViewResourceHref(baseHref, entityCode, viewId)}/default`, {
    method: "PATCH",
    credentials: "same-origin",
    headers: csrfHeader(),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(readMessage(body) ?? `Default update returned ${response.status}`);
  }
}

function markDefaultView(views: SavedView[], viewId: string | null): SavedView[] {
  return views.map((view) => ({ ...view, is_default: viewId === view.id }));
}

const SYSTEM_VIEW_ID = "system";

const DEFAULT_VIEW_PARAMS = [
  P.SORT,
  P.GROUP,
  P.VIEW_MODE,
  P.COLUMNS,
  P.DENSITY,
  P.FACETS,
  P.PINNED,
  P.VIEW_ID,
  P.BASE_VIEW_ID,
] as const;

function buildDefaultViewOverrides(
  rawSearchParams: Record<string, string | string[] | undefined>,
): Record<string, string | null> {
  const overrides: Record<string, string | null> = {};
  for (const param of DEFAULT_VIEW_PARAMS) overrides[param] = null;
  for (const key of Object.keys(rawSearchParams)) {
    if (key.startsWith(P.FILTER_PFX)) overrides[key] = null;
  }
  return overrides;
}

function hasResettableViewState(
  rawSearchParams:   Record<string, string | string[] | undefined>,
  activeSavedViewId: string | null,
): boolean {
  if (activeSavedViewId) return true;
  return Object.entries(rawSearchParams).some(([key, value]) => (
    (DEFAULT_VIEW_PARAMS.includes(key as typeof DEFAULT_VIEW_PARAMS[number]) || key.startsWith(P.FILTER_PFX)) &&
    hasParamValue(value)
  ));
}

function hasParamValue(value: string | string[] | undefined): boolean {
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === "string" && first.trim().length > 0;
}

function firstParamValue(value: string | string[] | undefined): string | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === "string" && first.trim() ? first.trim() : undefined;
}

function readMessage(value: unknown): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record["message"] === "string") return record["message"];
  if (typeof record["error"] === "string") return record["error"];
  return undefined;
}

function csrfHeader(): Record<string, string> {
  const token = getCsrfToken();
  return token ? { "X-CSRF-Token": token } : {};
}

function getCsrfToken(): string {
  if (typeof document === "undefined") return "";
  for (const cookieName of ["__csrf", "__mesh_csrf", "__admin_csrf"]) {
    const token = readCookie(cookieName);
    if (token) return token;
  }
  return "";
}

function readCookie(cookieName: string): string {
  const escapedName = cookieName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${escapedName}=([^;]+)`));
  if (!match) return "";
  try {
    return decodeURIComponent(match[1] ?? "");
  } catch {
    return match[1] ?? "";
  }
}
