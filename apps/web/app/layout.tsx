import { type ReactNode } from "react";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Source_Serif_4 } from "next/font/google";
import { DEFAULT_PRESET } from "@athyper/theme/presets";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import "./globals.css";

const sourceSerif4 = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
});

export const metadata = {
  title: "Neon",
  description: "Business Operating Platform",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" dir="ltr" data-theme-preset={DEFAULT_PRESET}>
      <body
        className={`${GeistSans.variable} ${GeistMono.variable} ${sourceSerif4.variable} min-h-screen font-sans antialiased`}
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
