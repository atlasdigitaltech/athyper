"use client";

// lib/entity-page/use-entity-action.ts
//
// Hook for executing entity page actions via the action dispatcher endpoint.
// Handles CSRF injection, loading state, and toast notifications.

import { useCallback, useState } from "react";
import { toast } from "sonner";

import type { ActionExecutionResult } from "./types";
import type { SessionBootstrap } from "@/lib/session-bootstrap";

export interface UseEntityActionResult {
  execute: (
    actionCode: string,
    payload?: Record<string, unknown>,
  ) => Promise<ActionExecutionResult | null>;
  loading: boolean;
  lastResult: ActionExecutionResult | null;
}

function getCsrfToken(): string {
  if (typeof window === "undefined") return "";
  const bootstrap = (window as any).__SESSION_BOOTSTRAP__ as
    | SessionBootstrap
    | undefined;
  return bootstrap?.csrfToken ?? "";
}

export function useEntityAction(
  entityName: string,
  entityId: string,
  onSuccess?: () => void,
): UseEntityActionResult {
  const [loading, setLoading] = useState(false);
  const [lastResult, setLastResult] = useState<ActionExecutionResult | null>(
    null,
  );

  const execute = useCallback(
    async (
      actionCode: string,
      payload?: Record<string, unknown>,
    ): Promise<ActionExecutionResult | null> => {
      setLoading(true);

      try {
        const csrfToken = getCsrfToken();

        const res = await fetch(
          `/api/entity-page/${encodeURIComponent(entityName)}/${encodeURIComponent(entityId)}/actions/${encodeURIComponent(actionCode)}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-csrf-token": csrfToken,
            },
            credentials: "same-origin",
            body: JSON.stringify({ payload }),
          },
        );

        const body = (await res.json()) as {
          success: boolean;
          data?: ActionExecutionResult;
          error?: { message?: string };
        };

        if (body.data) {
          setLastResult(body.data);

          if (body.data.success) {
            toast.success(`Action completed: ${actionCode}`);
            onSuccess?.();
          } else {
            const errorMsg =
              body.data.error?.details?.[0]?.message ?? "Action failed";
            toast.error(errorMsg);
          }

          return body.data;
        }

        // Fallback for unexpected response shape
        const errorResult: ActionExecutionResult = {
          success: false,
          actionCode,
          error: {
            reasonCode: "validation_failed",
            blockedBy: "client",
            details: [
              {
                message:
                  body.error?.message ?? `Request failed (${res.status})`,
              },
            ],
          },
        };
        setLastResult(errorResult);
        toast.error(errorResult.error!.details[0].message);
        return errorResult;
      } catch (err) {
        const errorResult: ActionExecutionResult = {
          success: false,
          actionCode,
          error: {
            reasonCode: "validation_failed",
            blockedBy: "client",
            details: [
              { message: err instanceof Error ? err.message : "Network error" },
            ],
          },
        };
        setLastResult(errorResult);
        toast.error(errorResult.error!.details[0].message);
        return errorResult;
      } finally {
        setLoading(false);
      }
    },
    [entityName, entityId, onSuccess],
  );

  return { execute, loading, lastResult };
}
