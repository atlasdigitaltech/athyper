"use client";

import { type ComponentType, type ReactNode } from "react";
import {
  Boxes,
  FileText,
  Home,
  Inbox,
  LayoutDashboard,
  Settings,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import {
  CanonicalShell,
  type ShellExperienceDefinition,
  type ShellNavigationItem,
} from "@athyper/shell";
import { MESH_NAV_ITEMS, type NavItem } from "@athyper/app-mesh-route-manifest";
import { getPlaneConfig } from "@athyper/platform-iam-session-plane";
import { getPublicBrandAssets } from "@athyper/platform-brand";
import type { FavoritesPanelSlotProps } from "@athyper/shell-runtime";

export type { FavoritesPanelTab, FavoritesPanelSlotProps } from "@athyper/shell-runtime";

const PLANE = "mesh" as const;
const planeConfig = getPlaneConfig(PLANE);
const ICONS = {
  home: Home,
  inbox: Inbox,
  settings: Settings,
  workbench: LayoutDashboard,
  app: Boxes,
  content: FileText,
  shield: ShieldCheck,
} satisfies Partial<Record<NavItem["icon"], LucideIcon>>;

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
  runtimeCatalog = [],
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
  runtimeCatalog?: ReadonlyArray<{ entityCode: string; labelPlural: string; list: boolean }>;
}) {
  const brand = getPublicBrandAssets(PLANE);
  const catalogNavigation: ShellNavigationItem[] = runtimeCatalog
    .filter((item) => item.list)
    .map((item) => ({
      key: `entity:${item.entityCode}`,
      label: item.labelPlural,
      icon: Boxes,
      href: `/app/${item.entityCode}`,
      category: "workspace",
    }));
  const experience = createMeshShellExperience({ light: brand.wordmarkBlack, dark: brand.wordmarkWhite }, catalogNavigation);

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

export function createMeshShellExperience(
  brandWordmark: { light: string; dark: string },
  catalogNavigation: readonly ShellNavigationItem[] = [],
): ShellExperienceDefinition {
  return {
    plane: PLANE,
    productName: "Mesh",
    brandAlt: "Mesh",
    brandWordmark,
    defaultPath: planeConfig.defaultPath,
    logoutPath: planeConfig.logoutPath,
    navigation: [
      ...MESH_NAV_ITEMS.map((item) => ({
        key: item.key,
        label: item.label,
        href: item.href,
        icon: ICONS[item.icon] ?? Boxes,
        category: item.category,
      })),
      ...catalogNavigation,
    ],
    contextLabel: (org) => org?.orgName ?? null,
    supportModeDescription: "Partner support access is active. Actions are account-bound and audited.",
    favoritesEnabled: false,
  };
}
