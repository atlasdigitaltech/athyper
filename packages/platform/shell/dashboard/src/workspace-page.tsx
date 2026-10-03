"use client";

import type { CatalogModuleRoute, CatalogWorkspaceRoute } from "@athyper/contract-platform-navigation";
import { entityDirectoryOperation, type EntityDirectoryItemV1 } from "@athyper/platform-api-client";
import { useEntityI18n } from "@athyper/platform-i18n/entity-react";
import { ChevronRightIcon, PlusIcon, StarIcon, resolveMetadataIcon } from "@athyper/platform-icons";
import { ManagementWorkspace, PageHeader, readQuickAccessRecent, type ShellQuickAccessItem } from "@athyper/platform-shell";
import { useApiClient, useApplicationNavigation, useSessionIdentity } from "@athyper/platform-shell-app-foundation";
import { Button, Menu, MenuContent, MenuItem, MenuTrigger } from "@athyper/platform-ui";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

const MAX_ENTITY_ROWS = 4, MAX_RECENT = 3;

type DirectoryState =
  | { readonly status: "loading" }
  | { readonly status: "error" }
  | { readonly status: "ready"; readonly items: ReadonlyMap<string, EntityDirectoryItemV1> };

/** The entities placed in these modules that the caller may open (server-authorized). */
function useEntityDirectory(modules: readonly CatalogModuleRoute[]) {
  const client = useApiClient();
  const codes = useMemo(() => [...new Set(modules.flatMap((module) => module.entities.map((entity) => entity.code)))].slice(0, 50), [modules]);
  const key = codes.join(",");
  const [state, setState] = useState<DirectoryState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!codes.length) { setState({ status: "ready", items: new Map() }); return; }
    const controller = new AbortController();
    setState({ status: "loading" });
    client.request(entityDirectoryOperation, { query: { entity: codes }, signal: controller.signal })
      .then((items) => { if (!controller.signal.aborted) setState({ status: "ready", items: new Map(items.map((item) => [item.entityCode, item])) }); })
      .catch(() => { if (!controller.signal.aborted) setState({ status: "error" }); });
    return () => controller.abort();
    // `key` stands for the code list.
  }, [client, key, attempt]);
  return { state, retry: useCallback(() => setAttempt((value) => value + 1), []) };
}

/** Records opened recently in this browser, for the signed-in account. */
function useRecentRecords(displayName: string) {
  const scope = useSessionIdentity().scope;
  const [items, setItems] = useState<readonly ShellQuickAccessItem[]>([]);
  useEffect(() => {
    if (!scope?.tenantId || !scope.principalId) return;
    setItems(readQuickAccessRecent(displayName, scope.tenantId, scope.principalId).filter((item) => item.kind === "record"));
  }, [displayName, scope?.tenantId, scope?.principalId]);
  return items;
}

function recentFor(items: readonly ShellQuickAccessItem[], workspace: CatalogWorkspaceRoute, module: CatalogModuleRoute, entityCodes: readonly string[]) {
  const prefixes = module.entities
    .filter((entity) => entityCodes.includes(entity.code))
    .flatMap((entity) => [`/app/entity/${entity.code}/`, `/${workspace.routeSlug}/${module.routeSlug}/${entity.routeSlug}/`]);
  return items.filter((item) => prefixes.some((prefix) => item.href.startsWith(prefix))).slice(0, MAX_RECENT);
}

export interface WorkspaceLandingProps {
  readonly displayName: string;
  readonly workspace: CatalogWorkspaceRoute;
  readonly workspaceName: string;
  readonly description?: string;
  /** Module descriptions from the catalog's module cards. */
  readonly moduleDescriptions: Readonly<Record<string, string>>;
  readonly orderedModuleCodes: readonly string[];
  readonly pinnedModuleCodes: readonly string[];
  readonly badges: Readonly<Record<string, string>>;
  readonly onTogglePinned: (moduleCode: string) => void;
  /** The workspace's module tabs (Home, modules, More). */
  readonly navigation: ReactNode;
  readonly accessory?: ReactNode;
}

