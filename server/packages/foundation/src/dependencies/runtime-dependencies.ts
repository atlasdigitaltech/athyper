/** Time source used at asynchronous and stateful dependency boundaries. */
export interface Clock {
  now(): number;
  sleep(milliseconds: number, signal?: AbortSignal): Promise<void>;
}

/** Uniform random source. Implementations must return a value in [0, 1). */
export interface RandomSource {
  next(): number;
}

export const systemClock: Clock = Object.freeze({
  now: () => Date.now(),
  sleep(milliseconds: number, signal?: AbortSignal) {
    signal?.throwIfAborted();
    if (milliseconds <= 0) return Promise.resolve();

    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(finish, milliseconds);

      function finish(): void {
        signal?.removeEventListener("abort", abort);
        resolve();
      }

      function abort(): void {
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
        reject(signal?.reason ?? new DOMException("The operation was aborted", "AbortError"));
      }

      signal?.addEventListener("abort", abort, { once: true });
    });
  },
});

export const systemRandom: RandomSource = Object.freeze({
  next: () => Math.random(),
});

export interface RuntimeDependencies {
  readonly clock?: Clock;
  readonly random?: RandomSource;
}
