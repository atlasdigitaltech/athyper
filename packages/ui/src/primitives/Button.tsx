import clsx from "clsx";
import * as React from "react";

/**
 * A button component with multiple visual variants and sizes.
 *
 * @example
 * <Button variant="primary">Save</Button>
 * <Button variant="outline" size="sm">Cancel</Button>
 */
export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Visual style of the button. Defaults to "primary". */
  variant?: "default" | "primary" | "secondary" | "outline" | "ghost";
  /** Size preset. "icon" renders a square button for icon-only use. */
  size?: "default" | "sm" | "lg" | "icon";
};

export function Button({
  className,
  variant = "primary",
  size = "default",
  ...props
}: ButtonProps) {
  return (
    <button
      className={clsx(
        "inline-flex items-center justify-center rounded-xl text-sm font-medium transition",
        (variant === "primary" || variant === "default") &&
          "bg-primary text-primary-foreground hover:opacity-90",
        variant === "secondary" &&
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        variant === "outline" &&
          "border border-border bg-transparent text-foreground hover:bg-accent",
        variant === "ghost" &&
          "bg-transparent text-foreground hover:bg-accent",
        size === "default" && "px-4 py-2",
        size === "sm" && "px-3 py-1.5 text-xs",
        size === "lg" && "px-6 py-3",
        size === "icon" && "size-8 p-0",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        className,
      )}
      {...props}
    />
  );
}
