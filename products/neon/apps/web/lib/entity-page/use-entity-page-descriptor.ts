"use client";

// lib/entity-page/use-entity-page-descriptor.ts
//
// Fetches the static (cacheable) and dynamic (per-request) descriptors
// for an entity page. The static descriptor is refetched only when the
// entity type changes; the dynamic descriptor refetches on every
// entityId change or manual refresh.

import { useCallback, useEffect, useRef, useState } from "react";

import type {
  EntityPageDynamicDescriptor,
  EntityPageStaticDescriptor,
  ViewMode,
} from "./types";
import type { SessionBootstrap } from "@/lib/session-bootstrap";


export interface UseEntityPageDescriptorResult {
  staticDescriptor: EntityPageStaticDescriptor | null;
  dynamicDescriptor: EntityPageDynamicDescriptor | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

function getCsrfToken(): string {
  if (typeof window === "undefined") return "";
  const bootstrap = (window as any).__SESSION_BOOTSTRAP__ as SessionBootstrap | undefined;
  return bootstrap?.csrfToken ?? "";
}

export function useEntityPageDescriptor(
  entityName: string,
  entityId: string,
  viewMode?: ViewMode,
): UseEntityPageDescriptorResult {
  const [staticDescriptor, setStaticDescriptor] = useState<EntityPageStaticDescriptor | null>(null);
  const [dynamicDescriptor, setDynamicDescriptor] = useState<EntityPageDynamicDescriptor | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Track the last-fetched entity name for static descriptor caching
  const lastStaticEntity = useRef<string>("");
  const abortRef = useRef<AbortController | null>(null);
  const refreshCounter = useRef(0);

  const fetchDescriptors = useCallback(async () => {
    // Abort any in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    const csrfToken = getCsrfToken();
    const headers: Record<string, string> = {};
    if (csrfToken) headers["x-csrf-token"] = csrfToken;

    try {
      // Fetch static only if entity name changed
      const needsStatic = lastStaticEntity.current !== entityName;

      const requests: Promise<Response>[] = [];

      if (needsStatic) {
        requests.push(
          fetch(`/api/entity-page/${encodeURIComponent(entityName)}`, {
            headers,
            credentials: "same-origin",
            signal: controller.signal,
          }),
        );
      }

      const vmParam = viewMode ? `?viewMode=${viewMode}` : "";
      requests.push(
        fetch(
          `/api/entity-page/${encodeURIComponent(entityName)}/${encodeURIComponent(entityId)}${vmParam}`,
          {
            headers,
            credentials: "same-origin",
            signal: controller.signal,
          },
        ),
      );

      const responses = await Promise.all(requests);

      const staticIdx = 0;
      const dynamicIdx = needsStatic ? 1 : 0;

      // Process static
      if (needsStatic) {
        const staticRes = responses[staticIdx];
        if (!staticRes.ok) {
          const body = (await staticRes.json()) as { error?: { message?: string } };
          throw new Error(body.error?.message ?? `Static descriptor failed (${staticRes.status})`);
        }
        const staticBody = (await staticRes.json()) as { data: EntityPageStaticDescriptor };
        setStaticDescriptor(staticBody.data);
        lastStaticEntity.current = entityName;
      }

      // Process dynamic
      const dynamicRes = responses[dynamicIdx];
      if (!dynamicRes.ok) {
        const body = (await dynamicRes.json()) as { error?: { message?: string } };
        throw new Error(body.error?.message ?? `Dynamic descriptor failed (${dynamicRes.status})`);
      }
      const dynamicBody = (await dynamicRes.json()) as { data: EntityPageDynamicDescriptor };
      setDynamicDescriptor(dynamicBody.data);
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Failed to load entity page");
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [entityName, entityId, viewMode]);

  // Fetch on mount and when deps change
  useEffect(() => {
    fetchDescriptors();
    return () => abortRef.current?.abort();
  }, [fetchDescriptors]);

  const refresh = useCallback(() => {
    refreshCounter.current += 1;
    // Reset static cache to force full refetch
    lastStaticEntity.current = "";
    fetchDescriptors();
  }, [fetchDescriptors]);

  return { staticDescriptor, dynamicDescriptor, loading, error, refresh };
}
