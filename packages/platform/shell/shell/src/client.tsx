"use client";
import { useAtlasContextNavigation } from "@athyper/platform-ai-agent-ui";
import {
  GlobalAppBar,
  GlobalSidebar,
  GlobalFooter,
  SkipToContent,
} from "./shell-chrome";
import { ShellSurfaceBoundary } from "./shell-surface-boundary";
import {
  ShellSurfaceContext,
  useShellSurfaceContext,
} from "./shell-surface-context";
import { readShellPreference, writeShellPreference } from "./shell-preferences";
import { useShellSurfaces } from "./use-shell-surfaces";
import { HeaderActions } from "./shell-header-actions";
import {
  NavigationPanel,
  QuickAccessRailActions,
  type ShellNavigationPeek,
} from "./shell-navigation";
import { useShellI18n } from "./shell-i18n";
import type { HeaderActionKind } from "./shell-surfaces";

import {
  Building2Icon,
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  LogOutIcon,
  MenuIcon,
  NetworkIcon,
  RefreshCwIcon,
  UserIcon,
} from "@athyper/platform-icons";
import { localeDefinition, type SupportedLocale } from "@athyper/platform-i18n";
import * as React from "react";
import {
  useCallback,
  useEffect,
  useRef,
  useId,
  useState,
  type ReactNode,
} from "react";
import { deriveEntityBreadcrumbs, useShellRoute } from "./route-state";
import {
  canAccessRoute,
  isShellActivityRoute,
  type DerivedShellNavigation,
} from "./core";
import { type ShellActivityDataSource } from "./activity-center";
import {
  useRememberQuickAccessVisit,
  type ShellQuickAccessDataSource,
  type ShellQuickAccessTab,
} from "./quick-access";
import { AtlasSurfaceContext } from "./atlas-surface";
import { ShellOverlayHost } from "./shell-overlay-host";

