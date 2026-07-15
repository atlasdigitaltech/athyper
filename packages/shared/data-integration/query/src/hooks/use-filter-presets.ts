/**
 * useFilterPresets — list, save, and delete named filter presets for an entity.
 *
 * Presets store only EntityListFilters JSON (not sort/columns/viewMode).
 * Applying a preset never changes URL state beyond the filters key.
 *
 * Fetches via runtimePath.filterPresets(entityCode) (BFF relay catchall).
 * staleTime: 5 min (presets change infrequently).
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { EntityListFilters } from "@athyper/api-contracts/entity-list";
import { runtimePath } from "@athyper/api-contracts/runtime-paths";

function getCsrfToken(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(/(?:^|;\s*)__csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]!) : "";
}

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
  const res = await fetch(runtimePath.filterPresets(entityCode));
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
      const res = await fetch(runtimePath.filterPresets(entityCode), {
        method:  "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": getCsrfToken() },
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
        runtimePath.filterPreset(entityCode, presetId),
        { method: "DELETE", headers: { "X-CSRF-Token": getCsrfToken() } },
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
