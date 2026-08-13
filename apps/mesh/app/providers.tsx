"use client";

import { createHttpClient } from "@athyper/platform-api-client";
import { getBrowserQueryClient, type DehydratedState } from "@athyper/platform-query";
import { AppFoundationProviders, type ExperienceBootstrap, type SanitizedSession } from "@athyper/platform-shell-app-foundation";
import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

export function AppProviders({ session, bootstrap, dehydratedState, children }: { readonly session: SanitizedSession; readonly bootstrap: ExperienceBootstrap; readonly dehydratedState: DehydratedState; readonly children: ReactNode }) { const [queryClient] = useState(getBrowserQueryClient), router = useRouter(); const apiClient = useMemo(() => createHttpClient(), []); return <AppFoundationProviders session={session} bootstrap={bootstrap} dehydratedState={dehydratedState} queryClient={queryClient} apiClient={apiClient} onBootstrapRevalidation={() => router.refresh()} onAuthenticationFailure={() => window.location.assign("/api/auth/login")}>{children}</AppFoundationProviders>; }
