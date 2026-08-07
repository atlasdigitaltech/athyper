"use client";

import {
  QueryClient,
  QueryCache,
  MutationCache,
  type Query,
} from "@tanstack/react-query";

export interface PlatformQueryClientOptions {
  /** Called on any query or mutation error — wire to Sentry / OTel here. */
  onError?: (error: unknown, query: Query) => void;
}

/**
 * Create a QueryClient with standardized production defaults.
 * Call once at app boot and pass to <QueryClientProvider>.
 *
 * Defaults:
 *   - Queries:   1 retry, 500ms delay, refetchOnWindowFocus, offlineFirst
 *   - Mutations: no retry (mutations are not idempotent)
 *   - Global onError for telemetry routing
 */
export function createPlatformQueryClient(
  opts: PlatformQueryClientOptions = {},
): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry:                1,
        retryDelay:           500,
        networkMode:          "offlineFirst",
        refetchOnWindowFocus: true,
        refetchOnReconnect:   true,
      },
      mutations: {
        retry:       false,
        networkMode: "online",
      },
    },
    queryCache: new QueryCache({
      onError: opts.onError
        ? (error, query) => opts.onError!(error, query)
        : undefined,
    }),
    mutationCache: new MutationCache({
      onError: opts.onError
        ? (error) => opts.onError!(error, undefined as unknown as Query)
        : undefined,
    }),
  });
}
