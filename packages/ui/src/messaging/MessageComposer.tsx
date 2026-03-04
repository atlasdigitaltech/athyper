/**
 * MessageComposer - Message input area
 *
 * Features:
 * - Auto-resizing textarea
 * - Send button (Enter to send, Shift+Enter for new line)
 * - Character counter
 * - Send on Ctrl/Cmd+Enter
 * - Disabled state while sending
 */

"use client";

import { Send, Loader2 } from "lucide-react";
import { useState, useRef, useEffect } from "react";

import { Button } from "../button";
import { cn } from "../lib/utils";

export interface MessageComposerProps {
    onSend: (message: string) => Promise<void> | void;
    placeholder?: string;
    disabled?: boolean;
    maxLength?: number;
    className?: string;
}

export function MessageComposer({
    onSend,
    placeholder = "Type a message...",
    disabled = false,
    maxLength = 10000,
    className,
}: MessageComposerProps) {
    const [message, setMessage] = useState("");
    const [isSending, setIsSending] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Auto-resize textarea
    useEffect(() => {
        const textarea = textareaRef.current;
        if (!textarea) return;

        textarea.style.height = "auto";
        textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }, [message]);

    const handleSend = async () => {
        const trimmed = message.trim();
        if (!trimmed || isSending) return;

        setIsSending(true);
        try {
            await onSend(trimmed);
            setMessage("");

            // Reset textarea height
            if (textareaRef.current) {
                textareaRef.current.style.height = "auto";
            }
        } catch (err) {
            console.error("Failed to send message:", err);
        } finally {
            setIsSending(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const isOverLimit = message.length > maxLength;
    const canSend = message.trim().length > 0 && !isSending && !isOverLimit;

    return (
        <div
            className={cn(
                "border-t bg-background p-4 flex items-end gap-2",
                className
            )}
        >
            <div className="flex-1 relative">
                <textarea
                    ref={textareaRef}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={placeholder}
                    disabled={disabled || isSending}
                    className={cn(
                        "w-full resize-none rounded-lg border border-input bg-background px-4 py-3 text-sm",
                        "placeholder:text-muted-foreground",
                        "focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent",
                        "disabled:cursor-not-allowed disabled:opacity-50",
                        "min-h-[44px] max-h-[200px]",
                        isOverLimit && "border-destructive focus:ring-destructive"
                    )}
                    rows={1}
                />

                {/* Character counter */}
                {message.length > maxLength * 0.8 && (
                    <div
                        className={cn(
                            "absolute bottom-2 right-2 text-xs",
                            isOverLimit ? "text-destructive" : "text-muted-foreground"
                        )}
                    >
                        {message.length} / {maxLength}
                    </div>
                )}
            </div>

            <Button
                onClick={handleSend}
                disabled={!canSend || disabled}
                size="icon"
                className="h-11 w-11 rounded-lg shrink-0"
            >
                {isSending ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                    <Send className="h-5 w-5" />
                )}
            </Button>
        </div>
    );
}
