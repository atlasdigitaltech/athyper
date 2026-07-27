"use client";

import type { ReactNode } from "react";
import { PlaneProviders } from "@athyper/app-foundation/client";
import { configureNeonRuntime } from "@/lib/configure-neon-runtime";

configureNeonRuntime();

export function NeonProviders({ children }: { children: ReactNode }) {
  return <PlaneProviders>{children}</PlaneProviders>;
}
