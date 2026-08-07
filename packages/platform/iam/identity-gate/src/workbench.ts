import type { PlaneKey } from "@athyper/platform-iam-session-plane";

export type WorkbenchFilter = "user" | "partner" | "admin";

interface WorkbenchCopy {
  label: string;
  description: string;
  defaultRoute: string;
}

const COMMON_WORKBENCH_COPY: Record<string, WorkbenchCopy> = {
  user: {
    label: "User",
    description: "Standard tenant scope and business records.",
    defaultRoute: "/dashboard",
  },
  partner: {
    label: "Partner",
    description: "Delegated collaboration, shared records, and submissions.",
    defaultRoute: "/dashboard",
  },
  admin: {
    label: "Admin",
    description: "Administrative setup, governance, and platform controls.",
    defaultRoute: "/dashboard",
  },
};

const PLANE_WORKBENCH_COPY: Partial<Record<PlaneKey, Record<string, Partial<WorkbenchCopy>>>> = {
  mesh: {
    partner: {
      label: "Collaboration",
      description: "Partner and supplier collaboration through delegated access.",
    },
  },
  admin: {
    admin: {
      label: "Platform administration",
      description: "Internal platform operations with mandatory audit controls.",
      defaultRoute: "/dashboard",
    },
  },
};

export function getWorkbenchLabel(role: string, plane: PlaneKey): string {
  return resolveWorkbenchCopy(role, plane).label;
}

export function getWorkbenchDescription(role: string, plane: PlaneKey): string {
  return resolveWorkbenchCopy(role, plane).description;
}

export function getWorkbenchDefaultRoute(role: string, plane: PlaneKey): string {
  return resolveWorkbenchCopy(role, plane).defaultRoute;
}

export function getDefaultWorkbenchForPlane(plane: PlaneKey): WorkbenchFilter {
  if (plane === "mesh") return "partner";
  if (plane === "admin") return "admin";
  return "user";
}

function resolveWorkbenchCopy(role: string, plane: PlaneKey): WorkbenchCopy {
  const base = COMMON_WORKBENCH_COPY[role] ?? {
    label: toTitleCase(role),
    description: "",
    defaultRoute: "/dashboard",
  };
  const override = PLANE_WORKBENCH_COPY[plane]?.[role] ?? {};
  return {
    ...base,
    ...override,
  };
}

function toTitleCase(value: string): string {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
