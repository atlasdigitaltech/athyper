"use client";

// components/shell/GlobalDrawer.tsx
//
// On-demand overlay navigation drawer.
// Replaces the persistent AppSidebar to give full canvas width to content.
//
// Exports:
//   GlobalDrawerProvider  — React context (open/close state, Ctrl+B shortcut)
//   GlobalDrawerTrigger   — ☰ button that opens the drawer
//   GlobalDrawer          — The Sheet-based overlay drawer

import {
  ArrowLeftRight,
  ArrowRightLeft,
  Banknote,
  BarChart3,
  BookOpen,
  Box,
  Building,
  Building2,
  Calculator,
  Calendar,
  CalendarCheck,
  CalendarOff,
  ChevronRight,
  CircleDot,
  ClipboardList,
  Combine,
  Command,
  CreditCard,
  FileDiff,
  FileMinus,
  FilePlus,
  FileStack,
  FileText,
  GitBranch,
  Handshake,
  HardDrive,
  Landmark,
  Layers,
  LayoutDashboard,
  Menu,
  Package,
  PenLine,
  Plug,
  Receipt,
  Scale,
  ScrollText,
  Send,
  Settings,
  Shapes,
  Shield,
  ShoppingCart,
  Target,
  UserCircle,
  Users,
  Wallet,
  Warehouse,
  Brain,
  Globe,
  Rocket,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  ExperienceSection,
  LogoutSection,
  OperationalSection,
  TenantManagementSection,
  UserMenuHeader,
} from "./user-menu";

import type { LucideIcon } from "lucide-react";

import type { NavModule, NavWorkspace } from "@/lib/nav/nav-types";
import type { Workbench } from "@/lib/auth/types";
import type { SessionBootstrap } from "@/lib/session-bootstrap";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useAuthOptional } from "@/lib/auth/auth-context";
import { WORKBENCH_CONFIGS } from "@/lib/auth/workbench-config";
import { filterNavTree } from "@/lib/nav/filter-nav";
import { useNavTree } from "@/lib/nav/use-nav-tree";
import { useUserMenuModel } from "@/lib/user-menu/use-user-menu-model";
import { cn } from "@/lib/utils";

// ─── Context ─────────────────────────────────────────────────────────────────

interface GlobalDrawerContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const GlobalDrawerContext = createContext<GlobalDrawerContextValue | null>(
  null,
);

export function useGlobalDrawer() {
  const ctx = useContext(GlobalDrawerContext);
  if (!ctx)
    throw new Error("useGlobalDrawer must be used within GlobalDrawerProvider");
  return ctx;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function GlobalDrawerProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  // Ctrl+B / Cmd+B to toggle the drawer
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "b" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const value = useMemo(() => ({ open, setOpen }), [open]);

  return (
    <GlobalDrawerContext.Provider value={value}>
      {children}
    </GlobalDrawerContext.Provider>
  );
}

// ─── Trigger ──────────────────────────────────────────────────────────────────

export function GlobalDrawerTrigger({ className }: { className?: string }) {
  const { setOpen } = useGlobalDrawer();
  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn("size-7", className)}
      onClick={() => setOpen(true)}
      aria-label="Open navigation"
    >
      <Menu className="size-4" />
    </Button>
  );
}

// ─── Drawer ───────────────────────────────────────────────────────────────────

export interface GlobalDrawerProps {
  workbench: Workbench;
}

export function GlobalDrawer({ workbench }: GlobalDrawerProps) {
  const { open, setOpen } = useGlobalDrawer();
  const pathname = usePathname();

  // Auto-close on route change
  useEffect(() => {
    setOpen(false);
  }, [pathname, setOpen]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        side="left"
        showCloseButton={false}
        className="w-72 p-0 gap-0 flex flex-col"
      >
        <DrawerHeader workbench={workbench} />
        <ScrollArea className="flex-1">
          <div className="space-y-1 px-3 py-3">
            {workbench === "admin" && (
              <MeshAdminSection workbench={workbench} />
            )}
            {workbench !== "admin" && (
              <WorkspaceNavSection workbench={workbench} />
            )}
            {(workbench === "user" || workbench === "ops") && (
              <FinanceConsoleSection workbench={workbench} />
            )}
            <SystemSection workbench={workbench} />
          </div>
        </ScrollArea>
        <DrawerUser workbench={workbench} />
      </SheetContent>
    </Sheet>
  );
}

// ─── Drawer Header ────────────────────────────────────────────────────────────

