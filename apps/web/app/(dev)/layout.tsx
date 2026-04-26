/**
 * (dev) route group — isolated component testing pages.
 * Not included in production builds when NODE_ENV=production.
 * Access at /header-fixtures, /header-fixtures/[fixture], etc.
 */

import { notFound } from "next/navigation";
import type { ReactNode } from "react";

export default function DevLayout({ children }: { children: ReactNode }) {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="border-b border-border px-6 py-3 bg-muted/30 flex items-center gap-3">
        <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Dev</span>
        <span className="text-muted-foreground/40">·</span>
        <a href="/header-fixtures" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
          Header Fixtures
        </a>
      </div>
      <div className="p-6">
        {children}
      </div>
    </div>
  );
}
