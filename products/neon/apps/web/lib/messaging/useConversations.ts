/**
 * useConversations - SWR hook for fetching conversations
 */

import { listConversations, type Conversation } from "@athyper/api-client/messaging/messagingClient";
import useSWR from "swr";

export function useConversations(options?: {
    type?: "direct" | "group";
    limit?: number;
}) {
    const { data, error, isLoading, mutate } = useSWR<Conversation[]>(
        `/api/conversations?type=${options?.type ?? "all"}&limit=${options?.limit ?? 50}`,
        () => listConversations(options),
        {
            refreshInterval: 30000, // Refresh every 30 seconds
            revalidateOnFocus: true,
        }
    );

    return {
        conversations: data ?? [],
        isLoading,
        isError: !!error,
        error,
        refresh: mutate,
    };
}
