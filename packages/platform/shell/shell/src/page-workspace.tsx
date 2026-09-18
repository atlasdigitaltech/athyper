import React, { type ReactNode } from "react";
import { PageFrame, PageHeader, type PageFrameProps, type PageHeaderProps } from "./page-foundation";

export interface PageWorkspaceProps extends PageFrameProps {
  /** Omit when an ancestor owns the collection header; never infer ownership from the URL. */
  readonly header?: PageHeaderProps | React.ReactElement;
  readonly navigation?: ReactNode;
  readonly status?: ReactNode;
  readonly toolbar?: ReactNode;
  readonly actions?: ReactNode;
  readonly actionOutcome?: ReactNode;
}

/** Composition only: resource recovery, authorization, focus and history remain with the runtime. */
export function PageWorkspace({ header, navigation, status, toolbar, actions, actionOutcome, titleId = "page-title", className, children, ...props }: PageWorkspaceProps) {
  return <PageFrame {...props} titleId={titleId} className={["athyper-page-workspace", className].filter(Boolean).join(" ")}>
    {header ? React.isValidElement(header) ? header : <PageHeader {...header as PageHeaderProps} titleId={titleId} /> : null}
    {navigation}
    <div className="athyper-page-workspace__status" data-slot="page-status">{status}</div>
    {toolbar ? <div data-slot="page-toolbar">{toolbar}</div> : null}
    <div className="athyper-page-workspace__body" data-slot="page-body">{children}</div>
    <div className="athyper-page-workspace__actions" data-slot="page-actions">
      {actions}
      {actionOutcome}
    </div>
  </PageFrame>;
}

export interface PlanePageFrameProps {
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly actions?: ReactNode;
  readonly toolbar?: ReactNode;
  readonly contentOnly?: boolean;
  readonly className?: string;
  readonly children?: ReactNode;
}

/** Shared page frame for plane-local surfaces: avoids nesting a second main/h1 inside the shell's own Main. contentOnly defers header ownership to an ancestor (e.g. an intake step chrome); toolbar renders content search/filter controls above the body, per the shared page-toolbar convention. */
export function PlanePageFrame({ title, description, actions, toolbar, contentOnly = false, className, children }: PlanePageFrameProps) {
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

type PageLayoutSlots =
  | { readonly variant?: "content"; readonly sectionNavigation?: never; readonly overview?: never }
  | { readonly variant: "sections-content"; readonly sectionNavigation: ReactNode; readonly overview?: never }
  | { readonly variant: "sections-content-overview"; readonly sectionNavigation: ReactNode; readonly overview: ReactNode };

export type PageLayoutProps = PageLayoutSlots & {
  readonly children: ReactNode;
  readonly className?: string;
};

/** One document scroll surface. Supplied navigation keeps its existing scroll/switch behavior. */
export function PageLayout({ variant = "content", sectionNavigation, overview, children, className }: PageLayoutProps) {
  return <div className={["athyper-page-layout", `athyper-page-layout--${variant}`, className].filter(Boolean).join(" ")}>
    {variant !== "content" ? <div data-slot="section-navigation">{sectionNavigation}</div> : null}
    <div data-slot="page-content">{children}</div>
    {variant === "sections-content-overview" ? <div data-slot="overview-panel">{overview}</div> : null}
  </div>;
}
