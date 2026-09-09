"use client";
import { useAtlasBusinessContextPublisher } from "@athyper/platform-shell";
import { AppliedFilters, type AppliedFilterChip } from "./applied-filters";
import { useDirectoryFilters, DirectoryFilterEditor, ScopeQuickFilters, scopeFilterReady, type DirectorySelection } from "./directory-filters";
export { DirectoryFilterContext, type DirectoryFilterAdapter } from "./directory-filters";
import { FilterChoiceLoader, FilterValueEditor, filterValidationError, recentFilterKey, rememberFilters } from "./filter-editor";
import { LIST_DRAWERS, ListDrawerHost, listDrawer, type ListDrawerKey } from "./drawer-registry";
import { StickyListTable } from "./sticky-table";
import { EntityNavigation, EntityNavigationSkeleton } from "./navigation";
import { EntityOverviewRuntime } from "./overview";
export { EntityOverview, type EntityOverviewProps } from "./overview";
import { useOptionalI18n } from "@athyper/platform-i18n/react";
import { resolveEntityText } from "@athyper/contract-platform-entity-list";


import { ENTITY_LIST_MAX_VISIBLE_COLUMNS, type EntityViewCatalog, type EntityApplicationDescriptorV1, type EntityListDescriptorV1, type EntityListResultV1, type EntityListRowV1, type EntityListScopeCoordinateV1, type JsonValue, type ListFieldDescriptorV1, type ListFilterOperator, type ListFilterV1, type ListLocationStateV1, type ListSortV1 } from "@athyper/contract-platform-entity-list";
import { addRecordBookmarksOperation, ApiTransportError, entityViewsOperation, entityViewCommandOperation, entityApplicationDescriptorOperation, entityListDescriptorOperation, entityListOperation, entityListQuery, entityListScopeQuery, recordBookmarkMembershipOperation, removeRecordBookmarksOperation, type HttpClient, type RecordBookmarkMutationV1 } from "@athyper/platform-api-client";
import { resolveIcon, ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon, Building2Icon, CheckIcon, ChevronDownIcon, CloseIcon, ColumnsIcon, CopyIcon, DownloadIcon, EyeIcon, FilterIcon, GripVerticalIcon, GroupIcon, LayoutIcon, LinkIcon, MoreVerticalIcon, RefreshCwIcon, ResetIcon, SearchIcon, SlidersHorizontalIcon, SortIcon, StarIcon, TrashIcon } from "@athyper/platform-icons";
import { PageFrame, PageHeader, ManagementWorkspace, ManagementToolbar, useEntityBreadcrumbBinding } from "@athyper/platform-shell";
import { Badge, Button, Card, Checkbox, Dialog, DialogClose, DialogContent, Drawer, Input, Label, Menu, MenuContent, MenuItem, MenuTrigger, Select, Skeleton } from "@athyper/platform-ui";
import { createPortal } from "react-dom";
import React, { createContext, useContext, useCallback, useEffect, useId, useRef, useState, type DragEvent as ReactDragEvent, type FormEvent, type ReactNode } from "react";
import { clearDisplayPreferences, readDisplayPreferences, readSavedViews, saveableViewState, savedViewStorageKey, writeDisplayPreferences, writeSavedViews, type DisplayPreferences, type SavedListView } from "./preferences";
import { describeFilter, filterInputValue, filterValueFromInput, nextPrimarySort, visibleListFields, withoutNavigation } from "./state";
import { DataOperationsControl, hasVisibleDataOperations, type DataOperationLaunch } from "./data-operations";
import { fieldTypeLabel, groupAvailableColumns, matchesColumnSearch, reorderColumn } from "./columns";
import { FieldCataloguePicker, FieldSearchInput, SearchableFieldSelect } from "./field-catalogue";
import { portableListHref, readListLocation, writeListLocation } from "./location";

interface EntityListPageAction {
  readonly key: string;
  readonly href?: string;
  readonly disabled?: boolean;
  readonly reason?: string;
  readonly label: string;
  readonly variant?: "primary" | "secondary";
}

interface EntityApplicationContextValue { readonly client: HttpClient; readonly descriptor: EntityApplicationDescriptorV1; readonly scopeCoordinate?: EntityListScopeCoordinateV1; readonly scopeControl?: ReactNode; }
const EntityApplicationContext = createContext<EntityApplicationContextValue | undefined>(undefined);
export const useEntityApplication = () => useContext(EntityApplicationContext);
export function EntityApplicationSection({sectionKey, initialDensity}: {readonly sectionKey?: string; readonly initialDensity?: EntityListRuntimeProps["initialDensity"]}) {
  const app = useEntityApplication();
  if (!app) return null;
  const key = sectionKey ?? app.descriptor.application?.defaultSectionKey;
  const section = app.descriptor.navigation?.find(item => item.key === key);
  if (!section?.content) return <div role="status">This section is unavailable.</div>;
  if(section.content.kind === "overview") return <EntityOverviewRuntime client={app.client} application={app.descriptor} scopeCoordinate={app.scopeCoordinate}/>;
  if(section.content.kind === "entity_list" || section.content.kind === "task_list") return <EntityListRuntime key={`${app.descriptor.application?.key}:${section.key}:${section.content.entityCode}`} client={app.client} entityCode={section.content.entityCode!} scopeCoordinate={app.scopeCoordinate} scopeControl={app.scopeControl} contentOnly viewNamespace={`${app.descriptor.application?.key}.${section.key}.${section.content.entityCode}`} initialDensity={initialDensity}/>;
  return <div role="status">This section is unavailable.</div>;
}

export interface EntityListRuntimeProps {
  readonly client: HttpClient;
  readonly entityCode: string;
  readonly scopeCoordinate?: EntityListScopeCoordinateV1;
  readonly scopeControl?: ReactNode;
  readonly scopePending?: boolean;
  readonly navigationOnly?: boolean;
  readonly applicationOnly?: boolean;
  readonly contentOnly?: boolean;
  readonly viewNamespace?: string;
  readonly children?: ReactNode;
  readonly activePath?: string;
  readonly onNavigate?: (href:string)=>void;
  readonly initialDensity?: "compact" | "comfortable" | "spacious";
}

export function EntityListRuntime(props:EntityListRuntimeProps) {
  return props.applicationOnly ? <EntityApplicationRuntime {...props}/> : <EntityCollectionRuntime {...props}/>;
}
function EntityApplicationRuntime({client,entityCode,scopeCoordinate,scopeControl,scopePending=false,children,onNavigate,activePath}:EntityListRuntimeProps) {
  const locale=useOptionalI18n()?.localization.uiLocale;
  const [descriptor,setDescriptor]=useState<EntityApplicationDescriptorV1>();
  const [error,setError]=useState<ApiTransportError>();
  const [attempt,setAttempt]=useState(0),[loadedKey,setLoadedKey]=useState<string>();
  const authorityKey=`${entityCode}:${JSON.stringify(scopeCoordinate??{})}`;
  useEntityBreadcrumbBinding(!scopePending && loadedKey===authorityKey && descriptor?.application ? {basePath:descriptor.application.basePath,sections:(descriptor.navigation??[]).map(section=>({href:section.href,aliases:section.aliases,label:resolveEntityText(section.label,locale)}))}:undefined);
  useEffect(()=>{const controller=new AbortController();setDescriptor(undefined);setLoadedKey(undefined);setError(undefined);if(scopePending)return()=>controller.abort();client.request(entityApplicationDescriptorOperation,{params:{entityCode},query:entityListScopeQuery(scopeCoordinate),signal:controller.signal}).then(value=>{if(!controller.signal.aborted){setDescriptor(value);setLoadedKey(authorityKey);}}).catch(cause=>{if(!controller.signal.aborted)setError(asTransportError(cause));});return()=>controller.abort();},[client,authorityKey,scopePending,attempt]);
  if(scopePending || !descriptor || loadedKey!==authorityKey)return <>{error && !scopeCoordinate ? <PageFrame width="wide">{scopeControl}</PageFrame> : null}<ListFrame title="Loading application" headerOnly loading={!error} error={error} retry={()=>setAttempt(value=>value+1)}/></>;
  const header=descriptor.surface.header,Icon=header?.iconKey?resolveIcon(header.iconKey):LayoutIcon;
  const title=header?resolveEntityText(header.title,locale):descriptor.surface.title,description=header?.description?resolveEntityText(header.description,locale):descriptor.surface.description;
  const actions=descriptor.actions.filter(action=>(action.placement==="primary"||action.placement==="secondary")&&action.state!=="hidden"&&action.execution==="navigate"&&action.selection==="none");
  return <EntityApplicationContext.Provider value={{client,descriptor,scopeCoordinate,scopeControl}}><ManagementWorkspace className="a-entity-application" header={<PageHeader level="collection" title={title} description={description} icon={<Icon/>} actions={actions.length?<>{actions.map(action=>{const label=action.localizedLabel?resolveEntityText(action.localizedLabel,locale):action.label;return action.state==="enabled"&&action.href?<a key={action.key} className={`a-button a-button--${action.placement}`} href={action.href} onClick={event=>{if(onNavigate&&event.button===0&&!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&!event.altKey){event.preventDefault();onNavigate(action.href!);}}}>{label}</a>:<span className="a-entity-list__unavailable-action" key={action.key}><button className={`a-button a-button--${action.placement}`} disabled>{label}</button><small>{action.disabledMessage?resolveEntityText(action.disabledMessage,locale):undefined}</small></span>;})}</>:undefined}/>} navigation={<EntityNavigation sections={descriptor.navigation} onNavigate={onNavigate} activePath={activePath}/>}>{descriptor.scope.status === "context_required" ? scopeControl : children}</ManagementWorkspace></EntityApplicationContext.Provider>;
}

