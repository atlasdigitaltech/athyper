"use client";

import { createContext, createElement, useCallback, useContext, useMemo, useState } from "react";
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
  openPanel:               OrganizePanelName | null;
  requestedFilterField:    string | null;
  requestedFilterTrigger:  HTMLButtonElement | null;
  showPanel:               (panel: OrganizePanelName) => void;
  closePanel:              () => void;
  togglePanel:             (panel: OrganizePanelName) => void;
  showFilterField:         (fieldName: string, trigger?: HTMLButtonElement) => void;
}

const OrganizePaletteCtx = createContext<OrganizePaletteContextValue | null>(null);

export function OrganizePaletteProvider({ children }: { children: React.ReactNode }) {
  const parentContext = useContext(OrganizePaletteCtx);
  if (parentContext) return children;

  return createElement(OrganizePaletteProviderRoot, null, children);
}

function OrganizePaletteProviderRoot({ children }: { children: React.ReactNode }) {
  const [openPanel, setOpenPanel] = useState<OrganizePanelName | null>(null);
  const [requestedFilterField, setRequestedFilterField] = useState<string | null>(null);
  const [requestedFilterTrigger, setRequestedFilterTrigger] = useState<HTMLButtonElement | null>(null);

  const showPanel = useCallback((panel: OrganizePanelName) => {
    setRequestedFilterField(null);
    setRequestedFilterTrigger(null);
    setOpenPanel(panel);
  }, []);

  const closePanel = useCallback(() => {
    setRequestedFilterField(null);
    setRequestedFilterTrigger(null);
    setOpenPanel(null);
  }, []);

  const togglePanel = useCallback((panel: OrganizePanelName) => {
    setRequestedFilterField(null);
    setRequestedFilterTrigger(null);
    setOpenPanel((current) => current === panel ? null : panel);
  }, []);

  const showFilterField = useCallback((fieldName: string, trigger?: HTMLButtonElement) => {
    setRequestedFilterField(fieldName);
    setRequestedFilterTrigger(trigger ?? null);
    setOpenPanel("filter");
  }, []);

  const value = useMemo(() => ({
    openPanel,
    requestedFilterField,
    requestedFilterTrigger,
    showPanel,
    closePanel,
    togglePanel,
    showFilterField,
  }), [closePanel, openPanel, requestedFilterField, requestedFilterTrigger, showFilterField, showPanel, togglePanel]);
  return createElement(OrganizePaletteCtx.Provider, { value }, children);
}

export function useOrganizePanel(panel: OrganizePanelName) {
  const ctx = useContext(OrganizePaletteCtx);
  if (!ctx) throw new Error("useOrganizePanel must be used inside <OrganizePaletteProvider>");
  const open = ctx.openPanel === panel;
  return {
    open,
    show:   () => ctx.showPanel(panel),
    close:  ctx.closePanel,
    toggle: () => ctx.togglePanel(panel),
  };
}

export function useOrganizeFilterPanel() {
  const panel = useOptionalOrganizeFilterPanel();
  if (!panel) throw new Error("useOrganizeFilterPanel must be used inside <OrganizePaletteProvider>");
  return panel;
}

export function useOptionalOrganizeFilterPanel() {
  const ctx = useContext(OrganizePaletteCtx);
  if (!ctx) return null;
  return {
    open:               ctx.openPanel === "filter",
    requestedFieldName: ctx.requestedFilterField,
    requestedTrigger:   ctx.requestedFilterTrigger,
    show:               () => ctx.showPanel("filter"),
    showField:          ctx.showFilterField,
    close:              ctx.closePanel,
    toggle:             () => ctx.togglePanel("filter"),
  };
}
