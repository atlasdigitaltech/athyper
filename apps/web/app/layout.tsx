import { type ReactNode } from "react";
import { cookies } from "next/headers";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { DEFAULT_PRESET } from "@athyper/theme/presets";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { normalizeThemePreset, THEME_PRESET_COOKIE } from "@/lib/preferences/ui-profile";
import "./globals.css";

export const metadata = {
  title: "Neon",
  description: "Business Operating Platform",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  const initialThemePreset =
    normalizeThemePreset(cookieStore.get(THEME_PRESET_COOKIE)?.value) ?? DEFAULT_PRESET;

  return (
    <html lang="en" dir="ltr" data-theme-preset={initialThemePreset} suppressHydrationWarning>
      <body
        className={`${GeistSans.variable} ${GeistMono.variable} min-h-screen font-sans antialiased`}
        suppressHydrationWarning
      >
        <QueryProvider>
          <ThemeProvider />
          {children}
        </QueryProvider>
      </body>
    </html>
  );
}
