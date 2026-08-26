import React, { type HTMLAttributes, type ReactNode } from "react";

export interface ContentHeaderProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  readonly eyebrow?: ReactNode;
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly actions?: ReactNode;
  readonly titleId?: string;
  readonly variant?: "standard" | "hero";
}

/**
 * The shared heading contract for shell content across every plane.
 *
 * Keep breadcrumbs in the shell chrome. Use `actions` only for page-level
 * commands; filters and tabs belong immediately after this header.
 */
export function ContentHeader({
  eyebrow,
  title,
  description,
  actions,
  titleId = "page-title",
  variant = "standard",
  className,
  ...props
}: ContentHeaderProps) {
  const classes = ["athyper-content-header", `athyper-content-header--${variant}`, className].filter(Boolean).join(" ");

  return (
    <header className={classes} data-slot="content-header" data-has-eyebrow={eyebrow ? "true" : "false"} aria-labelledby={titleId} {...props}>
      <div className="athyper-content-header__copy">
        {eyebrow ? <p className="athyper-content-header__eyebrow">{eyebrow}</p> : null}
        <h1 className="athyper-content-header__title" id={titleId}>{title}</h1>
        {description ? <p className="athyper-content-header__description">{description}</p> : null}
      </div>
      {actions ? <div className="athyper-content-header__actions">{actions}</div> : null}
    </header>
  );
}
