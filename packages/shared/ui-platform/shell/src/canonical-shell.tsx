"use client";

import {
  type ComponentType,
  type ReactNode,
  useCallback,
  useEffect,
  useState,
} from "react";
import { type LucideIcon } from "lucide-react";
import {
  SessionWarningDialog,
  usePlaneSessionLifecycle,
  type ActiveOrg,
  type FavoritesPanelSlotProps,
  type FavoritesPanelTab,
} from "@athyper/shell-runtime";
import type { PlaneKey } from "@athyper/platform-iam-session-plane";
import { NavRail, type NavRailWorkspace } from "./nav-rail";
import {
  ResponsiveNavigationDrawer,
  type NavigationCategory,
  type ResponsiveNavigationItem,
} from "./responsive-navigation-drawer";
import { ScopeSwitcher } from "./scope-switcher";
import { ShellLayout } from "./shell-layout";
import { Topbar } from "./topbar";
import { AccountMenu } from "./account-menu";
import { PlaneWordmark } from "@athyper/platform-brand/logos";

export interface ShellNavigationItem {
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
  category: NavigationCategory;
}

export interface ShellExperienceDefinition {
  plane: PlaneKey;
  productName: string;
  brandAlt: string;
  /** Light wordmark URL (dark-coloured, for light backgrounds) and dark variant. */
  brandWordmark: { light: string; dark: string };
  defaultPath: string;
  logoutPath: string;
  navigation: readonly ShellNavigationItem[];
  contextLabel: (org: ActiveOrg | null) => string | null;
  supportModeTitle?: string;
  supportModeDescription?: string;
  favoritesEnabled?: boolean;
}

export interface CanonicalShellProps {
  experience: ShellExperienceDefinition;
  pathname: string;
  initialSession?: unknown;
  supportMode?: boolean;
  inboxCount?: number;
  notificationCount?: number;
  assistantSlot?: ReactNode;
  FavoritesPanelComponent?: ComponentType<FavoritesPanelSlotProps>;
  navigate?: (href: string) => void;
  onSearchClick?: () => void;
  children: ReactNode;
}

type PanelTab = FavoritesPanelTab | null;

const PANEL_TAB_TO_RAIL_KEY: Record<FavoritesPanelTab, string> = {
  bookmarks: "favorites",
  recent: "recent",
};

