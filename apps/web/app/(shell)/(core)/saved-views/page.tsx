"use client";

/**
 * Saved Views Manager — /saved-views
 *
 * Browse all personal and shared saved views across entities.
 * Allows deleting personal views and setting a view as default.
 *
 * Query: GET /api/relay/platform/saved-views/:entity
 * The page groups views by entity_code and lists them in a flat table.
 *
 * Note: Each entity's views are fetched individually. This page shows views
 * for a selected entity; switch via the entity selector.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bookmark, Trash2 } from "lucide-react";
import { PageFrame } from "@athyper/ui/layout";
import { Badge, Button, Input, Skeleton } from "@athyper/ui/primitives";
import type { SavedView } from "@athyper/api-contracts/platform";
import { bffFetch } from "@/lib/bff-fetch";

// ── Hooks ─────────────────────────────────────────────────────────────────────

function useSavedViews(entityCode: string) {
  return useQuery<SavedView[]>({
    queryKey: ["saved-views", entityCode],
    queryFn: async () => {
      if (!entityCode) return [];
      const res = await fetch(`/api/relay/platform/saved-views/${encodeURIComponent(entityCode)}`);
      if (!res.ok) throw new Error("Failed to load saved views");
      return res.json() as Promise<SavedView[]>;
    },
    enabled: !!entityCode,
    staleTime: 30 * 1000,
  });
}

function useDeleteView(entityCode: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (viewId: string) =>
      bffFetch(
        `/api/relay/platform/saved-views/${encodeURIComponent(entityCode)}/${encodeURIComponent(viewId)}`,
        { method: "DELETE" },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["saved-views", entityCode] });
    },
  });
}

function useSetDefault(entityCode: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (viewId: string) =>
      bffFetch(
        `/api/relay/platform/saved-views/${encodeURIComponent(entityCode)}/${encodeURIComponent(viewId)}/default`,
        { method: "PATCH" },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["saved-views", entityCode] });
    },
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString(undefined, {
    year: "numeric", month: "short", day: "numeric",
  });
}

// ── Components ────────────────────────────────────────────────────────────────

function ViewRow({
  view,
  onDelete,
  onSetDefault,
  isDeleting,
  isSettingDefault,
}: {
  view: SavedView;
  onDelete(): void;
  onSetDefault(): void;
  isDeleting: boolean;
  isSettingDefault: boolean;
}) {
  const filterCount = Object.keys(view.config.filters ?? {}).length;
  const columnCount = view.config.columns?.length ?? 0;

  return (
    <div className="flex items-center gap-3 rounded-lg border px-4 py-3 hover:bg-muted/30 transition-colors">
      <Bookmark className={`h-4 w-4 shrink-0 ${view.is_default ? "text-primary fill-primary/20" : "text-muted-foreground"}`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium">{view.name}</p>
          {view.is_default && <Badge variant="info" className="text-[10px]">Default</Badge>}
          {view.is_shared && <Badge variant="secondary" className="text-[10px]">Shared</Badge>}
        </div>
        <p className="text-xs text-muted-foreground">
          {[
            filterCount > 0 ? `${filterCount} filter${filterCount !== 1 ? "s" : ""}` : null,
            columnCount > 0 ? `${columnCount} column${columnCount !== 1 ? "s" : ""}` : null,
            view.config.sort?.[0] ? `sorted by ${view.config.sort[0].key} ${view.config.sort[0].dir}` : null,
            view.config.pageSize ? `${view.config.pageSize} per page` : null,
          ].filter(Boolean).join(" · ") || "No configuration"}
          {" · "}
          {fmtDate(view.created_at)}
        </p>
      </div>
      <div className="shrink-0 flex items-center gap-1">
        {!view.is_default && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={onSetDefault}
            loading={isSettingDefault}
            disabled={isSettingDefault || isDeleting}
          >
            Set default
          </Button>
        )}
        {!view.is_shared && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-destructive hover:text-destructive"
            onClick={onDelete}
            loading={isDeleting}
            disabled={isDeleting || isSettingDefault}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SavedViewsPage() {
  const [inputValue, setInputValue] = useState("");
  const [entityCode, setEntityCode] = useState("");

  const { data: views, isLoading } = useSavedViews(entityCode);
  const deleteMutation = useDeleteView(entityCode);
  const setDefaultMutation = useSetDefault(entityCode);

  function handleSearch() {
    setEntityCode(inputValue.trim());
  }

  const defaultView  = views?.find((v) => v.is_default);
  const personalViews = views?.filter((v) => !v.is_shared && !v.is_default) ?? [];
  const sharedViews   = views?.filter((v) => v.is_shared) ?? [];

  return (
    <PageFrame
      title="Saved Views"
      description="Named filter and column presets for entity lists"
      width="default"
    >
      <div className="space-y-6">

        {/* Entity selector */}
        <div className="rounded-lg border bg-card p-4 space-y-2">
          <p className="text-sm font-medium">Entity</p>
          <p className="text-xs text-muted-foreground">
            Enter an entity code (e.g. <code className="font-mono">supplier</code>, <code className="font-mono">purchase_order</code>) to browse its saved views.
          </p>
          <div className="flex items-center gap-2">
            <Input
              className="h-8 text-sm font-mono flex-1 max-w-xs"
              placeholder="entity_code"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            />
            <Button size="sm" className="h-8" onClick={handleSearch}>
              Load views
            </Button>
          </div>
        </div>

        {/* Views list */}
        {entityCode && (
          <div className="space-y-4">
            {isLoading ? (
              [1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)
            ) : !views || views.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-12 text-center">
                <Bookmark className="h-8 w-8 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">
                  No saved views for <code className="font-mono">{entityCode}</code>
                </p>
                <p className="text-xs text-muted-foreground/70">
                  Views are created from entity list pages using the filter panel.
                </p>
              </div>
            ) : (
              <>
                {defaultView && (
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Default</h3>
                    <ViewRow
                      view={defaultView}
                      onDelete={() => deleteMutation.mutate(defaultView.id)}
                      onSetDefault={() => setDefaultMutation.mutate(defaultView.id)}
                      isDeleting={deleteMutation.isPending && deleteMutation.variables === defaultView.id}
                      isSettingDefault={setDefaultMutation.isPending && setDefaultMutation.variables === defaultView.id}
                    />
                  </div>
                )}

                {sharedViews.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Shared
                      <Badge variant="secondary" className="ml-2 text-[10px] px-1.5 normal-case tracking-normal">{sharedViews.length}</Badge>
                    </h3>
                    {sharedViews.map((v) => (
                      <ViewRow
                        key={v.id}
                        view={v}
                        onDelete={() => deleteMutation.mutate(v.id)}
                        onSetDefault={() => setDefaultMutation.mutate(v.id)}
                        isDeleting={deleteMutation.isPending && deleteMutation.variables === v.id}
                        isSettingDefault={setDefaultMutation.isPending && setDefaultMutation.variables === v.id}
                      />
                    ))}
                  </div>
                )}

                {personalViews.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Personal
                      <Badge variant="secondary" className="ml-2 text-[10px] px-1.5 normal-case tracking-normal">{personalViews.length}</Badge>
                    </h3>
                    {personalViews.map((v) => (
                      <ViewRow
                        key={v.id}
                        view={v}
                        onDelete={() => deleteMutation.mutate(v.id)}
                        onSetDefault={() => setDefaultMutation.mutate(v.id)}
                        isDeleting={deleteMutation.isPending && deleteMutation.variables === v.id}
                        isSettingDefault={setDefaultMutation.isPending && setDefaultMutation.variables === v.id}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </PageFrame>
  );
}
