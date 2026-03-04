/**
 * NotificationCard Component
 *
 * Displays a single notification item with read/dismiss actions.
 */

"use client";

import { formatDistanceToNow } from "date-fns";
import { Check, X, ExternalLink } from "lucide-react";
import { useState } from "react";

import { cn } from "../lib/utils";

import type { Notification } from "@athyper/api-client";

export interface NotificationCardProps {
    notification: Notification;
    onMarkRead?: (id: string) => void;
    onDismiss?: (id: string) => void;
    onClick?: (notification: Notification) => void;
}

export function NotificationCard({
    notification,
    onMarkRead,
    onDismiss,
    onClick,
}: NotificationCardProps) {
    const [isActing, setIsActing] = useState(false);

    const handleMarkRead = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (notification.isRead || !onMarkRead) return;

        setIsActing(true);
        try {
            await onMarkRead(notification.id);
        } catch (err) {
            console.error("Failed to mark as read:", err);
        } finally {
            setIsActing(false);
        }
    };

    const handleDismiss = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!onDismiss) return;

        setIsActing(true);
        try {
            await onDismiss(notification.id);
        } catch (err) {
            console.error("Failed to dismiss:", err);
        } finally {
            setIsActing(false);
        }
    };

    const handleClick = () => {
        if (onClick) {
            onClick(notification);
        } else if (notification.actionUrl) {
            window.location.href = notification.actionUrl;
        }
    };

    const timeAgo = notification.createdAt
        ? formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })
        : "";

    return (
        <div
            data-slot="notification-card"
            className={cn(
                "group relative border-b border-border p-4 transition-colors hover:bg-accent/50",
                !notification.isRead && "bg-accent/20",
                notification.actionUrl && "cursor-pointer",
                isActing && "opacity-50 pointer-events-none"
            )}
            onClick={handleClick}
        >
            {/* Unread indicator */}
            {!notification.isRead && (
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />
            )}

            <div className="flex gap-3 pl-3">
                {/* Icon */}
                {notification.icon && (
                    <div className="flex-shrink-0 text-2xl">{notification.icon}</div>
                )}

                {/* Content */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                            <h4 className="text-sm font-medium text-foreground line-clamp-2">
                                {notification.title}
                            </h4>
                            {notification.body && (
                                <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                                    {notification.body}
                                </p>
                            )}
                        </div>

                        {/* Action URL indicator */}
                        {notification.actionUrl && (
                            <ExternalLink className="size-3 text-muted-foreground flex-shrink-0 mt-1" />
                        )}
                    </div>

                    {/* Meta */}
                    <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                        <span>{timeAgo}</span>
                        {notification.category && (
                            <>
                                <span>•</span>
                                <span className="capitalize">{notification.category}</span>
                            </>
                        )}
                    </div>
                </div>

                {/* Actions */}
                <div className="flex items-start gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {!notification.isRead && onMarkRead && (
                        <button
                            type="button"
                            onClick={handleMarkRead}
                            className="p-1.5 rounded-xs hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                            title="Mark as read"
                        >
                            <Check className="size-4" />
                        </button>
                    )}
                    {onDismiss && (
                        <button
                            type="button"
                            onClick={handleDismiss}
                            className="p-1.5 rounded-xs hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                            title="Dismiss"
                        >
                            <X className="size-4" />
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
