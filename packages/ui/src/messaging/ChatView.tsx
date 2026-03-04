/**
 * ChatView - Main message display area
 *
 * Features:
 * - Auto-scroll to bottom on new messages
 * - Scroll to bottom button (when scrolled up)
 * - Message grouping by date
 * - Loading states
 * - Empty state
 */

"use client";

import { formatDate, isToday, isYesterday } from "date-fns";
import { ArrowDown, Loader2, MessageSquare } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "../button";
import { cn } from "../lib/utils";
import { ScrollArea } from "../scroll-area";

import { MessageBubble, type MessageBubbleProps } from "./MessageBubble";

export interface ChatViewProps {
    messages: Omit<MessageBubbleProps, "currentUserId">[];
    currentUserId: string;
    isLoading?: boolean;
    conversationTitle?: string;
    participantCount?: number;
    onEdit?: (messageId: string, newBody: string) => void;
    onDelete?: (messageId: string) => void;
    onReply?: (messageId: string) => void;
    onViewThread?: (messageId: string) => void;
    className?: string;
}

function getDateGroupLabel(date: Date): string {
    if (isToday(date)) return "Today";
    if (isYesterday(date)) return "Yesterday";
    return formatDate(date, "MMMM d, yyyy");
}

export function ChatView({
    messages,
    currentUserId,
    isLoading = false,
    conversationTitle,
    participantCount = 0,
    onEdit,
    onDelete,
    onReply,
    onViewThread,
    className,
}: ChatViewProps) {
    const scrollAreaRef = useRef<HTMLDivElement>(null);
    const [showScrollButton, setShowScrollButton] = useState(false);
    const [shouldAutoScroll, setShouldAutoScroll] = useState(true);

    // Auto-scroll to bottom on new messages
    useEffect(() => {
        if (shouldAutoScroll) {
            scrollToBottom();
        }
    }, [messages.length, shouldAutoScroll]);

    const scrollToBottom = (smooth = true) => {
        const scrollArea = scrollAreaRef.current?.querySelector(
            "[data-radix-scroll-area-viewport]"
        );
        if (scrollArea) {
            scrollArea.scrollTo({
                top: scrollArea.scrollHeight,
                behavior: smooth ? "smooth" : "auto",
            });
        }
    };

    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const target = e.target as HTMLDivElement;
        const isAtBottom =
            Math.abs(target.scrollHeight - target.scrollTop - target.clientHeight) < 50;

        setShowScrollButton(!isAtBottom);
        setShouldAutoScroll(isAtBottom);
    };

    // Group messages by date
    const groupedMessages: Array<{
        date: string;
        label: string;
        messages: typeof messages;
    }> = [];

    messages.forEach((msg) => {
        const msgDate = new Date(msg.message.createdAt);
        const dateKey = formatDate(msgDate, "yyyy-MM-dd");

        let group = groupedMessages.find((g) => g.date === dateKey);
        if (!group) {
            group = {
                date: dateKey,
                label: getDateGroupLabel(msgDate),
                messages: [],
            };
            groupedMessages.push(group);
        }

        group.messages.push(msg);
    });

    return (
        <div className={cn("flex flex-col h-full bg-background", className)}>
            {/* Header */}
            {conversationTitle && (
                <div className="flex items-center justify-between p-4 border-b">
                    <div>
                        <h2 className="font-semibold">{conversationTitle}</h2>
                        {participantCount > 0 && (
                            <p className="text-xs text-muted-foreground">
                                {participantCount} {participantCount === 1 ? "participant" : "participants"}
                            </p>
                        )}
                    </div>
                </div>
            )}

            {/* Messages */}
            <div className="flex-1 relative">
                <ScrollArea
                    ref={scrollAreaRef}
                    className="h-full"
                    onScrollCapture={handleScroll}
                >
                    {isLoading ? (
                        <div className="flex items-center justify-center h-full">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : messages.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full px-4 text-center">
                            <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
                            <h3 className="font-medium mb-1">No messages yet</h3>
                            <p className="text-sm text-muted-foreground">
                                Send a message to start the conversation
                            </p>
                        </div>
                    ) : (
                        <div className="py-4">
                            {groupedMessages.map((group) => (
                                <div key={group.date}>
                                    {/* Date separator */}
                                    <div className="flex items-center justify-center py-2 sticky top-0 bg-background/80 backdrop-blur-sm z-10">
                                        <span className="text-xs font-medium text-muted-foreground bg-muted px-3 py-1 rounded-full">
                                            {group.label}
                                        </span>
                                    </div>

                                    {/* Messages for this date */}
                                    {group.messages.map((msg) => (
                                        <MessageBubble
                                            key={msg.message.id}
                                            {...msg}
                                            currentUserId={currentUserId}
                                            onEdit={onEdit}
                                            onDelete={onDelete}
                                            onReply={onReply}
                                            onViewThread={onViewThread}
                                            participantCount={participantCount}
                                        />
                                    ))}
                                </div>
                            ))}
                        </div>
                    )}
                </ScrollArea>

                {/* Scroll to bottom button */}
                {showScrollButton && (
                    <div className="absolute bottom-4 right-4">
                        <Button
                            size="icon"
                            variant="secondary"
                            className="rounded-full shadow-lg h-10 w-10"
                            onClick={() => {
                                scrollToBottom();
                                setShouldAutoScroll(true);
                            }}
                        >
                            <ArrowDown className="h-5 w-5" />
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}
