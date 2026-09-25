/** Owns transport cancellation and the expiry timer, never the protected value. */
export function createProtectedValueAttempt() {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    controller,
    expireIn(milliseconds: number, onExpire: () => void) {
      if (controller.signal.aborted) return;
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = undefined;
        if (!controller.signal.aborted) onExpire();
      }, milliseconds);
    },
    cancel() {
      controller.abort();
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
    },
  };
}
