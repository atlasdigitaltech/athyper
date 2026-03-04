import { clsx } from "clsx";
import * as React from "react";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export function Input({ className, ...props }: InputProps) {
  return (
    <input
      className={clsx(
        "w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none",
        "focus:ring-2 focus:ring-black/10",
        className
      )}
      {...props}
    />
  );
}
