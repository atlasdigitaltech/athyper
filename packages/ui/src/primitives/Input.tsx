import { clsx } from "clsx";
import * as React from "react";

/** Props for the Input component. Extends native input attributes. */
export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

/**
 * A text input with theme-aware border, background, and focus ring.
 *
 * @example
 * <Input placeholder="Enter your name" />
 * <Input type="email" disabled />
 */
export function Input({ className, ...props }: InputProps) {
  return (
    <input
      className={clsx(
        "w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none",
        "focus:ring-2 focus:ring-ring/50",
        className,
      )}
      {...props}
    />
  );
}
