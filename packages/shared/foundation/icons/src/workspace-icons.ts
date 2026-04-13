/**
 * @athyper/icons — Workspace Icon Registry
 *
 * Maps workspace identifiers to Lucide icons.
 * Used by the workbench shell and sidebar workspace headers.
 */
import {
  Server,
  Coins,
  Link,
  Heart,
  UserCog,
  FolderKanban,
  Cog,
  Building2,
  CircleHelp,
  type LucideIcon,
} from "lucide-react";

const WORKSPACE_ICON_MAP: Record<string, LucideIcon> = {
  "core":                     Server,        // Core modules
  "finance":                  Coins,         // Finance workspace
  "supply-chain":             Link,          // Supply Chain workspace
  "customer-experience":      Heart,         // Customer Experience workspace
  "people-management":        UserCog,       // People Management workspace
  "project-management":       FolderKanban,  // Project Management workspace
  "manufacturing-operations": Cog,           // Manufacturing & Operations workspace
  "asset-management":         Building2,     // Asset Management workspace
};

/** Fallback icon for unknown workspace keys. */
const FALLBACK_ICON: LucideIcon = CircleHelp;

/**
 * Get the icon component for a workspace.
 *
 * @param workspaceKey - e.g. "finance", "supply-chain"
 * @returns Lucide icon component — never undefined, falls back to CircleHelp
 */
export function getWorkspaceIcon(workspaceKey: string): LucideIcon {
  return WORKSPACE_ICON_MAP[workspaceKey] ?? FALLBACK_ICON;
}

/** Get all registered workspace keys. */
export function getRegisteredWorkspaceKeys(): string[] {
  return Object.keys(WORKSPACE_ICON_MAP);
}
