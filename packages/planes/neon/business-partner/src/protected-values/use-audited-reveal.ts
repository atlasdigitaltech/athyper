import { useEffect, useRef, useState } from "react";
import { parseInstant } from "@athyper/platform-temporal";
import { createProtectedValueAttempt } from "@athyper/platform-entity-form-detail/record";

/** A reveal never survives its record/scope/permission view or a failed retry. */
export function useAuditedReveal(key: string) {
  const [result, setResult] = useState<{ key: string; value: string }>();
  const [failure, setFailure] = useState<string>();
  const active = useRef<
    | ReturnType<typeof createProtectedValueAttempt>
    | undefined
  >(undefined);
  const currentKey = useRef(key);
  currentKey.current = key;
  const cancel = () => {
    active.current?.cancel();
    active.current = undefined;
  };
  useEffect(() => {
    setResult(undefined);
    setFailure(undefined);
    return cancel;
  }, [key]);
  async function run(
    load: (
      signal: AbortSignal,
    ) => Promise<{ value: string; expiresAt: string }>,
  ) {
    cancel();
    setResult(undefined);
    setFailure(undefined);
    const request = createProtectedValueAttempt();
    active.current = request;
    try {
      const response = await load(request.controller.signal);
      if (
        request.controller.signal.aborted ||
        currentKey.current !== key ||
        active.current !== request
      )
        return;
      const remaining = parseInstant(response.expiresAt) - Date.now();
      if (!Number.isFinite(remaining) || remaining <= 0 || remaining > 60_000)
        throw Error("Reveal expiry is invalid");
      setResult({ key, value: response.value });
      request.expireIn(remaining, () => {
        setResult(undefined);
        active.current = undefined;
      });
    } catch {
      if (!request.controller.signal.aborted && currentKey.current === key) {
        setResult(undefined);
        setFailure(key);
      }
    }
  }
  return {
    value: result?.key === key ? result.value : undefined,
    failed: failure === key,
    run,
    clear: () => {
      cancel();
      setResult(undefined);
      setFailure(undefined);
    },
  };
}
