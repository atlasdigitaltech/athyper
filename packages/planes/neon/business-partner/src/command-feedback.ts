import { ApiTransportError } from "@athyper/platform-api-client";
import { useToasts } from "@athyper/platform-shell-app-foundation";
import { useRef } from "react";
import { useContextDepartureGuard } from "@athyper/platform-shell";
import { businessLabel } from "./360/display-values";

export function businessPartnerErrorMessage(
  cause: unknown,
  fallback: string,
): string {
  if (cause instanceof ApiTransportError)
    return cause.problem?.detail ?? cause.message;
  if (cause instanceof Error) return cause.message;
  return fallback;
}

/** Serialize commands while preserving each screen's error and refresh behavior. */
export function useCommandRunner(options: {
  setBusy: (name: string | undefined) => void;
  setError: (message: string | undefined) => void;
  errorMessage: (cause: unknown) => string;
  reload: () => Promise<unknown>;
  blocked?: boolean;
  onStart?: () => void;
  onSuccess?: () => void;
  onError?: (cause: unknown) => void;
}) {
  const toasts = useToasts();
  const running = useRef(false);
  useContextDepartureGuard({ get busy() { return running.current; }, dirty: false });
  return async (
    name: string,
    command: () => Promise<unknown>,
    success = `${businessLabel(name, "title")} completed`,
  ) => {
    if (running.current || options.blocked) return;
    running.current = true;
    options.setBusy(name);
    options.setError(undefined);
    try {
      options.onStart?.();
      await command();
      options.onSuccess?.();
      toasts.push({ tone: "success", title: success });
      await options.reload();
    } catch (cause) {
      options.setError(options.errorMessage(cause));
      options.onError?.(cause);
    } finally {
      running.current = false;
      options.setBusy(undefined);
    }
  };
}
