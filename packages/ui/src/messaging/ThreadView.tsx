/**
 * ThreadView - Display thread replies for a parent message
 *
 * Features:
 * - Shows parent message with context
 * - Chronological thread replies
 * - Reply composer
 * - Auto-scroll to bottom
 * - Loading states
 */

"use client";

import { ArrowLeft, Loader2, MessageSquare } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "../button";
import { cn } from "../lib/utils";
import { ScrollArea } from "../scroll-area";

import { MessageBubble, type MessageBubbleProps } from "./MessageBubble";
import { MessageComposer } from "./MessageComposer";

export interface ThreadViewProps {
    parentMessage: Omit<MessageBubbleProps, "currentUserId">;
    replies: Omit<MessageBubbleProps, "currentUserId">[];
    currentUserId: string;
    replyCount: number;
    isLoading?: boolean;
    onSendReply?: (body: string) => void;
    onEdit?: (messageId: string, newBody: string) => void;
    onDelete?: (messageId: string) => void;
    onBack?: () => void;
    className?: string;
}

export function ThreadView({
    parentMessage,
    replies,
    currentUserId,
    replyCount,
    isLoading = false,
    onSendReply,
    onEdit,
    onDelete,
    onBack,
    className,
}: ThreadViewProps) {
    const scrollAreaRef = useRef<HTMLDivElement>(null);
    const [shouldAutoScroll, setShouldAutoScroll] = useState(true);

    // Auto-scroll to bottom on new replies
    useEffect(() => {
        if (shouldAutoScroll) {
            scrollToBottom();
        }
    }, [replies.length, shouldAutoScroll]);

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
        setShouldAutoScroll(isAtBottom);
    };

    return (
        <div className={cn("flex flex-col h-full bg-background", className)}>
            {/* Header */}
            <div className="flex items-center gap-3 p-4 border-b">
                {onBack && (
                    <Button variant="ghost" size="icon" onClick={onBack}>
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                )}
                <div className="flex items-center gap-2">
                    <MessageSquare className="h-5 w-5 text-muted-foreground" />
                    <div>
                        <h2 className="font-semibold">Thread</h2>
                        <p className="text-xs text-muted-foreground">
                            {replyCount} {replyCount === 1 ? "reply" : "replies"}
                        </p>
                    </div>
                </div>
            </div>

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
                    ) : (
                        <div className="py-4">
                            {/* Parent message with highlight */}
                            <div className="mb-4 pb-4 border-b">
                                <MessageBubble
                                    {...parentMessage}
                                    currentUserId={currentUserId}
                                    onEdit={onEdit}
                                    onDelete={onDelete}
                                />
                            </div>

                            {/* Thread replies */}
                            {replies.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                                    <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
                                    <h3 className="font-medium mb-1">No replies yet</h3>
                                    <p className="text-sm text-muted-foreground">
                                        Be the first to reply to this message
                                    </p>
                                </div>
                            ) : (
                                <div>
                                    {replies.map((reply) => (
                                        <MessageBubble
                                            key={reply.message.id}
                                            {...reply}
                                            currentUserId={currentUserId}
                                            onEdit={onEdit}
                                            onDelete={onDelete}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </ScrollArea>
            </div>

            {/* Reply composer */}
            {onSendReply && (
                <div className="border-t">
                    <MessageComposer
                        onSend={onSendReply}
                        placeholder="Reply to thread..."
                    />
                </div>
            )}
        </div>
    );
}
