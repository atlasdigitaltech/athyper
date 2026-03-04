"use client";

import { Loader2, MessageSquare, CheckCheck } from "lucide-react";
import { useCallback } from "react";

import { CommentCard, type CommentCardProps } from "./CommentCard";
import { CommentForm } from "./CommentForm";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useComments, useCommentActions, useReadTracking } from "@/lib/collab";

interface CommentListProps {
    entityType: string;
    entityId: string;
}

export function CommentList({ entityType, entityId }: CommentListProps) {
    const { comments, hasMore, isLoading, error, mutate } = useComments(
        entityType,
        entityId,
    );
    const { createComment } = useCommentActions();
    const { unreadCount, markAllAsRead } = useReadTracking(entityType, entityId);

    const handleSubmit = useCallback(
        async (text: string) => {
            await createComment(entityType, entityId, text);
            await mutate();
        },
        [entityType, entityId, createComment, mutate],
    );

    const handleMutate = useCallback(() => {
        mutate();
    }, [mutate]);

    // Recursive render function passed down to avoid circular imports
    const renderCard = useCallback(
        (props: CommentCardProps) => (
            <CommentCard
                key={props.comment.id}
                {...props}
                onMutate={handleMutate}
                renderCard={renderCard}
            />
        ),
        [handleMutate],
    );

    // Top-level comments only (no parent)
    const topLevelComments = comments.filter((c) => !c.parentCommentId);

    if (isLoading && comments.length === 0) {
        return (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="mr-2 size-4 animate-spin" />
                Loading comments...
            </div>
        );
    }

    if (error) {
        return (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                Failed to load comments: {error.message ?? "Unknown error"}
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <MessageSquare className="size-5 text-muted-foreground" />
                    <span className="text-sm font-medium">
                        {comments.length} {comments.length === 1 ? "comment" : "comments"}
                    </span>
                    {unreadCount > 0 && (
                        <Badge variant="default" className="text-[10px]">
                            {unreadCount} new
                        </Badge>
                    )}
                </div>
                {unreadCount > 0 && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={markAllAsRead}
                    >
                        <CheckCheck className="size-4" />
                        Mark all read
                    </Button>
                )}
            </div>

            {/* New comment form */}
            <CommentForm
                entityType={entityType}
                entityId={entityId}
                onSubmit={handleSubmit}
            />

            {/* Comment list */}
            {topLevelComments.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                    No comments yet. Be the first to comment!
                </div>
            ) : (
                <div className="space-y-4">
                    {topLevelComments.map((comment) =>
                        renderCard({
                            comment,
                            depth: 0,
                            entityType,
                            entityId,
                            renderCard,
                        }),
                    )}
                </div>
            )}

            {/* Load more */}
            {hasMore && (
                <div className="text-center">
                    <Button variant="ghost" size="sm">
                        Load more comments
                    </Button>
                </div>
            )}
        </div>
    );
}
