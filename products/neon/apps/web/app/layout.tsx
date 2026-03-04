import "./globals.css";
import { getIntl, isValidLocale } from "@athyper/i18n";
import { cookies } from "next/headers";

import type { Locale } from "@athyper/i18n";
import type { Metadata } from "next";

import { Toaster } from "@/components/ui/sonner";
import { APP_CONFIG } from "@/config/app-config";
import { fontVars } from "@/lib/fonts/registry";
import { MessagesProvider } from "@/lib/i18n/messages-context";
import { PREFERENCE_DEFAULTS } from "@/lib/preferences/preferences-config";
import { getSessionBootstrap } from "@/lib/session-bootstrap";
import { ThemeBootScript } from "@/scripts/theme-boot";
import { PreferencesStoreProvider } from "@/stores/preferences/preferences-provider";

export const metadata: Metadata = {
  title: APP_CONFIG.meta.title,
  description: APP_CONFIG.meta.description,
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const bootstrap = await getSessionBootstrap();
  const cookieStore = await cookies();
  const rawLocale = cookieStore.get("neon_locale")?.value ?? "en";
  const locale = isValidLocale(rawLocale) ? rawLocale : ("en" as Locale);
  const dir = locale === "ar" ? "rtl" : "ltr";
  const intl = await getIntl(locale);

  const {
    theme_mode,
    theme_preset,
    content_layout,
    navbar_style,
    sidebar_variant,
    sidebar_collapsible,
    font,
  } = PREFERENCE_DEFAULTS;

  return (
    <html
      lang={locale}
      dir={dir}
      data-theme-mode={theme_mode}
      data-theme-preset={theme_preset}
      data-content-layout={content_layout}
      data-navbar-style={navbar_style}
      data-sidebar-variant={sidebar_variant}
      data-sidebar-collapsible={sidebar_collapsible}
      data-font={font}
      suppressHydrationWarning
    >
      <head>
        <ThemeBootScript />
      </head>
      <body className={`${fontVars} min-h-screen antialiased`}>
        {bootstrap && (
          <script
            dangerouslySetInnerHTML={{
              __html: `window.__SESSION_BOOTSTRAP__=${JSON.stringify(bootstrap)}`,
            }}
          />
        )}
        <MessagesProvider
          messages={intl.messages as Record<string, string>}
          locale={locale}
        >
          <PreferencesStoreProvider
            themeMode={theme_mode}
            themePreset={theme_preset}
            contentLayout={content_layout}
            navbarStyle={navbar_style}
            font={font}
          >
            {children}
            <Toaster />
          </PreferencesStoreProvider>
        </MessagesProvider>
      </body>
    </html>
  );
}
