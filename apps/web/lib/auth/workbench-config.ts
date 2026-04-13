// lib/auth/workbench-config.ts
//
// Static metadata for each workbench role. Single source of truth for:
//   - /auth/select (labels, descriptions)
//   - WorkbenchToggle (labels)
//   - Post-select redirect resolver (defaultRoute)
//
// v4 roles come from the KC org `allowed_workbenches` attribute:
//   user | partner | admin
// (ops workbench from F1 is replaced by platform-control realm login in v4)

export type WorkbenchRole = "user" | "partner" | "admin";

export interface WorkbenchConfig {
  id: WorkbenchRole;
  label: string;
  description: string;
  icon: string; // Lucide icon name
  defaultRoute: string;
}

export const WORKBENCH_CONFIGS: Record<WorkbenchRole, WorkbenchConfig> = {
  user: {
    id: "user",
    label: "User",
    description: "Standard ERP and finance workbench",
    icon: "User",
    defaultRoute: "/workbench/user",
  },
  partner: {
    id: "partner",
    label: "Partner",
    description: "Inter-entity collaboration and shared documents",
    icon: "Handshake",
    defaultRoute: "/workbench/partner",
  },
  admin: {
    id: "admin",
    label: "Admin",
    description: "Meta Studio — system configuration and tenant management",
    icon: "Shield",
    defaultRoute: "/workbench/admin",
  },
};

/** Get the display label for a workbench role string. Falls back to capitalised role. */
export function getWorkbenchLabel(role: string): string {
  return (
    WORKBENCH_CONFIGS[role as WorkbenchRole]?.label ??
    role.charAt(0).toUpperCase() + role.slice(1)
  );
}

/** Get the default landing route for a workbench role. Falls back to /home. */
export function getWorkbenchDefaultRoute(role: string): string {
  return WORKBENCH_CONFIGS[role as WorkbenchRole]?.defaultRoute ?? "/home";
}

/** Get the description for a workbench role. */
export function getWorkbenchDescription(role: string): string {
  return WORKBENCH_CONFIGS[role as WorkbenchRole]?.description ?? "";
}
