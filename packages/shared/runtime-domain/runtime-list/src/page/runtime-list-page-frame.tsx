import type { ReactNode } from "react";

export interface RuntimeListPageFrameProps {
  eyebrow?: string;
  title?: string;
  description?: string;
  commandBar?: ReactNode;
  actions?: ReactNode;
  toolbar?: ReactNode;
  children: ReactNode;
}

/** Canonical frame for every runtime entity list, independent of app branding. */
export function RuntimeListPageFrame({
  eyebrow,
  title,
  description,
  commandBar,
  actions,
  toolbar,
  children,
}: RuntimeListPageFrameProps) {
  const hasHeader = commandBar || eyebrow || title || description || actions || toolbar;

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 overflow-auto bg-muted/20 [scrollbar-gutter:stable] md:overflow-hidden md:[scrollbar-gutter:auto]">
      <div className="flex min-h-full min-w-0 w-full flex-col gap-2.5 md:h-full md:min-h-0">
        {hasHeader && (
          <div className="w-full min-w-0 shrink-0 overflow-hidden rounded-xl border bg-card px-3 py-3 shadow-sm sm:px-4">
            {commandBar ? commandBar : (
              <>
                <div className="flex min-w-0 items-start justify-between gap-4">
                  <div className="min-w-0">
                    {eyebrow && <p className="mb-1 truncate text-xs text-muted-foreground">{eyebrow}</p>}
                    {title && <h1 className="truncate text-xl font-semibold leading-tight text-foreground">{title}</h1>}
                    {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
                  </div>
                  {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
                </div>
                {toolbar && <div className="min-w-0 border-t pt-3">{toolbar}</div>}
              </>
            )}
          </div>
        )}
        <div
          className="min-w-0 md:min-h-0 md:flex-1 md:overflow-auto md:[scrollbar-gutter:stable]"
          data-runtime-list-scroll-root
        >
          {children}
        </div>
      </div>
    </div>
  );
}
