"use client";

import {
  authFailurePresentation,
  isAuthFailureCode,
} from "@athyper/auth-bff/error-codes";
import { AuthFailurePage } from "@athyper/identity-gate";
import {
  readErrorDigest,
  type ApplicationErrorBoundaryProps,
} from "./global-application-error";

export interface PlaneRouteErrorProps extends ApplicationErrorBoundaryProps {
  planeRoot?: string;
}

export function PlaneRouteError({
  error,
  reset,
  planeRoot = "",
}: PlaneRouteErrorProps) {
  const digest = readErrorDigest(error);
  const codeCandidate =
    typeof (error as unknown as { code?: unknown }).code === "string"
      ? (error as unknown as { code: string }).code
      : error.message;

  if (isAuthFailureCode(codeCandidate)) {
    const presentation = authFailurePresentation(codeCandidate);
    if (presentation?.severity === "fatal") {
      return (
        <AuthFailurePage
          code={codeCandidate}
          planeRoot={planeRoot}
          {...(digest ? { requestId: digest } : {})}
        />
      );
    }
  }

  return (
    <div className="min-h-screen bg-background p-6 text-foreground">
      <div className="rounded-lg border bg-card p-4">
        <h1 className="text-lg font-medium">Route error</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong while loading this route.
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
    </div>
  );
}
