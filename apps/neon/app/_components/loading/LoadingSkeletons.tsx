import type { ReactNode } from "react";
import { PlaneAppBootstrapSkeleton } from "@athyper/app-foundation";
import { Skeleton } from "@athyper/ui/primitives";
import { DelayedLoadingMessage } from "./DelayedLoadingMessage";

function LoadingProgressBar() {
  return (
    <div
      className="h-0.5 w-full overflow-hidden bg-primary/10"
      role="progressbar"
      aria-label="Loading"
    >
      <div className="neon-loading-progress h-full w-2/5 bg-primary motion-reduce:w-full" />
    </div>
  );
}

export function RouteLoadingFrame({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <section className="relative min-h-[60vh]" aria-busy="true" aria-label={label}>
      <div className="absolute inset-x-0 top-0">
        <LoadingProgressBar />
      </div>
      <div className="space-y-3 pt-4">
        <DelayedLoadingMessage label={label} />
        <div aria-hidden="true">{children}</div>
      </div>
    </section>
  );
}

export function GenericPageSkeleton() {
  return (
    <div className="mx-auto w-full max-w-screen-2xl space-y-5">
      <div className="flex items-center justify-between gap-6">
        <div className="space-y-2">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-7 w-52" />
        </div>
        <Skeleton className="h-9 w-24" />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="rounded-xl border bg-card p-4">
            <Skeleton className="mb-4 h-4 w-24" />
            <Skeleton className="h-8 w-32" />
          </div>
        ))}
      </div>
      <div className="rounded-xl border bg-card p-5">
        <Skeleton className="mb-5 h-5 w-40" />
        <div className="space-y-3">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-10 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}

/** Mirrors the current command-hub dashboard: PageFrame header + StatePanel. */
export function DashboardSkeleton() {
  return (
    <div className="mx-auto w-full max-w-screen-2xl space-y-6" data-loading-skeleton="dashboard">
      <div className="space-y-2">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-full max-w-md" />
      </div>
      <div className="flex min-h-52 flex-col items-center justify-center rounded-xl border bg-card px-6 text-center shadow-sm">
        <Skeleton className="mb-4 h-10 w-10 rounded-full" />
        <Skeleton className="mb-3 h-6 w-32" />
        <Skeleton className="h-4 w-full max-w-sm" />
      </div>
    </div>
  );
}


export function DocumentDetailSkeleton() {
  return (
    <div className="mx-auto w-full max-w-screen-2xl space-y-4">
      <div className="rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-3 w-36" />
            <div className="flex items-center gap-3">
              <Skeleton className="h-7 w-56" />
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>
            <Skeleton className="h-4 w-72 max-w-full" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-9 w-20" />
            <Skeleton className="h-9 w-24" />
          </div>
        </div>

        <div className="mt-6 grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, index) => (
            <div key={index} className="space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-5 w-full max-w-44" />
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-5 overflow-hidden border-b px-2 py-2">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-4 w-24 shrink-0" />
        ))}
      </div>

      <div className="rounded-xl border bg-card p-4">
        <Skeleton className="mb-5 h-5 w-40" />
        <div className="grid gap-x-8 gap-y-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="space-y-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-9 w-full" />
            </div>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="flex items-center justify-between border-b p-4">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-8 w-24" />
        </div>
        <div className="p-4">
          <div className="mb-3 grid grid-cols-5 gap-3">
            {Array.from({ length: 5 }, (_, index) => (
              <Skeleton key={index} className="h-4 w-full" />
            ))}
          </div>
          <div className="space-y-2">
            {Array.from({ length: 5 }, (_, row) => (
              <div key={row} className="grid grid-cols-5 gap-3">
                {Array.from({ length: 5 }, (_, column) => (
                  <Skeleton key={column} className="h-8 w-full" />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function AppBootstrapSkeleton() {
  return <PlaneAppBootstrapSkeleton plane="neon" />;
}
