"use client";
import type { ReactNode } from "react";
import { PageWorkspace } from "@athyper/platform-shell";

/** Shared page frame for BP surfaces: avoids nesting a second main/h1 inside the shell's own Main. contentOnly defers header ownership to an ancestor (e.g. an intake step chrome); toolbar renders content search/filter controls above the body, per the shared page-toolbar convention. */
export function BusinessPartnerPageFrame({
  title,
  description,
  actions,
  toolbar,
  contentOnly = false,
  className,
  children,
}: {
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly actions?: ReactNode;
  readonly toolbar?: ReactNode;
  readonly contentOnly?: boolean;
  readonly className?: string;
  readonly children?: ReactNode;
}) {
  return contentOnly ? (
    <section className={className}>
      {toolbar}
      {children}
    </section>
  ) : (
    <PageWorkspace header={{ level: "collection", title, description, actions }} toolbar={toolbar} className={className}>
      {children}
    </PageWorkspace>
  );
}
