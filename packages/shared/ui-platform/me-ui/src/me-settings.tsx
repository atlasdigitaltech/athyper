"use client";

import { useRef, useState, type ElementType } from "react";
import { Building2, Palette, ShieldCheck, User } from "lucide-react";
import { cn } from "@athyper/platform-theme/utils";
import {
  Badge,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@athyper/platform-ui/primitives";

import { ProfileSection } from "./sections/profile-section";
import { IdentitySection } from "./sections/identity-section";
import { PreferencesSection } from "./sections/preferences-section";
import { TenantContextSection } from "./sections/tenant-context-section";
import { TenantAdminSection } from "./sections/tenant-admin-section";

// ─── Section registry ─────────────────────────────────────────────────────────

export type MeSectionId = "profile" | "identity" | "preferences" | "tenant-context";
export type MeAdminSectionId = "tenant";

const ME_SECTION_REGISTRY: Record<
  MeSectionId,
  { label: string; icon: ElementType; Component: (props: { active: boolean }) => React.ReactNode }
> = {
  profile:          { label: "Profile",           icon: User,        Component: ProfileSection },
  identity:         { label: "Identity & Access", icon: ShieldCheck, Component: IdentitySection },
  preferences:      { label: "Preferences",       icon: Palette,     Component: PreferencesSection },
  "tenant-context": { label: "Tenant Context",    icon: Building2,   Component: TenantContextSection },
};

const ME_ADMIN_SECTION_REGISTRY: Record<
  MeAdminSectionId,
  { label: string; icon: ElementType }
> = {
  tenant: { label: "Tenant Administration", icon: Building2 },
};

// ─── Orchestrator ─────────────────────────────────────────────────────────────

export interface MeSettingsProps {
  /** Principal-centric sections (no admin gate). Defaults to all three. */
  sections?: readonly MeSectionId[];
  /** Admin-gated sections. Defaults to none. */
  adminSections?: readonly MeAdminSectionId[];
  /**
   * Per-admin-section URL overrides. When omitted, each section uses its
   * canonical endpoint (e.g. `/api/admin/tenant`). Provide an override when
   * a plane's BFF admin namespace differs from the default.
   */
  adminSectionUrls?: Partial<Record<MeAdminSectionId, string>>;
  /**
   * If supplied, the first matching extra section receives a tab too.
   * Used by callers that want to inject plane-specific extras
   * (e.g. neon's notifications/diagnostics) into the same nav.
   */
  extras?: ReadonlyArray<{
    id: string;
    label: string;
    icon?: ElementType;
    adminOnly?: boolean;
    render: (active: boolean) => React.ReactNode;
  }>;
  /** Initial active tab. Defaults to the first item in `sections`. */
  defaultActiveId?: string;
}

/**
 * Default settings layout for mesh and admin planes. Renders a vertical
 * sidebar nav + keep-alive section panes. Neon currently composes the
 * individual section components in its own custom layout — when mesh and
 * admin settings pages land, they pick this up as the canonical layout.
 */
export function MeSettings({
  sections = ["profile", "identity", "preferences", "tenant-context"],
  adminSections = [],
  adminSectionUrls,
  extras = [],
  defaultActiveId,
}: MeSettingsProps) {
  const navItems = [
    ...sections.map((id) => ({
      id,
      label: ME_SECTION_REGISTRY[id].label,
      icon: ME_SECTION_REGISTRY[id].icon,
      adminOnly: false,
      render: (act: boolean) => {
        const Comp = ME_SECTION_REGISTRY[id].Component;
        return <Comp active={act} />;
      },
    })),
    ...adminSections.map((id) => ({
      id,
      label: ME_ADMIN_SECTION_REGISTRY[id].label,
      icon: ME_ADMIN_SECTION_REGISTRY[id].icon,
      adminOnly: true,
      render: (act: boolean) => {
        if (id === "tenant") {
          return <TenantAdminSection active={act} url={adminSectionUrls?.tenant} />;
        }
        return null;
      },
    })),
    ...extras.map((e) => ({
      id: e.id,
      label: e.label,
      icon: e.icon ?? User,
      adminOnly: e.adminOnly ?? false,
      render: (act: boolean) => e.render(act),
    })),
  ];

  const initialId = defaultActiveId ?? navItems[0]?.id ?? "profile";
  const [active, setActive] = useState<string>(initialId);
  const activated = useRef<Set<string>>(new Set([initialId]));

  function go(id: string) {
    activated.current.add(id);
    setActive(id);
  }

  return (
    <div className="flex gap-0">
      <aside className="hidden w-[220px] shrink-0 pr-8 lg:block">
        <nav className="sticky top-8 flex flex-col gap-0.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = active === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => go(item.id)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm leading-5 transition-colors",
                  isActive
                    ? "bg-accent font-medium text-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate text-left">{item.label}</span>
                {item.adminOnly && <Badge variant="secondary" className="shrink-0 text-xs">Admin</Badge>}
              </button>
            );
          })}
        </nav>
      </aside>

      <div className="min-w-0 flex-1">
        {/* Mobile nav — sidebar is hidden below lg, so surface the same items in a Select. */}
        <div className="mb-4 lg:hidden">
          <Select value={active} onValueChange={(v) => go(v)}>
            <SelectTrigger className="w-full text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {navItems.map((item) => (
                <SelectItem key={item.id} value={item.id} className="text-sm">
                  <span className="flex items-center gap-2">
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.adminOnly && (
                      <Badge variant="secondary" className="text-[10px]">Admin</Badge>
                    )}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {navItems.map((item) => (
          <div key={item.id} className={active === item.id ? "block" : "hidden"}>
            {activated.current.has(item.id) && item.render(active === item.id)}
          </div>
        ))}
      </div>
    </div>
  );
}






