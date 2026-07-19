import type { ReactNode } from "react";
import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { getPublicBrandAssets } from "@athyper/brand";
import { getPlaneConfig } from "@athyper/session-plane";
import { PLANE_KEY } from "@/lib/plane";
import { AdminProviders } from "./providers";
import "./globals.css";

const plane = getPlaneConfig(PLANE_KEY);
const brandAssets = getPublicBrandAssets(PLANE_KEY);

export const metadata: Metadata = {
  title: plane.browserTitle,
  description: plane.productName,
  applicationName: plane.appName,
  icons: {
    icon: [{ url: brandAssets.favicon, type: "image/png" }],
    shortcut: [{ url: brandAssets.favicon, type: "image/png" }],
    apple: [{ url: brandAssets.appIcon, type: "image/png" }],
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" dir="ltr" data-theme-preset={plane.themePreset} suppressHydrationWarning>
      <body
        className={`${GeistSans.variable} ${GeistMono.variable} min-h-screen font-sans antialiased`}
        suppressHydrationWarning
      >
        <AdminProviders>{children}</AdminProviders>
      </body>
    </html>
  );
}
