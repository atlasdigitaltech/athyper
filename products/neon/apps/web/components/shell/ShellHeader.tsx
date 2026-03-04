"use client";

// components/shell/ShellHeader.tsx
//
// Responsive header bar for the workbench shell.
// Uses CSS container queries (@container on shell-container) so it adapts
// both to real viewport changes AND the dev viewport switcher tool.
//
// Breakpoints (Tailwind v4 container query variants):
//   < @sm  (384px)  — Brand + Bell + User only
//   @sm              — + Workbench (icon) + Search (icon only)
//   @3xl  (768px)   — + Workbench text + Test Mode + all icons + separators
//   @5xl  (1024px)  — + Tier text + Upgrade button (full desktop)

import { NotificationBell, NotificationInboxPanel } from "@athyper/ui";
import { CircleHelp, Command, Menu, Megaphone } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import type { SessionBootstrap } from "@/lib/session-bootstrap";

import { useGlobalDrawer } from "@/components/shell/GlobalDrawer";
import { UserMenu } from "@/components/shell/UserMenu";
import { WorkbenchSwitcher } from "@/components/shell/WorkbenchSwitcher";
import { SearchDialog } from "@/components/sidebar/search-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useMessages } from "@/lib/i18n/messages-context";
import { useNotifications } from "@/lib/notifications/useNotifications";
import { useNotificationStream } from "@/lib/notifications/useNotificationStream";
import { useUnreadCount } from "@/lib/notifications/useUnreadCount";
import { cn } from "@/lib/utils";

interface ShellHeaderProps {
  workbench: string;
}

export function ShellHeader({ workbench }: ShellHeaderProps) {
  const { setOpen: openDrawer } = useGlobalDrawer();
  const { t } = useMessages();
  const [inboxOpen, setInboxOpen] = useState(false);
  const [bootstrap, setBootstrap] = useState<SessionBootstrap | undefined>(
    undefined,
  );

  useEffect(() => {
    const bs = (window as unknown as Record<string, unknown>)
      .__SESSION_BOOTSTRAP__ as SessionBootstrap | undefined;
    if (bs) setBootstrap(bs);
  }, []);

  const environment = bootstrap?.environment ?? null;
  const subscriptionTier = bootstrap?.subscriptionTier ?? "Standard";

  const { count: unreadCount, refresh: refreshCount } = useUnreadCount();
  const {
    notifications,
    isLoading,
    markRead,
    markAllRead,
    dismiss,
    refresh: refreshNotifications,
  } = useNotifications({ limit: 50 });

  useNotificationStream({
    onNotificationNew: () => {
      refreshCount();
      refreshNotifications();
    },
    onNotificationRead: () => {
      refreshCount();
    },
    onNotificationDismissed: () => {
      refreshCount();
    },
    enabled: !!bootstrap,
  });

  return (
    <header
      className={cn(
        "flex h-12 shrink-0 items-center gap-1 border-b",
        "[html[data-navbar-style=sticky]_&]:sticky [html[data-navbar-style=sticky]_&]:top-0 [html[data-navbar-style=sticky]_&]:z-50 [html[data-navbar-style=sticky]_&]:bg-background/50 [html[data-navbar-style=sticky]_&]:backdrop-blur-md",
      )}
    >
      <div className="flex w-full items-center px-2 @3xl:px-4 @5xl:px-6">
        {/* ── Left: Brand + Drawer + Workbench + Test Mode ── */}
        <div className="flex items-center gap-1 @3xl:gap-2 min-w-0">
          <button
            type="button"
            onClick={() => openDrawer(true)}
            className="flex items-center gap-1.5 rounded-md px-1.5 py-1 transition-colors hover:bg-accent shrink-0"
            aria-label="Open navigation"
          >
            <Command className="size-4 text-primary" />
            <span className="text-sm font-semibold tracking-tight hidden @xs:inline">
              Neon
            </span>
            <Menu className="size-3.5 text-muted-foreground" />
          </button>

          {/* Workbench switcher: hidden on tiny, icon-only on small, full on tablet+ */}
          <div className="hidden @sm:block">
            <WorkbenchSwitcher />
          </div>

          {/* Test Mode badge: only on tablet+ */}
          {environment !== null && environment !== "production" && (
            <Badge
              variant="secondary"
              className="hidden @3xl:inline-flex bg-info/15 text-info border-info/30"
            >
              {t("common.header.test_mode")}
            </Badge>
          )}
        </div>

        {/* ── Spacer ── */}
        <div className="flex-1 min-w-2" />

        {/* ── Right: Search + Tier + Icons + User ── */}
        <div className="flex items-center gap-0.5 @3xl:gap-1">
          {/* Full search button: tablet+ */}
          <div className="hidden @3xl:block">
            <SearchDialog />
          </div>
          {/* Compact search icon: small screens only */}
          <div className="block @3xl:hidden">
            <SearchDialog compact />
          </div>

          {/* Tier text: desktop only */}
          <span className="hidden @5xl:inline text-sm text-muted-foreground px-2">
            {subscriptionTier}
          </span>
          {/* Upgrade button: desktop only */}
          <Button
            variant="outline"
            size="sm"
            className="hidden @5xl:inline-flex h-7 text-xs"
            asChild
          >
            <Link href={`/wb/${workbench}/settings/subscription`}>
              {t("common.header.upgrade")}
            </Link>
          </Button>

          {/* Separator: tablet+ */}
          <Separator
            orientation="vertical"
            className="hidden @3xl:block mx-1 data-[orientation=vertical]:h-4"
          />

          {/* Announcements: tablet+ */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="hidden @3xl:inline-flex size-8"
              >
                <Megaphone className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("common.header.announcements")}</TooltipContent>
          </Tooltip>

          {/* Notification bell: always visible */}
          <NotificationBell
            unreadCount={unreadCount}
            onClick={() => setInboxOpen(true)}
            tooltipContent={t("common.header.notifications")}
          />
          <NotificationInboxPanel
            open={inboxOpen}
            onOpenChange={setInboxOpen}
            notifications={notifications}
            isLoading={isLoading}
            unreadCount={unreadCount}
            onMarkRead={markRead}
            onMarkAllRead={markAllRead}
            onDismiss={dismiss}
            onNotificationClick={(notification) => {
              if (!notification.isRead) markRead(notification.id);
              setInboxOpen(false);
            }}
          />

          {/* Help: tablet+ */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="hidden @3xl:inline-flex size-8"
              >
                <CircleHelp className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("common.header.help")}</TooltipContent>
          </Tooltip>

          {/* Separator: tablet+ */}
          <Separator
            orientation="vertical"
            className="hidden @3xl:block mx-1 data-[orientation=vertical]:h-4"
          />

          <UserMenu workbench={workbench} />
        </div>
      </div>
    </header>
  );
}
