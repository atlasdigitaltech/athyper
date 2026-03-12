"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { buildHeaders } from "./use-csrf";

export interface ModuleOption {
  code: string;
  name: string;
}

export interface UseModulesResult {
  modules: ModuleOption[];
  loading: boolean;
  error: string | null;
}

/**
 * Fetches modules from /api/admin/mesh/meta-studio/modules.
 * Caches the result across all callers for the lifetime of the page.
 */

let _cache: ModuleOption[] | null = null;
let _promise: Promise<ModuleOption[]> | null = null;

function fetchModulesOnce(): Promise<ModuleOption[]> {
  if (_cache) return Promise.resolve(_cache);
  if (_promise) return _promise;

  _promise = fetch("/api/admin/mesh/meta-studio/modules", {
    headers: buildHeaders(),
    credentials: "same-origin",
  })
    .then(async (res) => {
      if (!res.ok) throw new Error(`Failed to load modules (${res.status})`);
      const body = (await res.json()) as { data: ModuleOption[] };
      _cache = body.data;
      return _cache;
    })
    .catch((err) => {
      _promise = null; // allow retry on failure
      throw err;
    });

  return _promise;
}

export function useModules(): UseModulesResult {
  const [modules, setModules] = useState<ModuleOption[]>(_cache ?? []);
  const [loading, setLoading] = useState(!_cache);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    try {
      const data = await fetchModulesOnce();
      if (mounted.current) {
        setModules(data);
        setLoading(false);
      }
    } catch (err) {
      if (mounted.current) {
        setError(err instanceof Error ? err.message : "Failed to load modules");
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    if (!_cache) load();
    return () => { mounted.current = false; };
  }, [load]);

  return { modules, loading, error };
}