export interface ShellContextOption {
  readonly tenantId: string;
  readonly label: string;
  readonly code?: string;
}
export interface ShellTransactionContext {
  readonly label: string;
  readonly value: string;
  readonly secondaryLabel?: string;
  readonly changeable?: boolean;
}
export interface HeaderContextIdentityProps {
  readonly name: string;
  readonly countryCode?: string;
  readonly logoAssetRef?: string;
  readonly showMark?: boolean;
  readonly logoOrName?: boolean;
  readonly switchable?: boolean;
  readonly hoverLines?: readonly string[];
}
export interface ShellContextSelectorProps extends HeaderContextIdentityProps {
  readonly selectionRevision?: string | number;
  readonly ariaLabel: string;
  readonly className?: string;
  readonly interactive: boolean;
  readonly respondToWorkContextRequest?: boolean;
  readonly onOpen?: () => void;
  readonly onClose?: () => void;
  readonly children?: ReactNode;
}
export interface ShellContextPickerPanelProps {
  readonly className?: string;
  readonly title: string;
  readonly description: string;
  readonly searchLabel?: string;
  readonly searchValue?: string;
  readonly onSearchChange?: (value: string) => void;
  readonly resultSummary?: ReactNode;
  readonly children: ReactNode;
}
export interface ShellChromeProps {
  readonly principalId?: string;
  readonly currentLocale?: string;
  readonly localePolicy?: Readonly<{
    enabledLocales: readonly SupportedLocale[];
  }>;
  readonly onLocaleChange?: (localeCode: SupportedLocale) => Promise<void>;
  readonly applicationName: string;
  readonly planeDescriptor?: string;
  readonly planeIconSrc?: string;
  readonly planeWordmarkSrc?: string;
  readonly persistentDesktopBrand?: boolean;
  readonly homeHref?: string;
  readonly initialCollapsed?: boolean;
  readonly tenantId: string;
  readonly tenantLabel: string;
  readonly tenantSecondaryLabel?: string;
  readonly tenantCountryCode?: string;
  readonly tenantLogoAssetRef?: string;
  readonly contextLabel?: string;
  readonly showOrganizationContext?: boolean;
  readonly accountLabel: string;
  readonly accountInitials?: string;
  readonly accountLoginId?: string;
  readonly accountEmail?: string;
  readonly accountSecondaryLabel?: string;
  readonly transactionContext?: ShellTransactionContext;
  readonly workContextControl?: ReactNode;
  readonly navigation: DerivedShellNavigation;
  readonly experienceState?: "ready" | "context_not_ready";
  readonly contexts?: readonly ShellContextOption[];
  readonly quickAccess?: ShellQuickAccessDataSource;
  readonly activity?: ShellActivityDataSource;
  readonly children: ReactNode;
}
export function ShellChrome({
  principalId,
  currentLocale = "en",
  localePolicy,
  onLocaleChange,
  applicationName,
  planeDescriptor = "Business workspace",
  planeIconSrc,
  planeWordmarkSrc,
  persistentDesktopBrand = false,
  homeHref = "/home",
  initialCollapsed = false,
  tenantId,
  tenantLabel,
  tenantSecondaryLabel,
  tenantCountryCode,
  tenantLogoAssetRef,
  contextLabel = "Business context",
  showOrganizationContext = true,
  accountLabel,
  accountInitials,
  accountLoginId,
  accountEmail,
  accountSecondaryLabel,
  transactionContext,
  workContextControl,
  navigation,
  experienceState = "ready",
  contexts,
  quickAccess,
  activity,
  children,
}: ShellChromeProps) {
  const t = useShellI18n().message;
  const {
    surface,
    setContext,
    dismissContext,
    compact,
    atlasOpen,
    atlasPinned,
    atlasFull,
    setAtlasOpen,
    setAtlasPinned,
    setAtlasFull,
    drawerOpen,
    headerAction,
    quickAccessTab,
    setDrawerOpen,
    setHeaderAction,
    setQuickAccessTab,
    dismissTransient,
  } = useShellSurfaces();
  const [collapsed, setCollapsed] = useState(initialCollapsed),
    [observedPath, setPath] = useState("/");
  const routeState = useShellRoute(),
    path = routeState?.pathname ?? observedPath;
  useAtlasContextNavigation(path);
  const quickAccessScope =
    principalId ?? accountLoginId ?? accountSecondaryLabel ?? accountLabel;
  useRememberQuickAccessVisit(
    applicationName,
    tenantId,
    quickAccessScope,
    path,
    navigation,
    experienceState === "ready" && quickAccess?.recent === undefined,
    routeState?.record,
  );
  const [navigationPeek, setNavigationPeek] = useState<ShellNavigationPeek>();
  const menuButton = useRef<HTMLButtonElement>(null),
    firstLink = useRef<HTMLAnchorElement>(null);
  const atlasOpener = useRef<HTMLElement | null>(null);
  const closeAtlas = useCallback(() => {
    setAtlasOpen(false);
    requestAnimationFrame(() => {
      if (atlasOpener.current?.isConnected) atlasOpener.current.focus();
    });
  }, [setAtlasOpen]);
  const quickAccessOpener = useRef<HTMLButtonElement>(null);
  const previousScope = useRef({ path, tenantId });
  useEffect(() => {
    const previous = previousScope.current;
    if (previous.tenantId !== tenantId) dismissContext();
    else if (previous.path !== path) dismissTransient();
    previousScope.current = { path, tenantId };
  }, [path, tenantId, dismissContext, dismissTransient]);
  useEffect(() => {
    setPath(window.location.pathname);
    const pinned = readShellPreference("athyper.atlas.pinned") === true;
    setAtlasPinned(pinned);
    setAtlasOpen(pinned);
    const stored = readShellPreference("athyper.shell.collapsed");
    if (stored !== undefined) {
      setCollapsed(stored);
      return;
    }
    if (
      window.matchMedia("(min-width: 761px) and (max-width: 1100px)").matches
    ) {
      setCollapsed(true);
    }
  }, []);
  useEffect(() => {
    const openAtlas = (event: Event) => {
      atlasOpener.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      const pinned =
        (event as CustomEvent<{ readonly pinned?: boolean }>).detail?.pinned ===
        true;
      dismissTransient();
      setAtlasFull(false);
      setAtlasOpen(true);
      if (pinned) {
        setAtlasPinned(true);
        writeShellPreference("athyper.atlas.pinned", true);
      }
    };
    window.addEventListener("athyper:atlas-open", openAtlas);
    return () => window.removeEventListener("athyper:atlas-open", openAtlas);
  }, [dismissTransient]);
  useEffect(() => {
    if (!drawerOpen) return;
    firstLink.current?.focus();
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) {
        setDrawerOpen(false);
        requestAnimationFrame(() => menuButton.current?.focus());
      }
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [drawerOpen]);
  const toggleCollapsed = () =>
    setCollapsed((value) => {
      const next = !value;
      setNavigationPeek(undefined);
      writeShellPreference("athyper.shell.collapsed", next);
      return next;
    });
  const closeDrawer = () => {
    setDrawerOpen(false);
    requestAnimationFrame(() => menuButton.current?.focus());
  };
  const closeQuickAccess = useCallback(() => {
    setQuickAccessTab(undefined);
    requestAnimationFrame(() =>
      (window.matchMedia("(max-width: 760px)").matches
        ? menuButton.current
        : quickAccessOpener.current
      )?.focus(),
    );
  }, []);
  const changeHeaderAction = useCallback((next?: HeaderActionKind) => {
    setHeaderAction(next);
  }, []);
  const openQuickAccess = (
    tab: ShellQuickAccessTab,
    opener: HTMLButtonElement,
  ) => {
    quickAccessOpener.current = opener;
    setNavigationPeek(undefined);
    setDrawerOpen(false);
    setHeaderAction(undefined);
    setQuickAccessTab((current) => (current === tab ? undefined : tab));
  };
  const openNavigation = () => {
    setQuickAccessTab(undefined);
    setHeaderAction(undefined);
    setDrawerOpen(true);
  };
  const crumbs = deriveEntityBreadcrumbs(
    navigation,
    path,
    routeState?.binding,
    routeState?.record,
  );
  const homeRoute = path === "/" || path === homeHref,
    atlasRoute = path === "/atlas" || path.startsWith("/atlas/");
  const systemRoute =
      homeRoute ||
      atlasRoute ||
      isShellActivityRoute(path) ||
      path === "/select-context" ||
      path.startsWith("/auth/"),
    routeAllowed = systemRoute || canAccessRoute(navigation, path);
  const changeAtlasPin = (next: boolean) => {
    setAtlasPinned(next);
    writeShellPreference("athyper.atlas.pinned", next);
  };
  const atlasVisible = atlasOpen && !path.startsWith("/atlas");
  return (
    <ShellSurfaceContext.Provider value={{ surface, setContext }}>
      <AtlasSurfaceContext.Provider
        value={{
          sidebarOpen: atlasVisible,
          close: closeAtlas,
          fullscreen: () => {
            setAtlasFull(true);
            setAtlasOpen(true);
          },
          minimize: () => {
            setAtlasFull(false);
            setAtlasOpen(true);
          },
        }}
      >
        <div
          className="athyper-shell"
          data-collapsed={collapsed}
          data-desktop-brand={persistentDesktopBrand}
          data-home-route={homeRoute}
          data-drawer-open={drawerOpen}
          data-quick-access-open={Boolean(quickAccessTab)}
          data-activity-open={
            headerAction === "notifications" || headerAction === "inbox"
          }
          data-atlas-open={atlasVisible}
          data-atlas-pinned={
            atlasVisible && atlasPinned && !atlasFull && !compact
          }
          data-atlas-full={atlasVisible && atlasFull}
        >
          <SkipToContent label={t("shell.skip")} />
          <GlobalAppBar
            desktopBrand={
              persistentDesktopBrand ? (
                <div className="athyper-shell__desktop-brand">
                  <button
                    className="athyper-shell__desktop-brand-toggle"
                    type="button"
                    aria-label={t(
                      collapsed
                        ? "shell.navigation.expand"
                        : "shell.navigation.collapse",
                    )}
                    aria-expanded={!collapsed}
                    aria-controls="plane-navigation"
                    onClick={toggleCollapsed}
                  >
                    <MenuIcon size={22} />
                  </button>
                  <PlaneHomeLink
                    className="athyper-shell__desktop-brand-link"
                    applicationName={applicationName}
                    planeDescriptor={planeDescriptor}
                    planeIconSrc={planeIconSrc}
                    planeWordmarkSrc={planeWordmarkSrc}
                    landingHref={homeHref}
                  />
                </div>
              ) : null
            }
            navigationToggle={
              <button
                ref={menuButton}
                className="athyper-shell__menu-button"
                type="button"
                aria-label={t("shell.navigation.open")}
                aria-expanded={drawerOpen}
                aria-controls="plane-navigation"
                onClick={openNavigation}
              >
                <MenuIcon size={20} />
              </button>
            }
            mobileBrand={
              <PlaneHomeLink
                className="athyper-shell__mobile-brand"
                applicationName={applicationName}
                planeDescriptor={planeDescriptor}
                planeIconSrc={planeIconSrc}
                planeWordmarkSrc={planeWordmarkSrc}
                landingHref={homeHref}
              />
            }
            businessContext={
              <BusinessContext
                tenantId={tenantId}
                tenantLabel={tenantLabel}
                tenantSecondaryLabel={tenantSecondaryLabel}
                tenantCountryCode={tenantCountryCode}
                tenantLogoAssetRef={tenantLogoAssetRef}
                contextLabel={contextLabel}
                showOrganizationContext={showOrganizationContext}
                workContextControl={workContextControl}
                contexts={contexts}
                landingHref={homeHref}
              />
            }
            actions={
              <HeaderActions
                navigation={navigation}
                activity={activity}
                active={headerAction}
                atlasOpen={atlasVisible}
                onAtlasToggle={(opener) => {
                  atlasOpener.current = opener;
                  dismissTransient();
                  setAtlasFull(false);
                  setAtlasOpen((value) => !value);
                }}
                onActiveChange={changeHeaderAction}
                applicationName={applicationName}
                planeDescriptor={planeDescriptor}
                currentLocale={currentLocale}
                localePolicy={localePolicy}
                onLocaleChange={onLocaleChange}
              />
            }
          />
          {drawerOpen ? (
            <button
              type="button"
              className="athyper-shell__scrim"
              aria-label={t("shell.navigation.close")}
              onClick={closeDrawer}
            />
          ) : null}
          <GlobalSidebar
            compact={compact}
            open={drawerOpen}
            label={t("shell.navigation.application")}
            brand={
              <PlaneHomeLink
                className="athyper-shell__rail-brand"
                applicationName={applicationName}
                planeDescriptor={planeDescriptor}
                planeIconSrc={planeIconSrc}
                planeWordmarkSrc={planeWordmarkSrc}
                landingHref={homeHref}
                onClick={closeDrawer}
              />
            }
            controls={
              <>
                <button
                  className="athyper-shell__rail-toggle"
                  type="button"
                  aria-label={t(
                    collapsed
                      ? "shell.navigation.expand"
                      : "shell.navigation.collapse",
                  )}
                  aria-expanded={!collapsed}
                  onClick={toggleCollapsed}
                >
                  <span>{planeDescriptor}</span>
                  <b aria-hidden="true">
                    {collapsed ? (
                      <ChevronRightIcon size={14} />
                    ) : (
                      <ChevronLeftIcon size={14} />
                    )}
                  </b>
                </button>
                <button
                  className="athyper-shell__close athyper-shell__close--rail"
                  type="button"
                  aria-label={t("shell.navigation.close")}
                  onClick={closeDrawer}
                >
                  <CloseIcon size={20} />
                </button>
              </>
            }
            navigation={
              <NavigationPanel
                navigation={navigation}
                path={path}
                homeHref={homeHref}
                firstLink={firstLink}
                onNavigate={() => {
                  setNavigationPeek(undefined);
                  setQuickAccessTab(undefined);
                  setHeaderAction(undefined);
                  closeDrawer();
                }}
                onPeek={setNavigationPeek}
              />
            }
            peek={
              collapsed && navigationPeek ? (
                <div
                  className="athyper-shell__navigation-peek"
                  role="tooltip"
                  style={{ top: navigationPeek.top }}
                >
                  <small>{navigationPeek.workspace}</small>
                  <strong>{navigationPeek.label}</strong>
                </div>
              ) : null
            }
            quickAccess={
              <QuickAccessRailActions
                activeTab={quickAccessTab}
                onOpen={openQuickAccess}
                onPeek={setNavigationPeek}
              />
            }
            profile={
              <SidebarProfile
                accountLabel={accountLabel}
                accountInitials={accountInitials}
                loginId={accountLoginId ?? accountSecondaryLabel}
                email={
                  accountEmail ??
                  (accountSecondaryLabel?.includes("@")
                    ? accountSecondaryLabel
                    : undefined)
                }
                tenantLabel={tenantLabel}
                tenantSecondaryLabel={tenantSecondaryLabel}
                transactionContext={transactionContext}
                currentLocale={currentLocale}
                localePolicy={localePolicy}
                onLocaleChange={onLocaleChange}
              />
            }
          />
          <ShellOverlayHost
            quickAccess={
              quickAccessTab
                ? {
                    activeTab: quickAccessTab,
                    modal: compact,
                    tenantId,
                    accountScope: quickAccessScope,
                    plane: applicationName,
                    path,
                    navigation,
                    dataSource: quickAccess,
                    onTabChange: setQuickAccessTab,
                    onClose: closeQuickAccess,
                  }
                : undefined
            }
            atlas={
              atlasVisible
                ? {
                    breadcrumbs: crumbs,
                    mode: atlasFull ? "fullscreen" : "dock",
                    planeName: applicationName,
                    currentPath: path,
                    pinned: atlasPinned && !compact,
                    onPinnedChange: changeAtlasPin,
                    onClose: closeAtlas,
                    restoreFocusOnUnmount: false,
                  }
                : undefined
            }
          />
          <div className="athyper-shell__body">
            {homeRoute ? null : atlasRoute ? (
              <nav
                className="athyper-shell__breadcrumbs"
                aria-label={t("shell.navigation.breadcrumb")}
              >
                <ol>
                  <li>
                    <a href={homeHref}>Home</a>
                  </li>
                  <li>
                    <span aria-current="page">Atlas AI</span>
                  </li>
                </ol>
              </nav>
            ) : (
              <nav
                className="athyper-shell__breadcrumbs"
                aria-label={t("shell.navigation.breadcrumb")}
              >
                {crumbs.length ? (
                  <ol>
                    {crumbs.map((crumb, index) => (
                      <li key={`${crumb.label}-${index}`}>
                        {crumb.href && index < crumbs.length - 1 ? (
                          <a href={crumb.href}>{crumb.label}</a>
                        ) : (
                          <span
                            aria-current={
                              index === crumbs.length - 1 ? "page" : undefined
                            }
                          >
                            {crumb.label}
                          </span>
                        )}
                      </li>
                    ))}
                  </ol>
                ) : null}
              </nav>
            )}
            <main
              id="main-content"
              tabIndex={-1}
              className="athyper-shell__main"
            >
              {experienceState === "context_not_ready" ? (
                <ContextNotReady />
              ) : !navigation.routes.length ? (
                <EmptyEntitlement />
              ) : routeAllowed ? (
                children
              ) : (
                <ForbiddenRoute />
              )}
            </main>
            <GlobalFooter />
          </div>
        </div>
      </AtlasSurfaceContext.Provider>
    </ShellSurfaceContext.Provider>
  );
}

