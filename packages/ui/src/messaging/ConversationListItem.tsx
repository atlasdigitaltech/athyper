/**
 * ConversationListItem - Individual conversation in the list
 *
 * Features:
 * - Conversation title/participants
 * - Last message preview
 * - Unread count badge
 * - Timestamp
 * - Active state
 */

"use client";

import { formatDistanceToNow } from "date-fns";
import { Users, User } from "lucide-react";

import { Badge } from "../badge";
import { cn } from "../lib/utils";

export interface ConversationListItemProps {
    conversation: {
        id: string;
        type: "direct" | "group";
        title: string | null;
        createdAt: string;
        updatedAt: string | null;
    };
    lastMessage?: {
        body: string;
        createdAt: string;
        senderId: string;
    } | null;
    unreadCount?: number;
    isActive?: boolean;
    onClick?: () => void;
    participantNames?: string[];
}

export function ConversationListItem({
    conversation,
    lastMessage,
    unreadCount = 0,
    isActive = false,
    onClick,
    participantNames = [],
}: ConversationListItemProps) {
    const displayTitle =
        conversation.title ||
        (participantNames.length > 0
            ? participantNames.join(", ")
            : "Untitled Conversation");

    const lastMessagePreview = lastMessage
        ? lastMessage.body.length > 50
            ? `${lastMessage.body.slice(0, 50)}...`
            : lastMessage.body
        : "No messages yet";

    const lastMessageTime = lastMessage
        ? formatDistanceToNow(new Date(lastMessage.createdAt), { addSuffix: true })
        : formatDistanceToNow(new Date(conversation.createdAt), { addSuffix: true });

    return (
        <button
            onClick={onClick}
            className={cn(
                "w-full flex items-start gap-3 p-3 rounded-lg transition-colors text-left",
                "hover:bg-muted/50",
                isActive && "bg-muted"
            )}
        >
            {/* Avatar/Icon */}
            <div
                className={cn(
                    "flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center",
                    conversation.type === "group"
                        ? "bg-primary/10 text-primary"
                        : "bg-muted"
                )}
            >
                {conversation.type === "group" ? (
                    <Users className="w-6 h-6" />
                ) : (
                    <div className="w-full h-full rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium">
                        {participantNames[0]?.[0]?.toUpperCase() ?? <User className="w-6 h-6" />}
                    </div>
                )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 mb-1">
                    <h3
                        className={cn(
                            "font-medium text-sm truncate",
                            unreadCount > 0 && "font-semibold"
                        )}
                    >
                        {displayTitle}
                    </h3>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {lastMessageTime}
                    </span>
                </div>

                <div className="flex items-center justify-between gap-2">
                    <p
                        className={cn(
                            "text-xs text-muted-foreground truncate",
                            unreadCount > 0 && "font-medium text-foreground"
                        )}
                    >
                        {lastMessagePreview}
                    </p>
                    {unreadCount > 0 && (
                        <Badge
                            variant="default"
                            className="ml-auto shrink-0 h-5 min-w-[20px] px-1.5 rounded-full"
                        >
                            {unreadCount > 99 ? "99+" : unreadCount}
                        </Badge>
                    )}
                </div>
            </div>
        </button>
    );
}
