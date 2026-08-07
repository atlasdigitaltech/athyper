"use client";

export { neonAtlasProfile } from "./atlas-profile";

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
} from "@athyper/shell";
import { NEON_NAV_ITEMS, type NavItem } from "@athyper/app-neon-route-manifest";
import { getPlaneConfig } from "@athyper/platform-iam-session-plane";
import { getPublicBrandAssets } from "@athyper/platform-brand";
import type { FavoritesPanelSlotProps } from "@athyper/shell-runtime";

export type { FavoritesPanelTab, FavoritesPanelSlotProps } from "@athyper/shell-runtime";

const PLANE = "neon" as const;
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
  const experience = createNeonShellExperience({ light: brand.wordmarkBlack, dark: brand.wordmarkWhite });

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

export function createNeonShellExperience(brandWordmark: { light: string; dark: string }): ShellExperienceDefinition {
  return {
    plane: PLANE,
    productName: "Neon",
    brandAlt: "Neon",
    brandWordmark,
    defaultPath: planeConfig.defaultPath,
    logoutPath: planeConfig.logoutPath,
    navigation: NEON_NAV_ITEMS.map((item) => ({
      key: item.key,
      label: item.label,
      href: item.href,
      icon: ICONS[item.icon] ?? Boxes,
      category: item.category,
    })),
    contextLabel: (org) => org?.legalEntityName ?? null,
    supportModeDescription: "Delegated tenant support is active. Actions are grant-bound and audited.",
    favoritesEnabled: true,
  };
}
