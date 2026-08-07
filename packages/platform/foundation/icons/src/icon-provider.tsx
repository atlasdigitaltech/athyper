"use client";

/**
 * @athyper/platform-icons — IconProvider
 *
 * React context that distributes tenant icon overrides to any component that
 * calls `useIconResolver()`. Mount once at the app root (or at a sub-tree
 * boundary). The resolved icon from context always wins over the platform
 * registry default.
 *
 * Usage:
 *   // In root layout:
 *   <IconProvider overrides={tenantIcons}>
 *     <App />
 *   </IconProvider>
 *
 *   // In any component:
 *   const { resolve } = useIconResolver();
 *   const Icon = resolve("shopping-cart") ?? ShoppingCart;
 */

import {
  createContext,
  useContext,
  type ReactNode,
} from "react";
import type { IconComponent, TenantIconOverrides } from "./types.js";

interface IconContextValue {
  overrides: TenantIconOverrides;
}

const IconContext = createContext<IconContextValue>({ overrides: {} });

export interface IconProviderProps {
  /** Tenant-specific icon overrides. Keys match registry lookup strings. */
  overrides?: TenantIconOverrides;
  children: ReactNode;
}

/**
 * Provides tenant icon overrides to the subtree. Renders no DOM element.
 * Safe to nest: inner providers merge with (and override) outer ones.
 */
export function IconProvider({ overrides = {}, children }: IconProviderProps) {
  const parent = useContext(IconContext);
  const merged: TenantIconOverrides = { ...parent.overrides, ...overrides };
  return (
    <IconContext.Provider value={{ overrides: merged }}>
      {children}
    </IconContext.Provider>
  );
}

export interface IconResolverContext {
  /**
   * Resolves an icon key against tenant overrides, falling back to the
   * caller-supplied platform lookup. Returns `undefined` for unknown keys.
   *
   * @param key     Icon lookup key (module code, entity icon_key, verb, etc.)
   * @param lookup  Platform fallback — e.g. `getModuleIcon`
   */
  resolve: (
    key: string,
    lookup: (key: string) => IconComponent | undefined,
  ) => IconComponent | undefined;

  /** Raw override map for advanced use. */
  overrides: TenantIconOverrides;
}

/**
 * Returns the tenant icon resolver from context. Use in icon-rendering
 * components to apply overrides before falling back to the registry.
 *
 * @example
 * const { resolve } = useIconResolver();
 * const ModuleIcon = resolve(moduleCode, getModuleIcon) ?? Blocks;
 */
export function useIconResolver(): IconResolverContext {
  const { overrides } = useContext(IconContext);
  return {
    overrides,
    resolve(key, lookup) {
      return overrides[key] ?? lookup(key);
    },
  };
}
