"use client";

/**
 * SessionNav — sidebar navigation driven by the runtime session
 *
 * Reads `runtime.modules` from SessionProvider and renders one nav link
 * per module. While the runtime session loads it shows skeleton placeholders.
 *
 * Navigation structure:
 *   Home            ← always present
 *   ─────────────
 *   [module links]  ← from runtime session modules[]
 *
 * Module-to-route mapping is simple for Phase 4: /module/{code.toLowerCase()}.
 * The full metadata-driven module tree (entities, sub-routes) is wired in Sprint 2
 * when packages/navigation provides the module tree from the API.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  BookOpen,
  CreditCard,
  FileText,
  Inbox,
  LayoutDashboard,
  Package,
  Receipt,
  Settings,
  Users,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { Skeleton } from "@athyper/ui/primitives";
import { cn } from "@athyper/theme/utils";
import { useShellSession } from "@/components/providers/SessionProvider";

// ─── Module icon map ──────────────────────────────────────────────────────────

const MODULE_ICONS: Record<string, LucideIcon> = {
  ACC: BookOpen,
  PAY: CreditCard,
  INV: Receipt,
  GEN: LayoutDashboard,
  REP: BarChart3,
  WF: Workflow,
  PRC: Package,
  HR: Users,
  SET: Settings,
};

// ─── Nav item component ───────────────────────────────────────────────────────

function NavItem({
  href,
  label,
  Icon,
}: {
  href: string;
  label: string;
  Icon: LucideIcon;
}) {
  const pathname = usePathname();
  const isActive = href === "/home"
    ? pathname === href || pathname.startsWith("/workbench/")
    : pathname === href || pathname.startsWith(href + "/");

  return (
    <Link
      href={href}
      className={cn(
        "group flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
        isActive
          ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
          : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
      )}
    >
      <Icon
        className={cn(
          "h-4 w-4 shrink-0 transition-colors",
          isActive
            ? "text-sidebar-accent-foreground"
            : "text-sidebar-foreground/50 group-hover:text-sidebar-foreground/80",
        )}
      />
      <span className="truncate">{label}</span>
    </Link>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function SessionNav() {
  const { runtime, runtimeLoading } = useShellSession();

  if (runtimeLoading) {
    return (
      <div className="space-y-1 px-3 py-1">
        <NavItem href="/home" label="Home" Icon={LayoutDashboard} />
        <div className="my-2 h-px bg-sidebar-border" />
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="mx-0.5 h-8 w-[calc(100%-4px)] rounded-md bg-sidebar-accent/30" />
        ))}
        <div className="my-2 h-px bg-sidebar-border" />
        <NavItem href="/inbox" label="Inbox" Icon={Inbox} />
        <NavItem href="/settings" label="Settings" Icon={Settings} />
      </div>
    );
  }

  const modules = runtime?.modules ?? [];

  return (
    <div className="space-y-0.5 px-3 py-1">
      <NavItem href="/home" label="Home" Icon={LayoutDashboard} />

      {modules.length > 0 && <div className="my-2 h-px bg-sidebar-border" />}

      {modules.map((mod) => {
        const Icon = MODULE_ICONS[mod.code] ?? FileText;
        return (
          <NavItem
            key={mod.code}
            href={`/module/${mod.code.toLowerCase()}`}
            label={mod.name}
            Icon={Icon}
          />
        );
      })}

      <div className="my-2 h-px bg-sidebar-border" />
      <NavItem href="/inbox" label="Inbox" Icon={Inbox} />
      <NavItem href="/settings" label="Settings" Icon={Settings} />
    </div>
  );
}
