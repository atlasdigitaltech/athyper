import * as React from "react";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";

function classes(...values: Array<string | undefined | false>): string { return values.filter(Boolean).join(" "); }

export function ActionLink({ variant = "contrast", className, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { readonly variant?: "primary" | "contrast" | "secondary" | "ghost" }) {
  return <a {...props} className={classes("a-action", `a-action--${variant}`, className)} />;
}

export function ActionButton({ variant = "contrast", className, type = "button", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { readonly variant?: "primary" | "contrast" | "secondary" | "ghost" }) {
  return <button {...props} type={type} className={classes("a-action", `a-action--${variant}`, className)} />;
}

export function PresentationCard(props: HTMLAttributes<HTMLElement>) {
  return <section {...props} className={classes("a-presentation-card", props.className)} />;
}

export function Notice({ title, icon, tone = "warning", children, className, ...props }: HTMLAttributes<HTMLDivElement> & { readonly title: string; readonly icon?: ReactNode; readonly tone?: "warning" | "danger" | "info" }) {
  return <div {...props} className={classes("a-notice", `a-notice--${tone}`, className)}>{icon ? <span className="a-notice__icon" aria-hidden="true">{icon}</span> : null}<div className="a-notice__copy"><strong>{title}</strong><span>{children}</span></div></div>;
}

export function Heading(props: HTMLAttributes<HTMLHeadingElement>) { return <h1 {...props} className={classes("a-heading", props.className)} />; }
export function SupportingText(props: HTMLAttributes<HTMLParagraphElement>) { return <p {...props} className={classes("a-supporting-text", props.className)} />; }
export function Eyebrow(props: HTMLAttributes<HTMLParagraphElement>) { return <p {...props} className={classes("a-eyebrow", props.className)} />; }
export function MetaText(props: HTMLAttributes<HTMLParagraphElement>) { return <p {...props} className={classes("a-meta-text", props.className)} />; }
export function StatusBadge(props: HTMLAttributes<HTMLSpanElement>) { return <span {...props} className={classes("a-status-badge", props.className)} />; }

export function SelectionCard({ className, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} type={props.type ?? "button"} className={classes("a-selection-card", className)}>{children}</button>;
}

export function Spinner({ label }: { readonly label?: string }) { return <span className="a-spinner a-spinner--large" aria-label={label} aria-hidden={label ? undefined : true} />; }
export function ScreenReaderText(props: HTMLAttributes<HTMLSpanElement>) { return <span {...props} className={classes("a-visually-hidden", props.className)} />; }