function PlaneHomeLink({
  className,
  applicationName,
  planeDescriptor,
  planeIconSrc,
  planeWordmarkSrc,
  landingHref,
  onClick,
}: {
  readonly className: string;
  readonly applicationName: string;
  readonly planeDescriptor: string;
  readonly planeIconSrc?: string;
  readonly planeWordmarkSrc?: string;
  readonly landingHref?: string;
  readonly onClick?: () => void;
}) {
  return (
    <a
      className={className}
      data-plane={applicationName.toLowerCase()}
      href={landingHref ?? "/"}
      aria-label={`${applicationName} home`}
      onClick={onClick}
    >
      <span className="athyper-shell__brand-mark-frame">
        {planeIconSrc ? (
          <img
            className="athyper-shell__brand-mark"
            src={planeIconSrc}
            alt=""
          />
        ) : (
          <span className="athyper-shell__brand-mark" aria-hidden="true">
            A
          </span>
        )}
        <span className="athyper-shell__plane-badge" aria-hidden="true">
          {applicationName.slice(0, 1).toUpperCase()}
        </span>
      </span>
      <span className="athyper-shell__brand-copy">
        {planeWordmarkSrc ? (
          <span className="athyper-shell__product-wordmark" aria-hidden="true">
            <img src={planeWordmarkSrc} alt="" />
          </span>
        ) : (
          <strong>{applicationName}</strong>
        )}
        <small>{planeDescriptor}</small>
      </span>
      <span className="athyper-shell__brand-tooltip" aria-hidden="true">
        <strong>{applicationName} home</strong>
      </span>
    </a>
  );
}

