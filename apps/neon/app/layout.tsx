import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { createPlaneMetadata } from "@athyper/app-foundation";
import { getPlaneConfig } from "@athyper/platform-iam-session-plane";
import { DEFAULT_PRESET, getPresetMeta } from "@athyper/platform-theme/presets";
import { PLANE_KEY } from "@/lib/plane";
import { NeonProviders } from "./providers";
import "./globals.css";

const plane = getPlaneConfig(PLANE_KEY);
export const metadata = createPlaneMetadata(PLANE_KEY);

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
