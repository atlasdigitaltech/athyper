"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { homePersonalizationStorageKey } from "./home-personalization";

interface ShellPersonalizationScope {
  readonly storageKey: string;
}

const Context = createContext<ShellPersonalizationScope | undefined>(undefined);

export function ShellPersonalizationScopeProvider({ plane, tenantId, principalId, children }: { readonly plane: string; readonly tenantId: string; readonly principalId: string; readonly children: ReactNode }) {
  const value = useMemo(() => Object.freeze({ storageKey: homePersonalizationStorageKey(plane, tenantId, principalId) }), [plane, tenantId, principalId]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useShellPersonalizationScope(): ShellPersonalizationScope {
  const value = useContext(Context);
  if (!value) throw new Error("Dashboard personalization requires PlatformShell");
  return value;
}
