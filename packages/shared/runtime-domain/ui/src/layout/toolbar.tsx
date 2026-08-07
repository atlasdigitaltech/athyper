import { type ReactNode, type HTMLAttributes } from "react";
import { cn } from "@athyper/platform-theme/utils";

export interface ToolbarProps extends HTMLAttributes<HTMLDivElement> {
  left?: ReactNode;
  right?: ReactNode;
}

export function Toolbar({ left, right, className, children, ...props }: ToolbarProps) {
  return (
    <div className={cn("flex items-center justify-between gap-4 py-2", className)} {...props}>
      <div className="flex items-center gap-2">{left ?? children}</div>
      {right && <div className="flex items-center gap-2">{right}</div>}
    </div>
  );
}
