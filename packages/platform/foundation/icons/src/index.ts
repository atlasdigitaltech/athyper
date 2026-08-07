/**
 * @athyper/platform-icons
 *
 * Curated icon registry for Athyper. Maps semantic identifiers
 * (module codes, workspaces, entity classes, actions, statuses)
 * to Lucide React icon components.
 *
 * Prefer subpath imports for clarity:
 *   import { getModuleIcon }      from "@athyper/platform-icons/modules";
 *   import { getWorkspaceIcon }   from "@athyper/platform-icons/workspaces";
 *   import { getEntityClassIcon } from "@athyper/platform-icons/entity-classes";
 *   import { getActionIcon }      from "@athyper/platform-icons/actions";
 *   import { getStatusIcon }      from "@athyper/platform-icons/statuses";
 *
 * Or use this barrel for multiple imports:
 *   import { getModuleIcon, getStatusIcon } from "@athyper/platform-icons";
 */

// Entity icons (control.entity.icon_key → Lucide component)
export { getEntityIcon, hasEntityIcon } from "./entity-icons";

// Entity color tokens (control.entity.color_token → Tailwind classes)
export { getEntityColorClasses, type EntityColorClasses } from "./color-tokens";

// Module icons (64 modules across Athyper, Neon, Mesh planes)
export {
  getModuleIcon,
  hasModuleIcon,
  getRegisteredModuleCodes,
  resolveModuleIcon,
} from "./module-icons";

// Workspace icons (18 workspaces across Athyper, Neon, Mesh planes)
export {
  getWorkspaceIcon,
  hasWorkspaceIcon,
  getRegisteredWorkspaceKeys,
  resolveWorkspaceIcon,
} from "./workspace-icons";

// Entity class icons (10 classes)
export {
  getEntityClassIcon,
  getRegisteredEntityClasses,
} from "./entity-class-icons";

// Action icons (4 handler types + 25 common verbs)
export {
  getActionIcon,
  getHandlerTypeIcon,
  getRegisteredActions,
} from "./action-icons";

// Status icons (8 semantic intents)
export { getStatusIcon } from "./status-icons";

// Icon resolver (registry wrapper + tenant override layer)
export { createRegistryResolver, mergeResolvers } from "./icon-resolver";
export type { IconResolver } from "./icon-resolver";

// Icon provider (React context for tenant overrides)
export { IconProvider, useIconResolver } from "./icon-provider";
export type { IconProviderProps, IconResolverContext } from "./icon-provider";

// Types
export type { IconComponent, IconProps, IconResolverFn, TenantIconOverrides } from "./types";
