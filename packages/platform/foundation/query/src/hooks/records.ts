"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { type EntityListParams } from "@athyper/platform-api-client";
import { queryKeys } from "../query-keys";
import { clients } from "../client-store";
import { invalidateRuntimeListEntity } from "../_utils/invalidate";

export function useEntityList(
  entityCode: string,
  params?:    EntityListParams,
  opts?:      { enabled?: boolean },
) {
  const cacheParams = params ? {
    ...(params.q          ? { _q:      params.q }                                             : {}),
    ...(params.sort?.length ? { _sort: params.sort.map((s) => `${s.key}:${s.dir}`).join(",") } : {}),
    ...(params.page       ? { _page:   params.page }                                           : {}),
    ...(params.pageSize   ? { _size:   params.pageSize }                                       : {}),
    ...(params.facets     ? { _facets: params.facets }                                         : {}),
    ...(params.parent_id  ? { _pid:    params.parent_id }                                      : {}),
    ...(params.filters    ? params.filters                                                      : {}),
  } : undefined;

  const queryKey = cacheParams && Object.keys(cacheParams).length > 0
    ? queryKeys.entityList.byTypeFiltered(entityCode, cacheParams)
    : queryKeys.entityList.byType(entityCode);

  return useQuery({
    queryKey,
    queryFn:   () => clients.records().list(entityCode, params),
    staleTime: 30 * 1000,
    enabled:   opts?.enabled !== false,
  });
}

export function useEntityDetail(entityCode: string, id: string) {
  return useQuery({
    queryKey:  queryKeys.entityDetail.byId(entityCode, id),
    queryFn:   () => clients.records().get(entityCode, id),
    staleTime: 60 * 1000,
    enabled:   Boolean(entityCode) && Boolean(id),
  });
}

export function useCreateEntity(entityCode: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      clients.records().create(entityCode, { data }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.entityList.byType(entityCode) });
      invalidateRuntimeListEntity(entityCode, "create");
    },
  });
}

export function useUpdateEntity(entityCode: string, id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      clients.records().update(entityCode, id, { data }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.entityDetail.byId(entityCode, id) });
      qc.invalidateQueries({ queryKey: queryKeys.entityList.byType(entityCode) });
      invalidateRuntimeListEntity(entityCode, "edit");
    },
  });
}

export function useDeleteEntity(entityCode: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => clients.records().remove(entityCode, id),
    onSuccess: (_data, id) => {
      qc.removeQueries({ queryKey: queryKeys.entityDetail.byId(entityCode, id) });
      qc.invalidateQueries({ queryKey: queryKeys.entityList.byType(entityCode) });
      invalidateRuntimeListEntity(entityCode, "delete");
    },
  });
}