export function CanonicalShell({
  experience,
  pathname,
  initialSession,
  supportMode = false,
  inboxCount = 0,
  notificationCount = 0,
  assistantSlot,
  FavoritesPanelComponent,
  navigate,
  onSearchClick,
  children,
}: CanonicalShellProps) {
  const {
    activeOrg,
    activeUser,
    sessionStatus,
    availableOrgs,
    scopeSwitchStatus,
    scopeSwitchError,
    switchOrg,
    warningSeconds,
    warningReason,
    continuePending,
    continueSession,
    logoutNow,
  } = usePlaneSessionLifecycle(experience.plane, initialSession);
  const [panelTab, setPanelTab] = useState<PanelTab>(null);
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const [contextSwitchRequest, setContextSwitchRequest] = useState(0);
  const closePanel = useCallback(() => setPanelTab(null), []);
  const navigateTo = useCallback((href: string) => {
    if (navigate) navigate(href);
    else window.location.assign(href);
  }, [navigate]);
  const openSearch = useCallback(() => {
    if (onSearchClick) onSearchClick();
    else window.dispatchEvent(new CustomEvent("athyper:command-open"));
  }, [onSearchClick]);
  const requestContextSwitch = useCallback(() => {
    requestAnimationFrame(() => setContextSwitchRequest((current) => current + 1));
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        openSearch();
      }
      if (event.key === "Escape") {
        setPanelTab(null);
        setMobileNavigationOpen(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [openSearch]);

  const workspaceItems = experience.navigation.filter((item) => (
    item.category === "workspace" || item.category === "setup"
  ));
  const workspaces: NavRailWorkspace[] = workspaceItems.map(({ key, label, icon, href }) => ({
    key,
    label,
    icon,
    href,
  }));
  const activeRailKey = resolveActiveRailKey(pathname, panelTab, experience, workspaces);
  const favoritesAvailable = experience.favoritesEnabled !== false && FavoritesPanelComponent !== undefined;
  const mobileItems: ResponsiveNavigationItem[] = experience.navigation.map((item) => ({
    ...item,
    ...(item.key === "inbox"
      ? { badge: inboxCount, badgeLabel: "work items pending" }
      : {}),
  }));

  const selectRailItem = (key: string) => {
    if (key === "favorites" && favoritesAvailable) {
      setPanelTab((current) => current === "bookmarks" ? null : "bookmarks");
      return;
    }
    if (key === "recent") {
      setPanelTab((current) => current === "recent" ? null : "recent");
      return;
    }
    setPanelTab(null);
    if (key === "home") return navigateTo(experience.defaultPath);
    if (key === "inbox") return navigateTo("/inbox");
    if (key === "settings") return navigateTo("/settings");
    if (key === "search") return openSearch();
    const item = experience.navigation.find((candidate) => candidate.key === key);
    if (item) navigateTo(item.href);
  };

  const contextLabel = experience.contextLabel(activeOrg);
  const activeAlias = availableOrgs.find((org) => org.isActive)?.alias ?? null;
  const panel = panelTab === "recent" && !FavoritesPanelComponent
    ? <RecentItemsPanel onClose={closePanel} navigate={navigateTo} />
    : panelTab && FavoritesPanelComponent
      ? <FavoritesPanelComponent activeTab={panelTab} onTabChange={setPanelTab} onClose={closePanel} />
      : null;
  const contextSlot = (
    <ScopeSwitcher
      plane={experience.plane}
      activeName={contextLabel}
      activeAlias={activeAlias}
      organizations={availableOrgs}
      status={scopeSwitchStatus}
      errorMessage={scopeSwitchError}
      onSelect={(alias, workbench) => { void switchOrg(alias, workbench); }}
      onOpenFullPicker={(alias) => navigateTo(`/auth/select?org=${encodeURIComponent(alias)}`)}
      openRequest={contextSwitchRequest}
    />
  );
  const mobileContextSlot = (
    <ScopeSwitcher
      plane={experience.plane}
      activeName={contextLabel}
      activeAlias={activeAlias}
      organizations={availableOrgs}
      status={scopeSwitchStatus}
      errorMessage={scopeSwitchError}
      onSelect={(alias, workbench) => { void switchOrg(alias, workbench); }}
      onOpenFullPicker={(alias) => navigateTo(`/auth/select?org=${encodeURIComponent(alias)}`)}
    />
  );

  return (
    <ShellLayout
      panel={panel}
      panelOpen={panel !== null}
      rail={
        <NavRail
          workspaces={workspaces}
          activeKey={activeRailKey}
          inboxCount={inboxCount}
          homeHref={experience.defaultPath}
          showSearch
          showFavorites={favoritesAvailable}
          onSelect={selectRailItem}
        />
      }
      topbar={
        <Topbar
          onMenuToggle={() => setMobileNavigationOpen(true)}
          brandSlot={
            <a
              href={experience.defaultPath}
              aria-label={`${experience.productName} home`}
              onClick={(event) => navigateAnchor(event, experience.defaultPath, navigateTo)}
              className="flex items-center rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <PlaneWordmark
                light={experience.brandWordmark.light}
                dark={experience.brandWordmark.dark}
                alt={experience.brandAlt}
                className="h-5 w-auto max-w-36 object-contain"
              />
            </a>
          }
          tenantSlot={contextSlot}
          onSearchClick={openSearch}
          assistantSlot={assistantSlot}
          notificationCount={notificationCount}
          notificationActive={pathMatchesHref(pathname, "/notifications")}
          onNotificationClick={() => navigateTo("/notifications")}
          userSlot={
            <AccountMenu
              plane={experience.plane}
              user={activeUser}
              organization={activeOrg}
              sessionStatus={{ ...sessionStatus, supportMode: sessionStatus.supportMode || supportMode }}
              organizations={availableOrgs}
              onNavigate={navigateTo}
              onSwitchContext={requestContextSwitch}
              onLogout={logoutNow}
              settingsActive={pathMatchesHref(pathname, "/settings")}
            />
          }
        />
      }
      banner={supportMode ? (
        <div role="status" className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-amber-950">
          <p className="text-sm font-semibold">{experience.supportModeTitle ?? "Support context"}</p>
          <p className="text-xs">
            {experience.supportModeDescription
              ?? "Privileged support access is active. Actions are grant-bound and audited."}
          </p>
        </div>
      ) : undefined}
    >
      <>
        <ResponsiveNavigationDrawer
          open={mobileNavigationOpen}
          onOpenChange={setMobileNavigationOpen}
          title={experience.productName}
          scopeSlot={mobileContextSlot}
          items={mobileItems}
          activePathname={pathname}
          logoutHref={experience.logoutPath}
          onNavigate={navigateTo}
        />
        {children}
        {warningSeconds !== null ? (
          <SessionWarningDialog
            secondsRemaining={warningSeconds}
            reason={warningReason ?? "idle"}
            pending={continuePending}
            onContinue={() => { void continueSession(); }}
            onLogout={logoutNow}
            brandWordmark={experience.brandWordmark}
            brandAlt={experience.brandAlt}
          />
        ) : null}
      </>
    </ShellLayout>
  );
}

function RecentItemsPanel({
  onClose,
  navigate,
}: {
  onClose: () => void;
  navigate: (href: string) => void;
}) {
  const [items, setItems] = useState<Array<{ href: string; label: string; visitedAt?: string }>>([]);
  useEffect(() => {
    try {
      const value = JSON.parse(window.localStorage.getItem("athyper.recent.v1") ?? "[]") as unknown;
      if (Array.isArray(value)) {
        setItems(value.filter((item): item is { href: string; label: string; visitedAt?: string } => (
          Boolean(item)
          && typeof item === "object"
          && typeof (item as { href?: unknown }).href === "string"
          && typeof (item as { label?: unknown }).label === "string"
        )).slice(0, 25));
      }
    } catch {
      setItems([]);
    }
  }, []);
  return (
    <section className="flex h-full min-h-0 flex-col" aria-labelledby="recent-items-title">
      <header className="flex items-center justify-between border-b p-4">
        <h2 id="recent-items-title" className="font-semibold">Recent</h2>
        <button type="button" className="rounded px-2 py-1 text-sm" onClick={onClose}>Close</button>
      </header>
      {items.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">No recent items.</p>
      ) : (
        <ul className="min-h-0 divide-y overflow-y-auto">
          {items.map((item) => (
            <li key={item.href}>
              <button
                type="button"
                className="w-full p-3 text-left text-sm hover:bg-muted"
                onClick={() => { onClose(); navigate(item.href); }}
              >
                <span className="block font-medium">{item.label}</span>
                {item.visitedAt ? <span className="text-xs text-muted-foreground">{new Date(item.visitedAt).toLocaleString()}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function resolveActiveRailKey(
  pathname: string,
  panelTab: PanelTab,
  experience: ShellExperienceDefinition,
  workspaces: NavRailWorkspace[],
): string {
  if (panelTab) return PANEL_TAB_TO_RAIL_KEY[panelTab];
  if (pathname === "/" || pathMatchesHref(pathname, experience.defaultPath)) return "home";
  if (pathMatchesHref(pathname, "/inbox")) return "inbox";
  if (pathMatchesHref(pathname, "/settings")) return "settings";
  const workspace = workspaces.find((item) => (
    typeof item.href === "string" && pathMatchesHref(pathname, item.href)
  ));
  if (workspace) return workspace.key;
  return experience.navigation.find((item) => pathMatchesHref(pathname, item.href))?.key ?? "home";
}

function pathMatchesHref(pathname: string, href: string): boolean {
  const path = href.split(/[?#]/, 1)[0] || "/";
  return pathname === path || pathname.startsWith(`${path}/`);
}

function navigateAnchor(
  event: React.MouseEvent<HTMLAnchorElement>,
  href: string,
  navigate: (href: string) => void,
) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  navigate(href);
}
