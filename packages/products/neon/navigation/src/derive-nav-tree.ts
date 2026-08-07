/**
 * @athyper/navigation — deriveNavTree
 *
 * Derives MenuWorkspaceGroup[] from the flat RuntimeSession.modules[] array
 * using the static MODULE_WORKSPACE_MAP. This bridges the gap between the
 * runtime session (which carries flat modules) and the sidebar's workspace-
 * grouped navigation model.
 *
 * When the platform navigation API (/api/nav/tree → WorkspaceNode[]) becomes
 * available, replace the call site in AppNavRail with buildMenuTree() instead.
 */

import type { RuntimeModule } from "@athyper/platform-iam-session-plane";
import { getWorkspaceIcon } from "@athyper/platform-icons/workspaces";
import { getModuleIcon } from "@athyper/platform-icons/modules";
import {
  MODULE_WORKSPACE_MAP,
  WORKSPACE_LABELS,
  WORKSPACE_SORT_ORDER,
} from "./module-workspace-map";
import { getModulePrimaryHref } from "./module-pages";
import type { MenuModuleItem, MenuWorkspaceGroup } from "@athyper/navigation-core";

/**
 * Group RuntimeSession.modules[] into workspace buckets.
 * Core modules (MODULE_WORKSPACE_MAP[code] === "core") are excluded —
 * they are handled separately via deriveCoreModules().
 */
export function deriveNavTree(modules: RuntimeModule[]): MenuWorkspaceGroup[] {
  const buckets = new Map<string, MenuModuleItem[]>();

  for (const mod of modules) {
    const wsKey = MODULE_WORKSPACE_MAP[mod.code];
    if (!wsKey || wsKey === "core") continue;

    const existing = buckets.get(wsKey) ?? [];
    existing.push({
      code: mod.code,
      label: mod.name,
      icon: getModuleIcon(mod.code),
      href: getModulePrimaryHref(mod.code),
      entityCodes: [],
      isEnabled: true,
    });
    buckets.set(wsKey, existing);
  }

  return [...buckets.entries()]
    .sort(
      ([a], [b]) =>
        (WORKSPACE_SORT_ORDER[a] ?? 99) - (WORKSPACE_SORT_ORDER[b] ?? 99),
    )
    .map(([key, mods]) => ({
      key,
      label: WORKSPACE_LABELS[key] ?? key,
      icon: getWorkspaceIcon(key),
      modules: mods,
    }));
}

/**
 * Build PanelModule items for the Core ContextPanel.
 *
 * @param coreCodes  - from RuntimeSession.platform (e.g. [{ code: "FND" }])
 * @param allModules - RuntimeSession.modules (used to resolve display names)
 */
export function deriveCoreModules(
  coreCodes: Array<{ code: string }>,
  allModules: RuntimeModule[],
): MenuModuleItem[] {
  const nameMap = new Map(allModules.map((m) => [m.code, m.name]));

  return coreCodes.map((p) => ({
    code: p.code,
    label: nameMap.get(p.code) ?? p.code,
    icon: getModuleIcon(p.code),
    href: getModulePrimaryHref(p.code),
    entityCodes: [],
    isEnabled: true,
  }));
}
