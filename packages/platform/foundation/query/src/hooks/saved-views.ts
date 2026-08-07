"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { type SavedView } from "@athyper/platform-api-client";
import { queryKeys } from "../query-keys";
import { clients } from "../client-store";

export function useSavedViews(entityCode: string) {
  return useQuery({
    queryKey:  queryKeys.savedViews.byEntity(entityCode),
    queryFn:   () => clients.platform().getSavedViews(entityCode),
    staleTime: 5 * 60 * 1000,
  });
}

export function useSaveView() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (view: Omit<SavedView, "id" | "created_by" | "created_at">) =>
      clients.platform().saveSavedView(view),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({
        queryKey: queryKeys.savedViews.byEntity(variables.entity_code),
      });
    },
  });
}

export function useUpdateView(entityCode: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      viewId,
      config,
      name,
    }: {
      viewId:  string;
      config:  SavedView["config"];
      name?:   string;
    }) => clients.platform().updateSavedView(entityCode, viewId, { config, name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.savedViews.byEntity(entityCode) });
    },
  });
}
