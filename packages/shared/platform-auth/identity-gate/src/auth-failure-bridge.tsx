"use client";

// packages/shared/platform-auth/identity-gate/src/authFailureBridge.tsx
//
// Phase A â€” Glue component mounted inside <ToastProvider> + react-query
// <QueryClientProvider>. Subscribes to query/mutation errors and dispatches
// the matching auth-failure presentation via the shared handler:
//
//   - Recognized AuthFailureCode â†’ toast / auto-navigate per the contract
//   - Unknown code â†’ no-op (the host's existing error boundary handles it)
//
// Hosts mount one of these per app:
//
//   <ToastProvider>
//     <QueryClientProvider client={qc}>
//       <AuthFailureBridge planeRoot="">
//         {children}
//       </AuthFailureBridge>
//     </QueryClientProvider>
//   </ToastProvider>

import { useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { AuthFailurePage } from "./auth-failure-page";
import { dispatchAuthFailure } from "./auth-failure-handler";
import type {
  AuthFailureCode,
  AuthFailureDispatcherDeps,
} from "./auth-failure-handler";

export interface AuthFailureBridgeProps {
  /** Plane-root for href interpolation; pass "" for root-mounted apps. */
  readonly planeRoot?: string;
  /**
   * Toast emitter â€” typically `useToast().toast` adapted to the dispatcher's
   * shape. When omitted, the bridge still invalidates state, records telemetry,
   * navigates, and renders wrapped fatal failures.
   */
  readonly emitToast?: AuthFailureDispatcherDeps["emitToast"];
  /**
   * Router push fn â€” usually `useRouter().push` from `next/navigation`.
   * When omitted, the bridge falls back to `window.location.assign(href)`.
   */
  readonly navigate?: (href: string) => void;
  /**
   * Functional notification for session/cache invalidation. This is separate
   * from telemetry so replacing an observability sink cannot retain stale
   * authenticated state.
   */
  readonly onAuthFailure?: AuthFailureDispatcherDeps["onAuthFailure"];
  /**
   * Optional telemetry sink. Wire to your beacon, posthog, or a console.log
   * during dev. Omitting it disables the telemetry hook.
   */
  readonly recordTelemetry?: AuthFailureDispatcherDeps["recordTelemetry"];
  /**
   * When supplied, a non-navigating fatal failure replaces this subtree with
   * the shared full-page failure presentation.
   */
  readonly children?: ReactNode;
}

/**
 * Shape of the data shoveled through react-query errors. Compatible with both
 * @athyper/api-client's ApiError (which exposes .code on the thrown instance)
 * and bare fetch errors with `.code` / `.error` fields.
 */
interface MaybeApiError {
  readonly status?: number;
  readonly code?: string;
  readonly error?: string;
  readonly requestId?: string;
  readonly detail?: Record<string, unknown>;
  readonly message?: string;
}

function asMaybeApiError(input: unknown): MaybeApiError | null {
  if (!input || typeof input !== "object") return null;
  const e = input as Record<string, unknown>;
  return {
    ...(typeof e["status"] === "number" ? { status: e["status"] as number } : {}),
    ...(typeof e["code"] === "string" ? { code: e["code"] as string } : {}),
    ...(typeof e["error"] === "string" ? { error: e["error"] as string } : {}),
    ...(typeof e["requestId"] === "string" ? { requestId: e["requestId"] as string } : {}),
    ...(typeof e["message"] === "string" ? { message: e["message"] as string } : {}),
    ...(e["detail"] && typeof e["detail"] === "object"
      ? { detail: e["detail"] as Record<string, unknown> }
      : {}),
  };
}

export function AuthFailureBridge({
  planeRoot = "",
  emitToast,
  navigate,
  onAuthFailure,
  recordTelemetry,
  children,
}: AuthFailureBridgeProps) {
  const queryClient = useQueryClient();
  const [fatalFailure, setFatalFailure] = useState<{
    code: AuthFailureCode;
    requestId?: string;
  } | null>(null);

  useEffect(() => {
    const deps: AuthFailureDispatcherDeps = {
      planeRoot,
      ...(emitToast ? { emitToast } : {}),
      ...(navigate ? { navigate } : {}),
      ...(onAuthFailure ? { onAuthFailure } : {}),
      ...(recordTelemetry ? { recordTelemetry } : {}),
    };

    function handle(rawError: unknown): void {
      const err = asMaybeApiError(rawError);
      if (!err) return;
      // Prefer the `code` set by ApiError; fall back to `error` field from
      // structured BFF responses.
      const code = err.code ?? err.error ?? null;
      const outcome = dispatchAuthFailure(
        {
          code,
          ...(err.requestId ? { requestId: err.requestId } : {}),
          ...(err.detail ? { detail: err.detail } : {}),
        },
        deps,
      );
      if (
        outcome.code
        && outcome.presentation?.severity === "fatal"
        && !outcome.navigateHref
      ) {
        setFatalFailure({
          code: outcome.code,
          ...(err.requestId ? { requestId: err.requestId } : {}),
        });
      }
    }

    const qSub = queryClient.getQueryCache().subscribe((event) => {
      if (event.type === "updated" && event.action.type === "error") {
        handle(event.action.error);
      }
    });
    const mSub = queryClient.getMutationCache().subscribe((event) => {
      if (event.type === "updated" && event.action.type === "error") {
        handle(event.action.error);
      }
    });

    return () => {
      qSub();
      mSub();
    };
  }, [
    queryClient,
    planeRoot,
    emitToast,
    navigate,
    onAuthFailure,
    recordTelemetry,
  ]);

  if (fatalFailure) {
    return (
      <AuthFailurePage
        code={fatalFailure.code}
        planeRoot={planeRoot}
        {...(fatalFailure.requestId ? { requestId: fatalFailure.requestId } : {})}
      />
    );
  }

  return children ?? null;
}
