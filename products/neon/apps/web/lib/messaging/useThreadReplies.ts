/**
 * useThreadReplies - SWR hook for fetching thread replies
 */

import {
    listThreadReplies,
    sendMessage as apiSendMessage,
    editMessage as apiEditMessage,
    deleteMessage as apiDeleteMessage,
    type Message,
} from "@athyper/api-client/messaging/messagingClient";
import { useCallback } from "react";
import useSWR from "swr";

export function useThreadReplies(parentMessageId: string | null) {
    const { data, error, isLoading, mutate } = useSWR<{
        replies: Message[];
        count: number;
    }>(
        parentMessageId ? `/api/messages/${parentMessageId}/thread` : null,
        parentMessageId ? () => listThreadReplies(parentMessageId, { limit: 100 }) : null,
        {
            refreshInterval: 0, // SSE handles real-time updates
            revalidateOnFocus: true,
        }
    );

    /**
     * Send a reply with optimistic update
     */
    const sendReply = useCallback(
        async (
            conversationId: string,
            body: string,
            bodyFormat: "plain" | "markdown" = "plain"
        ) => {
            if (!parentMessageId) return;

            // Optimistic update
            const tempId = `temp-${Date.now()}`;
            const optimisticMessage: Message = {
                id: tempId,
                tenantId: "",
                conversationId,
                senderId: "",
                body,
                bodyFormat,
                clientMessageId: null,
                parentMessageId,
                createdAt: new Date().toISOString(),
                editedAt: null,
                deletedAt: null,
            };

            const currentReplies = data?.replies ?? [];
            await mutate(
                {
                    replies: [...currentReplies, optimisticMessage],
                    count: (data?.count ?? 0) + 1,
                },
                false
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
        [parentMessageId, data, mutate]
    );

    /**
     * Edit a reply with optimistic update
     */
    const editReply = useCallback(
        async (messageId: string, newBody: string) => {
            if (!data) return;

            // Optimistic update
            await mutate(
                {
                    ...data,
                    replies: data.replies.map((msg) =>
                        msg.id === messageId
                            ? { ...msg, body: newBody, editedAt: new Date().toISOString() }
                            : msg
                    ),
                },
                false
            );

            try {
                await apiEditMessage(messageId, newBody);
                await mutate();
            } catch (err) {
                await mutate();
                throw err;
            }
        },
        [data, mutate]
    );

    /**
     * Delete a reply with optimistic update
     */
    const deleteReply = useCallback(
        async (messageId: string) => {
            if (!data) return;

            // Optimistic update
            await mutate(
                {
                    ...data,
                    replies: data.replies.map((msg) =>
                        msg.id === messageId
                            ? { ...msg, deletedAt: new Date().toISOString() }
                            : msg
                    ),
                },
                false
            );

            try {
                await apiDeleteMessage(messageId);
                await mutate();
            } catch (err) {
                await mutate();
                throw err;
            }
        },
        [data, mutate]
    );

    return {
        replies: data?.replies ?? [],
        replyCount: data?.count ?? 0,
        isLoading,
        isError: !!error,
        error,
        sendReply,
        editReply,
        deleteReply,
        refresh: mutate,
    };
}
