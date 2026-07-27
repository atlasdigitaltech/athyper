import { getPublicBrandAssets } from "@athyper/brand";
import { BrandedAuthLoader } from "@athyper/identity-gate";
import { getPlaneConfig, type PlaneKey } from "@athyper/session-plane";
import { Skeleton } from "@athyper/ui/primitives";
import { DelayedLoadingMessage } from "./delayed-loading-message";

export type PlaneLoadingSurface = "bootstrap" | "shell";

export interface PlaneAppBootstrapSkeletonProps {
  plane: PlaneKey;
  surface?: PlaneLoadingSurface;
}

export function PlaneAppBootstrapSkeleton({
  plane,
  surface = "bootstrap",
}: PlaneAppBootstrapSkeletonProps) {
  const config = getPlaneConfig(plane);
  const brandAssets = getPublicBrandAssets(plane);

  return (
    <div
      className="flex h-dvh flex-col overflow-hidden bg-background"
      aria-busy="true"
      aria-label="Loading application"
      data-plane={plane}
    >
      <header className="flex h-12 shrink-0 items-center border-b border-border bg-background px-2">
        <div
          className="flex w-full items-center justify-between gap-4"
          aria-hidden="true"
        >
          <img
            alt=""
            className="h-5 w-auto max-w-36 object-contain"
            draggable={false}
            src={brandAssets.wordmarkBlack}
          />
          <div className="flex items-center gap-3">
            <Skeleton className="hidden h-5 w-32 sm:block" />
            <Skeleton className="h-8 w-8 rounded-full" />
          </div>
        </div>
      </header>
      <ApplicationLoadingProgress />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <nav
          aria-hidden="true"
          className="hidden w-nav-rail shrink-0 flex-col items-center gap-3 border-r border-sidebar-border bg-sidebar py-3 md:flex"
        >
          {Array.from({ length: 7 }, (_, index) => (
            <Skeleton key={index} className="h-9 w-9 rounded-lg" />
          ))}
        </nav>
        <main
          className="flex min-h-0 flex-1 items-center justify-center overflow-hidden px-6"
          data-loading-skeleton={`application-${surface}`}
        >
          <div
            className={
              surface === "shell"
                ? "w-full max-w-screen-2xl space-y-5"
                : "flex flex-col items-center gap-4 text-center"
            }
          >
            {surface === "shell" ? <ApplicationShellContentSkeleton /> : null}
            {surface === "bootstrap" ? (
              <>
            <div className="flex items-center gap-2" aria-hidden="true">
              <Skeleton className="h-2.5 w-2.5 rounded-full [animation-delay:-300ms]" />
              <Skeleton className="h-2.5 w-2.5 rounded-full [animation-delay:-150ms]" />
              <Skeleton className="h-2.5 w-2.5 rounded-full" />
            </div>
            <DelayedLoadingMessage
              label={`Loading ${config.appName}…`}
              longWaitLabel={`${config.appName} is taking longer than expected to load.`}
            />
              </>
            ) : null}
          </div>
        </main>
      </div>
    </div>
  );
}

export function PlanePublicLoading({ plane }: { plane: PlaneKey }) {
  return (
    <BrandedAuthLoader
      plane={plane}
      message="Preparing secure sign-in…"
      longWaitMessage="Secure sign-in is taking longer than expected."
    />
  );
}

function ApplicationShellContentSkeleton() {
  return (
    <div className="space-y-5" aria-hidden="true">
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

function ApplicationLoadingProgress() {
  return (
    <>
      <div
        className="h-0.5 w-full overflow-hidden bg-primary/10"
        role="progressbar"
        aria-label="Loading"
      >
        <div className="athyper-app-loading-progress h-full w-2/5 bg-primary motion-reduce:w-full" />
      </div>
      <style>{`
        @keyframes athyper-app-loading-progress {
          from { transform: translateX(-110%); }
          to { transform: translateX(360%); }
        }
        .athyper-app-loading-progress {
          animation: athyper-app-loading-progress 1.35s ease-in-out infinite;
          will-change: transform;
        }
        @media (prefers-reduced-motion: reduce) {
          .athyper-app-loading-progress {
            animation: none;
            transform: none;
          }
        }
      `}</style>
    </>
  );
}
