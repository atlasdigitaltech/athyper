"use client";

import { HydrationBoundary, QueryClientProvider } from "@tanstack/react-query";
import * as React from "react";
import type { ReactNode } from "react";
import type { DehydratedState, QueryClient } from "./core";

export * from "./core";
export function PlatformQueryProvider({ client, dehydratedState, children }: { readonly client: QueryClient; readonly dehydratedState?: DehydratedState; readonly children: ReactNode }) { return <QueryClientProvider client={client}>{dehydratedState ? <HydrationBoundary state={dehydratedState}>{children}</HydrationBoundary> : children}</QueryClientProvider>; }
export { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
