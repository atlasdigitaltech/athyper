/**
 * useFilterPresets — list, save, and delete named filter presets for an entity.
 *
 * Presets store only EntityListFilters JSON (not sort/columns/viewMode).
 * Applying a preset never changes URL state beyond the filters key.
 *
 * Fetches from /api/records/{entityCode}/filter-presets (BFF relay).
 * staleTime: 5 min (presets change infrequently).
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { EntityListFilters } from "@athyper/api-contracts/entity-list";

export interface FilterPreset {
  id:        string;
  name:      string;
  filters:   EntityListFilters;
  isShared:  boolean;
  isOwn:     boolean;
  createdAt: string;
  updatedAt: string;
}

const QUERY_KEY = (entityCode: string) => ["filter-presets", entityCode] as const;

async function fetchPresets(entityCode: string): Promise<FilterPreset[]> {
  const res = await fetch(`/api/records/${entityCode}/filter-presets`);
  if (!res.ok) return [];
  const json = await res.json() as { data?: FilterPreset[] };
  return json.data ?? [];
}

export function useFilterPresets(entityCode: string) {
  const queryClient = useQueryClient();

  const { data: presets = [], isLoading } = useQuery({
    queryKey: QUERY_KEY(entityCode),
    queryFn:  () => fetchPresets(entityCode),
    staleTime: 5 * 60 * 1000,
  });

  const save = useMutation({
    mutationFn: async ({
      name,
      filters,
      isShared = false,
    }: {
      name:     string;
      filters:  EntityListFilters;
      isShared?: boolean;
    }) => {
      const res = await fetch(`/api/records/${entityCode}/filter-presets`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ name, filters, is_shared: isShared }),
      });
      if (!res.ok) throw new Error("Failed to save preset");
      return res.json() as Promise<{ data: FilterPreset }>;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY(entityCode) });
    },
  });

  const remove = useMutation({
    mutationFn: async (presetId: string) => {
      const res = await fetch(
        `/api/records/${entityCode}/filter-presets/${presetId}`,
        { method: "DELETE" },
      );
      if (!res.ok && res.status !== 204) throw new Error("Failed to delete preset");
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY(entityCode) });
    },
  });

  return {
    presets,
    isLoading,
    save:      save.mutate,
    remove:    remove.mutate,
    isSaving:  save.isPending,
    isRemoving: remove.isPending,
  };
}
