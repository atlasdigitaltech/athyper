// lib/auth/workbench-config.ts
//
// Static metadata for each workbench. Used by:
//   - WorkbenchSwitcher (dropdown labels/icons)
//   - Login page (workbench selection)
//   - Post-login redirect resolver
//   - Nav registry (default landing routes)

import type { Workbench } from "./types";

export interface WorkbenchConfig {
    id: Workbench;
    label: string;
    description: string;
    icon: string; // Lucide icon name
    defaultRoute: string;
}

export const WORKBENCH_CONFIGS: Record<Workbench, WorkbenchConfig> = {
    user: {
        id: "user",
        label: "User",
        description: "Standard user workbench",
        icon: "User",
        defaultRoute: "/wb/user/home",
    },
    partner: {
        id: "partner",
        label: "Partner",
        description: "Partner collaboration workbench",
        icon: "Handshake",
        defaultRoute: "/wb/partner/home",
    },
    ops: {
        id: "ops",
        label: "Operations",
        description: "Operations management workbench",
        icon: "Settings",
        defaultRoute: "/wb/ops/home",
    },
    admin: {
        id: "admin",
        label: "Admin",
        description: "System administration workbench",
        icon: "Shield",
        defaultRoute: "/wb/admin/home",
    },
};

/**
 * Get the default route for a workbench.
 */
export function getWorkbenchDefaultRoute(wb: Workbench): string {
    return WORKBENCH_CONFIGS[wb].defaultRoute;
}

/**
 * Get config for all workbenches as an ordered array.
 */
export function getWorkbenchList(): WorkbenchConfig[] {
    return Object.values(WORKBENCH_CONFIGS);
}
