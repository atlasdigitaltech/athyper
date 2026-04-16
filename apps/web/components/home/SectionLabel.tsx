import type { ReactNode } from "react";

/** Consistent section heading used across workspace-home launcher pages. */
export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </h2>
  );
}
