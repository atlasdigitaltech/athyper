"use client";

import {
  useCallback,
  useState,
  type ReactNode,
} from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  AuthFailureBridge,
  type AuthFailureEvent,
} from "@athyper/platform-iam-identity-gate";
import { ToastProvider, useToast } from "@athyper/platform-ui/composites";

export interface PlaneProvidersProps {
  children: ReactNode;
  planeRoot?: string;
}

export function PlaneProviders({
  children,
  planeRoot = "",
}: PlaneProvidersProps) {
  const [queryClient] = useState(createPlaneQueryClient);

  return (
    <ToastProvider>
      <QueryClientProvider client={queryClient}>
        <WiredAuthFailureBridge planeRoot={planeRoot}>
          {children}
        </WiredAuthFailureBridge>
      </QueryClientProvider>
    </ToastProvider>
  );
}

function createPlaneQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  });
}

function WiredAuthFailureBridge({
  children,
  planeRoot,
}: {
  children: ReactNode;
  planeRoot: string;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const emitToast = useCallback(
    (input: Parameters<typeof toast>[0]) => toast(input),
    [toast],
  );
  const navigate = useCallback((href: string) => router.push(href), [router]);
  const onAuthFailure = useCallback((input: AuthFailureEvent) => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(
      new CustomEvent("athyper:auth-failure", { detail: input }),
    );
  }, []);
  const recordTelemetry = useCallback((input: AuthFailureEvent) => {
    if (typeof window === "undefined") return;
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.info("[telemetry]", input.event, input);
    }
  }, []);

  return (
    <AuthFailureBridge
      planeRoot={planeRoot}
      emitToast={emitToast}
      navigate={navigate}
      onAuthFailure={onAuthFailure}
      recordTelemetry={recordTelemetry}
    >
      {children}
    </AuthFailureBridge>
  );
}
