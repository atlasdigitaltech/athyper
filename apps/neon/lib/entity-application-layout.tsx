"use client";
import type { ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { NeonEntityApplication } from "@athyper/product-neon-list-view";
export function EntityApplicationLayout({
  entityCode,
  children,
}: {
  readonly entityCode: string;
  readonly children: ReactNode;
}) {
  const query = useSearchParams().toString();
  return (
    <NeonEntityApplication
      initialDirectoryQuery={query}
      entityCode={entityCode}
      activePath={usePathname()}
    >
      {children}
    </NeonEntityApplication>
  );
}
