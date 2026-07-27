"use client";

export function SessionWarningDialog({
  secondsRemaining,
  reason = "idle",
  pending,
  onContinue,
  onLogout,
  brandWordmarkSrc,
  brandAlt,
}: {
  secondsRemaining: number;
  reason?: "idle" | "absolute";
  pending: boolean;
  onContinue: () => void;
  onLogout: () => void;
  brandWordmarkSrc?: string;
  brandAlt?: string;
}) {
  const remaining = Math.max(secondsRemaining, 0);
  const description =
    reason === "absolute"
      ? "Your session is reaching its maximum lifetime and cannot be extended."
      : "Your session will close soon because there has not been activity.";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="session-warning-title"
      aria-describedby="session-warning-description"
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-4 font-sans text-foreground backdrop-blur-sm"
    >
      <div className="w-full max-w-md rounded-lg border bg-card p-4 text-card-foreground shadow-sm sm:p-6">
        {brandWordmarkSrc ? (
          <div className="mb-4 flex items-center">
            <img
              alt={brandAlt ?? ""}
              className="h-5 w-auto max-w-36 object-contain"
              draggable={false}
              src={brandWordmarkSrc}
            />
          </div>
        ) : null}
        <div className="mb-4 grid gap-1">
          <h2
            id="session-warning-title"
            className="text-2xl font-medium leading-tight sm:text-[1.75rem]"
          >
            Still there?
          </h2>
          <p
            id="session-warning-description"
            className="text-sm font-normal leading-5 text-muted-foreground sm:text-base sm:leading-6"
          >
            {description}
          </p>
        </div>
        <p
          aria-live="polite"
          aria-atomic="true"
          className="mb-5 text-sm text-muted-foreground"
        >
          Signing out in{" "}
          <span className="font-medium tabular-nums text-foreground">
            {remaining}s
          </span>
        </p>
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={onContinue}
            disabled={pending || reason === "absolute"}
            className="inline-flex h-10 w-full items-center justify-center gap-3 rounded-md bg-foreground px-4 text-base font-medium text-background transition-colors hover:bg-foreground/90 disabled:pointer-events-none disabled:opacity-60"
          >
            {reason === "absolute"
              ? "Continue unavailable"
              : pending
                ? "Checking session..."
                : "Continue session"}
          </button>
          <button
            type="button"
            onClick={onLogout}
            disabled={pending}
            className="inline-flex h-10 w-full items-center justify-center rounded-md border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-60"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
