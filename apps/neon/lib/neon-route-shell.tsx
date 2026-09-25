"use client";
import { usePathname } from "next/navigation";
import { NeonShell } from "@athyper/product-neon-shell";
import type { ComponentProps } from "react";
import { isTenantWorkspaceRoute } from "./tenant-workspace-route";
export function NeonRouteShell(
  props: Omit<ComponentProps<typeof NeonShell>, "tenantWorkspace">,
) {
  return (
    <NeonShell
      {...props}
      tenantWorkspace={isTenantWorkspaceRoute(usePathname())}
    />
  );
}
