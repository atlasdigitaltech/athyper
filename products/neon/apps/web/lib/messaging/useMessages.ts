/**
 * useMessages - SWR hook for fetching messages in a conversation
 */

import {
  listMessages,
  sendMessage as apiSendMessage,
  editMessage as apiEditMessage,
  deleteMessage as apiDeleteMessage,
  markMessageAsRead as apiMarkMessageAsRead,
  type Message,
} from "@athyper/api-client/messaging/messagingClient";
import { useCallback } from "react";
import useSWR from "swr";

export function useMessages(conversationId: string | null) {
  const { data, error, isLoading, mutate } = useSWR<Message[]>(
    conversationId ? `/api/conversations/${conversationId}/messages` : null,
    conversationId ? () => listMessages(conversationId, { limit: 100 }) : null,
    {
      refreshInterval: 0, // SSE handles real-time updates
      revalidateOnFocus: true,
    },
  );

  /**
   * Send a message with optimistic update
   */
  const sendMessage = useCallback(
    async (
      body: string,
      bodyFormat: "plain" | "markdown" = "plain",
      parentMessageId?: string,
    ) => {
      if (!conversationId) return;

      // Optimistic update
      const tempId = `temp-${Date.now()}`;
      const optimisticMessage: Message = {
        id: tempId,
        tenantId: "", // Will be filled by server
        conversationId,
        senderId: "", // Will be filled by server (current user)
        body,
        bodyFormat,
        clientMessageId: null,
        parentMessageId: parentMessageId ?? null,
        createdAt: new Date().toISOString(),
        editedAt: null,
        deletedAt: null,
      };

      await mutate(
        data ? [...data, optimisticMessage] : [optimisticMessage],
        false,
      );

      try {
        // Send to server
        await apiSendMessage(conversationId, {
          body,
          bodyFormat,
          parentMessageId,
        });

        // Revalidate to get real message from server
        await mutate();
      } catch (err) {
        // Revert optimistic update on error
        await mutate();
        throw err;
      }
    },
    [conversationId, data, mutate],
  );

  /**
   * Edit a message with optimistic update
   */
  const editMessage = useCallback(
    async (messageId: string, newBody: string) => {
      if (!data) return;

      // Optimistic update
      await mutate(
        data.map((msg) =>
          msg.id === messageId
            ? { ...msg, body: newBody, editedAt: new Date().toISOString() }
            : msg,
        ),
        false,
      );

      try {
        await apiEditMessage(messageId, newBody);
        await mutate();
      } catch (err) {
        await mutate();
        throw err;
      }
    },
    [data, mutate],
  );

  /**
   * Delete a message with optimistic update
   */
  const deleteMessage = useCallback(
    async (messageId: string) => {
      if (!data) return;

      // Optimistic update
      await mutate(
        data.map((msg) =>
          msg.id === messageId
            ? { ...msg, deletedAt: new Date().toISOString() }
            : msg,
        ),
        false,
      );

      try {
        await apiDeleteMessage(messageId);
        await mutate();
      } catch (err) {
        await mutate();
        throw err;
      }
    },
    [data, mutate],
  );

  /**
   * Mark a message as read
   */
  const markAsRead = useCallback(
    async (messageId: string) => {
      if (!conversationId) return;

      try {
        await apiMarkMessageAsRead(messageId, conversationId);
      } catch (err) {
        console.error("Failed to mark message as read:", err);
      }
    },
    [conversationId],
  );

  return {
    messages: data ?? [],
    isLoading,
    isError: !!error,
    error,
    sendMessage,
    editMessage,
    deleteMessage,
    markAsRead,
    refresh: mutate,
  };
}
