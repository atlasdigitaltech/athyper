"use client";

import { createContext, createElement, useContext, useMemo, useState } from "react";
import type React from "react";
import type { SortEntry } from "../../core/types";
import type { OrganizeControlName } from "../../adapter/types";

export type OrganizePanelName = Exclude<OrganizeControlName, "search">;

// Shared reference shape only. Each control owns its own draft useState.
export interface OrganizeDraftState {
  filters?: Record<string, string[]>;
  sort?:    SortEntry[];
  columns?: string[];
  group?:   string | null;
}

interface OrganizePaletteContextValue {
  openPanel:    OrganizePanelName | null;
  setOpenPanel: (panel: OrganizePanelName | null) => void;
}

const OrganizePaletteCtx = createContext<OrganizePaletteContextValue | null>(null);

export function OrganizePaletteProvider({ children }: { children: React.ReactNode }) {
  const [openPanel, setOpenPanel] = useState<OrganizePanelName | null>(null);
  const value = useMemo(() => ({ openPanel, setOpenPanel }), [openPanel]);
  return createElement(OrganizePaletteCtx.Provider, { value }, children);
}

export function useOrganizePanel(panel: OrganizePanelName) {
  const ctx = useContext(OrganizePaletteCtx);
  if (!ctx) throw new Error("useOrganizePanel must be used inside <OrganizePaletteProvider>");
  const open = ctx.openPanel === panel;
  return {
    open,
    show:   () => ctx.setOpenPanel(panel),
    close:  () => ctx.setOpenPanel(null),
    toggle: () => ctx.setOpenPanel(open ? null : panel),
  };
}
