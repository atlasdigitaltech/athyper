import "@athyper/platform-theme/styles.css";
import "@athyper/platform-iam-identity-gate/styles.css";
import "@athyper/product-mesh-shell/styles.css";
import "@athyper/platform-verification/styles.css";
import { getPlaneWebMetadata } from "@athyper/platform-iam-identity-gate";
import { ThemeScript } from "@athyper/platform-theme";
import { GeistSans } from "geist/font/sans";
import type { Metadata, Viewport } from "next";
const brand = getPlaneWebMetadata("mesh");
export const metadata: Metadata = { applicationName: brand.applicationName, title: { default: brand.title, template: brand.titleTemplate }, description: brand.description, manifest: brand.manifest, icons: { icon: [{ url: brand.favicon, type: "image/png", sizes: "64x64" }], apple: [{ url: brand.appleTouchIcon, type: "image/png", sizes: "64x64" }] } };
export const viewport: Viewport = { themeColor: brand.themeColor, colorScheme: "light dark" };
export default function RootLayout({ children }: { readonly children: React.ReactNode }) { return <html lang="en" suppressHydrationWarning className={GeistSans.variable}><head><ThemeScript platformDefault="light" /></head><body>{children}</body></html>; }
