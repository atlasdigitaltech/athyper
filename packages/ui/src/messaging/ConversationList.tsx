/**
 * ConversationList - List of conversations
 *
 * Features:
 * - Scrollable list
 * - Loading states
 * - Empty state
 * - Search filter (optional)
 * - New conversation button
 */

"use client";

import { MessageSquarePlus, Loader2, Search } from "lucide-react";
import { useState } from "react";

import { Button } from "../button";
import { Input } from "../input";
import { cn } from "../lib/utils";
import { ScrollArea } from "../scroll-area";

import {
  ConversationListItem,
  type ConversationListItemProps,
} from "./ConversationListItem";

export interface ConversationListProps {
  conversations: ConversationListItemProps[];
  activeConversationId?: string | null;
  onConversationSelect?: (conversationId: string) => void;
  onNewConversation?: () => void;
  isLoading?: boolean;
  className?: string;
}

export function ConversationList({
  conversations,
  activeConversationId,
  onConversationSelect,
  onNewConversation,
  isLoading = false,
  className,
}: ConversationListProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredConversations = searchQuery
    ? conversations.filter((conv) => {
        const title =
          conv.conversation.title || conv.participantNames?.join(", ") || "";
        return title.toLowerCase().includes(searchQuery.toLowerCase());
      })
    : conversations;

  return (
    <div className={cn("flex flex-col h-full bg-background", className)}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <h2 className="text-lg font-semibold">Messages</h2>
        {onNewConversation && (
          <Button
            size="icon"
            variant="ghost"
            onClick={onNewConversation}
            className="h-8 w-8"
          >
            <MessageSquarePlus className="h-5 w-5" />
          </Button>
        )}
      </div>

      {/* Search */}
      <div className="p-4 border-b">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Conversation list */}
      <ScrollArea className="flex-1">
        <div className="p-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <MessageSquarePlus className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="font-medium mb-1">
                {searchQuery ? "No results" : "No conversations yet"}
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                {searchQuery
                  ? "Try a different search term"
                  : "Start a new conversation to get started"}
              </p>
              {!searchQuery && onNewConversation && (
                <Button onClick={onNewConversation}>
                  <MessageSquarePlus className="mr-2 h-4 w-4" />
                  New Conversation
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-1">
              {filteredConversations.map((conv) => (
                <ConversationListItem
                  key={conv.conversation.id}
                  {...conv}
                  isActive={conv.conversation.id === activeConversationId}
                  onClick={() => onConversationSelect?.(conv.conversation.id)}
                />
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
