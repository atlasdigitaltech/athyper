"use client";
import type { ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { NeonEntityApplication } from "@athyper/product-neon-list-view";
export function EntityApplicationLayout({
  entityCode,
  children,
  activePath,
}: {
  readonly entityCode: string;
  readonly children: ReactNode;
  /** Public canonical path when this component is reached through an internal rewrite. */
  readonly activePath?: string;
}) {
  const query = useSearchParams().toString(), pathname = usePathname();
  return (
    <NeonEntityApplication
      initialDirectoryQuery={query}
      entityCode={entityCode}
      activePath={activePath ?? pathname}
    >
      {children}
    </NeonEntityApplication>
  );
}
