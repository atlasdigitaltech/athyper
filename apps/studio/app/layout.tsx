import "@athyper/platform-entity-list-view/styles.css";
import "./bank-directory.css";
import "@athyper/platform-theme/styles.css";
import "@athyper/platform-iam-identity-gate/styles.css";
import "@athyper/product-studio-shell/styles.css";
import "@athyper/platform-shell-activity-center-data/styles.css";
import { getPlaneWebMetadata } from "@athyper/platform-iam-identity-gate";
import { ThemeScript } from "@athyper/platform-theme";
import { resolveRequestLocale, textDirection } from "@athyper/platform-i18n";
import { GeistSans } from "geist/font/sans";
import type { Metadata, Viewport } from "next";
import { cookies, headers } from "next/headers";
const brand = getPlaneWebMetadata("studio");
export const metadata: Metadata = { applicationName: brand.applicationName, title: { default: brand.title, template: brand.titleTemplate }, description: brand.description, manifest: brand.manifest, icons: { icon: [{ url: brand.favicon, type: "image/svg+xml", sizes: "any" }], apple: [{ url: brand.appleTouchIcon, type: "image/png", sizes: "64x64" }] } };
export const viewport: Viewport = { themeColor: brand.themeColor, colorScheme: "light dark" };
export default async function RootLayout({ children }: { readonly children: React.ReactNode }) { const [cookieStore,headerStore]=await Promise.all([cookies(),headers()]);const locale=resolveRequestLocale({cookieLocale:cookieStore.get("athyper_locale")?.value,acceptLanguage:headerStore.get("accept-language")});return <html lang={locale} dir={textDirection(locale)} suppressHydrationWarning className={GeistSans.variable}><head><ThemeScript /></head><body>{children}</body></html>; }
