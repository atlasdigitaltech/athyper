"use client";

import React, { createContext, createElement, useContext, useEffect, useMemo, type HTMLAttributes, type ReactNode } from "react";
import { createIntlRuntime, textDirection, type EffectiveLocalization, type IntlRuntime, type LocalizationDiagnostic, type MessageCatalog, type MessageValues } from "./index";

const IntlContext = createContext<IntlRuntime | undefined>(undefined);

export interface IntlProviderProps {
  readonly localization: EffectiveLocalization;
  readonly messages: MessageCatalog;
  readonly fallbackMessages?: MessageCatalog;
  readonly onDiagnostic?: (event: LocalizationDiagnostic) => void;
  readonly children: ReactNode;
}

export function IntlProvider({ localization, messages, fallbackMessages, onDiagnostic, children }: IntlProviderProps) {
  const runtime = useMemo(() => createIntlRuntime({ localization, messages, ...(fallbackMessages ? { fallbackMessages } : {}), ...(onDiagnostic ? { onDiagnostic } : {}) }), [localization, messages, fallbackMessages, onDiagnostic]);
  useEffect(() => { document.documentElement.lang = localization.uiLocale; document.documentElement.dir = localization.direction; document.cookie = `athyper_locale=${encodeURIComponent(localization.uiLocale)}; Path=/; Max-Age=31536000; SameSite=Lax`; }, [localization.uiLocale, localization.direction]);
  return <IntlContext.Provider value={runtime}>{children}</IntlContext.Provider>;
}

export function useI18n(): IntlRuntime {
  const value = useContext(IntlContext);
  if (!value) throw new Error("useI18n must be used inside IntlProvider");
  return value;
}

export function useOptionalI18n(): IntlRuntime | undefined { return useContext(IntlContext); }

export function Message({ id, values }: { readonly id: string; readonly values?: MessageValues }) { return <>{useI18n().message(id, values)}</>; }

export function BidiText({ children, locale, dir = "auto", ...props }: Omit<HTMLAttributes<HTMLElement>, "dir"> & { readonly children: ReactNode; readonly locale?: string; readonly dir?: "auto" | "ltr" | "rtl" }) {
  return createElement("bdi", { ...props, dir: locale ? textDirection(locale) : dir }, children);
}

export function CodeText({ children, ...props }: HTMLAttributes<HTMLElement>) { return createElement("bdi", { ...props, dir: "ltr" }, children); }
