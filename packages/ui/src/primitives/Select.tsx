import { clsx } from "clsx";
import * as React from "react";

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

export function Select({ className, ...props }: SelectProps) {
  return (
    <select
      className={clsx(
        "w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none",
        "focus:ring-2 focus:ring-black/10",
        className
      )}
      {...props}
    />
  );
}
