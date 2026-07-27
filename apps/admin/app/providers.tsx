"use client";

import type { ReactNode } from "react";
import { PlaneProviders } from "@athyper/app-foundation/client";
import { csrfFetch, setBffClientPlane } from "@athyper/runtime-shared/client";
import { configureSurfaceEventTransport } from "@athyper/runtime-shared/observability";
import { PLANE_KEY } from "@/lib/plane";

// Plane-specific csrf cookie (__admin_csrf) — must run before any client
// component reads the token. Idempotent: HMR-safe.
setBffClientPlane(PLANE_KEY);
configureSurfaceEventTransport(csrfFetch);

export function AdminProviders({ children }: { children: ReactNode }) {
  return <PlaneProviders>{children}</PlaneProviders>;
}
