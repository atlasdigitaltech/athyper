import type { ReactNode } from "react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { getPublicBrandAssets } from "@athyper/brand";
import { getPlaneConfig } from "@athyper/session-plane";
import { DEFAULT_PRESET, getPresetMeta } from "@athyper/theme/presets";
import { PLANE_KEY } from "@/lib/plane";
import { NeonProviders } from "./providers";
import "./globals.css";

const plane = getPlaneConfig(PLANE_KEY);
const brandAssets = getPublicBrandAssets(PLANE_KEY);

export const metadata: Metadata = {
  title: plane.browserTitle,
  description: plane.productName,
  applicationName: plane.appName,
  icons: {
    icon: [{ url: brandAssets.favicon, type: "image/svg+xml" }],
    shortcut: [{ url: brandAssets.favicon, type: "image/svg+xml" }],
    apple: [{ url: brandAssets.appIcon, type: "image/svg+xml" }],
  },
};

const THEME_PRESET_COOKIE = "theme_preset";

export default async function RootLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  const initialThemePreset =
    getPresetMeta(cookieStore.get(THEME_PRESET_COOKIE)?.value ?? "")?.value ??
    getPresetMeta(plane.themePreset)?.value ??
    DEFAULT_PRESET;

  return (
    <html lang="en" dir="ltr" data-theme-preset={initialThemePreset} suppressHydrationWarning>
      <body
        className={`${GeistSans.variable} ${GeistMono.variable} min-h-screen font-sans antialiased`}
        suppressHydrationWarning
      >
        <NeonProviders>{children}</NeonProviders>
      </body>
    </html>
  );
}
