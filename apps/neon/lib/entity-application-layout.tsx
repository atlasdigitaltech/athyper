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
  const role = useSearchParams().get("role");
  return (
    <NeonEntityApplication
      initialPartnerRole={
        entityCode === "business_partner" &&
        (role === "supplier" || role === "customer")
          ? role
          : undefined
      }
      entityCode={entityCode}
      activePath={usePathname()}
    >
      {children}
    </NeonEntityApplication>
  );
}
