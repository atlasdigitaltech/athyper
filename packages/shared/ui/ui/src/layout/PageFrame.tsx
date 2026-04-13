import { type ReactNode, type HTMLAttributes } from "react";
import { cn } from "@athyper/theme/utils";

export interface PageFrameProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}

export function PageFrame({ title, description, actions, children, className, ...props }: PageFrameProps) {
  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      {(title || actions) && (
        <div className="flex items-start justify-between gap-4">
          <div>
            {title && <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>}
            {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
          </div>
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </div>
      )}
      {children}
    </div>
  );
}
