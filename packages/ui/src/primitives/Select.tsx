import { clsx } from "clsx";
import * as React from "react";

/** Props for the Select component. Extends native select attributes. */
export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

/**
 * A select dropdown with theme-aware border, background, and focus ring.
 *
 * @example
 * <Select>
 *   <option value="a">Option A</option>
 *   <option value="b">Option B</option>
 * </Select>
 */
export function Select({ className, ...props }: SelectProps) {
  return (
    <select
      className={clsx(
        "w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none",
        "focus:ring-2 focus:ring-ring/50",
        className,
      )}
      {...props}
    />
  );
}