/** Workspace home: the entity-list page frame with one card per module the caller is entitled to. */
export function WorkspaceLanding(props: WorkspaceLandingProps) {
  const intl = useEntityI18n();
  const byCode = new Map(props.workspace.modules.map((module) => [module.code, module]));
  const modules = props.orderedModuleCodes.flatMap((code) => { const module = byCode.get(code); return module ? [module] : []; });
  const directory = useEntityDirectory(modules);
  const recent = useRecentRecords(props.displayName);
  const Icon = resolveMetadataIcon("workspace", props.workspace.iconKey);
  const available = directory.state.status === "ready"
    ? modules.reduce((sum, module) => sum + module.entities.filter((entity) => (directory.state as { items: ReadonlyMap<string, unknown> }).items.has(entity.code)).length, 0)
    : undefined;
  return (
    <ManagementWorkspace
      className="athyper-workspace-landing"
      header={
        <PageHeader
          level="collection"
          title={props.workspaceName}
          icon={<Icon />}
          description={props.description}
          metadata={
            <span className="athyper-workspace-landing__counts">
              {intl.message("workspace.moduleCount", { count: modules.length })}
              {available !== undefined ? <> · {intl.message("workspace.entityCount", { count: available })}</> : null}
            </span>
          }
        />
      }
      navigation={props.navigation}
    >
      {props.accessory}
      <h2 className="athyper-workspace-landing__heading">{intl.message("workspace.modulesHeading")}</h2>
      <DirectoryStatus state={directory.state} retry={directory.retry} />
      <ul className="athyper-workspace-landing__grid">
        {modules.map((module) => (
          <li key={module.code}>
            <ModuleCard
              workspace={props.workspace}
              module={module}
              description={props.moduleDescriptions[module.code]}
              directory={directory.state}
              recent={recent}
              badge={props.badges[module.code]}
              pinned={props.pinnedModuleCodes.includes(module.code)}
              onTogglePinned={() => props.onTogglePinned(module.code)}
            />
          </li>
        ))}
      </ul>
    </ManagementWorkspace>
  );
}

function DirectoryStatus({ state, retry }: { readonly state: DirectoryState; readonly retry: () => void }) {
  const intl = useEntityI18n();
  if (state.status === "loading") return <p className="athyper-workspace-landing__status" role="status">{intl.message("workspace.loading")}</p>;
  if (state.status === "error")
    return (
      <div className="athyper-workspace-landing__status" role="alert">
        <span>{intl.message("workspace.unavailable")}</span>
        <Button size="small" variant="secondary" onClick={retry}>{intl.message("workspace.tryAgain")}</Button>
      </div>
    );
  return null;
}

