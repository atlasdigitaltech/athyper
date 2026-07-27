"use client";

import { type MouseEvent, type ReactNode } from "react";
import { LogOut, Settings, type LucideIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@athyper/ui/primitives";
import { cn } from "@athyper/theme/utils";
import { NavBadge } from "./nav-badge";

export type NavigationCategory = "global" | "workspace" | "setup" | "utility";

export interface ResponsiveNavigationItem {
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
  category: NavigationCategory;
  badge?: number;
  badgeLabel?: string;
}

export interface ResponsiveNavigationDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  scopeSlot?: ReactNode;
  items: readonly ResponsiveNavigationItem[];
  activePathname: string;
  settingsHref?: string;
  logoutHref: string;
  onNavigate: (href: string) => void;
}

const CATEGORY_LABELS: Record<NavigationCategory, string> = {
  global: "Global",
  workspace: "Workspaces",
  setup: "Setup",
  utility: "Utilities",
};

export function ResponsiveNavigationDrawer({
  open,
  onOpenChange,
  title,
  scopeSlot,
  items,
  activePathname,
  settingsHref = "/settings",
  logoutHref,
  onNavigate,
}: ResponsiveNavigationDrawerProps) {
  const sections = (["global", "workspace", "setup", "utility"] as const)
    .map((category) => ({ category, items: items.filter((item) => item.category === category) }))
    .filter((section) => section.items.length > 0);

  const navigate = (event: MouseEvent<HTMLAnchorElement>, href: string) => {
    if (isModifiedClick(event)) return;
    event.preventDefault();
    onOpenChange(false);
    onNavigate(href);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="bottom-0 left-0 top-0 h-dvh max-h-none w-[min(88vw,22rem)] max-w-none translate-x-0 translate-y-0 rounded-none border-y-0 border-l-0 p-0 md:hidden"
        aria-describedby="mobile-navigation-description"
      >
        <div className="flex h-full min-h-0 flex-col">
          <div className="border-b px-5 py-4 pr-12">
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription id="mobile-navigation-description">
              Application navigation and current scope
            </DialogDescription>
            {scopeSlot ? <div className="mt-3">{scopeSlot}</div> : null}
          </div>

          <nav aria-label="Mobile navigation" className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
            {sections.map(({ category, items: sectionItems }) => (
              <section key={category} aria-labelledby={`mobile-nav-${category}`} className="mb-4">
                <h2
                  id={`mobile-nav-${category}`}
                  className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  {CATEGORY_LABELS[category]}
                </h2>
                <div className="space-y-1">
                  {sectionItems.map((item) => {
                    const active = pathMatchesHref(activePathname, item.href);
                    const Icon = item.icon;
                    const accessibleLabel = item.badge && item.badge > 0 && item.badgeLabel
                      ? `${item.label} (${item.badge} ${item.badgeLabel})`
                      : item.label;
                    return (
                      <a
                        key={item.key}
                        href={item.href}
                        aria-label={accessibleLabel}
                        aria-current={active ? "page" : undefined}
                        onClick={(event) => navigate(event, item.href)}
                        className={cn(
                          "relative flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium outline-none transition-colors",
                          "focus-visible:ring-2 focus-visible:ring-ring",
                          active ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                        )}
                      >
                        <Icon className="size-5 shrink-0" />
                        <span className="flex-1">{item.label}</span>
                        <NavBadge count={item.badge ?? 0} />
                      </a>
                    );
                  })}
                </div>
              </section>
            ))}
          </nav>

          <div className="space-y-1 border-t p-3">
            {!items.some((item) => item.href === settingsHref) ? (
              <a
                href={settingsHref}
                onClick={(event) => navigate(event, settingsHref)}
                className="flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground outline-none hover:bg-muted/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Settings className="size-5" />
                Settings
              </a>
            ) : null}
            <a
              href={logoutHref}
              data-native-navigation="true"
              className="flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground outline-none hover:bg-muted/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <LogOut className="size-5" />
              Sign out
            </a>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function pathMatchesHref(pathname: string, href: string): boolean {
  const path = href.split(/[?#]/, 1)[0] || "/";
  return pathname === path || pathname.startsWith(`${path}/`);
}

function isModifiedClick(event: MouseEvent<HTMLAnchorElement>): boolean {
  return event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
}
