"use client";

export interface ApplicationErrorBoundaryProps {
  error: Error;
  reset: () => void;
}

export function GlobalApplicationError({
  error,
  reset,
}: ApplicationErrorBoundaryProps) {
  const digest = readErrorDigest(error);
  return (
    <main className="min-h-screen bg-background p-6 text-foreground">
      <div className="rounded-lg border bg-card p-4">
        <h1 className="text-lg font-medium">Application error</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong while loading the application.
        </p>
        {digest ? (
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            Reference: {digest}
          </p>
        ) : null}
        <button
          className="mt-4 rounded-md border px-3 py-2 text-sm font-medium"
          onClick={reset}
        >
          Try again
        </button>
      </div>
    </main>
  );
}

export function readErrorDigest(error: Error): string | null {
  return "digest" in error && typeof error.digest === "string"
    ? error.digest
    : null;
}
