/**
 * (dev) route group - isolated component testing pages.
 * Not included in production builds when NODE_ENV=production.
 * Access at /header-fixtures, /advanced-entity-chooser, etc.
 */

import { notFound } from "next/navigation";
import type { ReactNode } from "react";

export default function DevLayout({ children }: { children: ReactNode }) {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="flex items-center gap-3 border-b border-border bg-muted/30 px-6 py-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Dev</span>
        <span className="text-muted-foreground/40">|</span>
        <a href="/header-fixtures" className="text-xs text-muted-foreground transition-colors hover:text-foreground">
          Header Fixtures
        </a>
        <span className="text-muted-foreground/40">|</span>
        <a href="/advanced-entity-chooser" className="text-xs text-muted-foreground transition-colors hover:text-foreground">
          Advanced Entity Chooser
        </a>
      </div>
      <div className="p-6">
        {children}
      </div>
    </div>
  );
}
