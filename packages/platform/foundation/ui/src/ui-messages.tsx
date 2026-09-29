"use client";

import { createContext, useContext, type ReactNode } from "react";

/** Localized copy used by foundation controls. Product-specific content remains
 * with its owning surface; these are reusable control and accessibility labels. */
export interface UiMessages {
  readonly closePanel: string;
  readonly closeDialog: string;
  readonly drawerPanel: string;
  readonly notifications: string;
  readonly loading: string;
  readonly chooseDate: string;
  readonly loadingCalendar: string;
  readonly clearSearch: string;
  readonly selectedAndAvailable: (selected: number, available: number) => string;
  readonly companyAndLegalEntityCount: (companies: number, legalEntities: number) => string;
  readonly legalEntity: (code: string) => string;
  readonly companyDetails: (code: string, country: string, currency: string) => string;
  readonly noMatchingCompanies: string;
}

export const englishUiMessages: UiMessages = Object.freeze({
  closePanel: "Close panel", closeDialog: "Close dialog", drawerPanel: "Drawer panel",
  notifications: "Notifications", loading: "Loading", chooseDate: "Choose date",
  loadingCalendar: "Loading calendar…", clearSearch: "Clear search",
  selectedAndAvailable: (selected: number, available: number) => `${selected} selected · ${available} available`,
  companyAndLegalEntityCount: (companies: number, legalEntities: number) => `${companies} ${companies === 1 ? "company" : "companies"} · ${legalEntities} ${legalEntities === 1 ? "legal entity" : "legal entities"}`,
  legalEntity: (code: string) => `Legal entity · ${code}`,
  companyDetails: (code: string, country: string, currency: string) => `${code} · ${country} · ${currency}`,
  noMatchingCompanies: "No permitted companies match your search.",
});

const UiMessagesContext = createContext<UiMessages>(englishUiMessages);
export function UiMessagesProvider({ messages, children }: { readonly messages: UiMessages; readonly children: ReactNode }) { return <UiMessagesContext.Provider value={messages}>{children}</UiMessagesContext.Provider>; }
export function useUiMessages(): UiMessages { return useContext(UiMessagesContext); }
