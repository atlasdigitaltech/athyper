// neon-specific navigation data
export {
  MODULE_WORKSPACE_MAP,
  WORKSPACE_LABELS,
  WORKSPACE_SORT_ORDER,
  WORKSPACE_HREF_MAP,
  CORE_GROUPS,
  PARTNER_GROUPS,
} from "./module-workspace-map";

export { MODULE_PAGES, getModulePrimaryHref, type ModulePage } from "./module-pages";
export { deriveNavTree, deriveCoreModules } from "./derive-nav-tree";

// re-export shared navigation-core primitives
export { buildMenuTree, type MenuModuleItem, type MenuWorkspaceGroup } from "@athyper/navigation-core";
export { resolveWorkbench, type WorkbenchType } from "@athyper/navigation-core";
export { getRuntimePrefix, buildEntityRoute, buildDetailRoute } from "@athyper/navigation-core";
