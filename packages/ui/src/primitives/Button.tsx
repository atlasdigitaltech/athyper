import clsx from "clsx";
import * as React from "react";

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "primary" | "secondary" | "outline" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
};

export function Button({ className, variant = "primary", size = "default", ...props }: ButtonProps) {
  return (
    <button
      className={clsx(
        "inline-flex items-center justify-center rounded-xl text-sm font-medium transition",
        (variant === "primary" || variant === "default") && "bg-black text-white hover:opacity-90",
        variant === "secondary" && "bg-gray-100 text-black hover:bg-gray-200",
        variant === "outline" && "border border-gray-300 bg-transparent text-black hover:bg-gray-50",
        variant === "ghost" && "bg-transparent text-black hover:bg-black/5",
        size === "default" && "px-4 py-2",
        size === "sm" && "px-3 py-1.5 text-xs",
        size === "lg" && "px-6 py-3",
        size === "icon" && "size-8 p-0",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        className
      )}
      {...props}
    />
  );
}
