"use client";

import { type ComponentType, type ReactNode, useCallback, useEffect, useState } from "react";
import {
  Bell, Bookmark, Boxes, FileText, Home, Inbox, LayoutDashboard, Settings, ShieldCheck, SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";
import { NavRail, ShellLayout, Topbar, type NavRailWorkspace } from "@athyper/shell";
import { MESH_NAV_ITEMS, type NavItem } from "@athyper/app-mesh-route-manifest";
import { getPlaneConfig } from "@athyper/session-plane";
import { BoundaryBanner } from "@athyper/surface-kit";
import { getPublicBrandAssets } from "@athyper/brand";
import {
  usePlaneSessionLifecycle,
  SessionWarningDialog,
  type FavoritesPanelTab,
  type FavoritesPanelSlotProps,
  type ActiveOrg,
} from "@athyper/shell-runtime";

export type { FavoritesPanelTab, FavoritesPanelSlotProps };

const PLANE = "mesh" as const;
const config = getPlaneConfig(PLANE);

function TenantSlot({ org }: { org: ActiveOrg | null }) {
  if (!org) return null;
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-medium text-muted-foreground">{org.orgName}</span>
      {org.roles[0] && (
        <span className="rounded-md bg-secondary px-1.5 py-0.5 text-xs font-medium text-secondary-foreground capitalize">
          {org.roles[0]}
        </span>
      )}
    </div>
  );
}

const ICONS = {
  home: Home, inbox: Inbox, bell: Bell, bookmark: Bookmark, settings: Settings,
  workbench: LayoutDashboard, app: Boxes, content: FileText, shield: ShieldCheck, setup: SlidersHorizontal,
} satisfies Record<NavItem["icon"], LucideIcon>;

function toWorkspace(item: NavItem): NavRailWorkspace {
  return { key: item.key, label: item.label, icon: ICONS[item.icon], href: item.href };
}

type PanelTab = FavoritesPanelTab | null;

const PANEL_TAB_TO_RAIL_KEY: Record<FavoritesPanelTab, string> = {
  bookmarks: "favorites",
  recent: "recent",
};

const GLOBAL_RAIL_HREFS: Record<string, string> = {
  inbox: "/inbox",
  settings: "/settings",
};

function useBrowserPathname(): string | null {
  const [pathname, setPathname] = useState<string | null>(null);

  useEffect(() => {
    const update = () => setPathname(window.location.pathname);
    update();
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, []);

  return pathname;
}

function pathMatchesHref(pathname: string, href: string): boolean {
  const path = href.split(/[?#]/, 1)[0] || "/";
  return pathname === path || pathname.startsWith(`${path}/`);
}

function resolveActiveRailKey({
  panelTab,
  pathname,
  workspaces,
}: {
  panelTab: PanelTab;
  pathname: string | null;
  workspaces: NavRailWorkspace[];
}): string {
  if (panelTab) return PANEL_TAB_TO_RAIL_KEY[panelTab];
  if (!pathname || pathname === "/" || pathMatchesHref(pathname, config.defaultPath)) return "home";

  const globalEntry = Object.entries(GLOBAL_RAIL_HREFS).find(([, href]) => pathMatchesHref(pathname, href));
  if (globalEntry) return globalEntry[0];

  const workspace = workspaces.find((item) => item.href && pathMatchesHref(pathname, item.href));
  if (workspace) return workspace.key;

  const navItem = MESH_NAV_ITEMS.find((item) => pathMatchesHref(pathname, item.href));
  return navItem?.key ?? "home";
}

export function PlaneShell({
  children,
  supportMode = false,
  inboxCount = 0,
  FavoritesPanelComponent,
}: {
  children: ReactNode;
  supportMode?: boolean;
  inboxCount?: number;
  FavoritesPanelComponent?: ComponentType<FavoritesPanelSlotProps>;
}) {
  const brandAssets = getPublicBrandAssets(PLANE);
  const pathname = useBrowserPathname();
  const { activeOrg, warningSeconds, warningReason, continuePending, continueSession, logoutNow } = usePlaneSessionLifecycle(PLANE);
  const [panelTab, setPanelTab] = useState<PanelTab>(null);
  const closePanel = useCallback(() => setPanelTab(null), []);

  // mesh: all nav items shown as workspace icons
  const workspaces = MESH_NAV_ITEMS.map(toWorkspace);
  const activeRailKey = resolveActiveRailKey({ panelTab, pathname, workspaces });

  function selectRailItem(key: string) {
    if (key === "favorites") { setPanelTab((prev) => (prev === "bookmarks" ? null : "bookmarks")); return; }
    if (key === "recent") { setPanelTab((prev) => (prev === "recent" ? null : "recent")); return; }

    setPanelTab(null);

    const workspace = workspaces.find((c) => c.key === key);
    if (workspace?.href) { window.location.assign(workspace.href); return; }

    const item = MESH_NAV_ITEMS.find((c) => c.key === key);
    if (item) { window.location.assign(item.href); return; }

    const globalHref = GLOBAL_RAIL_HREFS[key];
    if (globalHref) { window.location.assign(globalHref); return; }

    if (key === "home") window.location.assign(config.defaultPath);
  }

  return (
    <ShellLayout
      panel={panelTab && FavoritesPanelComponent
        ? <FavoritesPanelComponent activeTab={panelTab} onTabChange={setPanelTab} onClose={closePanel} />
        : null}
      panelOpen={panelTab !== null && FavoritesPanelComponent !== undefined}
      rail={
        <NavRail
          workspaces={workspaces}
          activeKey={activeRailKey}
          inboxCount={inboxCount}
          hasPlatform={false}
          homeHref={config.defaultPath}
          showSearch={false}
          onSelect={selectRailItem}
        />
      }
      topbar={
        <Topbar
          brandSlot={
            <a href={config.defaultPath} aria-label="mesh"
              className="flex items-center gap-1.5 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <img alt="" aria-hidden="true" className="h-[26px] w-[26px] shrink-0 rounded-sm object-cover"
                draggable={false} src={brandAssets.appIcon} />
              <span className="hidden text-xl font-medium leading-none text-foreground lg:block">mesh</span>
            </a>
          }
          tenantSlot={<TenantSlot org={activeOrg} />}
          onNotificationClick={() => { window.location.assign("/notifications"); }}
          userSlot={<a href={config.logoutPath} className="rounded-full border px-3 py-1 text-xs font-medium">Account</a>}
        />
      }
      banner={supportMode ? (
        <div className="border-b bg-amber-50 px-3 py-2">
          <BoundaryBanner title="Support context">
            platform-control access is active and every privileged action must be grant-bound and audited.
          </BoundaryBanner>
        </div>
      ) : undefined}
    >
      <>
        {children}
        {warningSeconds !== null && (
          <SessionWarningDialog
            secondsRemaining={warningSeconds}
            reason={warningReason ?? "idle"}
            pending={continuePending}
            onContinue={() => { void continueSession(); }}
            onLogout={logoutNow}
          />
        )}
      </>
    </ShellLayout>
  );
}
