"use client";

import { SmilePlus } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useReactions } from "@/lib/collab";
import { cn } from "@/lib/utils";

const REACTION_EMOJIS = ["👍", "❤️", "🎉", "👀", "👎", "🚀", "💡", "🤔"] as const;

interface CommentReactionsProps {
    commentId: string;
}

export function CommentReactions({ commentId }: CommentReactionsProps) {
    const { reactions, toggleReaction } = useReactions(commentId);
    const [showPicker, setShowPicker] = useState(false);

    return (
        <div className="flex flex-wrap items-center gap-1">
            {/* Existing reactions */}
            {reactions
                .filter((r) => r.count > 0)
                .map((r) => (
                    <button
                        key={r.reactionType}
                        type="button"
                        onClick={() => toggleReaction(r.reactionType)}
                        className={cn(
                            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors hover:bg-accent",
                            r.reacted && "border-primary/40 bg-primary/5",
                        )}
                    >
                        <span>{r.reactionType}</span>
                        <span className="tabular-nums">{r.count}</span>
                    </button>
                ))}

            {/* Add reaction button */}
            <div className="relative">
                <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => setShowPicker((v) => !v)}
                    className="text-muted-foreground"
                >
                    <SmilePlus className="size-3.5" />
                </Button>

                {showPicker && (
                    <div className="absolute bottom-full left-0 z-50 mb-1 flex gap-0.5 rounded-lg border bg-popover p-1 shadow-md">
                        {REACTION_EMOJIS.map((emoji) => (
                            <button
                                key={emoji}
                                type="button"
                                className="rounded p-1 text-base hover:bg-accent"
                                onClick={() => {
                                    toggleReaction(emoji);
                                    setShowPicker(false);
                                }}
                            >
                                {emoji}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
