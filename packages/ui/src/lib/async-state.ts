/**
 * Discriminated union for async data states.
 *
 * Replaces boolean flag patterns (`isLoading`, `error`, `data`)
 * with exhaustive, type-safe state matching. The `status` discriminant
 * lets TypeScript narrow the type in each branch automatically.
 *
 * @example
 * const state: AsyncState<User[]> = { status: 'success', data: users };
 *
 * if (state.status === 'success') {
 *   // TypeScript knows state.data is User[]
 *   console.log(state.data.length);
 * }
 */
export type AsyncState<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: T }
  | { status: "error"; error: Error };

/** Type guard: returns true when state is idle. */
export function isIdle<T>(state: AsyncState<T>): state is { status: "idle" } {
  return state.status === "idle";
}

/** Type guard: returns true when state is loading. */
export function isLoading<T>(
  state: AsyncState<T>,
): state is { status: "loading" } {
  return state.status === "loading";
}

/** Type guard: returns true when state holds data. */
export function isSuccess<T>(
  state: AsyncState<T>,
): state is { status: "success"; data: T } {
  return state.status === "success";
}

/** Type guard: returns true when state holds an error. */
export function isError<T>(
  state: AsyncState<T>,
): state is { status: "error"; error: Error } {
  return state.status === "error";
}

/**
 * Convert SWR-style boolean flags to AsyncState\<T\>.
 *
 * Use as a bridge layer for existing `useSwrFetch` consumers
 * that want to migrate incrementally.
 *
 * @example
 * const swr = useSwrFetch(fetcher);
 * const state = fromSwrResult(swr);
 */
export function fromSwrResult<T>(result: {
  data: T | undefined;
  loading: boolean;
  error: string | null;
}): AsyncState<T> {
  if (result.error) {
    return { status: "error", error: new Error(result.error) };
  }
  if (result.loading) {
    return { status: "loading" };
  }
  if (result.data !== undefined) {
    return { status: "success", data: result.data };
  }
  return { status: "idle" };
}
