/**
 * @athyper/navigation — Menu Model
 *
 * Builds the sidebar navigation tree from platform API data.
 * Consumes WorkspaceNode + ModuleNode from api-contracts/platform.
 */
import { type WorkspaceNode, type ModuleNode } from "@athyper/api-contracts/platform";
import { getWorkspaceIcon } from "@athyper/icons/workspaces";
import { getModuleIcon } from "@athyper/icons/modules";
import { type LucideIcon } from "lucide-react";

export interface MenuModuleItem {
  code: string;
  label: string;
  icon: LucideIcon;
  href: string;
  entityCodes: string[];
  isEnabled: boolean;
}

export interface MenuWorkspaceGroup {
  key: string;
  label: string;
  icon: LucideIcon;
  modules: MenuModuleItem[];
}

/**
 * Build the sidebar menu tree from API workspace data.
 * Filters out disabled modules and applies capability gating.
 */
export function buildMenuTree(
  workspaces: WorkspaceNode[],
  enabledCapabilities?: Set<string>,
): MenuWorkspaceGroup[] {
  return workspaces
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((ws) => ({
      key: ws.key,
      label: ws.label,
      icon: getWorkspaceIcon(ws.key),
      modules: ws.modules
        .filter((m) => m.is_enabled)
        .filter((m) => !enabledCapabilities || m.entity_codes.length > 0)
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((m) => ({
          code: m.code,
          label: m.name,
          icon: getModuleIcon(m.code),
          href: buildModuleHref(m),
          entityCodes: m.entity_codes,
          isEnabled: m.is_enabled,
        })),
    }))
    .filter((ws) => ws.modules.length > 0);
}

function buildModuleHref(module: ModuleNode): string {
  if (module.entity_codes.length === 0) {
    return `/dashboards`;
  }
  return `/master/${module.entity_codes[0]}`;
}
