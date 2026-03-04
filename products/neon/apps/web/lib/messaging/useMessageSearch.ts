/**
 * useMessageSearch - Client hook for message search with debouncing
 */

import {
  searchMessages as apiSearchMessages,
  type MessageSearchResult,
} from "@athyper/api-client/messaging/messagingClient";
import { useState, useEffect, useCallback } from "react";
import useSWR from "swr";

export interface UseMessageSearchOptions {
  conversationId?: string;
  limit?: number;
  debounceMs?: number;
}

export function useMessageSearch(options?: UseMessageSearchOptions) {
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  // Debounce search query
  useEffect(() => {
    const debounceMs = options?.debounceMs ?? 300;
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [searchQuery, options?.debounceMs]);

  // SWR key: only fetch when we have a debounced query
  const swrKey = debouncedQuery
    ? [
        "/api/messages/search",
        debouncedQuery,
        options?.conversationId,
        options?.limit,
      ]
    : null;

  const { data, error, isLoading, mutate } = useSWR<{
    results: MessageSearchResult[];
    count: number;
  }>(
    swrKey,
    debouncedQuery
      ? () =>
          apiSearchMessages({
            q: debouncedQuery,
            conversationId: options?.conversationId,
            limit: options?.limit ?? 50,
          })
      : null,
    {
      refreshInterval: 0, // Don't auto-refresh search results
      revalidateOnFocus: false, // Don't refetch on focus
      dedupingInterval: 5000, // Cache results for 5 seconds
    },
  );

  /**
   * Update search query (will be debounced)
   */
  const search = useCallback((query: string) => {
    setSearchQuery(query);
  }, []);

  /**
   * Clear search
   */
  const clear = useCallback(() => {
    setSearchQuery("");
    setDebouncedQuery("");
  }, []);

  return {
    searchQuery,
    debouncedQuery,
    results: data?.results ?? [],
    count: data?.count ?? 0,
    isSearching: isLoading,
    isError: !!error,
    error,
    search,
    clear,
    refresh: mutate,
  };
}
