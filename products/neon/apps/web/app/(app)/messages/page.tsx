/**
 * Messages Page - Direct & Group Messaging
 *
 * Features:
 * - Conversation list sidebar
 * - Real-time message updates via SSE
 * - Send, edit, delete messages
 * - Read receipts
 * - Optimistic UI updates
 */

"use client";

import { Button } from "@athyper/ui/button";
import {
  ConversationList,
  ChatView,
  MessageComposer,
  ThreadView,
  MessageSearchBar,
  MessageSearchResults,
  type ConversationListItemProps,
} from "@athyper/ui/messaging";
import { Search, X } from "lucide-react";
import { useState } from "react";

import { useMessages as useI18nMessages } from "@/lib/i18n/messages-context";
import { useConversations } from "@/lib/messaging/useConversations";
import { useMessages } from "@/lib/messaging/useMessages";
import { useMessageSearch } from "@/lib/messaging/useMessageSearch";
import { useMessagingStream } from "@/lib/messaging/useMessagingStream";
import { useThreadReplies } from "@/lib/messaging/useThreadReplies";

export default function MessagesPage() {
  const { t } = useI18nMessages();
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(null);
  const [activeThreadMessageId, setActiveThreadMessageId] = useState<
    string | null
  >(null);
  const [isSearchMode, setIsSearchMode] = useState(false);

  // Fetch conversations
  const {
    conversations,
    isLoading: isLoadingConversations,
    refresh: refreshConversations,
  } = useConversations();

  // Fetch messages for active conversation
  const {
    messages,
    isLoading: isLoadingMessages,
    sendMessage,
    editMessage,
    deleteMessage,
    refresh: refreshMessages,
  } = useMessages(activeConversationId);

  // Fetch thread replies if viewing a thread
  const {
    replies: threadReplies,
    replyCount: threadReplyCount,
    isLoading: isLoadingThread,
    sendReply: sendThreadReply,
    editReply: editThreadReply,
    deleteReply: deleteThreadReply,
    refresh: refreshThread,
  } = useThreadReplies(activeThreadMessageId);

  // Search functionality
  const {
    searchQuery,
    debouncedQuery,
    results: searchResults,
    count: searchCount,
    isSearching,
    search,
    clear: clearSearch,
  } = useMessageSearch({
    conversationId: activeConversationId ?? undefined,
  });

  // Subscribe to real-time events
  useMessagingStream({
    onMessageSent: (event) => {
      // Refresh messages if it's for the active conversation
      if (event.conversationId === activeConversationId) {
        refreshMessages();
        // Also refresh thread if we're viewing one
        if (activeThreadMessageId) {
          refreshThread();
        }
      }
      // Always refresh conversation list to update last message preview
      refreshConversations();
    },
    onMessageEdited: (event) => {
      if (event.conversationId === activeConversationId) {
        refreshMessages();
        if (activeThreadMessageId) {
          refreshThread();
        }
      }
    },
    onMessageDeleted: (event) => {
      if (event.conversationId === activeConversationId) {
        refreshMessages();
        if (activeThreadMessageId) {
          refreshThread();
        }
      }
    },
    onMessageRead: (event) => {
      if (event.conversationId === activeConversationId) {
        refreshMessages();
      }
    },
    onConversationCreated: () => {
      refreshConversations();
    },
  });

  // Transform conversations for ConversationList
  const conversationListItems: ConversationListItemProps[] = conversations.map(
    (conv) => ({
      conversation: conv,
      // TODO: Fetch last message and unread count from API
      lastMessage: null,
      unreadCount: 0,
      participantNames: [], // TODO: Fetch participant names
    }),
  );

  // Calculate thread reply counts for each message
  const threadReplyCounts = new Map<string, number>();
  // TODO: Fetch actual thread counts from API or cache
  // For now, this would need to be fetched separately or included in the message response

  // Transform messages for ChatView
  const messageProps = messages.map((msg) => ({
    message: msg,
    senderName: undefined, // TODO: Fetch sender name
    // TODO: Fetch read status and count
    isRead: false,
    readCount: 0,
    threadReplyCount: threadReplyCounts.get(msg.id) ?? 0,
  }));

  // Find parent message for thread view
  const parentMessage = activeThreadMessageId
    ? messages.find((m) => m.id === activeThreadMessageId)
    : null;

  // Transform thread replies for ThreadView
  const threadReplyProps = threadReplies.map((msg) => ({
    message: msg,
    senderName: undefined, // TODO: Fetch sender name
    isRead: false,
    readCount: 0,
  }));

  // Get active conversation details
  const activeConversation = conversations.find(
    (c) => c.id === activeConversationId,
  );

  // Handle search result click - navigate to conversation and close search
  const handleSearchResultClick = (result: any) => {
    setActiveConversationId(result.message.conversationId);
    setIsSearchMode(false);
    clearSearch();
    // TODO: Scroll to the specific message
  };

  return (
    <div className="flex h-[calc(100vh-3rem)]">
      {/* Conversation List Sidebar */}
      <div className="w-80 border-r">
        <ConversationList
          conversations={conversationListItems}
          activeConversationId={activeConversationId}
          onConversationSelect={(id) => {
            setActiveConversationId(id);
            setIsSearchMode(false);
            setActiveThreadMessageId(null);
          }}
          onNewConversation={() => {
            // TODO: Open new conversation dialog
            console.log("New conversation");
          }}
          isLoading={isLoadingConversations}
        />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col">
        {/* Search Bar (when in search mode or has active search) */}
        {(isSearchMode || searchQuery) && (
          <div className="p-4 border-b flex items-center gap-2">
            <MessageSearchBar
              value={searchQuery}
              onChange={search}
              onClear={() => {
                clearSearch();
                setIsSearchMode(false);
              }}
              isSearching={isSearching}
              placeholder={
                activeConversationId
                  ? "Search in this conversation..."
                  : "Search all messages..."
              }
              className="flex-1"
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setIsSearchMode(false);
                clearSearch();
              }}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        )}

        {/* Search Toggle Button (when not in search mode) */}
        {!isSearchMode && !searchQuery && activeConversationId && (
          <div className="absolute top-4 right-4 z-10">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsSearchMode(true)}
              className="rounded-full shadow-md"
            >
              <Search className="h-5 w-5" />
            </Button>
          </div>
        )}

        {/* Content: Search Results, Thread View, or Chat View */}
        {isSearchMode || searchQuery ? (
          // Search Results
          <MessageSearchResults
            results={searchResults}
            query={debouncedQuery}
            isSearching={isSearching}
            onResultClick={handleSearchResultClick}
            // TODO: Fetch conversation and sender names
            conversationNames={new Map()}
            senderNames={new Map()}
            className="flex-1"
          />
        ) : activeConversationId ? (
          activeThreadMessageId && parentMessage ? (
            // Thread View
            <ThreadView
              parentMessage={{
                message: parentMessage,
                senderName: undefined,
                isRead: false,
                readCount: 0,
              }}
              replies={threadReplyProps}
              currentUserId="" // TODO: Get from session
              replyCount={threadReplyCount}
              isLoading={isLoadingThread}
              onSendReply={(body) => {
                if (activeConversationId) {
                  sendThreadReply(activeConversationId, body);
                }
              }}
              onEdit={editThreadReply}
              onDelete={deleteThreadReply}
              onBack={() => setActiveThreadMessageId(null)}
            />
          ) : (
            // Main Chat View
            <>
              <ChatView
                messages={messageProps}
                currentUserId="" // TODO: Get from session
                isLoading={isLoadingMessages}
                conversationTitle={
                  activeConversation?.title || "Untitled Conversation"
                }
                participantCount={0} // TODO: Get participant count
                onEdit={editMessage}
                onDelete={deleteMessage}
                onReply={(messageId) => setActiveThreadMessageId(messageId)}
                onViewThread={(messageId) =>
                  setActiveThreadMessageId(messageId)
                }
                className="flex-1"
              />
              <MessageComposer
                onSend={sendMessage}
                placeholder={t("messaging.type_message") || "Type a message..."}
              />
            </>
          )
        ) : (
          <div className="flex-1 flex items-center justify-center text-center px-4">
            <div>
              <h3 className="text-lg font-medium mb-2">
                {t("messaging.no_conversation_selected") ||
                  "No conversation selected"}
              </h3>
              <p className="text-sm text-muted-foreground">
                {t("messaging.select_conversation_hint") ||
                  "Select a conversation from the list or start a new one"}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