function ModuleCard({ workspace, module, description, directory, recent, badge, pinned, onTogglePinned }: {
  readonly workspace: CatalogWorkspaceRoute;
  readonly module: CatalogModuleRoute;
  readonly description?: string;
  readonly directory: DirectoryState;
  readonly recent: readonly ShellQuickAccessItem[];
  readonly badge?: string;
  readonly pinned: boolean;
  readonly onTogglePinned: () => void;
}) {
  const intl = useEntityI18n();
  const Icon = resolveMetadataIcon("module", module.iconKey);
  const moduleHref = `/${workspace.routeSlug}/${module.routeSlug}`;
  const entities = directory.status === "ready"
    ? module.entities.flatMap((entity) => { const item = directory.items.get(entity.code); return item ? [item] : []; })
    : [];
  const records = recentFor(recent, workspace, module, entities.map((entity) => entity.entityCode));
  const titleId = `module-card-${module.code}`;
  return (
    <article className="athyper-module-card" aria-labelledby={titleId} data-pinned={pinned || undefined} data-empty={directory.status === "ready" && !entities.length ? true : undefined}>
      <header className="athyper-module-card__header">
        <span className="athyper-module-card__icon" aria-hidden="true"><Icon size={20} /></span>
        <div className="athyper-module-card__identity">
          <h3 id={titleId}><a href={moduleHref}>{module.name}<ChevronRightIcon className="athyper-module-card__go" size={16} aria-hidden="true" /></a></h3>
          {description ? <p>{description}</p> : null}
        </div>
        <button
          type="button"
          className="athyper-module-card__pin"
          aria-pressed={pinned}
          aria-label={intl.message(pinned ? "workspace.unpin" : "workspace.pin", { module: module.name })}
          onClick={onTogglePinned}
        >
          <StarIcon size={16} />
        </button>
      </header>
      {badge ? (
        <a className="athyper-module-card__todo" href={`/inbox?workspace=${workspace.routeSlug}&module=${module.routeSlug}`}>
          {intl.message("workspace.toDo", { count: Number(badge) || 0 })}
        </a>
      ) : null}
      {directory.status === "ready" ? (
        entities.length ? (
          <section className="athyper-module-card__entities" aria-label={intl.message("workspace.entitiesHeading")}>
            <h4>{intl.message("workspace.entitiesHeading")} <span>{entities.length}</span></h4>
            <ul>
              {entities.slice(0, MAX_ENTITY_ROWS).map((entity) => {
                const EntityIcon = resolveMetadataIcon("entity", entity.iconKey);
                return (
                  <li key={entity.entityCode}>
                    <a href={`/app/entity/${entity.entityCode}`}>
                      <EntityIcon size={16} aria-hidden="true" />
                      <span>
                        <strong>{entity.title}</strong>
                        {entity.description ? <small>{entity.description}</small> : null}
                      </span>
                      {entity.count !== undefined ? <em className="athyper-module-card__count">{intl.message("workspace.recordCount", { count: entity.count })}</em> : null}
                      <ChevronRightIcon size={16} aria-hidden="true" className="athyper-module-card__chevron" />
                    </a>
                  </li>
                );
              })}
            </ul>
            {entities.length > MAX_ENTITY_ROWS ? (
              <a className="athyper-module-card__more" href={moduleHref}>{intl.message("workspace.more", { count: entities.length - MAX_ENTITY_ROWS })}</a>
            ) : null}
          </section>
        ) : (
          <p className="athyper-module-card__empty">{intl.message("workspace.noEntities")}</p>
        )
      ) : null}
      {records.length ? (
        <section className="athyper-module-card__recent" aria-label={intl.message("workspace.recentRecords", { module: module.name })}>
          <h4>{intl.message("workspace.recent")}</h4>
          <ul>{records.map((record) => <li key={record.href}><a href={record.href}>{record.label}</a></li>)}</ul>
        </section>
      ) : null}
      <footer className="athyper-module-card__footer">
        <NewMenu moduleName={module.name} entities={entities} />
      </footer>
    </article>
  );
}

/** "New" offers only the create actions the server authorized for this caller. */
function NewMenu({ moduleName, entities }: { readonly moduleName: string; readonly entities: readonly EntityDirectoryItemV1[] }) {
  const intl = useEntityI18n();
  const navigation = useApplicationNavigation();
  const actions = entities.flatMap((entity) => entity.actions.slice(0, 1).map((action) => ({ ...action, entity: entity.title })));
  if (!actions.length) return null;
  if (actions.length === 1)
    return (
      <a className="a-button a-button--primary a-button--small" href={actions[0]!.href}>
        <PlusIcon size={16} aria-hidden="true" />{actions[0]!.label}
      </a>
    );
  return (
    <Menu>
      <MenuTrigger variant="secondary" className="athyper-module-card__new" aria-label={intl.message("workspace.newIn", { module: moduleName })}>
        <PlusIcon size={16} aria-hidden="true" />{intl.message("workspace.new")}
      </MenuTrigger>
      <MenuContent portal aria-label={intl.message("workspace.newIn", { module: moduleName })}>
        {actions.map((action) => (
          <MenuItem key={`${action.entity}:${action.key}`} onClick={() => navigation.push(action.href)}>
            <span><strong>{action.label}</strong><small>{action.entity}</small></span>
          </MenuItem>
        ))}
      </MenuContent>
    </Menu>
  );
}

