"use client";

/**
 * QueryProvider — TanStack Query client for the entire app.
 *
 * Configured with sensible defaults matching the sprint requirements:
 *   - staleTime 30s (matches per-hook overrides)
 *   - gcTime 5 min
 *   - Retry 1 time on failure
 *   - refetchOnWindowFocus: true
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30 * 1000,
            gcTime: 5 * 60 * 1000,
            retry: 1,
            refetchOnWindowFocus: true,
          },
          mutations: {
            retry: 0,
          },
        },
      }),
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
