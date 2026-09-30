"use client";
import { useCallback, useEffect, useState, type DependencyList } from "react";

interface ResourceState<T> {
  readonly key: string;
  readonly data?: T;
  readonly error?: unknown;
}

/** Loads a resource for `key` and ignores results that arrive after `key`
 * or the component has changed. `data` is only returned for the current `key`,
 * so a stale resource is never shown for a new identity. */
export function useAsyncResource<T>(
  key: string,
  load: (signal: AbortSignal) => Promise<T>,
  deps: DependencyList,
  enabled = true,
): {
  readonly data?: T;
  readonly error?: unknown;
  readonly loading: boolean;
  readonly reload: () => void;
} {
  const [state, setState] = useState<ResourceState<T>>();
  const [reloadEpoch, setReloadEpoch] = useState(0);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setState(undefined);
    // Defer dispatch so React's setup/cleanup probe does not issue duplicate reads.
    if (enabled) void Promise.resolve().then(() => {
      if (controller.signal.aborted) return;
      return Promise.resolve().then(() => load(controller.signal)).then(
      (data) => active && setState({ key, data }),
      (error: unknown) => active && setState({ key, error }),
      );
    });
    return () => {
      active = false;
      controller.abort();
    };
    // `load` closes over `deps`; the caller lists them explicitly.
  }, [key, reloadEpoch, enabled, ...deps]);
  const current = enabled && state?.key === key ? state : undefined;
  return {
    ...(current?.data === undefined ? {} : { data: current.data }),
    ...(current?.error === undefined ? {} : { error: current.error }),
    loading: current === undefined,
    reload: useCallback(() => setReloadEpoch((value) => value + 1), []),
  };
}
