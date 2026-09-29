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
  load: () => Promise<T>,
  deps: DependencyList,
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
    setState(undefined);
    load().then(
      (data) => active && setState({ key, data }),
      (error: unknown) => active && setState({ key, error }),
    );
    return () => {
      active = false;
    };
    // `load` closes over `deps`; the caller lists them explicitly.
  }, [key, reloadEpoch, ...deps]);
  const current = state?.key === key ? state : undefined;
  return {
    ...(current?.data === undefined ? {} : { data: current.data }),
    ...(current?.error === undefined ? {} : { error: current.error }),
    loading: current === undefined,
    reload: useCallback(() => setReloadEpoch((value) => value + 1), []),
  };
}
