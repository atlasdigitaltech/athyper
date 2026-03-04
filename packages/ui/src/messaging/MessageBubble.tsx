/**
 * MessageBubble - Individual message display
 *
 * Features:
 * - Sender/receiver styling
 * - Timestamps with relative time
 * - Edit/Delete actions (sender only)
 * - Read receipts
 * - Markdown support
 */

"use client";

import { formatDistanceToNow } from "date-fns";
import {
  MoreVertical,
  Pencil,
  Trash2,
  Check,
  CheckCheck,
  MessageSquare,
} from "lucide-react";
import { useState } from "react";

import { Button } from "../button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../dropdown-menu";
import { cn } from "../lib/utils";

export interface MessageBubbleProps {
  message: {
    id: string;
    senderId: string;
    body: string;
    bodyFormat: "plain" | "markdown";
    parentMessageId: string | null;
    createdAt: string;
    editedAt: string | null;
    deletedAt: string | null;
  };
  currentUserId: string;
  senderName?: string;
  onEdit?: (messageId: string, newBody: string) => void;
  onDelete?: (messageId: string) => void;
  onReply?: (messageId: string) => void;
  onViewThread?: (messageId: string) => void;
  isRead?: boolean;
  readCount?: number;
  participantCount?: number;
  threadReplyCount?: number;
  showAvatar?: boolean;
}

export function MessageBubble({
  message,
  currentUserId,
  senderName,
  onEdit,
  onDelete,
  onReply,
  onViewThread,
  isRead = false,
  readCount = 0,
  participantCount = 0,
  threadReplyCount = 0,
  showAvatar = true,
}: MessageBubbleProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editBody, setEditBody] = useState(message.body);

  const isOwnMessage = message.senderId === currentUserId;
  const isDeleted = !!message.deletedAt;
  const isEdited = !!message.editedAt;

  const timeAgo = formatDistanceToNow(new Date(message.createdAt), {
    addSuffix: true,
  });

  const handleSaveEdit = () => {
    if (editBody.trim() && editBody !== message.body) {
      onEdit?.(message.id, editBody);
    }
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditBody(message.body);
    setIsEditing(false);
  };

  return (
    <div
      className={cn(
        "flex gap-2 px-4 py-2 hover:bg-muted/30 transition-colors group",
        isOwnMessage && "flex-row-reverse",
      )}
    >
      {/* Avatar */}
      {showAvatar && (
        <div
          className={cn(
            "flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium",
            isOwnMessage && "bg-primary text-primary-foreground",
          )}
        >
          {senderName?.[0]?.toUpperCase() ?? "?"}
        </div>
      )}

      <div
        className={cn(
          "flex flex-col gap-1 max-w-[70%]",
          isOwnMessage && "items-end",
        )}
      >
        {/* Sender name (if not own message) */}
        {!isOwnMessage && senderName && (
          <div className="text-xs font-medium text-muted-foreground px-3">
            {senderName}
          </div>
        )}

        {/* Message bubble */}
        <div
          className={cn(
            "rounded-2xl px-4 py-2 shadow-sm",
            isOwnMessage
              ? "bg-primary text-primary-foreground rounded-br-sm"
              : "bg-muted rounded-bl-sm",
            isDeleted && "opacity-50 italic",
          )}
        >
          {isEditing ? (
            <div className="flex flex-col gap-2">
              <textarea
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
                className="w-full min-h-[60px] bg-background/50 text-foreground rounded-lg px-3 py-2 border border-border focus:outline-none focus:ring-2 focus:ring-ring"
                autoFocus
                aria-label="Edit message"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSaveEdit();
                  }
                  if (e.key === "Escape") {
                    handleCancelEdit();
                  }
                }}
              />
              <div className="flex gap-2 justify-end">
                <Button size="sm" variant="ghost" onClick={handleCancelEdit}>
                  Cancel
                </Button>
                <Button size="sm" onClick={handleSaveEdit}>
                  Save
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-sm whitespace-pre-wrap break-words">
              {isDeleted ? "[Message deleted]" : message.body}
            </div>
          )}
        </div>

        {/* Metadata: time, edited, read receipts */}
        <div
          className={cn(
            "flex items-center gap-2 px-3 text-xs text-muted-foreground",
            isOwnMessage && "flex-row-reverse",
          )}
        >
          <span>{timeAgo}</span>
          {isEdited && !isDeleted && <span>(edited)</span>}
          {isOwnMessage && !isDeleted && (
            <div className="flex items-center gap-1">
              {readCount > 0 ? (
                <>
                  <CheckCheck className="w-3 h-3 text-primary" />
                  {participantCount > 2 && (
                    <span className="text-xs">{readCount}</span>
                  )}
                </>
              ) : (
                <Check className="w-3 h-3" />
              )}
            </div>
          )}
        </div>

        {/* Thread actions (if not a thread reply) */}
        {!message.parentMessageId && !isDeleted && (
          <div
            className={cn(
              "flex items-center gap-2 px-3",
              isOwnMessage && "flex-row-reverse",
            )}
          >
            {/* View thread button (if has replies) */}
            {threadReplyCount > 0 && onViewThread && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground hover:text-primary"
                onClick={() => onViewThread(message.id)}
              >
                <MessageSquare className="w-3 h-3 mr-1" />
                {threadReplyCount}{" "}
                {threadReplyCount === 1 ? "reply" : "replies"}
              </Button>
            )}

            {/* Reply button */}
            {onReply && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => onReply(message.id)}
              >
                Reply
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Actions menu (own messages only) */}
      {isOwnMessage && !isDeleted && !isEditing && (
        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onEdit && (
                <DropdownMenuItem onClick={() => setIsEditing(true)}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
              )}
              {onDelete && (
                <DropdownMenuItem
                  onClick={() => onDelete(message.id)}
                  className="text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
}
