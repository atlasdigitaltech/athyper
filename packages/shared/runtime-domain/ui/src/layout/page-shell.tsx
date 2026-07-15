/**
 * PageShell — spec §1 three-region layout
 *
 * Every screen in the entity runtime uses exactly this structure:
 *
 *   PAGE (flex col gap-2.5)
 *   ├── Region 1 · Header card    — identity + actions
 *   ├── Region 2 · Context card   — search+filters | tabs | stepper (optional)
 *   └── Region 3 · Content card   — DataTable | KV sections | form+rail
 *
 * The outer shell layout (ShellLayout) already provides px-4 py-2 lg:px-6 lg:py-3.
 * PageShell adds no outer padding — only the gap and the per-region card styling.
 *
 * Usage:
 *   <PageShell
 *     header={<PageHeader .../>}
 *     context={<TabStrip .../>}
 *   >
 *     <DataTable .../>
 *   </PageShell>
 */

import { type ReactNode } from "react";
import { cn } from "@athyper/theme/utils";

export interface PageShellProps {
  /** Region 1 — identity row + actions (always present). */
  header: ReactNode;
  /** Region 2 — context bar: search+filters, tabs, or stepper (omit if none). */
  context?: ReactNode;
  /** Region 3 — main content: table, KV sections, or form. */
  children: ReactNode;
  className?: string;
}

export function PageShell({ header, context, children, className }: PageShellProps) {
  return (
    <div className={cn("flex flex-col gap-2.5", className)}>
      {/* Region 1 — Header */}
      <div className="rounded-xl border border-border bg-card px-4 py-3">
        {header}
      </div>

      {/* Region 2 — Context bar (optional) */}
      {context && (
        <div className="flex h-9 items-center rounded-xl border border-border bg-card px-4">
          {context}
        </div>
      )}

      {/* Region 3 — Content */}
      <div className="rounded-xl border border-border bg-card p-4">
        {children}
      </div>
    </div>
  );
}
