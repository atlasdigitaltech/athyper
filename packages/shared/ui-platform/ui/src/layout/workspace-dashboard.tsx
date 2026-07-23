import { type HTMLAttributes, type ReactNode } from "react";
import { cn } from "@athyper/theme/utils";

export function WorkspaceDashboard({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <main className={cn("mx-auto w-full max-w-[1680px] space-y-6 p-5 sm:p-7 lg:p-9", className)} {...props} />;
}

export interface WorkspaceDashboardHeaderProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}

export function WorkspaceDashboardHeader({ eyebrow, title, description, actions, className, ...props }: WorkspaceDashboardHeaderProps) {
  return (
    <header className={cn("flex flex-wrap items-start justify-between gap-4", className)} {...props}>
      <div className="min-w-0">
        {eyebrow ? <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{eyebrow}</p> : null}
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? <div className="mt-1 text-sm text-muted-foreground">{description}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export interface WorkspaceDashboardSectionProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  panel?: boolean;
}

export function WorkspaceDashboardSection({ title, description, actions, children, panel = false, className, ...props }: WorkspaceDashboardSectionProps) {
  return (
    <section className={cn(panel && "rounded-xl border bg-card p-5", className)} {...props}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">{title}</h2>
          {description ? <div className="mt-1 text-sm text-muted-foreground">{description}</div> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function WorkspaceCardGrid({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("grid gap-3 md:grid-cols-2 xl:grid-cols-3", className)} {...props} />;
}
