// lib/entity-page/plugin-registry.ts
//
// Plugin registry for entity page tabs and drawers.
// Plugins register React components keyed by tab code or drawer type.
// The EntityPageShell resolves which component to render for each tab.

import type {
  EntityPageDynamicDescriptor,
  EntityPageStaticDescriptor,
} from "./types";
import type { ComponentType } from "react";


// ============================================================================
// Tab Plugin
// ============================================================================

export interface TabPluginProps {
  entityName: string;
  entityId: string;
  staticDescriptor: EntityPageStaticDescriptor;
  dynamicDescriptor: EntityPageDynamicDescriptor;
}

export type TabPlugin = {
  code: string;
  component: ComponentType<TabPluginProps>;
};

// ============================================================================
// Registry
// ============================================================================

const tabPlugins = new Map<string, TabPlugin>();

export function registerTabPlugin(plugin: TabPlugin): void {
  tabPlugins.set(plugin.code, plugin);
}

export function getTabPlugin(code: string): TabPlugin | undefined {
  return tabPlugins.get(code);
}

export function getAllTabPlugins(): TabPlugin[] {
  return Array.from(tabPlugins.values());
}
