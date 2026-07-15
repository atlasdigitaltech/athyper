"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import {
  DEFAULT_USER_DATE_FORMAT,
  DEFAULT_USER_LOCALE,
  DEFAULT_USER_TIME_ZONE,
  normalizeUserDateFormat,
} from "./date-format";

export interface RuntimeUserPreferences {
  locale: string;
  dateFormat: string;
  timeZone: string;
}

export interface RuntimeUserPreferencesInput {
  locale?: string | null;
  dateFormat?: string | null;
  timeZone?: string | null;
}

const DEFAULT_RUNTIME_USER_PREFERENCES: RuntimeUserPreferences = {
  locale: DEFAULT_USER_LOCALE,
  dateFormat: DEFAULT_USER_DATE_FORMAT,
  timeZone: DEFAULT_USER_TIME_ZONE,
};

const RuntimeUserPreferencesContext = createContext<RuntimeUserPreferences>(DEFAULT_RUNTIME_USER_PREFERENCES);

function normalizePreferences(value: RuntimeUserPreferencesInput | undefined): RuntimeUserPreferences {
  return {
    locale: value?.locale?.trim() || DEFAULT_USER_LOCALE,
    dateFormat: normalizeUserDateFormat(value?.dateFormat),
    timeZone: value?.timeZone?.trim() || DEFAULT_USER_TIME_ZONE,
  };
}

export function RuntimeUserPreferencesProvider({
  value,
  children,
}: {
  value?: RuntimeUserPreferencesInput;
  children: ReactNode;
}) {
  const normalized = useMemo(
    () => normalizePreferences(value),
    [value?.dateFormat, value?.locale, value?.timeZone],
  );

  return (
    <RuntimeUserPreferencesContext.Provider value={normalized}>
      {children}
    </RuntimeUserPreferencesContext.Provider>
  );
}

export function useRuntimeUserPreferences(): RuntimeUserPreferences {
  return useContext(RuntimeUserPreferencesContext);
}
