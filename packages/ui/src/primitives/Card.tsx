import { clsx } from "clsx";
import * as React from "react";

/** Props for the Card container component. */
export type CardProps = React.HTMLAttributes<HTMLDivElement>;

/**
 * A card container with theme-aware border, background, and shadow.
 *
 * @example
 * <Card>
 *   <h3>Title</h3>
 *   <p>Content goes here</p>
 * </Card>
 */
export function Card({ className, ...props }: CardProps) {
  return (
    <div
      className={clsx(
        "rounded-xl border border-border bg-card p-6 shadow-sm",
        className,
      )}
      {...props}
    />
  );
}
