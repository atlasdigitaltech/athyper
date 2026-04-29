/**
 * @athyper/icons
 *
 * Curated icon registry for Athyper. Maps semantic identifiers
 * (module codes, workspaces, entity classes, actions, statuses)
 * to Lucide React icon components.
 *
 * Prefer subpath imports for clarity:
 *   import { getModuleIcon }      from "@athyper/icons/modules";
 *   import { getWorkspaceIcon }   from "@athyper/icons/workspaces";
 *   import { getEntityClassIcon } from "@athyper/icons/entity-classes";
 *   import { getActionIcon }      from "@athyper/icons/actions";
 *   import { getStatusIcon }      from "@athyper/icons/statuses";
 *   import { AthyperLogo }        from "@athyper/icons/custom/AthyperLogo";
 *
 * Or use this barrel for multiple imports:
 *   import { getModuleIcon, getStatusIcon } from "@athyper/icons";
 */

// Entity icons (control.entity.icon_key → Lucide component)
export { getEntityIcon, hasEntityIcon } from "./entity-icons";

// Entity color tokens (control.entity.color_token → Tailwind classes)
export { getEntityColorClasses, type EntityColorClasses } from "./color-tokens";

// Module icons (40 modules)
export {
  getModuleIcon,
  hasModuleIcon,
  getRegisteredModuleCodes,
} from "./module-icons";

// Workspace icons (8 workspaces)
export { getWorkspaceIcon, getRegisteredWorkspaceKeys } from "./workspace-icons";

// Entity class icons (10 classes)
export {
  getEntityClassIcon,
  getRegisteredEntityClasses,
} from "./entity-class-icons";

// Action icons (4 handler types + 18 common verbs)
export {
  getActionIcon,
  getHandlerTypeIcon,
  getRegisteredActions,
} from "./action-icons";

// Status icons (8 semantic intents)
export { getStatusIcon } from "./status-icons";

// Custom SVGs
export { AthyperLogo } from "./custom/AthyperLogo";
export { NeonLogo } from "./custom/NeonLogo";

// Types
export type { IconComponent, IconProps } from "./types";
