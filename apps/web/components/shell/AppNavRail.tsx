"use client";

/**
 * AppNavRail — live-data wrapper around NavRail.
 *
 * - Reads runtime.modules from SessionProvider and derives workspace groups.
 * - Tracks activeKey (workspace key or global action) in state lifted from AppShellLayout.
 * - Dispatches "athyper:open-palette" custom event so AppTopbar opens ⌘K.
 * - Routes to /home, /inbox, /settings for global actions.
 * - Calls onWorkspaceChange so AppShellLayout can open/close the ContextPanel.
 */

import { useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { NavRail, type NavRailKey } from "@athyper/shell";
import { deriveNavTree, WORKSPACE_HREF_MAP } from "@athyper/navigation";
import { useShellSession } from "@/components/providers/SessionProvider";

export interface AppNavRailProps {
  /** The currently expanded workspace key (null = no panel / home state). */
  activeWorkspaceKey: string | null;
  onWorkspaceChange: (key: string | null) => void;
  inboxCount?: number;
  /** Workbench accent CSS color forwarded from AppShellLayout. */
  accentColor?: string;
}

export function AppNavRail({
  activeWorkspaceKey,
  onWorkspaceChange,
  inboxCount = 0,
  accentColor,
}: AppNavRailProps) {
  const { runtime } = useShellSession();
  const router = useRouter();
  const pathname = usePathname();

  const workspaces = runtime ? deriveNavTree(runtime.modules) : [];
  const hasPlatform = (runtime?.platform?.length ?? 0) > 0;
  const workspaceKeys = new Set(workspaces.map((ws) => ws.key));

  function routeWorkspaceKey(path: string): NavRailKey | null {
    const entry = Object.entries(WORKSPACE_HREF_MAP).find(([, href]) =>
      path === href || path.startsWith(`${href}/`),
    );
    if (entry) return entry[0];
    if (path === "/core" || path.startsWith("/core/")) return "core";
    return null;
  }

  // Derive the active rail key:
  // - workspace clicks → workspace key (panel open)
  // - route-driven → global key derived from pathname
  const routeKey: NavRailKey | null =
    activeWorkspaceKey ??
    (pathname === "/home" || pathname === "/dashboard" || pathname === "/"
      ? "home"
      : pathname.startsWith("/inbox")
        ? "inbox"
        : pathname.startsWith("/settings")
          ? "settings"
          : routeWorkspaceKey(pathname));

  const handleSelect = useCallback(
    (key: NavRailKey) => {
      switch (key) {
        case "home":
          onWorkspaceChange(null);
          router.push("/home");
          break;
        case "inbox":
          onWorkspaceChange(null);
          router.push("/inbox");
          break;
        case "search":
          // Notify AppTopbar to open the command palette
          window.dispatchEvent(new CustomEvent("athyper:open-palette"));
          break;
        case "settings":
          onWorkspaceChange(null);
          router.push("/settings");
          break;
        case "favorites":
          onWorkspaceChange("favorites");
          break;
        case "recent":
          onWorkspaceChange("recent");
          break;
        default:
          if (key === "core") {
            onWorkspaceChange(key);
            router.push("/core");
            break;
          }

          if (workspaceKeys.has(key)) {
            onWorkspaceChange(key);
            const href = WORKSPACE_HREF_MAP[key];
            if (href) router.push(href);
            break;
          }

          onWorkspaceChange(key === activeWorkspaceKey ? null : key);
          break;
      }
    },
    [activeWorkspaceKey, onWorkspaceChange, router, workspaceKeys],
  );

  return (
    <NavRail
      workspaces={workspaces.map((ws) => ({
        key: ws.key,
        label: ws.label,
        icon: ws.icon,
        href: WORKSPACE_HREF_MAP[ws.key],
      }))}
      hasPlatform={hasPlatform}
      activeKey={routeKey}
      inboxCount={inboxCount}
      accentColor={accentColor}
      onSelect={handleSelect}
    />
  );
}
