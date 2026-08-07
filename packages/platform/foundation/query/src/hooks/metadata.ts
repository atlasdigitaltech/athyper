"use client";

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../query-keys";
import { clients } from "../client-store";

declare const process: { env?: { NODE_ENV?: string } };
const IS_DEV =
  typeof process !== "undefined" && process.env?.NODE_ENV === "development";

const COMPILED_STALE = IS_DEV ? 0 : 5 * 60 * 1000;

export function useCompiledEntity(
  entityCode: string,
  opts?: { enabled?: boolean },
) {
  return useQuery({
    queryKey:          queryKeys.compiledEntity.byCode(entityCode),
    queryFn:           () => clients.metadata().getCompiledEntity(entityCode),
    staleTime:         COMPILED_STALE,
    refetchOnMount:    IS_DEV ? "always" : true,
    enabled:           Boolean(entityCode) && (opts?.enabled ?? true),
  });
}

export function useCatalogEntity(
  entityCode: string,
  opts?: { enabled?: boolean },
) {
  return useQuery({
    queryKey:  queryKeys.catalogEntity.byCode(entityCode),
    queryFn:   () => clients.metadata().getCatalogEntity(entityCode),
    staleTime: 5 * 60 * 1000,
    enabled:   Boolean(entityCode) && (opts?.enabled ?? true),
  });
}

export function useEntityOperations(entityName: string) {
  return useQuery({
    queryKey:  queryKeys.entityOperations.byEntity(entityName),
    queryFn:   () => clients.metadata().getEntityOperations(entityName),
    staleTime: 5 * 60 * 1000,
  });
}

export function useLookupDomain(
  domainCode: string,
  opts?: { enabled?: boolean },
) {
  return useQuery({
    queryKey:  queryKeys.lookupDomain.byCode(domainCode),
    queryFn:   () => clients.metadata().getLookupDomainBundle(domainCode),
    staleTime: 10 * 60 * 1000,
    enabled:   Boolean(domainCode) && (opts?.enabled ?? true),
  });
}

export function useStatusRoute(entityName: string) {
  return useQuery({
    queryKey:  queryKeys.statusRoute.byEntity(entityName),
    queryFn:   () => clients.metadata().getStatusRoute(entityName),
    staleTime: 5 * 60 * 1000,
  });
}

export function useEntityCapabilities(entityName: string) {
  return useQuery({
    queryKey:  queryKeys.capabilities.byEntity(entityName),
    queryFn:   () => clients.metadata().getEntityCapabilities(entityName),
    staleTime: 5 * 60 * 1000,
  });
}

export function useEntityFlow(
  entityCode: string,
  trigger:    string = "new",
  opts?: { enabled?: boolean },
) {
  return useQuery({
    queryKey:  queryKeys.entityFlow.byCode(entityCode, trigger),
    queryFn:   () => clients.metadata().getEntityFlow(entityCode, trigger),
    staleTime: (query) => (query.state.data ? 10 * 60 * 1000 : 0),
    retry:     false,
    enabled:   Boolean(entityCode) && (opts?.enabled ?? true),
  });
}
