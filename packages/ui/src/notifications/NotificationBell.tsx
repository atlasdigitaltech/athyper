/**
 * NotificationBell Component
 *
 * Bell icon button with unread count badge.
 */

"use client";

import { Bell } from "lucide-react";

import { cn } from "../lib/utils";
import { Badge } from "../primitives/Badge";
import { Button } from "../primitives/Button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../primitives/Tooltip";

export interface NotificationBellProps {
    unreadCount?: number;
    onClick?: () => void;
    className?: string;
    tooltipContent?: string;
}

export function NotificationBell({
    unreadCount = 0,
    onClick,
    className,
    tooltipContent = "Notifications",
}: NotificationBellProps) {
    const hasUnread = unreadCount > 0;

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={onClick}
                    className={cn("relative size-8", className)}
                    aria-label={tooltipContent}
                >
                    <Bell className="size-4" />
                    {hasUnread && (
                        <Badge
                            variant="destructive"
                            className="absolute -top-1 -right-1 size-5 p-0 text-[10px] leading-none flex items-center justify-center"
                        >
                            {unreadCount > 99 ? "99+" : unreadCount}
                        </Badge>
                    )}
                </Button>
            </TooltipTrigger>
            <TooltipContent>{tooltipContent}</TooltipContent>
        </Tooltip>
    );
}
