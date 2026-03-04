/**
 * NotificationList Component
 *
 * Scrollable list of notifications with loading and empty states.
 */

"use client";

import { Loader2, Inbox } from "lucide-react";

import { cn } from "../lib/utils";

import { NotificationCard } from "./NotificationCard";

import type { Notification } from "@athyper/api-client";

export interface NotificationListProps {
    notifications: Notification[];
    isLoading?: boolean;
    onMarkRead?: (id: string) => void;
    onDismiss?: (id: string) => void;
    onNotificationClick?: (notification: Notification) => void;
    emptyMessage?: string;
    className?: string;
}

export function NotificationList({
    notifications,
    isLoading = false,
    onMarkRead,
    onDismiss,
    onNotificationClick,
    emptyMessage = "No notifications",
    className,
}: NotificationListProps) {
    if (isLoading) {
        return (
            <div
                data-slot="notification-list-loading"
                className={cn("flex items-center justify-center py-12", className)}
            >
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (notifications.length === 0) {
        return (
            <div
                data-slot="notification-list-empty"
                className={cn(
                    "flex flex-col items-center justify-center py-12 text-center",
                    className
                )}
            >
                <Inbox className="size-12 text-muted-foreground/50 mb-3" />
                <p className="text-sm text-muted-foreground">{emptyMessage}</p>
            </div>
        );
    }

    return (
        <div data-slot="notification-list" className={cn("divide-y divide-border", className)}>
            {notifications.map((notification) => (
                <NotificationCard
                    key={notification.id}
                    notification={notification}
                    onMarkRead={onMarkRead}
                    onDismiss={onDismiss}
                    onClick={onNotificationClick}
                />
            ))}
        </div>
    );
}
