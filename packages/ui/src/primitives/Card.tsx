import { clsx } from "clsx";
import * as React from "react";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx("rounded-xl border border-black/10 bg-white p-6 shadow-sm", className)}
      {...props}
    />
  );
}