export interface ModuleLandingProps {
  readonly displayName: string;
  readonly workspace: CatalogWorkspaceRoute;
  readonly module: CatalogModuleRoute;
  readonly description?: string;
  readonly navigation: ReactNode;
}

/** Module home: the same frame, with a card per entity placed in the module. */
export function ModuleLanding(props: ModuleLandingProps) {
  const intl = useEntityI18n();
  const modules = useMemo(() => [props.module], [props.module]);
  const directory = useEntityDirectory(modules);
  const recent = useRecentRecords(props.displayName);
  const Icon = resolveMetadataIcon("module", props.module.iconKey);
  const entities = directory.state.status === "ready"
    ? props.module.entities.flatMap((entity) => { const item = (directory.state as { items: ReadonlyMap<string, EntityDirectoryItemV1> }).items.get(entity.code); return item ? [item] : []; })
    : [];
  return (
    <ManagementWorkspace
      className="athyper-workspace-landing athyper-workspace-landing--module"
      header={
        <PageHeader
          level="collection"
          title={props.module.name}
          icon={<Icon />}
          description={props.description}
          metadata={directory.state.status === "ready" ? <span className="athyper-workspace-landing__counts">{intl.message("workspace.entityCount", { count: entities.length })}</span> : undefined}
        />
      }
      navigation={props.navigation}
    >
      <h2 className="athyper-workspace-landing__heading">{intl.message("workspace.entitiesHeading")}</h2>
      <DirectoryStatus state={directory.state} retry={directory.retry} />
      {directory.state.status === "ready" && !entities.length ? <p className="athyper-module-card__empty">{intl.message("workspace.noEntities")}</p> : null}
      <ul className="athyper-workspace-landing__grid athyper-workspace-landing__grid--entities">
        {entities.map((entity) => {
          const EntityIcon = resolveMetadataIcon("entity", entity.iconKey);
          const records = recentFor(recent, props.workspace, props.module, [entity.entityCode]);
          const titleId = `entity-card-${entity.entityCode}`;
          return (
            <li key={entity.entityCode}>
              <article className="athyper-module-card athyper-module-card--entity" aria-labelledby={titleId}>
                <header className="athyper-module-card__header">
                  <span className="athyper-module-card__icon" aria-hidden="true"><EntityIcon size={20} /></span>
                  <div className="athyper-module-card__identity">
                    <h3 id={titleId}><a href={`/app/entity/${entity.entityCode}`}>{entity.title}</a></h3>
                    {entity.count !== undefined ? <em className="athyper-module-card__count">{intl.message("workspace.recordCount", { count: entity.count })}</em> : null}
                    {entity.description ? <p>{entity.description}</p> : null}
                  </div>
                  <ChevronRightIcon className="athyper-module-card__row-chevron" size={18} aria-hidden="true" />
                </header>
                {records.length ? (
                  <section className="athyper-module-card__recent" aria-label={intl.message("workspace.recentRecords", { module: entity.title })}>
                    <h4>{intl.message("workspace.recent")}</h4>
                    <ul>{records.map((record) => <li key={record.href}><a href={record.href}>{record.label}</a></li>)}</ul>
                  </section>
                ) : null}
                <footer className="athyper-module-card__footer">
                  {entity.actions.slice(0, 1).map((action) => (
                    <a key={action.key} className="a-button a-button--primary a-button--small" href={action.href}>
                      <PlusIcon size={16} aria-hidden="true" />{action.label}
                    </a>
                  ))}
                </footer>
              </article>
            </li>
          );
        })}
      </ul>
    </ManagementWorkspace>
  );
}
