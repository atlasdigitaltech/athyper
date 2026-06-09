import { type ReactNode, type HTMLAttributes } from "react";
import { cn } from "@athyper/theme/utils";

type PageFrameWidth = "narrow" | "default" | "wide" | "full";

const WIDTH_CLASS: Record<PageFrameWidth, string> = {
  narrow:  "max-w-content-sm  w-full",
  default: "max-w-content-md  w-full",
  wide:    "max-w-content-lg  w-full",
  full:    "max-w-content-full w-full",
};

export interface PageFrameProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  width?: PageFrameWidth;
}

export function PageFrame({ title, description, actions, children, className, width, ...props }: PageFrameProps) {
  return (
    <div className={cn("flex flex-col gap-3", width && WIDTH_CLASS[width], className)} {...props}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-4">
          <div>
            {title && <h1 className="text-xl font-medium tracking-tight text-foreground">{title}</h1>}
            {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
          </div>
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </div>
      )}
      {children}
    </div>
  );
}
