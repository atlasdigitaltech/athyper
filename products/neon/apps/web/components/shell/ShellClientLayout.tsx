"use client";

// components/shell/ShellClientLayout.tsx
//
// Client-side wrapper for dynamic shell components that require ssr:false.
// Moved out of the server component layout to satisfy Next.js restrictions.

import dynamic from "next/dynamic";

import type { Workbench } from "@/lib/auth/types";
import type { ReactNode } from "react";

import { GlobalCommandPalette } from "@/components/shell/GlobalCommandPalette";
import { GlobalDrawerProvider } from "@/components/shell/GlobalDrawer";

const GlobalDrawer = dynamic(
  () => import("@/components/shell/GlobalDrawer").then((m) => m.GlobalDrawer),
  { ssr: false },
);
const ShellHeader = dynamic(
  () => import("@/components/shell/ShellHeader").then((m) => m.ShellHeader),
  {
    ssr: false,
    loading: () => <div className="flex h-12 shrink-0 items-center border-b" />,
  },
);

interface ShellClientLayoutProps {
  workbench: Workbench;
  children: ReactNode;
}

export function ShellClientLayout({
  workbench,
  children,
}: ShellClientLayoutProps) {
  return (
    <GlobalDrawerProvider>
      <GlobalDrawer workbench={workbench} />
      <GlobalCommandPalette />
      <div
        data-slot="shell-container"
        className="@container flex h-svh flex-col"
      >
        <ShellHeader workbench={workbench} />
        <main
          data-slot="shell-main"
          className="flex-1 overflow-auto p-4 md:p-6"
        >
          {children}
        </main>
      </div>
    </GlobalDrawerProvider>
  );
}
