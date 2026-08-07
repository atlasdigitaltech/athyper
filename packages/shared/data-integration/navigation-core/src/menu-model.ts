/**
 * @athyper/navigation — Menu Model
 *
 * Builds the sidebar navigation tree from platform API data.
 * Consumes WorkspaceNode + ModuleNode from api-contracts/platform.
 */
import { type WorkspaceNode, type ModuleNode } from "@athyper/api-contracts/platform";
import { getWorkspaceIcon } from "@athyper/platform-icons/workspaces";
import { getModuleIcon } from "@athyper/platform-icons/modules";
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
 *
 * @param workspaces - Sorted workspace tree from the platform nav API.
 * @param enabledCapabilities - Optional set of entity codes the session can
 *   access. When provided, only modules that expose at least one accessible
 *   entity are shown. Omit to show all enabled modules unconditionally.
 */
export function buildMenuTree(
  workspaces: WorkspaceNode[],
  enabledCapabilities?: Set<string>,
): MenuWorkspaceGroup[] {
  return [...workspaces]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((ws) => ({
      key: ws.key,
      label: ws.label,
      icon: getWorkspaceIcon(ws.key),
      modules: [...ws.modules]
        .filter((m) => m.is_enabled)
        .filter((m) =>
          !enabledCapabilities ||
          m.entity_codes.some((code) => enabledCapabilities.has(code)),
        )
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((m) => ({
          code: m.code,
          label: m.name,
          icon: getModuleIcon(m.code),
          href: buildModuleHref(m),
          entityCodes: [...m.entity_codes],
          isEnabled: m.is_enabled,
        })),
    }))
    .filter((ws) => ws.modules.length > 0);
}

/**
 * Derive the landing href for a module. Falls back to /dashboard (not the
 * nonexistent /dashboards) for command-only modules with no entity codes.
 */
function buildModuleHref(module: ModuleNode): string {
  const [entityCode] = module.entity_codes;
  if (!entityCode) {
    return `/dashboard`;
  }
  return `/master/${encodeURIComponent(entityCode)}`;
}
