"use client";
import type { ReactNode } from "react";
import { PageWorkspace } from "@athyper/platform-shell";

/** Avoids nesting a second main/h1 inside the shell's own Main — same pattern as the Business Partner plane's BusinessPartnerPageFrame; not shared across planes by design. */
export function WorkforcePageFrame({
  title,
  description,
  actions,
  className,
  children,
}: {
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly actions?: ReactNode;
  readonly className?: string;
  readonly children?: ReactNode;
}) {
  return (
    <PageWorkspace header={{ level: "collection", title, description, actions }} className={className}>
      {children}
    </PageWorkspace>
  );
}