function EntityCollectionRuntime({ client, entityCode, scopeCoordinate, scopeControl, scopePending = false, navigationOnly = false, applicationOnly = false, contentOnly = false, viewNamespace, children, onNavigate, activePath, initialDensity = "comfortable" }: EntityListRuntimeProps) {
  const inherited = useEntityApplication();
  const locale = useOptionalI18n()?.localization.uiLocale;
  const actionReasonId = useId();
  const [descriptor, setDescriptor] = useState<EntityListDescriptorV1>();
  const [state, setState] = useState<ListLocationStateV1>();
  const [page, setPage] = useState<EntityListResultV1>();
  const [pageContextKey,setPageContextKey] = useState<string>();
  const [error, setError] = useState<ApiTransportError>();
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [refreshAttempt, setRefreshAttempt] = useState(0);
  const [cursorHistory, setCursorHistory] = useState<readonly (string | undefined)[]>([]);
  const scopeKey = JSON.stringify(scopeCoordinate ?? {}), authorityKey = `${entityCode}:${scopeKey}`;
  const serverQueryKey = JSON.stringify(state ? { standardViewKey:state.standardViewKey??null, query: state.query ?? null, filters: state.filters, sort: state.sort, group: state.group ?? null, columns: state.columns, cursor: state.cursor ?? null, pageSize: state.pageSize ?? null } : null);
  const previousAuthorityKey = useRef<string | undefined>(undefined);
  const [loadedAuthorityKey, setLoadedAuthorityKey] = useState<string>();
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [allMatchingSelected, setAllMatchingSelected] = useState(false);
  const [dataOperationsLaunch, setDataOperationsLaunch] = useState<DataOperationLaunch>();
  const [actionStatus, setActionStatus] = useState("");
  const [bookmarkedIds, setBookmarkedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [pendingBookmarkIds, setPendingBookmarkIds] = useState<ReadonlySet<string>>(() => new Set());

  useEffect(() => {
    const controller = new AbortController(), authorityChanged = previousAuthorityKey.current !== undefined && previousAuthorityKey.current !== authorityKey;
    setLoading(true); setError(undefined); setDescriptor(undefined); setPage(undefined); setCursorHistory([]); setLoadedAuthorityKey(undefined); setSelectedIds(new Set()); setAllMatchingSelected(false); setDataOperationsLaunch(undefined); setActionStatus(""); setBookmarkedIds(new Set()); setPendingBookmarkIds(new Set());
    if (scopePending) return () => controller.abort();
    previousAuthorityKey.current = authorityKey;
    client.request(entityListDescriptorOperation, { params: { entityCode }, query: entityListScopeQuery(scopeCoordinate), signal: controller.signal }).then(async (raw) => {
      let next = viewNamespace ? {...raw,viewNamespace} : raw;
      if(next.serverViews && next.scope.status=== "ready") {const viewCatalog=await client.request(entityViewsOperation,{params:{entityCode},query:{...entityListScopeQuery(scopeCoordinate),surface:viewNamespace??next.surface.key},signal:controller.signal});next={...next,viewCatalog};}
      if(viewNamespace && inherited?.descriptor.entity.code === entityCode && typeof window !== "undefined") { const newKey=savedViewStorageKey(next), oldKey=savedViewStorageKey(raw); try { if(!window.localStorage.getItem(newKey) && window.localStorage.getItem(oldKey)) window.localStorage.setItem(newKey,window.localStorage.getItem(oldKey)!); } catch { /* Storage is optional. */ } }
      if (controller.signal.aborted) return;
      let nextState = readListLocation(next);
      const requestedView=new URLSearchParams(window.location.search).get("vid")??next.viewCatalog?.personalDefault??next.viewCatalog?.sharedDefault;
      if(requestedView&&requestedView!=="system"&&nextState.savedViewId==="system")setActionStatus("The selected view is unavailable. System default has been applied.");
      const parameters = new URLSearchParams(window.location.search), preferences = readDisplayPreferences(next.plane);
      if (!nextState.savedViewId && !parameters.has("density") && preferences?.density) nextState = { ...nextState, density: preferences.density };
      if (!nextState.savedViewId && !parameters.has("view") && preferences?.mode && next.surface.supportedModes.includes(preferences.mode)) nextState = { ...nextState, mode: preferences.mode };
      if (authorityChanged && (nextState.cursor || nextState.pageIndex)) nextState = withoutNavigation(nextState);
      if (!navigationOnly && !applicationOnly) writeLocation(nextState, next, "replace");
      setDescriptor(next); setState(nextState); setLoadedAuthorityKey(authorityKey);
    }).catch((cause) => { if (!controller.signal.aborted) setError(asTransportError(cause)); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [client, entityCode, scopeKey, attempt, scopePending, navigationOnly, applicationOnly, viewNamespace]);

  useEffect(() => {
    if (navigationOnly || applicationOnly || scopePending || !descriptor || !state || descriptor.scope.status !== "ready" || loadedAuthorityKey !== authorityKey) return;
    const controller = new AbortController(); setLoading(true); setError(undefined);
    client.request(entityListOperation, { params: { entityCode }, query: entityListQuery(state, descriptor, scopeCoordinate), signal: controller.signal }).then((next) => {
      if (controller.signal.aborted) return;
      if (next.descriptorHash !== descriptor.revision.descriptorHash || next.scopeFingerprint !== descriptor.scope.fingerprint) throw new TypeError("List response authority no longer matches its descriptor");
      setPage(next); setPageContextKey(`${authorityKey}:${serverQueryKey}`);
    }).catch((cause) => { if (!controller.signal.aborted) setError(asTransportError(cause)); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [client, descriptor, entityCode, serverQueryKey, scopeKey, loadedAuthorityKey, attempt, refreshAttempt, scopePending, navigationOnly, applicationOnly]);

  const pageIdentityKey = page?.rows.map((row) => row.id).join(",") ?? "";
  useEffect(() => {
    if (!page?.rows.length) { setBookmarkedIds(new Set()); return; }
    const controller = new AbortController();
    client.request(recordBookmarkMembershipOperation, { params: { entityCode }, query: { recordId: page.rows.map((row) => row.id) }, signal: controller.signal })
      .then((ids) => { if (!controller.signal.aborted) { setBookmarkedIds(ids); setPage((current) => current ? ({ ...current, rows: current.rows.map((row) => ({ ...row, decoration: { ...row.decoration, bookmarked: ids.has(row.id) } })) }) : current); } })
      .catch(() => { if (!controller.signal.aborted) setActionStatus("Favourites could not be loaded. List records remain available."); });
    return () => controller.abort();
  }, [client, entityCode, pageIdentityKey]);

  const update = useCallback((next: ListLocationStateV1, history: "replace" | "push" = "replace") => { if (descriptor) { setState(next); writeLocation(next, descriptor, history); } }, [descriptor]);
  useEffect(() => { if (!descriptor) return; const restore = () => { setCursorHistory([]); setState(readListLocation(descriptor)); }; window.addEventListener("popstate", restore); return () => window.removeEventListener("popstate", restore); }, [descriptor]);

  useAtlasBusinessContextPublisher(!navigationOnly && !scopePending && descriptor?.scope.status === "ready" && loadedAuthorityKey === authorityKey && state ? {
    kind:"manage", entityCode, locale:locale??"en", filters:state.filters, search:state.query?.trim() && state.query.trim().length>=descriptor.surface.search.minimumQueryLength?state.query.trim():undefined, sort:state.sort,group:state.group,fields:state.columns.length?state.columns:undefined,
    selectedIds:[...selectedIds], visibleIds:pageContextKey===`${authorityKey}:${serverQueryKey}`?page?.rows.map(row=>row.id)??[]:[], analysisTarget:allMatchingSelected?"filtered_set":selectedIds.size?"selection":"filtered_set",
    pageSize:state.pageSize??descriptor.limits.defaultPageSize,pageIndex:state.pageIndex??0,cursor:state.cursor,standardViewKey:state.standardViewKey,
    directory:scopeCoordinate ? {operatingOrganizationIds:scopeCoordinate.operatingOrganizationIds??(scopeCoordinate.operatingOrganizationId?[scopeCoordinate.operatingOrganizationId]:undefined),companyCodeIds:scopeCoordinate.companyCodeIds??(scopeCoordinate.companyCodeId?[scopeCoordinate.companyCodeId]:undefined),partnerRole:scopeCoordinate.partnerRole,eligibleOperation:scopeCoordinate.eligibleOperation} : undefined,
    workContext:scopeCoordinate && (scopeCoordinate.operatingOrganizationId || scopeCoordinate.companyCodeId || scopeCoordinate.legalEntityId || scopeCoordinate.networkAccountId) ? {operatingOrganizationId:scopeCoordinate.operatingOrganizationId,companyCodeId:scopeCoordinate.companyCodeId,legalEntityId:scopeCoordinate.legalEntityId,networkAccountId:scopeCoordinate.networkAccountId}:undefined,
  }:undefined);

  if (navigationOnly) return scopePending || !descriptor || loadedAuthorityKey !== authorityKey ? (error ? null : <EntityNavigationSkeleton/>) : <EntityNavigation sections={descriptor.navigation}/>;
  if (scopePending || !descriptor || loadedAuthorityKey !== authorityKey) return <ListFrame contentOnly={contentOnly} headerOnly={applicationOnly} density={state?.density ?? initialDensity} title="Loading list" loading={scopePending || loading} error={error} retry={() => setAttempt((value) => value + 1)} />;
  const header = descriptor.surface.header;
  const HeaderIcon = header?.iconKey ? resolveIcon(header.iconKey) : LayoutIcon;
  const title = header ? resolveEntityText(header.title, locale) : descriptor.surface.title;
  const description = header ? (header.description ? resolveEntityText(header.description, locale) : undefined) : descriptor.surface.description;
  const pageActions: readonly EntityListPageAction[] = descriptor.actions.filter(action => action.state !== "hidden" && action.execution === "navigate" && action.selection === "none" && (action.placement === "primary" || action.placement === "secondary") && (action.state === "disabled" || action.href)).map(action => ({ key: action.key, label: action.localizedLabel ? resolveEntityText(action.localizedLabel, locale) : action.label, href: action.state === "enabled" ? action.href : undefined, variant: action.placement === "primary" ? "primary" : "secondary", disabled: action.state === "disabled", reason: action.disabledMessage ? resolveEntityText(action.disabledMessage, locale) : undefined }));
  const headerActions = pageActions.length ? <>{pageActions.map((action) => action.disabled ? <span key={action.key} className="a-entity-list__unavailable-action"><button type="button" className={`a-button a-button--${action.variant ?? "secondary"}`} aria-disabled="true" aria-describedby={`${actionReasonId}-${action.key}`}>{action.label}</button><small id={`${actionReasonId}-${action.key}`}>{action.reason}</small></span> : <a className={`a-button a-button--${action.variant ?? "secondary"}`} href={action.href} key={action.key}>{action.label}</a>)}</> : undefined;
  if (descriptor.scope.status === "context_required") return <PageFrame width="wide" className="a-entity-list">{!contentOnly ? <><PageHeader level="collection" title={title} description={description} icon={<HeaderIcon/>} actions={headerActions}/><EntityNavigation sections={descriptor.navigation} currentSurfaceKey={descriptor.currentSurfaceKey}/></> : null}{scopeControl}<Card className="a-entity-list__state"><Badge tone="warning">Context required</Badge><h2>Select a validated work context</h2><p>This entity is governed by a narrower authorization scope. Rows stay unavailable until the server accepts and applies an explicit work-context coordinate.</p></Card></PageFrame>;
  if (!state) return <ListFrame density={initialDensity} title={title} loading error={error} retry={() => setAttempt((value) => value + 1)} />;
  const fields = visibleListFields(descriptor, state);
  const resetAndUpdate = (patch: Partial<ListLocationStateV1>, history: "replace" | "push" = "replace") => { setCursorHistory([]); update(withoutNavigation({ ...state, ...patch }), history); };
  const selectionEnabled = true;
  const selectedRows = page?.rows.filter((row) => selectedIds.has(row.id)) ?? [];
  const mutateBookmarks = async (operation: "add" | "remove", rows: readonly EntityListRowV1[]) => {
    if (!rows.length || allMatchingSelected) return;
    const ids = rows.map((row) => row.id), previous = new Set(bookmarkedIds), pending = new Set(pendingBookmarkIds);
    for (const id of ids) pending.add(id);
    setPendingBookmarkIds(pending); setBookmarkedIds((current) => { const next = new Set(current); for (const id of ids) operation === "add" ? next.add(id) : next.delete(id); return next; }); setPage((current) => current ? ({ ...current, rows: current.rows.map((row) => ids.includes(row.id) ? ({ ...row, decoration: { ...row.decoration, bookmarked: operation === "add" } }) : row) }) : current);
    const scope = entityListScopeQuery(scopeCoordinate);
    const body: RecordBookmarkMutationV1 = { records: rows.map((row) => ({ id: row.id, label: formatFieldValue(row.values[descriptor.entity.identityField], descriptor.fields.find((field) => field.key === descriptor.entity.identityField)) })), ...scope };
    try {
      await client.request(operation === "add" ? addRecordBookmarksOperation : removeRecordBookmarksOperation, { params: { entityCode }, body, idempotencyKey: `record-bookmark:${operation}:${crypto.randomUUID()}` });
      setActionStatus(`${ids.length} ${ids.length === 1 ? "record" : "records"} ${operation === "add" ? "added to" : "removed from"} favourites.`);
      window.dispatchEvent(new CustomEvent("athyper:record-bookmarks-changed", { detail: { entityCode, operation, recordIds: ids } }));
    } catch (cause) {
      setBookmarkedIds(previous); setPage((current) => current ? ({ ...current, rows: current.rows.map((row) => ids.includes(row.id) ? ({ ...row, decoration: { ...row.decoration, bookmarked: previous.has(row.id) } }) : row) }) : current); setActionStatus(cause instanceof Error ? cause.message : "Favourites could not be updated.");
    } finally { setPendingBookmarkIds((current) => { const next = new Set(current); for (const id of ids) next.delete(id); return next; }); }
  };
  const countLabel = listCountLabel(page);

  return <FilterChoiceLoader.Provider value={async (field) => {
    const result = await client.request(entityListDescriptorOperation, { params: { entityCode }, query: { ...entityListScopeQuery(scopeCoordinate), filterChoiceField: field } });
    setDescriptor(current => current && current.scope.fingerprint === result.scope.fingerprint ? { ...current, fields: current.fields.map(item => item.key === field ? { ...item, filterOptions: result.fields.find(candidate => candidate.key === field)?.filterOptions } : item) } : current);
  }}><PageFrame width="wide" className={`a-entity-list a-entity-list--${state.density}`}>
    {!contentOnly ? <><PageHeader className="a-entity-list__header" level="collection" title={title} description={description} icon={<HeaderIcon/>} metadata={<>{countLabel ? <span aria-live="polite">{countLabel} records</span> : null}</>} actions={headerActions}/>
    <EntityNavigation sections={descriptor.navigation} currentSurfaceKey={descriptor.currentSurfaceKey}/></> : null}
    <div className="a-entity-list__panel">
    <ListChrome client={client} scopeCoordinate={scopeCoordinate} onCatalogChange={(viewCatalog)=>setDescriptor(current=>current?{...current,viewCatalog}:current)} descriptor={descriptor} state={state} page={page} scopeControl={scopeControl} pageActions={pageActions} loading={loading} actionStatus={actionStatus} onActionStatus={setActionStatus} onOpenDataOperations={() => setDataOperationsLaunch("picker")} onRefresh={() => setRefreshAttempt((value) => value + 1)} onChange={resetAndUpdate}/>
    {dataOperationsLaunch ? <DataOperationsControl client={client} descriptor={descriptor} state={state} page={page} selectedRows={selectedRows} scopeCoordinate={scopeCoordinate} activeViewName={readSavedViews(savedViewStorageKey(descriptor), descriptor).find((view) => view.id === state.savedViewId)?.name ?? "Default view"} onStatus={setActionStatus} open launch={dataOperationsLaunch} onOpenChange={(open) => { if (!open) setDataOperationsLaunch(undefined); }}/>: null}
    {error ? <ErrorState error={error} retry={() => setAttempt((value) => value + 1)} compact={Boolean(page)}/> : null}
    {loading && !page ? <LoadingTable columns={fields.length} /> : page ? <>
      <EntityRows key={`${authorityKey}:${state.group ?? ""}`} descriptor={descriptor} page={page} fields={fields} mode={state.mode} filters={state.filters} onFilters={(filters) => resetAndUpdate({ filters }, "push")} sort={state.sort} group={state.group} query={state.query} filtered={state.filters.length > 0} loading={loading} selectionEnabled={selectionEnabled} selectedIds={selectedIds} bookmarkedIds={bookmarkedIds} pendingBookmarkIds={pendingBookmarkIds} onBookmark={(row, favourite) => void mutateBookmarks(favourite ? "add" : "remove", [row])} onSelectionChange={(next) => { setSelectedIds(next); setAllMatchingSelected(false); }} onSort={(field, additive) => resetAndUpdate({ sort: nextSort(state.sort, field, descriptor.limits.maxSortLevels, additive) }, "push")}/>
    </> : null}
    {page ? <ListFooter
        descriptor={descriptor} state={state} page={page} loading={loading} cursorHistory={cursorHistory}
        onPrevious={() => {
          const cursor = cursorHistory.at(-1);
          setCursorHistory(cursorHistory.slice(0, -1));
          update({ ...state, cursor, pageIndex: Math.max(0, (state.pageIndex ?? cursorHistory.length) - 1) }, "push");
        }}
        onNext={() => {
          setCursorHistory([...cursorHistory, state.cursor]);
          update({ ...state, cursor: page.pagination.nextCursor, pageIndex: (state.pageIndex ?? 0) + 1 }, "push");
        }}
        onPageSize={(pageSize) => resetAndUpdate({ pageSize }, "push")}
      /> : loading ? <LoadingFooter/> : null}
    </div>
    {selectionEnabled && selectedIds.size ? <SelectionBar descriptor={descriptor} page={page} selectedRows={selectedRows} bookmarkedIds={bookmarkedIds} selectedCount={selectedIds.size} allMatching={allMatchingSelected} onBookmarks={(operation) => void mutateBookmarks(operation, selectedRows)} onSelectAllMatching={() => setAllMatchingSelected(true)} onExport={!state.standardViewKey && descriptor.dataOperations?.export.selected.state === "enabled" ? () => setDataOperationsLaunch(allMatchingSelected ? "filtered" : "selected") : undefined} onClear={() => { setSelectedIds(new Set()); setAllMatchingSelected(false); }}/>: null}
  </PageFrame></FilterChoiceLoader.Provider>;
}

function ListChrome({ client,scopeCoordinate,onCatalogChange,descriptor, state, page, scopeControl, pageActions, loading, actionStatus, onActionStatus, onOpenDataOperations, onRefresh, onChange }: { readonly client:HttpClient;readonly scopeCoordinate?:EntityListScopeCoordinateV1;readonly onCatalogChange:(catalog:EntityViewCatalog)=>void; readonly descriptor: EntityListDescriptorV1; readonly state: ListLocationStateV1; readonly page?: EntityListResultV1; readonly scopeControl?: ReactNode; readonly pageActions: readonly EntityListPageAction[]; readonly loading: boolean; readonly actionStatus: string; readonly onActionStatus: (status: string) => void; readonly onOpenDataOperations: () => void; readonly onRefresh: () => void; readonly onChange: (patch: Partial<ListLocationStateV1>, history?: "replace" | "push") => void }) {
  const directory = useDirectoryFilters(), directoryKinds = descriptor.scope.filterKinds ?? [];
  const filterCount = state.filters.length + (descriptor.scope.quickFilters?.filter(filter => directory?.value[filter.key]).length ?? 0) + (directoryKinds.includes("organization") ? directory?.value.operatingOrganizationIds?.length ?? 0 : 0) + (directoryKinds.includes("company") ? directory?.value.companyCodeIds?.length ?? 0 : 0);
  const [query, setQuery] = useState(state.query ?? ""), [activeDrawer, setActiveDrawer] = useState<ListDrawerKey>(), [scopeOpen, setScopeOpen] = useState(false), [resetOpen, setResetOpen] = useState(false), [views, setViews] = useState<readonly SavedListView[]>([]);
  const viewLocale=useOptionalI18n()?.localization.uiLocale;
  const closeDrawer = useCallback((open: boolean) => { if (!open) setActiveDrawer(undefined); }, []);
  const [refreshRequested, setRefreshRequested] = useState(false);
  const search = useRef<HTMLInputElement>(null);
  const refreshStarted = useRef(false);
  const viewKey = savedViewStorageKey(descriptor), activeView = views.find((view) => view.id === state.savedViewId) ?? views.find(view=>view.scope==="system"&&view.state.standardViewKey===state.standardViewKey&&state.standardViewKey), dirty = JSON.stringify(saveableViewState(state)) !== JSON.stringify(activeView?.state??saveableViewState(descriptor.surface.defaultState)), searchBehavior = readDisplayPreferences(descriptor.plane)?.searchBehavior ?? "instant";
  useEffect(() => setQuery(state.query ?? ""), [state.query]);
  useEffect(() => setViews(readSavedViews(viewKey, descriptor).map(view=>{const standard=descriptor.standardViews?.find(item=>`standard.${item.key}`===view.id);return standard?{...view,name:resolveEntityText(standard.label,viewLocale)}:view;})), [viewKey, descriptor,viewLocale]);
  useEffect(() => { if (!refreshRequested) return; if (loading) { refreshStarted.current = true; onActionStatus("Refreshing list"); return; } if (refreshStarted.current) { refreshStarted.current = false; setRefreshRequested(false); onActionStatus("List refreshed"); } }, [loading, refreshRequested, onActionStatus]);
  useEffect(() => { const normalized = query.trim(); if (searchBehavior !== "instant" || normalized === (state.query ?? "") || (normalized.length > 0 && normalized.length < descriptor.surface.search.minimumQueryLength)) return; const timer = window.setTimeout(() => onChange({ query: normalized || undefined }), 350); return () => window.clearTimeout(timer); }, [query, state.query, searchBehavior, descriptor.surface.search.minimumQueryLength, onChange]);
  useEffect(() => { const focusSearch = (event: KeyboardEvent) => { const target = event.target, editing = target instanceof HTMLElement && target.matches("input, textarea, select, [contenteditable=true]"); if ((event.key === "/" && !editing) || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k")) { event.preventDefault(); search.current?.focus(); } }; window.addEventListener("keydown", focusSearch); return () => window.removeEventListener("keydown", focusSearch); }, []);
  const submit = (event: FormEvent) => { event.preventDefault(); const normalized = query.trim(); if (normalized && normalized.length < descriptor.surface.search.minimumQueryLength) { onActionStatus(`Enter at least ${descriptor.surface.search.minimumQueryLength} characters to search`); return; } onChange({ query: normalized || undefined }, "push"); };
  const count = page?.pagination.total;
  const countLabel = count === undefined ? undefined : `${page?.pagination.countMode === "approximate" ? "≈" : ""}${new Intl.NumberFormat().format(count)}`;
  const resultCountLabel = countLabel ?? (page ? `${new Intl.NumberFormat().format(page.rows.length)}${page.pagination.hasNext ? "+" : ""}` : undefined);
  const groupLabel = state.group ? descriptor.fields.find((field) => field.key === state.group)?.label ?? state.group : "None";
  const scopeLabel = descriptor.scope.labels.at(-1);
  const customized = Boolean(state.savedViewId && state.savedViewId!=="system") || JSON.stringify(saveableViewState(state)) !== JSON.stringify(saveableViewState(descriptor.surface.defaultState));
  const reset = () => onChange({standardViewKey:undefined,group:undefined,spreadsheet:undefined, ...descriptor.surface.defaultState, query: state.query, savedViewId: "system" }, "push");
  const copyViewLink = () => { const href = portableListHref(state, descriptor); if (!href) { onActionStatus("This view has too much configuration to share as a link"); return; } void copyText(href).then((copied) => onActionStatus(copied ? "Link copied" : "Unable to copy link")); };
  const appliedChips: AppliedFilterChip[] = [
    ...(directory ? (descriptor.scope.quickFilters ?? []).filter(filter => directory.value[filter.key]).map(filter => ({
      key:filter.key, label:`${filter.label}: ${filter.options.find(option => option.value === directory.value[filter.key])?.label ?? directory.value[filter.key]}`, removeLabel:`Remove ${filter.label} filter`,
      onRemove:() => directory.apply({...directory.value,[filter.key]:undefined,...(filter.key === "partnerRole" ? {eligibleOperation:undefined} : {})})
    })) : []),
    ...state.filters.map((filter,index) => ({key:`field-${filter.field}-${index}`,label:describeFilter(filter,descriptor),onRemove:() => onChange({filters:state.filters.filter((_,i) => i !== index)},"push")})),
    ...(directory && directoryKinds.includes("organization") ? (directory.value.operatingOrganizationIds ?? []).map(id => ({
      key:`organization-${id}`,label:`Organization: ${directory.organizations.find(org => org.id === id)?.displayName ?? "Selected organization"}`,removeLabel:`Remove organization filter ${id}`,
      onRemove:() => directory.apply({...directory.value,eligibleOperation:undefined,operatingOrganizationIds:directory.value.operatingOrganizationIds?.filter(key => key !== id)})
    })) : []),
    ...(directory && directoryKinds.includes("company") ? (directory.value.companyCodeIds ?? []).map(id => {
      const company = directory.companies.find(item => item.companyCodeId === id);
      return {key:`company-${id}`,label:`Company: ${company?.code ?? "Selected company"}`,title:company ? `${company.code} · ${company.displayName}` : "Selected company",removeLabel:`Remove company filter ${id}`,
      onRemove:() => directory.apply({...directory.value,eligibleOperation:undefined,companyCodeIds:directory.value.companyCodeIds?.filter(key => key !== id)})};
    }) : [])
  ];
  return <div className="a-entity-list__chrome">
    {scopeControl ? <div className="a-entity-list__scope-bar">{scopeControl}</div> : null}
    <span className={actionStatus.includes("System default has been applied")?"a-entity-list__view-summary":"a-visually-hidden"} role="status" aria-live="polite">{actionStatus}</span>
    <ManagementToolbar className="a-entity-list__query-row">
      <form className="a-entity-list__search" role="search" onSubmit={submit}><Label htmlFor="entity-list-search" className="a-visually-hidden">Search {descriptor.entity.pluralLabel}</Label><span className="a-entity-list__search-icon" aria-hidden="true"><SearchIcon size={16}/></span><Input ref={search} id="entity-list-search" type="search" value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder={`Search by ${searchHint(descriptor)}…`} autoComplete="off" enterKeyHint="search"/><kbd title="Focus search">/</kbd></form>
      <Menu><MenuTrigger className="a-entity-list__view-trigger" aria-label="Select view">View: {activeView?.name??"System default"}{dirty?" (modified)":""}<ChevronDownIcon size={14}/></MenuTrigger><MenuContent><MenuItem onClick={reset}>System default</MenuItem>{views.map(view=><MenuItem key={view.id} onClick={()=>onChange({standardViewKey:undefined,group:undefined,spreadsheet:undefined,...view.state,query:state.query,savedViewId:view.id},"push")}>{view.name}</MenuItem>)}<MenuItem onClick={()=>setActiveDrawer("views")}>Manage views…</MenuItem></MenuContent></Menu>
      <div className="a-entity-list__toolbar-actions">

        {listDrawer("filters").available(descriptor) ? <Button className="a-entity-list__toolbar-action" variant={filterCount ? "primary" : "secondary"} size="small" aria-label={filterCount ? `Filters, ${filterCount} active` : "Filters"} title={filterCount ? `${filterCount} active filters` : "Filters"} onClick={() => setActiveDrawer("filters")}><FilterIcon size={16}/><span className="a-entity-list__toolbar-label">{listDrawer("filters").label}</span>{filterCount ? <span className="a-entity-list__action-count" aria-hidden="true">{filterCount}</span> : null}</Button> : null}
        {listDrawer("sort").available(descriptor) ? <Button className="a-entity-list__toolbar-action a-entity-list__sort-action" variant={state.sort.length > 1 ? "primary" : "secondary"} size="small" aria-label={state.sort.length > 1 ? `Sort, ${state.sort.length} rules` : "Sort"} title={state.sort.length > 1 ? `${state.sort.length} sort levels` : "Sort"} onClick={() => setActiveDrawer("sort")}><SortIcon size={16}/><span className="a-entity-list__toolbar-label">{listDrawer("sort").label}</span>{state.sort.length > 1 ? <span className="a-entity-list__action-count" aria-hidden="true">{state.sort.length}</span> : null}</Button> : null}
        {listDrawer("columns").available(descriptor) ? <Button className="a-entity-list__toolbar-action a-entity-list__columns-action" variant="secondary" size="small" aria-label={`${state.columns.length} visible columns`} title={`${state.columns.length} visible columns`} onClick={() => setActiveDrawer("columns")}><ColumnsIcon size={16}/><span>{listDrawer("columns").label}</span><span className="a-entity-list__action-count" aria-hidden="true">{state.columns.length}</span></Button> : null}
        <Menu><MenuTrigger className="a-entity-list__more-trigger" aria-label="Controls" title="Controls"><SlidersHorizontalIcon size={16}/><span className="a-entity-list__more-label">Controls</span></MenuTrigger><MenuContent className="a-entity-list__more-menu">{scopeControl ? <ListMenuItem className="a-entity-list__mobile-only a-entity-list__control-context" icon={<Building2Icon size={16}/>} label={scopeLabel?.label ?? "Directory filters"} value={scopeLabel?.value} onClick={() => setScopeOpen(true)}/> : null}{LIST_DRAWERS.filter(item => item.available(descriptor)).map(item => <ListMenuItem key={item.key} icon={<item.Icon size={16}/>} label={item.label} value={{filters:`${filterCount} active`,views:activeView?.name ?? "System default",sort:`${state.sort.length} ${state.sort.length === 1 ? "level" : "levels"}`,columns:`${state.columns.length} visible`,group:groupLabel,display:`${titleCase(state.mode)} · ${titleCase(state.density)}`}[item.key]} onClick={() => setActiveDrawer(item.key)}/>)}{pageActions.map((action) => <ListMenuItem className="a-entity-list__small-screen-only" icon={<LinkIcon size={16}/>} label={action.label} key={action.key} disabled={action.disabled} value={action.reason} onClick={() => { if (action.href && !action.disabled) window.location.assign(action.href); }}/>)}{hasVisibleDataOperations(descriptor) ? <><div className="a-entity-list__menu-separator" role="separator"/><ListMenuItem icon={<DownloadIcon size={16}/>} label="Data operations…" disabled={Boolean(state.standardViewKey)} value={state.standardViewKey?"Use System default for data operations; standard-view export is not supported yet.":undefined} onClick={onOpenDataOperations}/></> : null}<div className="a-entity-list__mobile-only a-entity-list__menu-separator" role="separator"/><ListMenuItem className="a-entity-list__mobile-only" icon={<RefreshCwIcon size={16}/>} label={refreshRequested ? "Refreshing…" : "Refresh"} onClick={() => { setRefreshRequested(true); onActionStatus("Refreshing list"); onRefresh(); }}/><ListMenuItem icon={<LinkIcon size={16}/>} label="Copy link to this view" onClick={copyViewLink}/><div className="a-entity-list__menu-separator" role="separator"/><ListMenuItem className="a-entity-list__reset-item" icon={<ResetIcon size={16}/>} label="Reset list settings" onClick={() => customized ? setResetOpen(true) : reset()}/></MenuContent></Menu>
      </div>
    </ManagementToolbar>
    <AppliedFilters chips={appliedChips} onClear={() => { onChange({filters:[]}, "push"); if (directory) directory.apply({}); }}/>
    {activeDrawer ? <ListDrawerHost key={descriptor.scope.fingerprint} active={activeDrawer} onSelect={setActiveDrawer} onOpenChange={closeDrawer} descriptor={descriptor} sections={{
      filters: <FilterDialog open onOpenChange={closeDrawer} descriptor={descriptor} filters={state.filters} resultCountLabel={resultCountLabel} onApply={(filters) => onChange({ filters }, "push")}/>,
      sort: <SortDialog open onOpenChange={closeDrawer} descriptor={descriptor} sort={state.sort} resultCountLabel={resultCountLabel} onApply={(sort) => onChange({ sort }, "push")}/>,
      columns: <ColumnsDialog open onOpenChange={closeDrawer} descriptor={descriptor} state={state} onApply={(columns) => onChange({ columns }, "push")}/>,
      group: <GroupDialog open onOpenChange={closeDrawer} descriptor={descriptor} group={state.group} onApply={(group) => onChange({ group }, "push")}/>,
      display: <DisplaySettingsDialog open onOpenChange={closeDrawer} descriptor={descriptor} state={state} onApply={(patch) => onChange(patch, "push")}/>,
      views: <SavedViewsDialog client={client} scopeCoordinate={scopeCoordinate} onCatalogChange={onCatalogChange} open onOpenChange={closeDrawer} descriptor={descriptor} state={state} views={views} onViewsChange={setViews} onApply={(patch) => onChange(patch, "push")}/>
    }}/> : null}
    <ResetConfigurationDialog open={resetOpen} onOpenChange={setResetOpen} onReset={reset}/>
    {scopeControl ? <Drawer.Root open={scopeOpen} onOpenChange={setScopeOpen}><Drawer.Panel size="standard" variant="task" mobilePresentation="fullscreen" className="a-entity-list__scope-drawer"><Drawer.Header icon={<Building2Icon/>} title={scopeLabel?.label ?? "Organization"} description="Choose the authorized context for this list." closeLabel="Close organization selector"/><Drawer.Body><div className="a-entity-list__mobile-scope-panel">{scopeControl}</div></Drawer.Body></Drawer.Panel></Drawer.Root> : null}
  </div>;
}

function ListMenuItem({ icon, label, value, className, disabled, onClick }: { readonly icon: ReactNode; readonly label: string; readonly value?: string; readonly className?: string; readonly disabled?: boolean; readonly onClick: () => void }) {
  return <MenuItem className={className} disabled={disabled} onClick={onClick}><span className="a-entity-list__menu-icon" aria-hidden="true">{icon}</span><span>{label}</span>{value ? <small title={value}>{value}</small> : null}</MenuItem>;
}

function ResetConfigurationDialog({ open, onOpenChange, onReset }: { readonly open: boolean; readonly onOpenChange: (open: boolean) => void; readonly onReset: () => void }) {
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent title="Reset list settings?" description="This will discard the current filters, sorting, grouping, columns, layout, and density. Your saved views will not be deleted."><div className="a-entity-list__dialog-actions"><DialogClose className="a-button a-button--secondary a-button--small">Cancel</DialogClose><Button variant="danger" size="small" onClick={() => { onReset(); onOpenChange(false); }}>Reset list settings</Button></div></DialogContent></Dialog>;
}

function directorySelectionKey(value: DirectorySelection) { return JSON.stringify([ [...(value.operatingOrganizationIds ?? [])].sort(), [...(value.companyCodeIds ?? [])].sort(), value.partnerRole, value.eligibleOperation]); }
interface DraftFilter { readonly id: string; readonly field: string; readonly operator: ListFilterOperator; readonly value: string; }
function FilterDialog({ open, onOpenChange, descriptor, filters, resultCountLabel, onApply }: { readonly open: boolean; readonly onOpenChange: (open: boolean) => void; readonly descriptor: EntityListDescriptorV1; readonly filters: readonly ListFilterV1[]; readonly resultCountLabel?: string; readonly onApply: (filters: readonly ListFilterV1[]) => void }) {
  const directory = useDirectoryFilters(), directoryKinds = descriptor.scope.filterKinds ?? [], hasDirectory = Boolean(directory && (directoryKinds.length || descriptor.scope.quickFilters?.length));
  const [directoryDraft, commitDirectoryDraft] = useState<DirectorySelection>(directory?.value ?? {});
  const setDirectoryDraft = (next: DirectorySelection) => {
    const eligibility = descriptor.scope.quickFilters?.find(filter => filter.key === "eligibleOperation");
    const contextChanged = JSON.stringify([next.partnerRole, next.operatingOrganizationIds, next.companyCodeIds]) !== JSON.stringify([directoryDraft.partnerRole, directoryDraft.operatingOrganizationIds, directoryDraft.companyCodeIds]);
    commitDirectoryDraft({...next, ...((contextChanged || !eligibility || !directory || !scopeFilterReady(eligibility, next, directory)) ? {eligibleOperation: undefined} : {})});
  };
  useEffect(() => { if (open) commitDirectoryDraft(directory?.value ?? {}); }, [open, directory?.value]);
  const directoryDirty = hasDirectory && directorySelectionKey(directoryDraft) !== directorySelectionKey(directory?.value ?? {});
  const sequence = useRef(0), filterable = descriptor.fields.filter((field) => field.filterOperators.length).sort((left, right) => left.defaultOrder - right.defaultOrder), filterPresentation = resolvedFilterPresentation(descriptor), quickFields = filterPresentation.quickFields.flatMap((configuration) => { const field = descriptor.fields.find((candidate) => candidate.key === configuration.field); return field ? [{ field, defaultOperator: configuration.defaultOperator }] : []; });
  const nextId = () => `filter-${++sequence.current}`;
  const makeDraft = () => filters.map((filter) => ({ id: nextId(), field: filter.field, operator: filter.operator, value: filterInputValue(filter, descriptor.fields.find((field) => field.key === filter.field)?.valueKind) }));
  const [draft, setDraft] = useState<readonly DraftFilter[]>(makeDraft);
  const [activeTab, setActiveTab] = useState<"common" | "all" | "organization" | "company">("common");
  const [filterPickerOpen, setFilterPickerOpen] = useState(false);
  const [quickOperators, setQuickOperators] = useState<Readonly<Record<string, ListFilterOperator>>>({});
  useEffect(() => { if (open) { setDraft(makeDraft()); setActiveTab("common"); setFilterPickerOpen(false); setQuickOperators(Object.fromEntries(quickFields.map(({ field, defaultOperator }) => [field.key, filters.find((item) => item.field === field.key)?.operator ?? defaultOperator]))); } }, [open, filters]);
  const add = (field: ListFieldDescriptorV1) => { setDraft([...draft, { id: nextId(), field: field.key, operator: field.filterOperators[0]!, value: "" }]); setFilterPickerOpen(false); };
  const invalid = draft.some(item => !!filterValidationError(filterable.find(field => field.key === item.field)!, item.operator, item.value));
  const apply = () => { if (invalid) return; const normalized = draft.flatMap((item) => { const value = filterValueFromInput(item.operator, item.value, filterable.find((field) => field.key === item.field)?.valueKind, filterable.find((field) => field.key === item.field)?.filterOptions); if (value === "" || (typeof value === "number" && !Number.isFinite(value)) || (Array.isArray(value) && (!value.length || (item.operator === "between" && value.length !== 2) || value.some((entry) => typeof entry === "number" && !Number.isFinite(entry))))) return []; return [{ field: item.field, operator: item.operator, ...(value !== undefined ? { value } : {}) } satisfies ListFilterV1]; }); rememberFilters(recentFilterKey(descriptor), normalized, descriptor.fields); onApply(Object.freeze(normalized)); if (directoryDirty) directory?.apply(directoryDraft); onOpenChange(false); };
  const quickKeys = new Set(quickFields.map(({ field }) => field.key)), additionalCount = draft.filter((item) => !quickKeys.has(item.field)).length;
  const dirty = directoryDirty || filterDraftFingerprint(draft) !== filterFingerprint(filters, descriptor);
  const remainingFilterFields = filterable.filter((field) => !draft.some((item) => item.field === field.key));
  const replace = (item: DraftFilter, next: DraftFilter) => setDraft(draft.map((candidate) => candidate.id === item.id ? next : candidate));
  const setQuickFilter = (field: ListFieldDescriptorV1, operator: ListFilterOperator, value: string) => {
    const existing = draft.find((item) => item.field === field.key);
    if (existing) { if (!value && operator !== "is_null" && operator !== "is_not_null") setDraft(draft.filter((item) => item.id !== existing.id)); else replace(existing, { ...existing, operator, value }); }
    else if (value || operator === "is_null" || operator === "is_not_null") setDraft([...draft, { id: nextId(), field: field.key, operator, value }]);
  };
  const recordLabel = resultCountLabel ? `${resultCountLabel} ${resultCountLabel === "1" ? "record" : "records"}` : "Not available";
  return <>

    <Drawer.Tabs value={activeTab} onValueChange={(value) => setActiveTab((value === "organization" || value === "company") && hasDirectory && directoryKinds.includes(value) ? value : value === "all" ? "all" : "common")}>
      <Drawer.Toolbar><Drawer.Context aria-label="Filter context"><Drawer.Metric label="Records" value={resultCountLabel ?? "—"}/><Drawer.Metric label="Active filters" value={draft.length + (descriptor.scope.quickFilters?.filter(filter => directoryDraft[filter.key]).length ?? 0) + (hasDirectory ? (directoryDraft.operatingOrganizationIds?.length ?? 0) + (directoryDraft.companyCodeIds?.length ?? 0) : 0)}/><Drawer.Metric label="State" value={dirty ? "Modified" : "Current"}/></Drawer.Context></Drawer.Toolbar>
      <Drawer.Navigation aria-label="Filter views"><Drawer.TabList className="a-entity-list__drawer-navigation"><Drawer.Tab value="common">Quick filters</Drawer.Tab><Drawer.Tab value="all">All filters{draft.length ? ` · ${draft.length}` : ""}</Drawer.Tab>{hasDirectory && directoryKinds.includes("organization") ? <Drawer.Tab value="organization">Organization</Drawer.Tab> : null}{hasDirectory && directoryKinds.includes("company") ? <Drawer.Tab value="company">Company</Drawer.Tab> : null}</Drawer.TabList></Drawer.Navigation>
      <Drawer.Body className="a-entity-list__filter-content">{hasDirectory && directory ? <>{directoryKinds.map(kind=><Drawer.TabPanel key={kind} value={kind} mount="lazy"><DirectoryFilterEditor adapter={directory} value={directoryDraft} onChange={setDirectoryDraft} kinds={[kind]}/></Drawer.TabPanel>)}</> : null}
        <Drawer.TabPanel value="common" mount="lazy">{directory && descriptor.scope.quickFilters?.length ? <ScopeQuickFilters filters={descriptor.scope.quickFilters} value={directoryDraft} adapter={directory} onChange={setDirectoryDraft}/> : null}
          <div className="a-entity-list__quick-filters">
            {quickFields.length ? <div className="a-entity-list__filter-list a-entity-list__filter-list--quick">
              <div className="a-entity-list__filter-header" aria-hidden="true"><span>Field</span><span>Operator</span><span>Value</span></div>
              {quickFields.map(({ field, defaultOperator }, index) => {
                const existing = draft.find((item) => item.field === field.key), operator = existing?.operator ?? quickOperators[field.key] ?? defaultOperator, value = existing?.value ?? "";
                return <div className="a-entity-list__filter-row" key={field.key}>
                  <div className="a-entity-list__filter-control"><span className="a-entity-list__filter-label">Field</span><strong>{field.label}</strong></div>
                  <div className="a-entity-list__filter-control">
                    <span className="a-entity-list__filter-label">Operator</span>
                    <Select aria-label={`Operator for quick ${field.label} filter`} value={operator} onChange={(event) => { const next = event.currentTarget.value as ListFilterOperator; setQuickOperators({ ...quickOperators, [field.key]: next }); setQuickFilter(field, next, ""); }}>
                      {field.filterOperators.map((candidate) => <option value={candidate} key={candidate}>{operatorLabel(candidate, field)}</option>)}
                    </Select>
                  </div>
                  <FilterValueEditor historyKey={recentFilterKey(descriptor)} field={field} operator={operator} value={value} filterNumber={index + 1} onChange={(next) => setQuickFilter(field, operator, next)}/>
                </div>;
              })}
            </div> : <p className="a-entity-list__filter-guidance">This entity does not publish quick filters. Use All filters to choose from every filterable field.</p>}
            {additionalCount ? <p className="a-entity-list__additional-filters">{additionalCount} additional {additionalCount === 1 ? "filter is" : "filters are"} configured under <button type="button" onClick={() => setActiveTab("all")}>All filters</button>.</p> : null}
          </div>
        </Drawer.TabPanel>
        <Drawer.TabPanel value="all" mount="lazy"><div className="a-entity-list__advanced-filters"><div className="a-entity-list__dialog-body">{draft.length ? <div className="a-entity-list__filter-list"><div className="a-entity-list__filter-header" aria-hidden="true"><span>Field</span><span>Operator</span><span>Value</span><span>Action</span></div>{draft.map((item, index) => { const field = filterable.find((candidate) => candidate.key === item.field) ?? filterable[0], operators = field?.filterOperators ?? [], availableFields = filterable.filter((candidate) => candidate.key === item.field || !draft.some((active) => active.field === candidate.key)), replaceItem = (next: DraftFilter) => replace(item, next); return <div className="a-entity-list__filter-row" key={item.id}><div className="a-entity-list__filter-control"><span className="a-entity-list__filter-label">Field</span><SearchableFieldSelect label={`Field for filter ${index + 1}`} fields={availableFields} value={item.field} onChange={(selected) => replaceItem({ ...item, field: selected.key, operator: selected.filterOperators[0]!, value: "" })}/></div><div className="a-entity-list__filter-control"><span className="a-entity-list__filter-label">Operator</span><Select aria-label={`Operator for ${field?.label ?? `filter ${index + 1}`}`} value={item.operator} onChange={(event) => replaceItem({ ...item, operator: event.currentTarget.value as ListFilterOperator, value: "" })}>{operators.map((operator) => <option value={operator} key={operator}>{operatorLabel(operator, field)}</option>)}</Select></div>{field ? <FilterValueEditor historyKey={recentFilterKey(descriptor)} field={field} operator={item.operator} value={item.value} filterNumber={index + 1} onChange={(value) => replaceItem({ ...item, value })}/> : <span/>}<Button className="a-entity-list__filter-remove" variant="ghost" size="icon" aria-label={`Remove ${field?.label ?? "filter"}`} title={`Remove ${field?.label ?? "filter"}`} onClick={() => setDraft(draft.filter((candidate) => candidate.id !== item.id))}><TrashIcon size={17}/></Button></div>; })}</div> : !filterPickerOpen ? <div className="a-entity-list__filter-builder-empty"><span aria-hidden="true"><FilterIcon/></span><strong>No filters configured</strong><p>Add a filter to narrow the authorized result set.</p></div> : null}{filterPickerOpen ? <FieldCataloguePicker heading="Add a filter field" fields={remainingFilterFields} placeholder="Search filterable fields by name or code…" onSelect={add} onClose={() => setFilterPickerOpen(false)}/> : <Button variant="secondary" size="small" onClick={() => setFilterPickerOpen(true)} disabled={!remainingFilterFields.length}>Add filter</Button>}</div></div></Drawer.TabPanel>
      </Drawer.Body>
      <Drawer.Footer className="a-entity-list__filter-actions"><Drawer.FooterSummary><strong>{dirty ? "Changes ready to apply" : `${recordLabel} matching`}</strong><span>{dirty ? `${recordLabel} in the current list` : `${draft.length + (directoryDraft.operatingOrganizationIds?.length ?? 0) + (directoryDraft.companyCodeIds?.length ?? 0) + (descriptor.scope.quickFilters?.filter(filter => directoryDraft[filter.key]).length ?? 0)} active filters`}</span></Drawer.FooterSummary><Drawer.FooterActions><Button variant="ghost" size="small" disabled={!draft.length && !directoryDraft.partnerRole && !directoryDraft.eligibleOperation && !directoryDraft.companyCodeIds?.length && !directoryDraft.operatingOrganizationIds?.length} onClick={() => { setDraft([]); setDirectoryDraft({}); }}>Reset filters</Button><Drawer.Close className="a-button a-button--secondary a-button--small">Cancel</Drawer.Close><Button size="small" disabled={!dirty || invalid || Boolean(directoryDirty && directory?.unavailable)} onClick={apply}><span className="a-entity-list__apply-desktop">Apply filters</span><span className="a-entity-list__apply-mobile">Show results</span></Button></Drawer.FooterActions></Drawer.Footer>
    </Drawer.Tabs>
  </>;
}

function filterDraftFingerprint(draft: readonly DraftFilter[]): string { return JSON.stringify(draft.map(({ field, operator, value }) => ({ field, operator, value }))); }
function filterFingerprint(filters: readonly ListFilterV1[], descriptor: EntityListDescriptorV1): string { return JSON.stringify(filters.map((filter) => ({ field: filter.field, operator: filter.operator, value: filterInputValue(filter, descriptor.fields.find((field) => field.key === filter.field)?.valueKind) }))); }

function resolvedFilterPresentation(descriptor: EntityListDescriptorV1): EntityListDescriptorV1["surface"]["filterPresentation"] {
  if (descriptor.surface.filterPresentation) return descriptor.surface.filterPresentation;
  const quickFields = descriptor.fields.filter((field) => field.filterOperators.length).sort((left, right) => legacyQuickFilterPriority(left) - legacyQuickFilterPriority(right) || left.defaultOrder - right.defaultOrder).slice(0, 4).map((field) => Object.freeze({ field: field.key, defaultOperator: preferredLegacyFilterOperator(field) }));
  return Object.freeze({ quickFields: Object.freeze(quickFields), source: "fallback", allowUserPinning: false });
}

function legacyQuickFilterPriority(field: ListFieldDescriptorV1): number {
  const value = `${field.key} ${field.label}`;
  if (field.semanticRole === "status" || /\bstatus\b/i.test(value)) return 0;
  if (/category|group|class|kind/i.test(value)) return 1;
  if (field.semanticRole === "country_code" || /country/i.test(value)) return 2;
  if (field.semanticRole === "updated_at" || /updated|modified/i.test(value)) return 3;
  return 10;
}

function preferredLegacyFilterOperator(field: ListFieldDescriptorV1): ListFilterOperator {
  const preferred: ListFilterOperator = field.valueKind === "date" || field.valueKind === "datetime" ? "relative" : field.filterOptions?.length || field.valueKind === "enum" || field.valueKind === "boolean" || field.valueKind === "reference" ? "eq" : "contains";
  return field.filterOperators.includes(preferred) ? preferred : field.filterOperators[0]!;
}

function SortDialog({ open, onOpenChange, descriptor, sort, resultCountLabel, onApply }: { readonly open: boolean; readonly onOpenChange: (open: boolean) => void; readonly descriptor: EntityListDescriptorV1; readonly sort: readonly ListSortV1[]; readonly resultCountLabel?: string; readonly onApply: (sort: readonly ListSortV1[]) => void }) {
  const fields = descriptor.fields.filter((field) => field.sortable), [draft, setDraft] = useState<readonly ListSortV1[]>(sort), [pickerOpen, setPickerOpen] = useState(false), [dragIndex, setDragIndex] = useState<number>();
  useEffect(() => { if (open) { setDraft(sort); setPickerOpen(false); setDragIndex(undefined); } }, [open, sort]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(sort), maximum = Math.min(descriptor.limits.maxSortLevels, fields.length), recordLabel = resultCountLabel ? `${resultCountLabel} ${resultCountLabel === "1" ? "record" : "records"}` : "Records unavailable";
  const remainingFields = fields.filter((field) => !draft.some((item) => item.field === field.key));
  const add = (field: ListFieldDescriptorV1) => { if (draft.length >= maximum) return; setDraft([...draft, { field: field.key, direction: "asc" }]); setPickerOpen(draft.length + 1 < maximum); };
  const drop = (event: ReactDragEvent<HTMLDivElement>, target: number) => { event.preventDefault(); if (dragIndex === undefined || dragIndex === target) return; setDraft(moveItem(draft, dragIndex, target)); setDragIndex(undefined); };
  return <>

    <Drawer.Toolbar><Drawer.Context aria-label="Sort context"><Drawer.Metric label="Records" value={resultCountLabel ?? "—"}/><Drawer.Metric label="Sort levels" value={draft.length}/><Drawer.Metric label="Maximum" value={maximum}/></Drawer.Context></Drawer.Toolbar>
    <Drawer.Body className="a-entity-list__sort-content">{draft.length ? <div className="a-entity-list__sort-list">{draft.map((item, index) => { const availableFields = fields.filter((field) => field.key === item.field || !draft.some((candidate) => candidate.field === field.key)); return <div key={`${item.field}-${index}`} data-dragging={dragIndex === index || undefined} onDragOver={(event) => { if (dragIndex !== undefined) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; } }} onDrop={(event) => drop(event, index)}><button type="button" className="a-entity-list__sort-grip" draggable aria-label={`Drag sort ${index + 1} to reorder`} title="Drag to reorder" onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; setDragIndex(index); }} onDragEnd={() => setDragIndex(undefined)}><GripVerticalIcon size={18}/></button><span className="a-entity-list__sort-order" aria-label={`Priority ${index + 1}`}>{index + 1}</span><Label><span>Field</span><SearchableFieldSelect label={`Field for sort ${index + 1}`} fields={availableFields} value={item.field} onChange={(selected) => setDraft(draft.map((candidate, itemIndex) => itemIndex === index ? { ...candidate, field: selected.key } : candidate))}/></Label><Label><span>Direction</span><Select aria-label={`Direction for sort ${index + 1}`} value={item.direction} onChange={(event) => setDraft(draft.map((candidate, itemIndex) => itemIndex === index ? { ...candidate, direction: event.currentTarget.value as "asc" | "desc" } : candidate))}><option value="asc">Ascending</option><option value="desc">Descending</option></Select></Label><div className="a-entity-list__sort-actions"><Button variant="ghost" size="icon" disabled={index === 0} aria-label={`Move sort ${index + 1} up`} title="Move up" onClick={() => setDraft(moveItem(draft, index, index - 1))}><ArrowUpIcon size={16}/></Button><Button variant="ghost" size="icon" disabled={index === draft.length - 1} aria-label={`Move sort ${index + 1} down`} title="Move down" onClick={() => setDraft(moveItem(draft, index, index + 1))}><ArrowDownIcon size={16}/></Button><Button variant="ghost" size="icon" aria-label={`Remove sort ${index + 1}`} title="Remove sort" onClick={() => setDraft(draft.filter((_candidate, itemIndex) => itemIndex !== index))}><TrashIcon size={17}/></Button></div></div>; })}</div> : !pickerOpen ? <div className="a-entity-list__sort-empty"><span aria-hidden="true"><SortIcon/></span><strong>No sort levels configured</strong><p>Records will use the entity’s natural order.</p></div> : null}{pickerOpen ? <FieldCataloguePicker key={draft.length} heading="Add a sortable field" fields={remainingFields} placeholder="Search sortable fields by name or code…" onSelect={add} onClose={() => setPickerOpen(false)}/> : <Button className="a-entity-list__sort-add" variant="secondary" size="small" disabled={draft.length >= maximum} onClick={() => setPickerOpen(true)}>Add sort level</Button>}</Drawer.Body>
    <Drawer.Footer><Drawer.FooterSummary><strong>{dirty ? "Changes ready to apply" : `${draft.length} active sort ${draft.length === 1 ? "level" : "levels"}`}</strong><span>{recordLabel} will be ordered by priority from top to bottom.</span></Drawer.FooterSummary><Drawer.FooterActions><Button variant="ghost" size="small" disabled={JSON.stringify(draft) === JSON.stringify(descriptor.surface.defaultState.sort)} onClick={() => setDraft(descriptor.surface.defaultState.sort)}>Reset sort</Button><Drawer.Close className="a-button a-button--secondary a-button--small">Cancel</Drawer.Close><Button size="small" disabled={!dirty} onClick={() => { onApply(draft); onOpenChange(false); }}>Apply sort</Button></Drawer.FooterActions></Drawer.Footer>
  </>;
}

function ColumnsDialog({ open, onOpenChange, descriptor, state, onApply }: { readonly open: boolean; readonly onOpenChange: (open: boolean) => void; readonly descriptor: EntityListDescriptorV1; readonly state: ListLocationStateV1; readonly onApply: (columns: readonly string[]) => void }) {
  const defaults = descriptor.surface.defaultState.columns;
  const [columns, setColumns] = useState<readonly string[]>(state.columns);
  const [search, setSearch] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [drag, setDrag] = useState<{ readonly source: string; readonly target?: string; readonly edge?: "before" | "after" }>();
  useEffect(() => { if (open) { setColumns(state.columns); setSearch(""); setAnnouncement(""); setDrag(undefined); } }, [open, state.columns]);
  const fieldsByKey = new Map(descriptor.fields.map((field) => [field.key, field]));
  const normalizedSearch = search.trim();
  const matches = (field: ListFieldDescriptorV1) => matchesColumnSearch(field, search);
  const matchingFieldCount = descriptor.fields.filter(matches).length;
  const visibleFields = columns.map((key) => fieldsByKey.get(key)).filter((field): field is ListFieldDescriptorV1 => Boolean(field));
  const matchingVisibleFields = visibleFields.filter(matches);
  const availableFields = descriptor.fields.filter((field) => !columns.includes(field.key) && matches(field)).sort((left, right) => left.defaultOrder - right.defaultOrder || left.label.localeCompare(right.label));
  const availableGroups = groupAvailableColumns(availableFields);
  const move = (key: string, target: number) => {
    const current = columns.indexOf(key);
    if (current < 0 || target < 0 || target >= columns.length || current === target) return;
    const next = moveItem(columns, current, target);
    setColumns(next);
    setAnnouncement(`${fieldsByKey.get(key)?.label ?? key} moved to position ${target + 1}.`);
  };
  const remove = (field: ListFieldDescriptorV1) => { if (field.key !== descriptor.entity.identityField) { setColumns(columns.filter((key) => key !== field.key)); setAnnouncement(`${field.label} hidden.`); } };
  const add = (field: ListFieldDescriptorV1) => { if (columns.length >= ENTITY_LIST_MAX_VISIBLE_COLUMNS) { setAnnouncement(`A maximum of ${ENTITY_LIST_MAX_VISIBLE_COLUMNS} visible fields is supported.`); return; } setColumns([...columns, field.key]); setAnnouncement(`${field.label} added as column ${columns.length + 1}.`); };
  const dragStart = (event: ReactDragEvent<HTMLButtonElement>, key: string) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", key); setDrag({ source: key }); };
  const dragOver = (event: ReactDragEvent<HTMLDivElement>, target: string) => {
    if (!drag || drag.source === target) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const bounds = event.currentTarget.getBoundingClientRect(), edge = event.clientY < bounds.top + bounds.height / 2 ? "before" : "after";
    if (drag.target !== target || drag.edge !== edge) setDrag({ source: drag.source, target, edge });
  };
  const drop = (event: ReactDragEvent<HTMLDivElement>, target: string) => {
    event.preventDefault();
    const source = drag?.source ?? event.dataTransfer.getData("text/plain"), edge = drag?.edge ?? "before";
    if (source && source !== target) { const next = reorderColumn(columns, source, target, edge); setColumns(next); setAnnouncement(`${fieldsByKey.get(source)?.label ?? source} moved to position ${next.indexOf(source) + 1}.`); }
    setDrag(undefined);
  };
  const dirty = JSON.stringify(columns) !== JSON.stringify(state.columns);
  return <>

    <Drawer.Toolbar><Drawer.Context aria-label="Column context"><Drawer.Metric label="Fields" value={descriptor.fields.length}/><Drawer.Metric label="Visible" value={columns.length}/><Drawer.Metric label="Maximum" value={ENTITY_LIST_MAX_VISIBLE_COLUMNS}/></Drawer.Context></Drawer.Toolbar>
    <Drawer.Body scrollable={false} className="a-entity-list__column-content"><FieldSearchInput id="entity-list-column-search" value={search} count={matchingFieldCount} placeholder="Search fields by name or code…" onChange={setSearch}/>
    <div className="a-entity-list__column-browser">
      <section aria-labelledby="visible-columns-heading"><div className="a-entity-list__column-section-heading"><h3 id="visible-columns-heading">Visible columns</h3><span>{columns.length} selected</span></div>
        {columns.length > 20 ? <p className="a-entity-list__column-warning">More than 20 visible columns may require horizontal scrolling.</p> : null}
        <div className="a-entity-list__column-list a-entity-list__column-list--visible">{matchingVisibleFields.map((field) => { const identity = field.key === descriptor.entity.identityField, index = columns.indexOf(field.key), dropEdge = drag?.target === field.key ? drag.edge : undefined; return <div key={field.key} data-dragging={drag?.source === field.key || undefined} data-drop-edge={dropEdge} onDragOver={(event) => dragOver(event, field.key)} onDrop={(event) => drop(event, field.key)}>
          <button type="button" className="a-entity-list__column-grip" draggable aria-label={`Drag ${field.label} to reorder`} title="Drag to reorder" onDragStart={(event) => dragStart(event, field.key)} onDragEnd={() => setDrag(undefined)}><GripVerticalIcon size={18}/></button>
          <Checkbox aria-label={`Show ${field.label}`} checked disabled={identity} onChange={() => remove(field)}/>
          <span className="a-entity-list__column-name"><strong>{field.label}</strong><small>{field.key}{identity ? " · Identity field" : ""}</small></span>
          <Button variant="ghost" size="icon" disabled={index <= 0} aria-label={`Move ${field.label} up`} title="Move up" onClick={() => move(field.key, index - 1)}><ArrowUpIcon size={16}/></Button>
          <Button variant="ghost" size="icon" disabled={index === columns.length - 1} aria-label={`Move ${field.label} down`} title="Move down" onClick={() => move(field.key, index + 1)}><ArrowDownIcon size={16}/></Button>
        </div>; })}</div>
        {!matchingVisibleFields.length ? <ColumnSearchEmpty search={search} section="visible columns" onClear={() => setSearch("")}/> : null}
      </section>
      <section aria-labelledby="available-columns-heading"><div className="a-entity-list__column-section-heading"><h3 id="available-columns-heading">Available fields</h3><span>{availableFields.length}{normalizedSearch ? ` of ${descriptor.fields.length - columns.length}` : ""}</span></div>
        {columns.length >= ENTITY_LIST_MAX_VISIBLE_COLUMNS ? <p className="a-entity-list__column-warning">Maximum {ENTITY_LIST_MAX_VISIBLE_COLUMNS} visible fields reached. Hide a field before adding another.</p> : null}
        {availableGroups.map((group) => <div className="a-entity-list__column-group" key={group.label}><h4>{group.label}<span>{group.fields.length}</span></h4><div className="a-entity-list__column-list a-entity-list__column-list--available">{group.fields.map((field) => <label key={field.key}><Checkbox aria-label={`Show ${field.label}`} checked={false} disabled={columns.length >= ENTITY_LIST_MAX_VISIBLE_COLUMNS} onChange={() => add(field)}/><span className="a-entity-list__column-name"><strong>{field.label}</strong><small>{field.key} · {fieldTypeLabel(field.valueKind)}</small></span></label>)}</div></div>)}
        {!availableGroups.length ? <ColumnSearchEmpty search={search} section="available fields" onClear={() => setSearch("")}/> : null}
      </section>
      <span className="a-visually-hidden" role="status" aria-live="polite">{announcement}</span>
    </div></Drawer.Body>
    <Drawer.Footer><Drawer.FooterSummary><strong>{dirty ? "Changes ready to apply" : `${columns.length} visible ${columns.length === 1 ? "column" : "columns"}`}</strong><span>{descriptor.fields.length - columns.length} fields remain available.</span></Drawer.FooterSummary><Drawer.FooterActions><Button variant="ghost" size="small" disabled={JSON.stringify(columns) === JSON.stringify(defaults)} onClick={() => { setColumns(defaults); setAnnouncement("Default columns restored."); }}>Reset columns</Button><Drawer.Close className="a-button a-button--secondary a-button--small">Cancel</Drawer.Close><Button size="small" disabled={!dirty} onClick={() => { onApply(columns); onOpenChange(false); }}>Apply columns</Button></Drawer.FooterActions></Drawer.Footer>
  </>;
}

function ColumnSearchEmpty({ search, section, onClear }: { readonly search: string; readonly section: string; readonly onClear: () => void }) { return <div className="a-entity-list__column-empty"><p>{search.trim() ? `No matching ${section}.` : `No ${section}.`}</p>{search.trim() ? <Button variant="ghost" size="small" onClick={onClear}>Clear search</Button> : null}</div>; }

function SavedViewsDialog({client,scopeCoordinate,onCatalogChange,open,onOpenChange,descriptor,state,views,onViewsChange,onApply}: {readonly client:HttpClient;readonly scopeCoordinate?:EntityListScopeCoordinateV1;readonly onCatalogChange:(catalog:EntityViewCatalog)=>void;readonly open:boolean;readonly onOpenChange:(open:boolean)=>void;readonly descriptor:EntityListDescriptorV1;readonly state:ListLocationStateV1;readonly views:readonly SavedListView[];readonly onViewsChange:(views:readonly SavedListView[])=>void;readonly onApply:(patch:Partial<ListLocationStateV1>)=>void}) {
 const [tab,setTab]=useState("available"),[renaming,setRenaming]=useState<string>(),[renameValue,setRenameValue]=useState("");
 const [name,setName]=useState(""),[visibility,setVisibility]=useState<"personal"|"shared">("personal"),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
 const catalog=descriptor.viewCatalog,caps=catalog?.capabilities;
 const apply=(view?:SavedListView)=>{onApply({standardViewKey:undefined,group:undefined,spreadsheet:undefined,...descriptor.surface.defaultState,...view?.state,query:state.query,savedViewId:view?.id??"system",cursor:undefined,pageIndex:undefined});onOpenChange(false);};
 const command=async(body:Record<string,unknown>,applyCreated=false)=>{
  setBusy(true);setMessage("");try{const result=await client.request(entityViewCommandOperation,{params:{entityCode:descriptor.entity.code},query:{...entityListScopeQuery(scopeCoordinate),surface:descriptor.viewNamespace??descriptor.surface.key},body});onCatalogChange(result);if(applyCreated&&result.createdId){const created=result.views.find(view=>view.id===result.createdId);if(created)apply(created);}else setMessage("View preferences saved.");return true;}catch(error){setMessage(error instanceof Error?error.message:"Unable to save view preferences");return false;}finally{setBusy(false);}
 };
 const save=()=>{if(!name.trim())return;if(descriptor.serverViews){void command({action:"create",name:name.trim(),visibility,state:saveableViewState(state)},true);return;}const saved={id:crypto.randomUUID(),name:name.trim(),state:saveableViewState(state)},next=[...views,saved];writeSavedViews(savedViewStorageKey(descriptor),next);onViewsChange(next);apply(saved);};
 const rows:readonly SavedListView[]=[{id:"system",name:"System default",state:saveableViewState(descriptor.surface.defaultState),scope:"system"},...views,...(catalog?.views.filter(view=>!view.compatible).map(view=>({...view,state:saveableViewState(descriptor.surface.defaultState)}))??[])];
 const activeName=rows.find(view=>view.id===(state.savedViewId??"system"))?.name??"System default";
 return <><Drawer.Toolbar><Drawer.Context aria-label="Saved view context"><Drawer.Metric label="Saved views" value={rows.filter(view=>view.scope!=="system").length}/><Drawer.Metric label="Active view" value={activeName}/><Drawer.Metric label="Configuration" value={`${state.columns.length} columns · ${state.filters.length} filters`}/></Drawer.Context></Drawer.Toolbar><Drawer.Tabs value={tab} onValueChange={setTab}><Drawer.TabList className="a-entity-list__drawer-navigation" aria-label="Manage views sections"><Drawer.Tab value="available">Available views</Drawer.Tab><Drawer.Tab value="save">Save current configuration</Drawer.Tab></Drawer.TabList><Drawer.Body className="a-entity-list__view-dialog"><div hidden={tab!=="save"} inert={tab!=="save"}>
 <section><h3>Save current configuration</h3><Label htmlFor="entity-list-view-name">View name</Label><div className="a-entity-list__save-view"><Input id="entity-list-view-name" value={name} onChange={event=>setName(event.currentTarget.value)} placeholder="Name this view"/><Button disabled={busy||!name.trim()||(descriptor.serverViews&&!catalog)} onClick={save}>Save view</Button></div>
 {descriptor.serverViews?<><Label htmlFor="entity-view-visibility">Visibility</Label><Select id="entity-view-visibility" value={visibility} onChange={event=>setVisibility(event.currentTarget.value as "personal"|"shared")}><option value="personal">Personal</option>{caps?.createShared?<option value="shared">Shared with this tenant</option>:null}</Select></>:null}<p className="a-entity-list__view-summary">Includes filters, sorting, grouping, columns, layout, and density. Search and work context are not saved.</p></section></div>
 <div hidden={tab!=="available"} inert={tab!=="available"}>{[{label:"Standard views",items:rows.filter(view=>view.scope==="system")},{label:"My views",items:rows.filter(view=>!view.scope||view.scope==="personal")},{label:"Shared views",items:rows.filter(view=>view.scope==="shared")}].map(section=><section key={section.label}><h3>{section.label}</h3>{!section.items.length?<p className="a-entity-list__view-summary">No {section.label.toLocaleLowerCase()} yet.</p>:<div className="a-entity-list__saved-views">{section.items.map(view=>{const system=view.scope==="system",local=!system&&!view.scope,active=(state.savedViewId??"system")===view.id,writable=!system&&(view.scope==="personal"||view.scope==="shared"&&caps?.manageShared);return <div key={view.id} className="a-entity-list__saved-view-row"><button type="button" onClick={()=>apply(view.id==="system"?undefined:view)} disabled={busy||view.compatible===false}><strong>{view.name}{view.compatible===false?" · Unavailable fields":""}{active?" · Active":""}</strong><small>{system?(view.id==="system"?"Published configuration":"Standard view"):local?"This browser":view.scope==="shared"?"Shared with this tenant":"Personal"}{catalog?.personalDefault===view.id?" · My default":""}{catalog?.sharedDefault===view.id?" · Tenant default":""}</small></button><div className="a-entity-list__view-row-actions">
 {catalog&&!local?<Button size="small" variant="ghost" disabled={busy||view.compatible===false||catalog.personalDefault===view.id} onClick={()=>void command({action:"default",id:view.id,target:"personal"})}>Make my default</Button>:null}
 {caps?.setSharedDefault&&(system||view.scope==="shared")?<Button size="small" variant="ghost" disabled={busy||view.compatible===false||catalog?.sharedDefault===view.id} onClick={()=>void command({action:"default",id:view.id,target:"shared"})}>Set tenant default</Button>:null}
 {view.scope==="shared"?<Button size="small" variant="ghost" disabled={busy} onClick={()=>void command({action:"copy",id:view.id})}>Personal copy</Button>:null}
 {writable?<><Button size="small" variant="ghost" disabled={busy} onClick={()=>{setRenaming(view.id);setRenameValue(view.name);}}>Rename</Button><Button size="small" variant="ghost" disabled={busy} onClick={()=>void command({action:"update",id:view.id,version:view.version,state:saveableViewState(state)})}>Update from current</Button><Button size="small" variant="ghost" disabled={busy} onClick={()=>void command({action:"delete",id:view.id}).then(success=>{if(success&&active)apply();})}>Delete</Button></>:null}
 {local?<Button size="small" variant="ghost" disabled={busy||!catalog} onClick={()=>void command({action:"create",name:view.name,visibility:"personal",state:view.state},true)}>Save to my account</Button>:null}
 </div>{renaming===view.id?<div className="a-entity-list__save-view"><Input aria-label={`New name for ${view.name}`} value={renameValue} onChange={event=>setRenameValue(event.currentTarget.value)}/><Button size="small" disabled={busy||!renameValue.trim()} onClick={()=>void command({action:"update",id:view.id,version:view.version,name:renameValue.trim()}).then(success=>{if(success)setRenaming(undefined);})}>Save name</Button><Button size="small" variant="ghost" onClick={()=>setRenaming(undefined)}>Cancel</Button></div>:null}</div>;})}</div>}</section>)}</div>{message?<p role="status">{message}</p>:null}<p className="a-entity-list__view-summary">Resetting to System default does not change your startup preference.</p>
 </Drawer.Body></Drawer.Tabs><Drawer.Footer><Drawer.FooterSummary><strong>{rows.filter(view=>view.scope!=="system").length} saved views</strong><span>Current view: {activeName}</span></Drawer.FooterSummary><Drawer.FooterActions><Button variant="ghost" size="small" disabled={busy} onClick={()=>apply()}>Reset to system default</Button><Drawer.Close className="a-button a-button--secondary a-button--small">Close</Drawer.Close></Drawer.FooterActions></Drawer.Footer></>;
}

function DisplaySettingsDialog({ open, onOpenChange, descriptor, state, onApply }: { readonly open: boolean; readonly onOpenChange: (open: boolean) => void; readonly descriptor: EntityListDescriptorV1; readonly state: ListLocationStateV1; readonly onApply: (patch: Partial<ListLocationStateV1>) => void }) {
  const preferences = readDisplayPreferences(descriptor.plane), [density, setDensity] = useState(state.density), [mode, setMode] = useState(state.mode), [searchBehavior, setSearchBehavior] = useState<DisplayPreferences["searchBehavior"]>(preferences?.searchBehavior ?? "instant");
  useEffect(() => { if (open) { const saved = readDisplayPreferences(descriptor.plane); setDensity(saved?.density ?? state.density); setMode(saved?.mode ?? state.mode); setSearchBehavior(saved?.searchBehavior ?? "instant"); } }, [open, descriptor.plane, state.density, state.mode]);
  const dirty = density !== (preferences?.density ?? state.density) || mode !== (preferences?.mode ?? state.mode) || searchBehavior !== (preferences?.searchBehavior ?? "instant");
  const reset = () => { clearDisplayPreferences(descriptor.plane); setDensity(descriptor.surface.defaultState.density); setMode(descriptor.surface.defaultState.mode); setSearchBehavior("instant"); };
  return <>

    <Drawer.Toolbar><Drawer.Context aria-label="Display setting context"><Drawer.Metric label="Layout" value={titleCase(mode)}/><Drawer.Metric label="Density" value={titleCase(density)}/><Drawer.Metric label="Search" value={searchBehavior === "instant" ? "As you type" : "On Enter"}/></Drawer.Context></Drawer.Toolbar>
    <Drawer.Body><div className="a-entity-list__view-options"><Label><span>Layout</span><Select value={mode} onChange={(event) => setMode(event.currentTarget.value as ListLocationStateV1["mode"])}>{descriptor.surface.supportedModes.map((item) => <option value={item} key={item}>{titleCase(item)}</option>)}</Select></Label><Label><span>Density</span><Select value={density} onChange={(event) => setDensity(event.currentTarget.value as ListLocationStateV1["density"])}><option value="compact">Compact</option><option value="comfortable">Comfortable</option><option value="spacious">Spacious</option></Select></Label><Label><span>Search behavior</span><Select value={searchBehavior} onChange={(event) => setSearchBehavior(event.currentTarget.value as DisplayPreferences["searchBehavior"])}><option value="instant">Search as I type</option><option value="submit">Search when I press Enter</option></Select></Label></div></Drawer.Body>
    <Drawer.Footer><Drawer.FooterSummary><strong>{dirty ? "Changes ready to save" : "Personal defaults are current"}</strong><span>These preferences apply to lists on this device.</span></Drawer.FooterSummary><Drawer.FooterActions><Button variant="ghost" size="small" onClick={reset}>Reset settings</Button><Drawer.Close className="a-button a-button--secondary a-button--small">Cancel</Drawer.Close><Button size="small" disabled={!dirty} onClick={() => { writeDisplayPreferences(descriptor.plane, { density, mode, searchBehavior }); onApply({ density, mode }); onOpenChange(false); }}>Save settings</Button></Drawer.FooterActions></Drawer.Footer>
  </>;
}

function GroupDialog({ open, onOpenChange, descriptor, group, onApply }: { readonly open: boolean; readonly onOpenChange: (open: boolean) => void; readonly descriptor: EntityListDescriptorV1; readonly group?: string; readonly onApply: (group?: string) => void }) {
  const [draft, setDraft] = useState(group ?? ""), fields = descriptor.fields.filter((field) => field.groupable);
  useEffect(() => { if (open) setDraft(group ?? ""); }, [open, group]);
  const selected = fields.find((field) => field.key === draft), dirty = draft !== (group ?? "");
  return <>

    <Drawer.Toolbar><Drawer.Context aria-label="Grouping context"><Drawer.Metric label="Groupable fields" value={fields.length}/><Drawer.Metric label="Current grouping" value={group ? fields.find((field) => field.key === group)?.label ?? group : "None"}/><Drawer.Metric label="Selected" value={selected?.label ?? "None"}/></Drawer.Context></Drawer.Toolbar>
    <Drawer.Body>{fields.length ? <div className="a-entity-list__group-settings"><Label><span>Grouping field</span><Select value={draft} onChange={(event) => setDraft(event.currentTarget.value)}><option value="">No grouping</option>{fields.map((field) => <option value={field.key} key={field.key}>{field.label}</option>)}</Select></Label><p>Grouping changes presentation only; it does not change the authorized result set.</p></div> : <div className="a-entity-list__dialog-empty">This entity does not publish any groupable fields.</div>}</Drawer.Body>
    <Drawer.Footer><Drawer.FooterSummary><strong>{dirty ? "Changes ready to apply" : selected ? `Grouped by ${selected.label}` : "No grouping applied"}</strong><span>Records will remain in the current authorized list.</span></Drawer.FooterSummary><Drawer.FooterActions><Button variant="ghost" size="small" disabled={!draft} onClick={() => setDraft("")}>Reset grouping</Button><Drawer.Close className="a-button a-button--secondary a-button--small">Cancel</Drawer.Close><Button size="small" disabled={!dirty} onClick={() => { onApply(draft || undefined); onOpenChange(false); }}>Apply grouping</Button></Drawer.FooterActions></Drawer.Footer>
  </>;
}



function EntityRows({ descriptor, page, fields, mode, filters, onFilters, sort, group, query, filtered, loading, selectionEnabled, selectedIds, bookmarkedIds, pendingBookmarkIds, onBookmark, onSelectionChange, onSort }: { readonly descriptor: EntityListDescriptorV1; readonly page: EntityListResultV1; readonly fields: readonly ListFieldDescriptorV1[]; readonly mode: ListLocationStateV1["mode"]; readonly filters: readonly ListFilterV1[]; readonly onFilters: (filters: readonly ListFilterV1[]) => void; readonly sort: readonly ListSortV1[]; readonly group?: string; readonly query?: string; readonly filtered: boolean; readonly loading: boolean; readonly selectionEnabled: boolean; readonly selectedIds: ReadonlySet<string>; readonly bookmarkedIds: ReadonlySet<string>; readonly pendingBookmarkIds: ReadonlySet<string>; readonly onBookmark: (row: EntityListRowV1, favourite: boolean) => void; readonly onSelectionChange: (ids: ReadonlySet<string>) => void; readonly onSort: (field: string, additive: boolean) => void }) {
  const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<string>>(() => new Set());
  const toggleGroup = (label: string) => setCollapsedGroups(current => { const next = new Set(current); if (next.has(label)) next.delete(label); else next.add(label); return next; });
  const groupHeading = (item: {label: string; count: number}) => <button type="button" className="a-entity-list__group-toggle" aria-expanded={!collapsedGroups.has(item.label)} aria-label={`${collapsedGroups.has(item.label) ? "Expand" : "Collapse"} ${item.label} group`} onClick={() => toggleGroup(item.label)}><ChevronDownIcon size={16}/><strong>{item.label}</strong><span>{item.count}</span></button>;
  if (!page.rows.length) { const constrained = Boolean(query?.trim()) || filtered; return <Card className="a-entity-list__state a-entity-list__state--empty"><span className="a-entity-list__state-icon" aria-hidden="true"><SearchIcon size={22}/></span><h2>{query?.trim() ? `No results for “${query.trim()}”` : constrained ? "No matching records" : `No ${descriptor.surface.title.toLocaleLowerCase()} yet`}</h2><p>{constrained ? "Try changing your search or resetting the active filters." : "Records will appear here when they become available in this authorized context."}</p></Card>; }
  const toggle = (id: string, checked: boolean) => { const next = new Set(selectedIds); if (checked) next.add(id); else next.delete(id); onSelectionChange(next); };
  const pageSelected = page.rows.length > 0 && page.rows.every((row) => selectedIds.has(row.id));
  const groups = groupedRows(page, group, descriptor), cards = (rows: readonly EntityListRowV1[]) => <div className="a-entity-list__cards" aria-busy={loading}>{rows.map((row) => { const identity = formatFieldValue(row.values[descriptor.entity.identityField], descriptor.fields.find((field) => field.key === descriptor.entity.identityField)), href = recordHref(descriptor, row); return <Card key={row.id} className="a-entity-list__card"><div className="a-entity-list__card-header">{selectionEnabled ? <Label className="a-entity-list__card-select"><Checkbox checked={selectedIds.has(row.id)} onChange={(event) => toggle(row.id, event.currentTarget.checked)}/> Select record</Label> : null}<BookmarkButton identity={identity} favourite={bookmarkedIds.has(row.id)} pending={pendingBookmarkIds.has(row.id)} onChange={(favourite) => onBookmark(row, favourite)}/></div><h2>{href ? <a className="a-entity-list__record-link" href={href}>{highlightText(identity, query)}</a> : highlightText(identity, query)}</h2><dl>{fields.filter((field) => field.key !== descriptor.entity.identityField).map((field) => <div key={field.key}><dt>{field.label}</dt><dd>{href && isRecordLinkField(field, descriptor) ? <a className="a-entity-list__record-link" href={href}>{renderFieldValue(row.values[field.key], field, query)}</a> : renderFieldValue(row.values[field.key], field, query)}</dd></div>)}</dl></Card>; })}</div>;
  if (mode === "compact") return group ? <div className="a-entity-list__groups">{groups.map((item) => <section key={item.label}><h2>{groupHeading(item)}</h2>{collapsedGroups.has(item.label) ? null : cards(item.rows)}</section>)}</div> : cards(page.rows);
  const openRecord = (row: EntityListRowV1) => { const href = recordHref(descriptor, row); if (href) window.location.assign(href); };
  const tableRows = (rows: readonly EntityListRowV1[]) => rows.map((row) => { const href = recordHref(descriptor, row), identity = formatFieldValue(row.values[descriptor.entity.identityField]); return <tr key={row.id} tabIndex={href ? 0 : undefined} onKeyDown={(event) => { if (event.key === "Enter" && !(event.target instanceof HTMLInputElement || event.target instanceof HTMLButtonElement || event.target instanceof HTMLAnchorElement)) openRecord(row); if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); const sibling = event.key === "ArrowDown" ? event.currentTarget.nextElementSibling : event.currentTarget.previousElementSibling; (sibling as HTMLElement | null)?.focus(); } }}>{selectionEnabled ? <td className="a-entity-list__selection-cell" data-label="Select"><Checkbox aria-label={`Select ${identity}`} checked={selectedIds.has(row.id)} onChange={(event) => toggle(row.id, event.currentTarget.checked)}/></td> : null}{fields.map((field) => <td key={field.key} data-label={field.label} title={formatFieldValue(row.values[field.key], field)}>{href && isRecordLinkField(field, descriptor) ? <a className="a-entity-list__record-link" href={href}>{renderFieldValue(row.values[field.key], field, query)}</a> : renderFieldValue(row.values[field.key], field, query)}</td>)}<td className="a-entity-list__bookmark-cell" data-label="Favourite"><BookmarkButton identity={identity} favourite={bookmarkedIds.has(row.id)} pending={pendingBookmarkIds.has(row.id)} onChange={(favourite) => onBookmark(row, favourite)}/></td><td className="a-entity-list__row-actions"><RowMenu descriptor={descriptor} row={row}/></td></tr>; });
  const columnCount = fields.length + 2 + Number(selectionEnabled);
  return <StickyListTable aria-busy={loading}><table className="a-entity-list__table"><caption className="a-visually-hidden">{descriptor.surface.title}</caption><thead><tr>{selectionEnabled ? <th scope="col" className="a-entity-list__selection-cell"><Checkbox aria-label="Select current page" checked={pageSelected} onChange={(event) => { const next = new Set(selectedIds); for (const row of page.rows) if (event.currentTarget.checked) next.add(row.id); else next.delete(row.id); onSelectionChange(next); }}/></th> : null}{fields.map((field) => { const sortIndex = sort.findIndex((item) => item.field === field.key), active = sortIndex >= 0 ? sort[sortIndex] : undefined; return <th key={field.key} scope="col" aria-sort={active ? active.direction === "asc" ? "ascending" : "descending" : "none"} style={field.defaultWidth ? { width: field.defaultWidth, minWidth: field.defaultWidth } : undefined}><div className="a-entity-list__column-heading">{field.sortable ? <button type="button" className="a-entity-list__sort-header" aria-label={sortHeaderLabel(field.label, active, sortIndex, sort.length)} title={sortHeaderTitle(active, descriptor.limits.maxSortLevels)} onClick={(event) => onSort(field.key, event.shiftKey)}><span>{field.label}</span><ColumnSortIndicator active={active} priority={sort.length > 1 ? sortIndex + 1 : undefined}/></button> : <span>{field.label}</span>}{field.filterOperators.length ? <ColumnFilter descriptor={descriptor} field={field} filters={filters} onApply={onFilters}/> : null}</div></th>; })}<th scope="col" className="a-entity-list__bookmark-heading"><span className="a-visually-hidden">Favourite</span></th><th scope="col" className="a-entity-list__actions-heading"><span className="a-visually-hidden">Actions</span></th></tr></thead><tbody>{group ? groups.flatMap((item) => [<tr className="a-entity-list__group-row" key={`group-${item.label}`}><th colSpan={columnCount} scope="rowgroup">{groupHeading(item)}</th></tr>, ...(collapsedGroups.has(item.label) ? [] : tableRows(item.rows))]) : tableRows(page.rows)}</tbody></table></StickyListTable>;
}

function SelectionBar({ descriptor, page, selectedRows, bookmarkedIds, selectedCount, allMatching, onBookmarks, onSelectAllMatching, onExport, onClear }: { readonly descriptor: EntityListDescriptorV1; readonly page?: EntityListResultV1; readonly selectedRows: readonly EntityListRowV1[]; readonly bookmarkedIds: ReadonlySet<string>; readonly selectedCount: number; readonly allMatching: boolean; readonly onBookmarks: (operation: "add" | "remove") => void; readonly onSelectAllMatching: () => void; readonly onExport?: () => void; readonly onClear: () => void }) { const total = page?.pagination.total, bookmarkedCount = selectedRows.filter((row) => bookmarkedIds.has(row.id)).length, effectiveCount = allMatching && total !== undefined ? total : selectedCount; return <div className="a-entity-list__selection-bar" role="status"><div className="a-entity-list__selection-summary"><strong>{new Intl.NumberFormat().format(effectiveCount)}{allMatching ? " matching records selected" : " selected"}</strong><span>{allMatching ? "Selection includes all pages." : selectedCount === page?.rows.length ? `${selectedCount} records on this page selected.` : ""}</span></div>{!allMatching && total !== undefined && total > selectedCount && descriptor.dataOperations?.export.filtered.state === "enabled" ? <Button size="small" variant="secondary" onClick={onSelectAllMatching}>Select all {new Intl.NumberFormat().format(total)} matching records</Button> : null}<div className="a-entity-list__selection-actions">{!allMatching ? <Menu><MenuTrigger><StarIcon size={16}/>Favourites <ChevronDownIcon size={14}/></MenuTrigger><MenuContent portal className="a-entity-list__selection-favourites-menu">{bookmarkedCount < selectedRows.length ? <MenuItem onClick={() => onBookmarks("add")}><StarIcon size={16}/>Add selected to favourites</MenuItem> : null}{bookmarkedCount > 0 ? <MenuItem onClick={() => onBookmarks("remove")}><StarIcon size={16}/>Remove selected from favourites</MenuItem> : null}</MenuContent></Menu> : null}{onExport ? <Button size="small" variant="secondary" onClick={onExport}><DownloadIcon size={16}/>Export</Button> : null}<Button size="small" variant="ghost" onClick={onClear}>Clear selection</Button></div></div>; }
function BookmarkButton({ identity, favourite, pending, onChange }: { readonly identity: string; readonly favourite: boolean; readonly pending: boolean; readonly onChange: (favourite: boolean) => void }) { const label = favourite ? `Remove ${identity} from favourites` : `Add ${identity} to favourites`; return <button type="button" className="a-entity-list__bookmark" data-bookmarked={favourite || undefined} aria-label={label} aria-pressed={favourite} title={label} disabled={pending} onClick={() => onChange(!favourite)}><StarIcon size={18}/></button>; }
function RowMenu({ descriptor, row }: { readonly descriptor: EntityListDescriptorV1; readonly row: EntityListRowV1 }) { const identity = formatFieldValue(row.values[descriptor.entity.identityField], descriptor.fields.find((field) => field.key === descriptor.entity.identityField)), href = recordHref(descriptor, row); return <Menu><MenuTrigger aria-label={`Actions for ${identity}`} title={`Actions for ${identity}`}><MoreVerticalIcon size={18}/></MenuTrigger><MenuContent portal className="a-entity-list__row-menu">{href ? <MenuItem onClick={() => window.location.assign(href)}><EyeIcon size={16}/>View</MenuItem> : null}<MenuItem onClick={() => void navigator.clipboard?.writeText(identity)}><CopyIcon size={16}/>Copy</MenuItem></MenuContent></Menu>; }
function ListFooter({ descriptor, state, page, loading, cursorHistory, onPrevious, onNext, onPageSize }: { readonly descriptor: EntityListDescriptorV1; readonly state: ListLocationStateV1; readonly page: EntityListResultV1; readonly loading: boolean; readonly cursorHistory: readonly (string | undefined)[]; readonly onPrevious: () => void; readonly onNext: () => void; readonly onPageSize: (value: number) => void }) { if (!page.rows.length) return null; const pageSize = state.pageSize ?? descriptor.limits.defaultPageSize, start = (state.pageIndex ?? cursorHistory.length) * pageSize + 1, end = start + page.rows.length - 1, formattedRange = `${new Intl.NumberFormat().format(start)}–${new Intl.NumberFormat().format(end)}`, total = page.pagination.total, countPrefix = page.pagination.countMode === "approximate" ? "≈" : "", summary = total === undefined ? `Showing ${formattedRange}${page.pagination.hasNext ? " · more available" : ""}` : `Showing ${formattedRange} of ${countPrefix}${new Intl.NumberFormat().format(total)}`; return <nav className="a-entity-list__pagination" aria-label="List pagination"><span aria-live="polite" title={page.pagination.countMode === "cached" ? "Recently calculated result count" : undefined}>{summary}</span><div className="a-entity-list__page-controls"><Label><span>Rows per page</span><Select value={pageSize} onChange={(event) => onPageSize(Number(event.currentTarget.value))}>{descriptor.limits.allowedPageSizes.map((size) => <option value={size} key={size}>{size}</option>)}</Select></Label><div className="a-entity-list__page-buttons"><Button size="small" variant="secondary" disabled={!cursorHistory.length || loading} onClick={onPrevious}>Previous</Button><Button size="small" variant="secondary" disabled={!page.pagination.hasNext || !page.pagination.nextCursor || loading} onClick={onNext}>Next</Button></div></div></nav>; }

function LoadingFooter() {
  return <div className="a-entity-list__pagination" aria-hidden="true"><span className="a-skeleton a-entity-list__skeleton-range"/><div className="a-entity-list__page-controls"><span className="a-skeleton a-entity-list__skeleton-page-size"/><div className="a-entity-list__page-buttons"><span className="a-skeleton a-entity-list__skeleton-page-button"/><span className="a-skeleton a-entity-list__skeleton-page-button"/></div></div></div>;
}

function recordHref(descriptor: EntityListDescriptorV1, row: EntityListRowV1): string | undefined { return descriptor.entity.detailRouteTemplate?.replace(":recordId", encodeURIComponent(row.id)); }
function isRecordLinkField(field: ListFieldDescriptorV1, descriptor: EntityListDescriptorV1): boolean { return field.key === descriptor.entity.identityField || field.semanticRole === "title"; }
function ColumnFilter({ descriptor, field, filters, onApply }: { readonly descriptor: EntityListDescriptorV1; readonly field: ListFieldDescriptorV1; readonly filters: readonly ListFilterV1[]; readonly onApply: (filters: readonly ListFilterV1[]) => void }) {
  const [open, setOpen] = useState(false), trigger = useRef<HTMLButtonElement>(null), panel = useRef<HTMLDivElement>(null), id = useId();
  const current = filters.filter(item => item.field === field.key);
  const fresh = (): DraftFilter => ({ id: String(Math.random()), field: field.key, operator: field.filterOperators[0]!, value: "" });
  const [draft, setDraft] = useState<readonly DraftFilter[]>([]);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const close = () => { setOpen(false); trigger.current?.focus(); };
  useEffect(() => {
    if (!open) return;
    const view = trigger.current!.ownerDocument.defaultView!, document = view.document;
    const place = () => {
      const rect = trigger.current!.getBoundingClientRect(), height = panel.current?.offsetHeight ?? 0, width = panel.current?.offsetWidth || 340;
      setPosition({ left: Math.max(8, Math.min(rect.left, view.innerWidth - width - 8)), top: Math.max(8, Math.min(rect.bottom + 8, view.innerHeight - height - 8)) });
    };
    place(); panel.current?.querySelector<HTMLElement>('select, input, button')?.focus();
    const outside = (event: Event) => { if (!panel.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); close(); } };
    document.addEventListener("pointerdown", outside, true); document.addEventListener("focusin", outside, true); document.addEventListener("keydown", escape);
    view.addEventListener("scroll", place, true); view.addEventListener("resize", place);
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(place); if (panel.current) observer?.observe(panel.current);
    return () => { document.removeEventListener("pointerdown", outside, true); document.removeEventListener("focusin", outside, true); document.removeEventListener("keydown", escape); view.removeEventListener("scroll", place, true); view.removeEventListener("resize", place); observer?.disconnect(); };
  }, [open]);
  const valid = draft.every(item => !filterValidationError(field, item.operator, item.value));
  const apply = (next: readonly ListFilterV1[]) => { rememberFilters(recentFilterKey(descriptor), next, descriptor.fields); onApply([...filters.filter(item => item.field !== field.key), ...next]); close(); };
  return <><button ref={trigger} type="button" className={`a-entity-list__column-filter${current.length ? " a-entity-list__column-filter--active" : ""}`} aria-label={`Filter ${field.label}${current.length ? `, ${current.length} active` : ""}`} title={`Filter ${field.label}`} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => { setDraft(current.length ? current.map((item, index) => ({ id: String(index), field: field.key, operator: item.operator, value: filterInputValue(item, field.valueKind) })) : [fresh()]); setOpen(!open); }}><FilterIcon size={15}/></button>{open ? createPortal(<div ref={panel} id={id} role="dialog" aria-label={`Filter ${field.label}`} className="a-entity-list__column-filter-popover" style={position}>
    <strong>Filter {field.label}</strong>
    {draft.map((item, index) => <div className="a-entity-list__column-filter-rule" key={item.id}><Select aria-label={`Operator for ${field.label} filter ${index + 1}`} value={item.operator} onChange={event => setDraft(draft.map(row => row.id === item.id ? { ...row, operator: event.currentTarget.value as ListFilterOperator, value: "" } : row))}>{field.filterOperators.map(operator => <option key={operator} value={operator}>{operatorLabel(operator, field)}</option>)}</Select><FilterValueEditor historyKey={recentFilterKey(descriptor)} field={field} operator={item.operator} value={item.value} filterNumber={index + 1} onChange={value => setDraft(draft.map(row => row.id === item.id ? { ...row, value } : row))}/>{draft.length > 1 ? <Button variant="ghost" size="small" onClick={() => setDraft(draft.filter(row => row.id !== item.id))}>Remove condition {index + 1}</Button> : null}</div>)}
    <div className="a-entity-list__dialog-actions"><Button variant="ghost" size="small" disabled={!current.length} onClick={() => apply([])}>Clear</Button><Button variant="secondary" size="small" onClick={close}>Cancel</Button><Button size="small" disabled={!valid} onClick={() => apply(draft.map(item => ({ field: field.key, operator: item.operator, value: filterValueFromInput(item.operator, item.value, field.valueKind, field.filterOptions) })))}>Apply</Button></div>
  </div>, trigger.current!.ownerDocument.body) : null}</>;
}

function ColumnSortIndicator({ active, priority }: { readonly active?: ListSortV1; readonly priority?: number }) { const Icon = active?.direction === "asc" ? ArrowUpIcon : active?.direction === "desc" ? ArrowDownIcon : ArrowUpDownIcon; return <span className={`a-entity-list__sort-indicator${active ? " a-entity-list__sort-indicator--active" : ""}`} aria-hidden="true"><Icon size={15}/>{active && priority ? <small>{priority}</small> : null}</span>; }
function sortHeaderLabel(label: string, active: ListSortV1 | undefined, index: number, levels: number): string { const action = !active ? "sort ascending" : active.direction === "asc" ? "sort descending" : "clear sorting"; if (!active) return `${label}, not sorted. Activate to ${action}.`; return `${label}, sorted ${active.direction === "asc" ? "ascending" : "descending"}${levels > 1 ? `, priority ${index + 1}` : ""}. Activate to ${action}.`; }
function sortHeaderTitle(active: ListSortV1 | undefined, maximum: number): string { const action = !active ? "Sort ascending" : active.direction === "asc" ? "Sort descending" : "Clear sorting"; return maximum > 1 ? `${action}. Shift-click to manage multi-column sorting.` : action; }

function renderFieldValue(value: JsonValue | undefined, field: ListFieldDescriptorV1, query?: string): ReactNode { const display = formatFieldValue(value, field), highlighted = highlightText(display, query); if (field.semanticRole === "status") { const normalized = String(value ?? "").toLowerCase(); return <span className={`a-entity-list__status a-entity-list__status--${normalized === "active" ? "success" : normalized === "draft" ? "warning" : "neutral"}`}><span aria-hidden="true"/>{highlighted}</span>; } return highlighted; }
function formatFieldValue(value: JsonValue | undefined, field?: ListFieldDescriptorV1): string { if (value === undefined || value === null || value === "") return "—"; if (typeof value === "boolean") return value ? "Yes" : "No"; if (typeof value === "object") return JSON.stringify(value); if (field?.valueKind === "datetime" || field?.valueKind === "date") { const date = new Date(String(value)); if (!Number.isNaN(date.getTime())) return new Intl.DateTimeFormat(undefined, field.valueKind === "date" ? { dateStyle: "medium" } : { dateStyle: "medium", timeStyle: "short" }).format(date); } if (field?.semanticRole === "country_code" && typeof Intl.DisplayNames === "function") { try { return new Intl.DisplayNames(undefined, { type: "region" }).of(String(value).toUpperCase()) ?? String(value); } catch { return String(value); } } if (field?.valueKind === "enum") return String(value).replace(/[_-]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase()); return String(value); }
async function copyText(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(value); return true; }
    const control = document.createElement("textarea");
    control.value = value; control.readOnly = true; control.className = "a-visually-hidden"; document.body.append(control); control.select();
    const copied = typeof document.execCommand === "function" && document.execCommand("copy");
    control.remove(); return copied;
  } catch { return false; }
}
function highlightText(value: string, query?: string): ReactNode { const needle = query?.trim(); if (!needle || needle.length < 2) return value; const index = value.toLocaleLowerCase().indexOf(needle.toLocaleLowerCase()); if (index < 0) return value; return <>{value.slice(0, index)}<mark>{value.slice(index, index + needle.length)}</mark>{value.slice(index + needle.length)}</>; }
function searchHint(descriptor: EntityListDescriptorV1): string { const priority = (field: ListFieldDescriptorV1) => field.key === descriptor.entity.identityField ? 0 : /display.?name|\bname\b/i.test(`${field.key} ${field.label}`) ? 1 : field.semanticRole === "country_code" || /country/i.test(`${field.key} ${field.label}`) ? 2 : 10 + field.defaultOrder; return [...descriptor.fields].sort((left, right) => priority(left) - priority(right)).slice(0, 3).map((field) => field.label.replace(new RegExp(`^${descriptor.entity.label}\\s+`, "i"), "").toLocaleLowerCase()).join(", "); }
function listCountLabel(page?: EntityListResultV1): string | undefined { const count = page?.pagination.total; return count === undefined ? undefined : `${page?.pagination.countMode === "approximate" ? "≈" : ""}${new Intl.NumberFormat().format(count)}`; }
function groupedRows(page: EntityListResultV1, group: string | undefined, descriptor: EntityListDescriptorV1): readonly { readonly label: string; readonly count: number; readonly rows: readonly EntityListRowV1[] }[] { if (!group) return [{ label: "All records", count: page.rows.length, rows: page.rows }]; const field = descriptor.fields.find((candidate) => candidate.key === group), authoritativeCounts = new Map((page.groups ?? []).map((bucket) => [formatFieldValue(bucket.value, field), bucket.count ?? 0])), buckets = new Map<string, EntityListRowV1[]>(); for (const row of page.rows) { const label = formatFieldValue(row.values[group], field), bucket = buckets.get(label) ?? []; bucket.push(row); buckets.set(label, bucket); } return [...buckets].sort(([left], [right]) => left.localeCompare(right)).map(([label, grouped]) => ({ label, count: authoritativeCounts.get(label) ?? grouped.length, rows: grouped })); }
function nextSort(current: readonly ListSortV1[], field: string, maximum: number, additive: boolean): readonly ListSortV1[] { if (!additive || maximum <= 1) return nextPrimarySort(current, field); const index = current.findIndex((item) => item.field === field); if (index < 0) return Object.freeze([...current, { field, direction: "asc" as const }].slice(0, maximum)); const active = current[index]!; if (active.direction === "asc") return Object.freeze(current.map((item, itemIndex) => itemIndex === index ? { ...item, direction: "desc" as const } : item)); return Object.freeze(current.filter((_item, itemIndex) => itemIndex !== index)); }
function titleCase(value: string): string { return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase()); }
function moveItem<T>(items: readonly T[], from: number, to: number): readonly T[] { if (to < 0 || to >= items.length) return items; const next = [...items], [item] = next.splice(from, 1); if (item !== undefined) next.splice(to, 0, item); return next; }
function operatorLabel(operator: ListFilterOperator, field?: ListFieldDescriptorV1): string { if (field && ["date", "datetime"].includes(field.valueKind)) { const label = { eq: field.valueKind === "date" ? "On" : "At", ne: field.valueKind === "date" ? "Not on" : "Not at", gt: "After", gte: "On or after", lt: "Before", lte: "On or before" }[operator as "eq"]; if (label) return label; } return ({ eq: "Equals", ne: "Does not equal", in: "Any of", contains: "Contains", starts_with: "Starts with", gt: "Greater than", gte: "At least", lt: "Less than", lte: "At most", between: "Between", is_null: "Is empty", is_not_null: "Is not empty", relative: "Relative period" })[operator]; }
function writeLocation(state: ListLocationStateV1, descriptor: EntityListDescriptorV1, history: "replace" | "push") { writeListLocation(state, descriptor, history); }
function asTransportError(cause: unknown): ApiTransportError { return cause instanceof ApiTransportError ? cause : new ApiTransportError("parse", "The list response could not be verified", 0, undefined, undefined, undefined, undefined, { cause }); }
function ListFrame({ title, loading, error, retry, contentOnly = false, headerOnly = false, density = "comfortable" }: { readonly contentOnly?: boolean; readonly headerOnly?: boolean; readonly density?: "compact" | "comfortable" | "spacious"; readonly title: string; readonly loading: boolean; readonly error?: ApiTransportError; readonly retry: () => void }) {
  return <PageFrame width="wide" className={`a-entity-list a-entity-list--${density}`} aria-busy={loading}>
    {!contentOnly && !error ? <PageHeader className={`a-entity-list__header${loading ? " a-entity-list__header--loading" : ""}`} level="collection" title={loading ? <><span className="a-visually-hidden">Loading list</span><span aria-hidden="true" className="a-skeleton a-entity-list__skeleton-title"/></> : title} description={loading ? <span aria-hidden="true" className="a-skeleton a-entity-list__skeleton-description"/> : undefined} icon={loading ? <span aria-hidden="true" className="a-skeleton a-entity-list__skeleton-icon"/> : <LayoutIcon/>} actions={loading ? <span aria-hidden="true" className="a-skeleton a-entity-list__skeleton-action"/> : undefined}/> : null}
    {error ? <ErrorState error={error} retry={retry} application={headerOnly}/> : loading ? <>{!contentOnly ? <EntityNavigationSkeleton/> : null}{!headerOnly ? <div className="a-entity-list__panel"><div className="a-entity-list__chrome" aria-hidden="true"><ManagementToolbar className="a-entity-list__query-row"><Skeleton className="a-entity-list__skeleton-search"/><Skeleton className="a-entity-list__skeleton-control"/><Skeleton className="a-entity-list__skeleton-control"/></ManagementToolbar></div><LoadingTable columns={6}/><LoadingFooter/></div> : null}</> : null}
  </PageFrame>;
}
function ErrorState({ error, retry, compact = false, application = false }: { readonly error: ApiTransportError; readonly retry: () => void; readonly compact?: boolean; readonly application?: boolean }) {
  return <Card className={`a-entity-list__state a-entity-list__state--error${compact ? " a-entity-list__state--inline" : " a-entity-list__state--empty"}`} role="alert">
    <span className="a-entity-list__state-icon" aria-hidden="true"><RefreshCwIcon/></span>
    <div><h2>{application ? "This application is unavailable" : compact ? "The latest results could not be loaded" : "This list is unavailable"}</h2><p>We couldn’t load this page. Please try again.</p></div>
    <Button size="small" variant="secondary" onClick={retry}>Try again</Button>
    <details className="a-entity-list__error-details"><summary>Technical details</summary><p>{error.message}</p>{error.requestId ? <small>Request ID: {error.requestId}</small> : null}</details>
  </Card>;
}
function LoadingTable({ columns }: { readonly columns: number }) {
  const count = Math.max(1, Math.min(columns, 12));
  return <StickyListTable role="status" aria-label="Loading records" aria-busy="true"><table className="a-entity-list__table a-entity-list__skeleton-table" aria-hidden="true"><thead><tr>{Array.from({length: count}, (_, i) => <th key={i}><Skeleton/></th>)}</tr></thead><tbody>{Array.from({length: 10}, (_, row) => <tr key={row}>{Array.from({length: count}, (_, column) => <td key={column}><Skeleton/></td>)}</tr>)}</tbody></table></StickyListTable>;
}

export { describeFilter, nextPrimarySort, visibleListFields, withoutNavigation } from "./state";
export { ListScopeControl, type ListScopeControlProps, type ListScopeOption } from "./scope-control";
export { RecordTransferWorkspace } from "./transfer-workspace";
export { RecordImportWorkspace, type RecordImportWorkspaceProps } from "./import-workspace";

export { StickyListTable } from "./sticky-table";
