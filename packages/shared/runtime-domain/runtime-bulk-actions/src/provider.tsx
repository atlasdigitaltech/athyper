"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { BulkActionsConfig } from "./types";
import { BULK_MAX_IDS } from "./types";

const RuntimeBulkActionsContext = createContext<Required<BulkActionsConfig> | null>(null);

export interface RuntimeBulkActionsProviderProps {
  config:   BulkActionsConfig;
  children: ReactNode;
}

export function RuntimeBulkActionsProvider({
  config,
  children,
}: RuntimeBulkActionsProviderProps) {
  const resolved: Required<BulkActionsConfig> = {
    bulkClient:        config.bulkClient,
    maxIds:            config.maxIds            ?? BULK_MAX_IDS,
    preflightDebounce: config.preflightDebounce ?? 300,
    preflightCap:      config.preflightCap      ?? 200,
  };
  return (
    <RuntimeBulkActionsContext.Provider value={resolved}>
      {children}
    </RuntimeBulkActionsContext.Provider>
  );
}

export function useBulkActionsConfig(): Required<BulkActionsConfig> {
  const ctx = useContext(RuntimeBulkActionsContext);
  if (!ctx) {
    throw new Error(
      "useBulkActionsConfig: missing <RuntimeBulkActionsProvider>. " +
      "Wrap the app shell with the provider and pass a BulkClient.",
    );
  }
  return ctx;
}
