// lib/nav/filter-nav.ts
//
// Filters navigation tree nodes based on the user's authorization context.
// Removes workspaces, modules, and entities that the user doesn't have access to.

import type { NavEntity, NavModule, NavTree, NavWorkspace } from "./nav-types";
import type { AuthContextValue } from "../auth/auth-context";

/**
 * Filter a navigation tree based on the user's auth context.
 * Removes nodes where the user lacks the required role.
 * Empty groups (no visible children) are also removed.
 *
 * @param tree - The full navigation tree from the API
 * @param auth - The user's authorization context (or null if not hydrated)
 * @returns Filtered tree with only accessible nodes
 */
export function filterNavTree(
  tree: NavTree,
  auth: AuthContextValue | null,
): NavTree {
  if (!auth) {
    // Auth not hydrated — return empty tree (will re-render once hydrated)
    return { workspaces: [] };
  }

  const workspaces = tree.workspaces
    .map((ws) => filterWorkspace(ws, auth))
    .filter((ws): ws is NavWorkspace => ws !== null);

  return { workspaces };
}

function filterWorkspace(
  ws: NavWorkspace,
  auth: AuthContextValue,
): NavWorkspace | null {
  const modules = ws.modules
    .map((mod) => filterModule(mod, auth))
    .filter((mod): mod is NavModule => mod !== null);

  if (modules.length === 0) return null;
  return { ...ws, modules };
}

function filterModule(
  mod: NavModule,
  auth: AuthContextValue,
): NavModule | null {
  // Check module-level role requirement
  if (mod.requiredRole && !auth.can(mod.requiredRole as any)) {
    return null;
  }

  const entities = mod.entities.filter((entity) => filterEntity(entity, auth));
  if (entities.length === 0) return null;

  return { ...mod, entities };
}

function filterEntity(entity: NavEntity, auth: AuthContextValue): boolean {
  if (!entity.requiredRole) return true;
  return auth.can(entity.requiredRole as any);
}
