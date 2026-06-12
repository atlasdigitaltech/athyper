"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { setBffClientPlane } from "@athyper/runtime-shared/client";
import { ToastProvider, useToast } from "@athyper/ui/composites";
import { AuthFailureBridge } from "@athyper/identity-gate";
import { PLANE_KEY } from "@/lib/plane";

// Plane-specific csrf cookie (__mesh_csrf) — must run before any client
// component reads the token. Idempotent: HMR-safe.
setBffClientPlane(PLANE_KEY);

export function MeshProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  }));

  return (
    <ToastProvider>
      <QueryClientProvider client={queryClient}>
        <AuthFailureBridgeWired />
        {children}
      </QueryClientProvider>
    </ToastProvider>
  );
}

function AuthFailureBridgeWired() {
  const { toast } = useToast();
  const router = useRouter();
  return (
    <AuthFailureBridge
      planeRoot=""
      emitToast={(input) => {
        toast({
          title: input.title,
          ...(input.description ? { description: input.description } : {}),
          intent: input.intent,
          ...(input.action ? { action: input.action } : {}),
        });
      }}
      navigate={(href) => router.push(href)}
      recordTelemetry={(input) => {
        if (typeof window === "undefined") return;
        if (process.env.NODE_ENV !== "production") {
          // eslint-disable-next-line no-console
          console.info("[telemetry]", input.event, input);
        }
        window.dispatchEvent(new CustomEvent("athyper:auth-failure", { detail: input }));
      }}
    />
  );
}
