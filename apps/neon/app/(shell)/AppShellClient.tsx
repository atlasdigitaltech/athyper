"use client";

import type { ReactNode } from "react";
import { PlaneShell } from "@athyper/app-neon-shell";
import { FavoritesPanelContainer } from "@athyper/app-neon/collaboration";
export function AppShellClient({
  supportMode,
  children,
}: {
  supportMode: boolean;
  children: ReactNode;
}) {
  return (
    <PlaneShell supportMode={supportMode} FavoritesPanelComponent={FavoritesPanelContainer}>
      {children}
    </PlaneShell>
  );
}