function DrawerHeader({ workbench }: { workbench: Workbench }) {
  const config = WORKBENCH_CONFIGS[workbench];
  return (
    <SheetHeader className="flex-row items-center justify-between gap-2 border-b px-4 py-3">
      <SheetTitle className="flex items-center gap-2">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Command className="size-4" />
        </div>
        <span className="text-sm font-semibold">Neon</span>
        <Badge variant="outline" className="h-5 text-xs capitalize">
          {config.label}
        </Badge>
      </SheetTitle>
    </SheetHeader>
  );
}

// ─── Section label ────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="px-2 pt-3 pb-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">
      {children}
    </p>
  );
}

// ─── Mesh Admin Section ───────────────────────────────────────────────────────

const MESH_NAV = [
  { label: "Dashboard", href: "", icon: LayoutDashboard },
  { label: "Meta Studio", href: "/meta-studio", icon: Shapes },
  { label: "Workflow Studio", href: "/workflow-studio", icon: GitBranch },
  { label: "Policy Studio", href: "/policy-studio", icon: Shield },
  { label: "Integration Studio", href: "/integration-studio", icon: Plug },
  { label: "Governance", href: "/governance", icon: ScrollText },
  { label: "Marketplace", href: "/marketplace", icon: Package },
] as const;

function MeshAdminSection({ workbench }: { workbench: Workbench }) {
  const pathname = usePathname();
  const basePath = `/wb/${workbench}/mesh`;

  return (
    <div>
      <Separator />
      <SectionLabel>Mesh Administration</SectionLabel>
      <ul className="space-y-0.5">
        {MESH_NAV.map((item) => {
          const href = `${basePath}${item.href}`;
          const isActive =
            item.href === ""
              ? pathname === basePath || pathname === `${basePath}/`
              : pathname.startsWith(href);
          return (
            <li key={item.href}>
              <Link
                href={href}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors",
                  isActive
                    ? "bg-accent text-accent-foreground font-medium"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <item.icon className="size-4 shrink-0" />
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ─── Icon map ────────────────────────────────────────────────────────────────

const ICON_MAP: Record<string, LucideIcon> = {
  ArrowLeftRight,
  ArrowRightLeft,
  Banknote,
  BarChart3,
  BookOpen,
  Box,
  Building,
  Building2,
  Calculator,
  Calendar,
  CalendarCheck,
  CalendarOff,
  ClipboardList,
  Combine,
  CreditCard,
  FileDiff,
  FileMinus,
  FilePlus,
  FileStack,
  FileText,
  Handshake,
  HardDrive,
  Landmark,
  Layers,
  Package,
  PenLine,
  Receipt,
  Scale,
  ScrollText,
  Send,
  ShoppingCart,
  Target,
  UserCircle,
  Users,
  Wallet,
  Warehouse,
};

function resolveIcon(name: string): LucideIcon {
  return ICON_MAP[name] ?? CircleDot;
}

// ─── Workspace-to-content mapping ────────────────────────────────────────────
// Defines which workspace codes are visible in each workbench.
// undefined = show all workspaces.

const WORKBENCH_WORKSPACE_MAP: Record<Workbench, string[] | undefined> = {
  user: undefined, // all workspaces
  ops: undefined, // all workspaces
  partner: ["operations", "supply-chain"], // limited scope
  admin: undefined, // admin workbench never renders this section (guarded above)
};

// ─── Workspace Navigation Section ────────────────────────────────────────────

function WorkspaceNavSection({ workbench }: { workbench: Workbench }) {
  const auth = useAuthOptional();
  const pathname = usePathname();
  const csrfToken =
    typeof window !== "undefined"
      ? (
          (window as unknown as Record<string, unknown>)
            .__SESSION_BOOTSTRAP__ as SessionBootstrap | undefined
        )?.csrfToken
      : undefined;

  const { tree, isFallback } = useNavTree(workbench, csrfToken);

  const filteredTree = useMemo(() => {
    if (!tree) return null;
    // In fallback/dev mode, show all modules without role filtering
    const roleFiltered = isFallback ? tree : filterNavTree(tree, auth);
    if (!roleFiltered) return null;

    // Scope workspaces to what this workbench should show
    const allowedCodes = WORKBENCH_WORKSPACE_MAP[workbench];
    if (!allowedCodes) return roleFiltered;

    return {
      ...roleFiltered,
      workspaces: roleFiltered.workspaces.filter((ws) =>
        allowedCodes.includes(ws.code),
      ),
    };
  }, [tree, auth, isFallback, workbench]);

  if (!filteredTree || filteredTree.workspaces.length === 0) return null;

  return (
    <>
      {filteredTree.workspaces.map((ws) => (
        <WorkspaceGroup
          key={ws.code}
          workspace={ws}
          pathname={pathname}
        />
      ))}
    </>
  );
}

function WorkspaceGroup({
  workspace,
  pathname,
}: {
  workspace: NavWorkspace;
  pathname: string;
}) {
  return (
    <div>
      <Separator />
      <SectionLabel>{workspace.label}</SectionLabel>
      <ul className="space-y-0.5">
        {workspace.modules.map((mod) => (
          <ModuleItem key={mod.code} module={mod} pathname={pathname} />
        ))}
      </ul>
    </div>
  );
}

function ModuleItem({
  module: mod,
  pathname,
}: {
  module: NavModule;
  pathname: string;
}) {
  const Icon = resolveIcon(mod.icon);
  const isAnyEntityActive = mod.entities.some((e) =>
    pathname.startsWith(`/app/${e.slug}`),
  );
  const [open, setOpen] = useState(isAnyEntityActive);

  return (
    <li>
      <button
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors",
          isAnyEntityActive
            ? "bg-accent text-accent-foreground font-medium"
            : "text-muted-foreground hover:bg-accent hover:text-foreground",
        )}
      >
        <Icon className="size-4 shrink-0" />
        <span className="flex-1 text-left">{mod.label}</span>
        <ChevronRight
          className={cn(
            "size-3.5 shrink-0 transition-transform duration-200",
            open && "rotate-90",
          )}
        />
      </button>
      {open && mod.entities.length > 0 && (
        <ul className="ml-4 mt-0.5 space-y-0.5 border-l pl-2">
          {mod.entities.map((entity) => {
            const href = `/app/${entity.slug}`;
            const isActive = pathname.startsWith(href);
            return (
              <li key={entity.slug}>
                <Link
                  href={href}
                  className={cn(
                    "flex items-center rounded-md px-2 py-1 text-sm transition-colors",
                    isActive
                      ? "bg-accent text-accent-foreground font-medium"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  {entity.label}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

// ─── Finance Console Section ─────────────────────────────────────────────────

const FINANCE_CONSOLE_NAV = [
  { label: "Atlas AI Console", href: "/finance/atlas-console", icon: Brain },
  {
    label: "Global Close Monitor",
    href: "/finance/global-close-monitor",
    icon: Globe,
  },
  {
    label: "Release Control Tower",
    href: "/finance/release-control-tower",
    icon: Rocket,
  },
] as const;

function FinanceConsoleSection({ workbench }: { workbench: Workbench }) {
  const pathname = usePathname();
  const basePath = `/wb/${workbench}`;

  return (
    <div>
      <Separator />
      <SectionLabel>Finance Console</SectionLabel>
      <ul className="space-y-0.5">
        {FINANCE_CONSOLE_NAV.map((item) => {
          const href = `${basePath}${item.href}`;
          const isActive = pathname.startsWith(href);
          return (
            <li key={item.href}>
              <Link
                href={href}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors",
                  isActive
                    ? "bg-accent text-accent-foreground font-medium"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <item.icon className="size-4 shrink-0" />
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ─── System Section ───────────────────────────────────────────────────────────

function SystemSection({ workbench }: { workbench: Workbench }) {
  return (
    <div>
      <Separator />
      <SectionLabel>System</SectionLabel>
      <ul className="space-y-0.5">
        <li>
          <Link
            href={`/wb/${workbench}/settings`}
            className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Settings className="size-4 shrink-0" />
            <span>Settings</span>
          </Link>
        </li>
      </ul>
    </div>
  );
}

// ─── Drawer User Footer ───────────────────────────────────────────────────────

function DrawerUser({ workbench }: { workbench: Workbench }) {
  const model = useUserMenuModel();

  return (
    <div className="border-t p-3">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex w-full items-center gap-2.5 rounded-md p-2 text-left transition-colors hover:bg-accent">
            <Avatar className="size-8 shrink-0 rounded-lg">
              <AvatarFallback
                className="rounded-lg text-xs"
                style={{
                  backgroundColor: model.avatarColor.bg,
                  color: model.avatarColor.fg,
                }}
              >
                {model.initials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">
                {model.truncatedName}
              </p>
              <p className="truncate text-xs capitalize text-muted-foreground">
                {model.persona}
              </p>
            </div>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" className="w-64">
          <DropdownMenuLabel className="p-0 font-normal">
            <UserMenuHeader model={model} variant="drawer" />
          </DropdownMenuLabel>
          <TenantManagementSection
            model={model}
            workbench={workbench}
            variant="drawer"
          />
          <OperationalSection
            model={model}
            workbench={workbench}
            variant="drawer"
          />
          <ExperienceSection model={model} variant="drawer" />
          <LogoutSection model={model} variant="drawer" />
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
