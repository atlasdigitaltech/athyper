"use client";

export { adminAtlasProfile } from "./atlas-profile";

import { type ComponentType, type ReactNode } from "react";
import {
  Boxes,
  Home,
  Inbox,
  Settings,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";
import {
  CanonicalShell,
  type ShellExperienceDefinition,
  type ShellNavigationItem,
} from "@athyper/shell";
import { ADMIN_NAV_ITEMS, type NavItem } from "@athyper/app-admin-route-manifest";
import { getPlaneConfig } from "@athyper/session-plane";
import { getPublicBrandAssets } from "@athyper/brand";
import type { FavoritesPanelSlotProps } from "@athyper/shell-runtime";

export type { FavoritesPanelTab, FavoritesPanelSlotProps } from "@athyper/shell-runtime";

const PLANE = "admin" as const;
const planeConfig = getPlaneConfig(PLANE);

const ICONS = {
  home: Home,
  inbox: Inbox,
  settings: Settings,
  setup: SlidersHorizontal,
  app: Boxes,
} satisfies Partial<Record<NavItem["icon"], LucideIcon>>;

function navigation(): ShellNavigationItem[] {
  return [
    { key: "dashboard", label: "Dashboard", href: planeConfig.defaultPath, icon: Home, category: "global" },
    { key: "inbox", label: "Inbox", href: "/inbox", icon: Inbox, category: "global" },
    ...ADMIN_NAV_ITEMS.map((item) => ({
      key: item.key,
      label: item.label,
      href: item.href,
      icon: ICONS[item.icon] ?? Boxes,
      category: item.category,
    })),
    { key: "settings", label: "Settings", href: "/settings", icon: Settings, category: "utility" },
  ];
}

export function PlaneShell({
  children,
  pathname,
  initialSession,
  supportMode = false,
  inboxCount = 0,
  notificationCount = 0,
  assistantSlot,
  FavoritesPanelComponent,
  navigate,
}: {
  children: ReactNode;
  pathname: string;
  initialSession?: unknown;
  supportMode?: boolean;
  inboxCount?: number;
  notificationCount?: number;
  assistantSlot?: ReactNode;
  FavoritesPanelComponent?: ComponentType<FavoritesPanelSlotProps>;
  navigate?: (href: string) => void;
}) {
  const brand = getPublicBrandAssets(PLANE);
  const experience = createAdminShellExperience(brand.wordmarkBlack);

  return (
    <CanonicalShell
      experience={experience}
      pathname={pathname}
      initialSession={initialSession}
      supportMode={supportMode}
      inboxCount={inboxCount}
      notificationCount={notificationCount}
      assistantSlot={assistantSlot}
      FavoritesPanelComponent={FavoritesPanelComponent}
      navigate={navigate}
    >
      {children}
    </CanonicalShell>
  );
}

export function createAdminShellExperience(brandWordmarkSrc: string): ShellExperienceDefinition {
  return {
    plane: PLANE,
    productName: "Athyper Admin",
    brandAlt: "Athyper",
    brandWordmarkSrc,
    defaultPath: planeConfig.defaultPath,
    logoutPath: planeConfig.logoutPath,
    navigation: navigation(),
    contextLabel: (org) => org?.tenantName ?? null,
    supportModeTitle: "Administrative support context",
    supportModeDescription: "Platform-control access is active. Privileged actions are grant-bound and audited.",
    favoritesEnabled: false,
  };
}
