"use client";

// components/sidebar/NavDynamic.tsx
//
// Renders the dynamic navigation tree in the sidebar.
// Displays workspace > module > entity hierarchy with collapsible groups.

import {
  ArrowRightLeft,
  Banknote,
  BarChart3,
  BookOpen,
  Box,
  Building,
  Building2,
  Calculator,
  Calendar,
  CalendarOff,
  CircleDot,
  ClipboardList,
  CreditCard,
  FileText,
  Handshake,
  HardDrive,
  Landmark,
  Layers,
  Package,
  Receipt,
  Scale,
  ScrollText,
  Send,
  ShoppingCart,
  UserCircle,
  Users,
  Wallet,
  Warehouse,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import type { NavEntity, NavModule, NavWorkspace } from "@/lib/nav/nav-types";
import type { LucideIcon } from "lucide-react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthOptional } from "@/lib/auth/auth-context";
import { useMessages } from "@/lib/i18n/messages-context";
import { filterNavTree } from "@/lib/nav/filter-nav";
import { useNavTree } from "@/lib/nav/use-nav-tree";

// Icon map for resolving icon names to Lucide components
const ICON_MAP: Record<string, LucideIcon> = {
  ArrowRightLeft,
  Banknote,
  BarChart3,
  BookOpen,
  Box,
  Building,
  Building2,
  Calculator,
  Calendar,
  CalendarOff,
  ClipboardList,
  CreditCard,
  FileText,
  Handshake,
  HardDrive,
  Landmark,
  Layers,
  Package,
  Receipt,
  Scale,
  ScrollText,
  Send,
  ShoppingCart,
  UserCircle,
  Users,
  Wallet,
  Warehouse,
};

function resolveIcon(name: string): LucideIcon {
  return ICON_MAP[name] ?? CircleDot;
}

interface NavDynamicProps {
  workbench: string;
  csrfToken?: string;
}

export function NavDynamic({ workbench, csrfToken }: NavDynamicProps) {
  const { tree, loading, error } = useNavTree(workbench, csrfToken);
  const auth = useAuthOptional();
  const pathname = usePathname();
  const { t } = useMessages();

  if (loading) {
    return (
      <SidebarGroup>
        <SidebarGroupLabel>{t("common.navigation.modules")}</SidebarGroupLabel>
        <SidebarGroupContent>
          <div className="space-y-2 px-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-6 w-full" />
            ))}
          </div>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }

  if (error || !tree) {
    return (
      <SidebarGroup>
        <SidebarGroupLabel>{t("common.navigation.modules")}</SidebarGroupLabel>
        <SidebarGroupContent>
          <p className="px-3 text-xs text-muted-foreground">
            {t("common.navigation.modules_error")}
          </p>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }

  const filteredTree = filterNavTree(tree, auth);

  if (filteredTree.workspaces.length === 0) {
    return null;
  }

  return (
    <>
      {filteredTree.workspaces.map((ws) => (
        <WorkspaceGroup key={ws.code} workspace={ws} pathname={pathname} />
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
    <SidebarGroup>
      <SidebarGroupLabel>{workspace.label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {workspace.modules.map((mod) => (
            <ModuleItem key={mod.code} module={mod} pathname={pathname} />
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function ModuleItem({
  module,
  pathname,
}: {
  module: NavModule;
  pathname: string;
}) {
  const Icon = resolveIcon(module.icon);
  const isActive = module.entities.some((e) =>
    pathname.startsWith(`/app/${e.slug}`),
  );

  return (
    <Collapsible defaultOpen={isActive} className="group/collapsible">
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton tooltip={module.label}>
            <Icon className="size-4" />
            <span>{module.label}</span>
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub>
            {module.entities.map((entity) => (
              <EntityLink
                key={entity.slug}
                entity={entity}
                pathname={pathname}
              />
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}

function EntityLink({
  entity,
  pathname,
}: {
  entity: NavEntity;
  pathname: string;
}) {
  const href = `/app/${entity.slug}`;
  const isActive = pathname.startsWith(href);

  return (
    <SidebarMenuSubItem>
      <SidebarMenuSubButton asChild isActive={isActive}>
        <Link href={href}>
          <span>{entity.label}</span>
        </Link>
      </SidebarMenuSubButton>
    </SidebarMenuSubItem>
  );
}
