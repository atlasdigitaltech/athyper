import React, { type HTMLAttributes, type ReactNode } from "react";

export type PageFrameWidth = "content" | "wide" | "full";
export type PageHeaderLevel = "workspace" | "module" | "collection";

export interface PageFrameProps extends HTMLAttributes<HTMLElement> {
  readonly width?: PageFrameWidth;
  readonly titleId?: string;
}

export interface PageHeaderProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  readonly level: PageHeaderLevel;
  readonly context?: ReactNode;
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly icon?: ReactNode;
  readonly metadata?: ReactNode;
  readonly supportingRow?: ReactNode;
  readonly actions?: ReactNode;
  readonly titleId?: string;
}

export interface SectionNavigationItem {
  readonly href: string;
  readonly label: ReactNode;
}

export interface SectionNavigationProps extends HTMLAttributes<HTMLElement> {
  readonly items: readonly SectionNavigationItem[];
  readonly currentHref?: string;
  readonly label: string;
}

export function PageFrame({ width = "content", titleId = "page-title", className, children, ...props }: PageFrameProps) {
  return <section className={["athyper-page-frame", `athyper-page-frame--${width}`, className].filter(Boolean).join(" ")} aria-labelledby={titleId} {...props}>{children}</section>;
}

export function PageHeader({ level, context, title, description, icon, metadata, actions, supportingRow, titleId = "page-title", className, ...props }: PageHeaderProps) {
  return <header className={["athyper-page-header", `athyper-page-header--${level}`, className].filter(Boolean).join(" ")} data-slot="page-header" aria-labelledby={titleId} {...props}>
    {icon ? <span className="athyper-page-header__icon" aria-hidden="true">{icon}</span> : null}
    <div className="athyper-page-header__body">
      {context ? <p className="athyper-page-header__context">{context}</p> : null}
      <div className="athyper-page-header__heading">
        <h1 id={titleId}>{title}</h1>
        {metadata ? <div className="athyper-page-header__metadata">{metadata}</div> : null}
      </div>
      {description ? <p className="athyper-page-header__description">{description}</p> : null}
    </div>
    {actions ? <div className="athyper-page-header__actions">{actions}</div> : null}
    {supportingRow ? <div className="athyper-page-header__supporting-row">{supportingRow}</div> : null}
  </header>;
}

export function SectionNavigation({ items, currentHref, label, className, ...props }: SectionNavigationProps) {
  return <nav className={["athyper-section-nav", className].filter(Boolean).join(" ")} aria-label={label} {...props}>
    {items.map((item) => <a key={item.href} href={item.href} aria-current={item.href === currentHref ? "page" : undefined}>{item.label}</a>)}
  </nav>;
}