function BusinessContext({
  tenantId,
  tenantLabel,
  tenantSecondaryLabel,
  tenantCountryCode,
  tenantLogoAssetRef,
  contextLabel,
  showOrganizationContext,
  workContextControl,
  contexts: suppliedContexts,
  landingHref,
}: {
  readonly tenantId: string;
  readonly tenantLabel: string;
  readonly tenantSecondaryLabel?: string;
  readonly tenantCountryCode?: string;
  readonly tenantLogoAssetRef?: string;
  readonly contextLabel: string;
  readonly showOrganizationContext: boolean;
  readonly workContextControl?: ReactNode;
  readonly contexts?: readonly ShellContextOption[];
  readonly landingHref?: string;
}) {
  const [contexts, setContexts] = useState<readonly ShellContextOption[]>(
      suppliedContexts ?? [],
    ),
    [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">(
      suppliedContexts ? "ready" : "idle",
    ),
    [pending, setPending] = useState<string>();
  const discoveryStarted = useRef(Boolean(suppliedContexts));
  const discover = useCallback(async () => {
    if (discoveryStarted.current) return;
    discoveryStarted.current = true;
    setStatus("loading");
    try {
      const response = await fetch("/api/auth/contexts", {
        credentials: "same-origin",
        headers: { accept: "application/json" },
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Context discovery failed");
      const value = (await response.json()) as {
        readonly contexts?: readonly Readonly<Record<string, unknown>>[];
      };
      const options = (value.contexts ?? []).flatMap((item) =>
        typeof item.tenantId === "string" && typeof item.tenantName === "string"
          ? [
              {
                tenantId: item.tenantId,
                label: item.tenantName,
                ...(typeof item.tenantCode === "string"
                  ? { code: item.tenantCode }
                  : {}),
              },
            ]
          : [],
      );
      setContexts(options);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, []);
  useEffect(() => {
    if (showOrganizationContext && !suppliedContexts) void discover();
  }, [showOrganizationContext, suppliedContexts, discover]);
  const activate = async (nextTenantId: string) => {
    if (nextTenantId === tenantId) return;
    setPending(nextTenantId);
    try {
      await switchShellContext(nextTenantId, landingHref);
    } catch {
      setPending(undefined);
      setStatus("error");
    }
  };
  return (
    <div className="athyper-shell__business-context">
      {showOrganizationContext ? (
        <ShellContextSelector
          ariaLabel={`${contextLabel}: ${tenantLabel}. Switch business context`}
          name={tenantLabel}
          countryCode={tenantCountryCode}
          logoAssetRef={tenantLogoAssetRef}
          logoOrName
          interactive={status === "ready" && contexts.length > 1}
          hoverLines={[`${tenantSecondaryLabel ?? tenantId} · ${tenantLabel}`]}
        >
          <div className="athyper-shell__context-menu">
            <header>
              <strong>Business context</strong>
              <small>Switch your authorized workspace</small>
            </header>
            <ul>
              {contexts.map((context) => (
                <li key={context.tenantId}>
                  <button
                    data-context-picker-select
                    type="button"
                    disabled={Boolean(pending) || context.tenantId === tenantId}
                    aria-current={
                      context.tenantId === tenantId ? "true" : undefined
                    }
                    onClick={() => void activate(context.tenantId)}
                  >
                    <span
                      className="athyper-shell__tenant-mark"
                      aria-hidden="true"
                    >
                      {context.label
                        .split(/\s+/)
                        .slice(0, 2)
                        .map((part) => part[0])
                        .join("")
                        .toUpperCase()}
                    </span>
                    <span>
                      <strong>
                        {pending === context.tenantId
                          ? "Switching…"
                          : context.label}
                      </strong>
                      <small>
                        {context.code ??
                          (context.tenantId === tenantId
                            ? "Current context"
                            : "Available context")}
                      </small>
                    </span>
                    {context.tenantId === tenantId ? (
                      <b aria-label="Current context">
                        <CheckIcon size={14} />
                      </b>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
            <a href="/select-context">Open context selector</a>
          </div>
        </ShellContextSelector>
      ) : null}
      {workContextControl ? (
        <div className="athyper-shell__work-context">{workContextControl}</div>
      ) : null}
    </div>
  );
}

export function ShellContextSelector({
  selectionRevision,
  ariaLabel,
  className,
  name,
  countryCode,
  logoAssetRef,
  showMark = true,
  logoOrName = true,
  interactive,
  respondToWorkContextRequest = false,
  onOpen,
  onClose,
  hoverLines = [],
  children,
}: ShellContextSelectorProps) {
  const coordination = useShellSurfaceContext();
  const contextId = useId();
  const setCoordinatedContext = coordination?.setContext;
  const contextOpen =
    coordination?.surface.kind === "context" &&
    coordination.surface.id === contextId;
  const details = useRef<HTMLDetailsElement>(null),
    onOpenRef = useRef(onOpen),
    onCloseRef = useRef(onClose);
  onOpenRef.current = onOpen;
  onCloseRef.current = onClose;
  const previousSelectionRevision = useRef(selectionRevision);
  useEffect(() => {
    if (previousSelectionRevision.current === selectionRevision) return;
    previousSelectionRevision.current = selectionRevision;
    if (setCoordinatedContext) setCoordinatedContext(contextId, false);
    else if (details.current) details.current.open = false;
    details.current?.querySelector("summary")?.focus();
  }, [selectionRevision, contextId, setCoordinatedContext]);
  useEffect(
    () => () => setCoordinatedContext?.(contextId, false),
    [contextId, setCoordinatedContext],
  );
  useEffect(() => {
    if (!interactive) return;
    const close = () => {
      if (setCoordinatedContext) setCoordinatedContext(contextId, false);
      else if (details.current) details.current.open = false;
    };
    const closeOutside = (event: PointerEvent) => {
      if (
        details.current?.open &&
        !details.current.contains(event.target as Node)
      )
        close();
    };
    const closeEscape = (event: KeyboardEvent) => {
      if (
        event.key === "Escape" &&
        !event.defaultPrevented &&
        details.current?.open
      ) {
        event.preventDefault();
        close();
        details.current.querySelector("summary")?.focus();
      }
    };
    const closeForPeer = (event: Event) => {
      if (
        details.current?.open &&
        (event as CustomEvent).detail !== details.current
      )
        close();
    };
    const openForProfile = () => {
      if (!respondToWorkContextRequest || !details.current) return;
      if (setCoordinatedContext) setCoordinatedContext(contextId, true);
      else details.current.open = true;
      requestAnimationFrame(() =>
        details.current?.querySelector("summary")?.focus(),
      );
    };
    window.addEventListener("pointerdown", closeOutside);
    window.addEventListener("keydown", closeEscape);
    window.addEventListener("athyper:context-picker-open", closeForPeer);
    window.addEventListener("athyper:work-context-request", openForProfile);
    return () => {
      window.removeEventListener("pointerdown", closeOutside);
      window.removeEventListener("keydown", closeEscape);
      window.removeEventListener("athyper:context-picker-open", closeForPeer);
      window.removeEventListener(
        "athyper:work-context-request",
        openForProfile,
      );
    };
  }, [
    interactive,
    respondToWorkContextRequest,
    setCoordinatedContext,
    contextId,
  ]);
  const identity = (
    <HeaderContextIdentity
      name={name}
      countryCode={countryCode}
      logoAssetRef={logoAssetRef}
      showMark={showMark}
      logoOrName={logoOrName}
      switchable={interactive}
      hoverLines={hoverLines}
    />
  );
  if (!interactive)
    return (
      <span
        className={`athyper-context-selector athyper-context-selector--static${className ? ` ${className}` : ""}`}
        data-appearance="ghost"
        aria-label={ariaLabel}
      >
        {identity}
      </span>
    );
  return (
    <details
      ref={details}
      open={coordination ? contextOpen : undefined}
      className={`athyper-context-selector${className ? ` ${className}` : ""}`}
      data-appearance="ghost"
      onClick={(event) => {
        const target = event.target as Element;
        if (
          coordination &&
          target.closest("summary") ===
            event.currentTarget.querySelector("summary")
        ) {
          event.preventDefault();
          coordination.setContext(contextId, !contextOpen);
        } else if (target.closest("[data-context-picker-select]")) {
          if (coordination) coordination.setContext(contextId, false);
          else event.currentTarget.open = false;
        }
      }}
      onToggle={(event) => {
        const element = event.currentTarget;
        if (element.open) {
          window.dispatchEvent(
            new CustomEvent("athyper:context-picker-open", { detail: element }),
          );
          onOpenRef.current?.();
          requestAnimationFrame(() =>
            element
              .querySelector<HTMLElement>("[data-context-picker-autofocus]")
              ?.focus(),
          );
        } else onCloseRef.current?.();
      }}
    >
      <summary aria-label={ariaLabel}>{identity}</summary>
      <ShellSurfaceBoundary
        label="Context picker recovery"
        onClose={() => {
          if (coordination) coordination.setContext(contextId, false);
          else if (details.current) details.current.open = false;
          details.current?.querySelector("summary")?.focus();
        }}
      >
        {children}
      </ShellSurfaceBoundary>
    </details>
  );
}

export function ShellContextPickerPanel({
  className,
  title,
  description,
  searchLabel,
  searchValue = "",
  onSearchChange,
  resultSummary,
  children,
}: ShellContextPickerPanelProps) {
  return (
    <div
      className={`athyper-context-picker__panel${className ? ` ${className}` : ""}`}
    >
      <header>
        <strong>{title}</strong>
        <small>{description}</small>
      </header>
      {searchLabel && onSearchChange ? (
        <label>
          {searchLabel}
          <input
            data-context-picker-autofocus
            type="search"
            value={searchValue}
            onChange={(event) => onSearchChange(event.currentTarget.value)}
            autoComplete="off"
          />
        </label>
      ) : null}
      {resultSummary !== undefined ? (
        <p aria-live="polite">{resultSummary}</p>
      ) : null}
      {children}
    </div>
  );
}

export function HeaderContextIdentity({
  name,
  logoAssetRef,
  showMark = true,
  logoOrName = false,
  switchable = false,
  hoverLines = [],
}: HeaderContextIdentityProps) {
  const [logoFailed, setLogoFailed] = useState(false),
    safeLogo =
      logoAssetRef && !logoFailed && safeAssetRef(logoAssetRef)
        ? logoAssetRef
        : undefined,
    logoOnly = logoOrName && Boolean(safeLogo);
  return (
    <span
      className={`athyper-context-identity${logoOrName ? " athyper-context-identity--logo-or-name" : ""}${switchable ? " athyper-context-identity--switchable" : ""}${logoOnly ? " athyper-context-identity--logo-only" : ""}`}
    >
      {showMark ? (
        safeLogo ? (
          <span className="athyper-context-identity__logo">
            <span className="athyper-context-identity__logo-frame">
              <img src={safeLogo} alt="" onError={() => setLogoFailed(true)} />
            </span>
            {switchable ? <SwitchBadge /> : null}
          </span>
        ) : (
          <span
            className="athyper-context-identity__company"
            aria-hidden="true"
          >
            <Building2Icon />
            {switchable ? <SwitchBadge /> : null}
          </span>
        )
      ) : null}
      {!logoOnly ? <strong>{name}</strong> : null}
      {switchable && !showMark ? (
        <span
          className="athyper-context-identity__disclosure"
          aria-hidden="true"
        >
          <ChevronDownIcon size={16} />
        </span>
      ) : null}
      {hoverLines.length ? (
        <span className="athyper-context-identity__tooltip" role="tooltip">
          {hoverLines.map((line, index) => (
            <span key={`${line}-${index}`}>{line}</span>
          ))}
        </span>
      ) : null}
    </span>
  );
}
function SwitchBadge() {
  return (
    <span className="athyper-context-identity__switch" aria-hidden="true">
      <RefreshCwIcon />
    </span>
  );
}
function safeAssetRef(value: string) {
  return (
    /^\/[A-Za-z0-9][A-Za-z0-9_./-]{0,1022}$/.test(value) &&
    !/(^|\/)\.\.(\/|$)/.test(value)
  );
}

export async function switchShellContext(
  tenantId: string,
  returnTo = "/",
  fetcher: typeof fetch = fetch,
): Promise<void> {
  if (!tenantId.trim()) throw new TypeError("tenantId is required");
  const csrf = readCookie("__Host-athyper-csrf") ?? readCookie("athyper-csrf");
  const response = await fetcher("/api/auth/session/context", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "content-type": "application/json",
      ...(csrf ? { "x-csrf-token": csrf } : {}),
    },
    body: JSON.stringify({ tenantId }),
  });
  if (!response.ok) throw new Error("Context switch failed");
  window.location.assign(
    returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/",
  );
}
function readCookie(name: string): string | undefined {
  return document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}
function SidebarProfile({
  accountLabel,
  accountInitials,
  loginId,
  email,
  tenantLabel,
  tenantSecondaryLabel,
  transactionContext,
  currentLocale,
  localePolicy,
  onLocaleChange,
}: {
  readonly accountLabel: string;
  readonly accountInitials?: string;
  readonly loginId?: string;
  readonly email?: string;
  readonly tenantLabel: string;
  readonly tenantSecondaryLabel?: string;
  readonly transactionContext?: ShellTransactionContext;
  readonly currentLocale: string;
  readonly localePolicy?: Readonly<{
    enabledLocales: readonly SupportedLocale[];
  }>;
  readonly onLocaleChange?: (localeCode: SupportedLocale) => Promise<void>;
}) {
  const t = useShellI18n().message;
  const [localePending, setLocalePending] = useState(false),
    [localeError, setLocaleError] = useState(false);
  const details = useRef<HTMLDetailsElement>(null),
    initials =
      accountInitials?.trim() ||
      accountLabel
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join("") ||
      "A";
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (
        details.current?.open &&
        !details.current.contains(event.target as Node)
      )
        details.current.open = false;
    };
    const escape = (event: KeyboardEvent) => {
      if (
        event.key === "Escape" &&
        !event.defaultPrevented &&
        details.current?.open
      ) {
        details.current.open = false;
        details.current.querySelector("summary")?.focus();
      }
    };
    window.addEventListener("pointerdown", outside);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("pointerdown", outside);
      window.removeEventListener("keydown", escape);
    };
  }, []);
  const openBusinessContext = () => {
    details.current!.open = false;
    const picker = document.querySelector<HTMLDetailsElement>(
      ".athyper-shell__business-context>details",
    );
    if (picker) {
      picker.open = true;
      picker.querySelector("summary")?.focus();
    } else window.location.assign("/select-context");
  };
  const openTransactionContext = () => {
    details.current!.open = false;
    window.dispatchEvent(new CustomEvent("athyper:work-context-request"));
  };
  return (
    <details ref={details} className="athyper-shell__profile">
      <summary aria-label={t("shell.profile.open", { name: accountLabel })}>
        <span className="athyper-shell__avatar" aria-hidden="true">
          {initials}
        </span>
        <span className="athyper-shell__profile-summary">
          <strong>{accountLabel}</strong>
          <small>{loginId ?? t("shell.profile.signedIn")}</small>
        </span>
        <ChevronDownIcon size={16} />
      </summary>
      <section
        className="athyper-shell__profile-panel"
        aria-label={t("shell.profile.label")}
      >
        <header>
          <span className="athyper-shell__profile-logo" aria-hidden="true">
            <UserIcon size={20} />
          </span>
          <span>
            <small>{t("shell.profile.account")}</small>
            <strong>{accountLabel}</strong>
          </span>
        </header>
        <dl className="athyper-shell__identity-details">
          <div>
            <dt>{t("shell.profile.loginId")}</dt>
            <dd>{loginId ?? t("shell.profile.notProvided")}</dd>
          </div>
          <div>
            <dt>{t("shell.profile.email")}</dt>
            <dd>{email ?? t("shell.profile.notProvided")}</dd>
          </div>
        </dl>
        {localePolicy &&
        localePolicy.enabledLocales.length > 1 &&
        onLocaleChange ? (
          <label className="athyper-shell__language">
            <span>
              <strong>{t("shell.profile.language")}</strong>
              <small>
                {localePending
                  ? t("shell.profile.languageSaving")
                  : localeError
                    ? t("shell.profile.languageError")
                    : t("shell.profile.languageHelp")}
              </small>
            </span>
            <select
              value={currentLocale}
              disabled={localePending}
              onChange={(event) => {
                const locale = event.currentTarget.value as SupportedLocale;
                setLocalePending(true);
                setLocaleError(false);
                void onLocaleChange(locale).catch(() => {
                  setLocalePending(false);
                  setLocaleError(true);
                });
              }}
            >
              {localePolicy.enabledLocales.map((locale) => {
                const definition = localeDefinition(locale);
                return (
                  <option key={locale} value={locale}>
                    {definition.nativeName === definition.englishName
                      ? definition.nativeName
                      : `${definition.nativeName} — ${definition.englishName}`}
                  </option>
                );
              })}
            </select>
          </label>
        ) : null}
        <ProfileContext
          icon={<NetworkIcon />}
          title={t("shell.profile.organization")}
          value={tenantLabel}
          secondary={tenantSecondaryLabel}
          onChange={openBusinessContext}
        />
        {transactionContext ? (
          <ProfileContext
            icon={<Building2Icon />}
            title={transactionContext.label}
            value={transactionContext.value}
            secondary={transactionContext.secondaryLabel}
            onChange={
              transactionContext.changeable ? openTransactionContext : undefined
            }
          />
        ) : null}
        <a className="athyper-shell__sign-out" href="/logout">
          <LogOutIcon />
          {t("shell.profile.signOut")}
        </a>
      </section>
    </details>
  );
}
function ProfileContext({
  icon,
  title,
  value,
  secondary,
  onChange,
}: {
  readonly icon: ReactNode;
  readonly title: string;
  readonly value: string;
  readonly secondary?: string;
  readonly onChange?: () => void;
}) {
  const t = useShellI18n().message,
    change = t("shell.profile.change", { name: title });
  return (
    <section className="athyper-shell__profile-context">
      <span className="athyper-shell__profile-context-icon" aria-hidden="true">
        {icon}
      </span>
      <span>
        <small>{title}</small>
        <strong>{value}</strong>
        {secondary ? <em>{secondary}</em> : null}
      </span>
      {onChange ? (
        <button
          type="button"
          aria-label={change}
          title={change}
          onClick={onChange}
        >
          <RefreshCwIcon />
        </button>
      ) : (
        <span
          className="athyper-shell__profile-na"
          aria-label={t("shell.profile.notApplicable")}
        >
          —
        </span>
      )}
    </section>
  );
}
function EmptyEntitlement() {
  const t = useShellI18n().message;
  return (
    <section
      className="athyper-shell__empty"
      aria-labelledby="empty-entitlement-title"
    >
      <h1 id="empty-entitlement-title">{t("shell.empty.noApps")}</h1>
      <p>{t("shell.empty.noAppsHelp")}</p>
      <a href="/select-context">{t("shell.empty.switch")}</a>
    </section>
  );
}
function ContextNotReady() {
  const t = useShellI18n().message;
  return (
    <section
      className="athyper-shell__empty"
      aria-labelledby="context-not-ready-title"
    >
      <h1 id="context-not-ready-title">{t("shell.empty.contextNotReady")}</h1>
      <p>{t("shell.empty.contextNotReadyHelp")}</p>
      <a href="/select-context">{t("shell.empty.switch")}</a>
    </section>
  );
}
function ForbiddenRoute() {
  const t = useShellI18n().message;
  return (
    <section
      className="athyper-shell__empty"
      aria-labelledby="forbidden-route-title"
    >
      <h1 id="forbidden-route-title">{t("shell.empty.denied")}</h1>
      <p>{t("shell.empty.deniedHelp")}</p>
      <a href="/">{t("shell.empty.available")}</a>
    </section>
  );
}
