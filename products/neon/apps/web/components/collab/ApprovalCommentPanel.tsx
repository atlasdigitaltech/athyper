"use client";

import { Loader2, MessageSquare, Send } from "lucide-react";
import { useCallback, useState } from "react";

import { MentionInput } from "./MentionInput";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useApprovalComments, type ApprovalComment } from "@/lib/collab";


// ─── Single approval comment card ────────────────────────────

function ApprovalCommentCard({ comment }: { comment: ApprovalComment }) {
    const initials = comment.commenterName
        ? comment.commenterName
            .split(" ")
            .map((w) => w[0])
            .join("")
            .toUpperCase()
            .slice(0, 2)
        : "?";

    const dateStr = new Date(comment.createdAt).toLocaleString();

    return (
        <div className="flex gap-3">
            <Avatar className="size-8 shrink-0">
                <AvatarFallback className="text-xs">{initials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">
                        {comment.commenterName ?? "Unknown"}
                    </span>
                    <span className="text-xs text-muted-foreground">{dateStr}</span>
                </div>
                <p className="mt-0.5 whitespace-pre-wrap text-sm">
                    {comment.commentText}
                </p>
            </div>
        </div>
    );
}

// ─── Main panel ──────────────────────────────────────────────

interface ApprovalCommentPanelProps {
    instanceId: string;
    taskId?: string;
}

export function ApprovalCommentPanel({
    instanceId,
    taskId,
}: ApprovalCommentPanelProps) {
    const { comments, isLoading, error, addComment } =
        useApprovalComments(instanceId);
    const [text, setText] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = useCallback(
        async (e: React.FormEvent) => {
            e.preventDefault();
            const trimmed = text.trim();
            if (!trimmed) return;

            setIsSubmitting(true);
            try {
                await addComment(trimmed, taskId);
                setText("");
            } finally {
                setIsSubmitting(false);
            }
        },
        [text, taskId, addComment],
    );

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="mr-2 size-4 animate-spin" />
                Loading comments...
            </div>
        );
    }

    if (error) {
        return (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                Failed to load approval comments.
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center gap-2">
                <MessageSquare className="size-4 text-muted-foreground" />
                <span className="text-sm font-medium">
                    {comments.length}{" "}
                    {comments.length === 1 ? "comment" : "comments"}
                </span>
            </div>

            {/* Comment list */}
            {comments.length === 0 ? (
                <div className="py-6 text-center text-sm text-muted-foreground">
                    No comments on this approval yet.
                </div>
            ) : (
                <div className="space-y-4">
                    {comments.map((comment) => (
                        <ApprovalCommentCard key={comment.id} comment={comment} />
                    ))}
                </div>
            )}

            {/* Add comment form */}
            <form onSubmit={handleSubmit} className="space-y-2">
                <MentionInput
                    value={text}
                    onChange={setText}
                    placeholder="Add a comment to this approval..."
                    rows={2}
                    disabled={isSubmitting}
                />
                <div className="flex justify-end">
                    <Button
                        type="submit"
                        size="sm"
                        disabled={isSubmitting || !text.trim()}
                    >
                        {isSubmitting ? (
                            <Loader2 className="size-4 animate-spin" />
                        ) : (
                            <Send className="size-4" />
                        )}
                        Comment
                    </Button>
                </div>
            </form>
        </div>
    );
}
