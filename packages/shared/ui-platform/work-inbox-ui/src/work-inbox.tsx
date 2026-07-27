"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  PlaneKey,
  WorkItemAction,
  WorkItemSummary,
} from "@athyper/api-contracts";
import { emitSurfaceEvent } from "@athyper/runtime-shared/observability";

export interface WorkInboxQuery {
  view: "assigned" | "delegated" | "escalated" | "completed";
  search: string;
  sort: "newest" | "oldest" | "priority";
  page: number;
  pageSize: number;
}

export interface WorkInboxListResult {
  items: WorkItemSummary[];
  total: number;
}

export interface WorkInboxAdapter {
  plane: PlaneKey;
  list: (query: WorkInboxQuery, signal: AbortSignal) => Promise<WorkInboxListResult>;
  get?: (id: string, signal: AbortSignal) => Promise<WorkItemSummary | null>;
  act?: (
    item: WorkItemSummary,
    action: WorkItemAction,
    input?: { comment?: string; delegateTo?: string },
  ) => Promise<WorkItemSummary | void>;
}

export interface WorkInboxProps {
  adapter: WorkInboxAdapter;
  selectedId?: string;
  query: WorkInboxQuery;
  onQueryChange: (query: WorkInboxQuery) => void;
  onSelect: (id: string | undefined) => void;
}

export function WorkInbox({
  adapter,
  selectedId,
  query,
  onQueryChange,
  onSelect,
}: WorkInboxProps) {
  const queryClient = useQueryClient();
  const listKey = ["work-inbox", adapter.plane, query] as const;
  const list = useQuery({
    queryKey: listKey,
    queryFn: ({ signal }) => adapter.list(query, signal),
    staleTime: 15_000,
  });
  const selectedFromList = list.data?.items.find((item) => item.id === selectedId);
  const detail = useQuery({
    queryKey: ["work-inbox", adapter.plane, "detail", selectedId],
    queryFn: ({ signal }) => adapter.get!(selectedId!, signal),
    enabled: Boolean(selectedId && !selectedFromList && adapter.get),
  });
  const selected = selectedFromList ?? detail.data ?? null;
  const [offline, setOffline] = useState(() => typeof navigator !== "undefined" && !navigator.onLine);

  useEffect(() => {
    const online = () => setOffline(false);
    const offlineHandler = () => setOffline(true);
    window.addEventListener("online", online);
    window.addEventListener("offline", offlineHandler);
    const onNotification = (event: Event) => {
      const detail = (event as CustomEvent<{ event_code?: string }>).detail;
      if (detail?.event_code?.includes("workflow") || detail?.event_code?.includes("inbox")) {
        void queryClient.invalidateQueries({ queryKey: ["work-inbox", adapter.plane] });
      }
    };
    window.addEventListener("athyper:notification", onNotification);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offlineHandler);
      window.removeEventListener("athyper:notification", onNotification);
    };
  }, [adapter.plane, queryClient]);

  const actionMutation = useMutation({
    mutationFn: async ({
      item,
      action,
      input,
    }: {
      item: WorkItemSummary;
      action: WorkItemAction;
      input?: { comment?: string; delegateTo?: string };
    }) => {
      if (!adapter.act) throw new Error("This action is not available.");
      return adapter.act(item, action, input);
    },
    onMutate: async ({ item }) => {
      await queryClient.cancelQueries({ queryKey: listKey });
      const previous = queryClient.getQueryData<WorkInboxListResult>(listKey);
      queryClient.setQueryData<WorkInboxListResult>(listKey, (current) => current ? {
        ...current,
        items: current.items.filter((candidate) => candidate.id !== item.id),
      } : current);
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(listKey, context.previous);
      emitWorkItemActionEvent(adapter.plane, "failure");
    },
    onSuccess: () => {
      emitWorkItemActionEvent(adapter.plane, "success");
      onSelect(undefined);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["work-inbox", adapter.plane] });
    },
  });

  const startAction = (item: WorkItemSummary, action: WorkItemAction) => {
    if (!window.confirm(`${action.label} "${item.title}"?`)) {
      emitWorkItemActionEvent(adapter.plane, "cancelled");
      return;
    }
    const comment = action.requiresComment
      ? window.prompt("Comment required")?.trim()
      : undefined;
    if (action.requiresComment && !comment) return;
    const delegateTo = action.code === "delegate"
      ? window.prompt("Delegate to principal ID")?.trim()
      : undefined;
    if (action.code === "delegate" && !delegateTo) return;
    actionMutation.mutate({ item, action, input: { comment, delegateTo } });
  };

  const totalPages = Math.max(1, Math.ceil((list.data?.total ?? 0) / query.pageSize));
  const views = useMemo(() => ["assigned", "delegated", "escalated", "completed"] as const, []);

  return (
    <section className="space-y-4" aria-labelledby="work-inbox-title">
      <header className="border-b pb-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{adapter.plane}</p>
        <h1 id="work-inbox-title" className="text-2xl font-semibold">Inbox</h1>
        <p className="text-sm text-muted-foreground">Operational work assigned to the active context.</p>
      </header>

      {offline ? (
        <div role="status" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
          You are offline. Showing the most recently cached work items.
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Inbox view" className="flex flex-wrap gap-1">
          {views.map((view) => (
            <button
              key={view}
              type="button"
              role="tab"
              aria-selected={query.view === view}
              className={`rounded-md border px-3 py-1.5 text-sm capitalize ${query.view === view ? "bg-foreground text-background" : ""}`}
              onClick={() => onQueryChange({ ...query, view, page: 0 })}
            >
              {view}
            </button>
          ))}
        </div>
        <input
          aria-label="Search work items"
          value={query.search}
          onChange={(event) => onQueryChange({ ...query, search: event.target.value, page: 0 })}
          placeholder="Search work"
          className="ml-auto min-h-9 rounded-md border bg-background px-3 text-sm"
        />
        <select
          aria-label="Sort work items"
          value={query.sort}
          onChange={(event) => onQueryChange({ ...query, sort: event.target.value as WorkInboxQuery["sort"], page: 0 })}
          className="min-h-9 rounded-md border bg-background px-2 text-sm"
        >
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="priority">Priority</option>
        </select>
      </div>

      {list.isLoading ? (
        <div role="status" className="rounded-lg border p-8 text-sm text-muted-foreground">Loading work items…</div>
      ) : list.isError ? (
        <div role="alert" className="rounded-lg border border-destructive/40 p-6">
          <p className="text-sm text-destructive">
            {(list.error as { status?: number })?.status === 403
              ? "You do not have access to this Inbox."
              : "Unable to load work items."}
          </p>
          <button type="button" className="mt-3 rounded-md border px-3 py-2 text-sm" onClick={() => void list.refetch()}>Retry</button>
        </div>
      ) : list.data?.items.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          No {query.view} work items match the current filters.
        </div>
      ) : (
        <div className="grid min-h-[28rem] overflow-hidden rounded-lg border lg:grid-cols-[minmax(18rem,0.8fr)_minmax(24rem,1.2fr)]">
          <ul aria-label="Work item results" className="divide-y overflow-y-auto">
            {list.data?.items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  aria-current={selectedId === item.id ? "true" : undefined}
                  className={`w-full p-4 text-left hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${selectedId === item.id ? "bg-muted" : ""}`}
                  onClick={() => onSelect(item.id)}
                >
                  <span className="flex justify-between gap-3">
                    <span className="font-medium">{item.title}</span>
                    <span className="text-xs uppercase text-muted-foreground">{item.priority}</span>
                  </span>
                  {item.description ? <span className="mt-1 block line-clamp-2 text-sm text-muted-foreground">{item.description}</span> : null}
                  <span className="mt-2 block text-xs text-muted-foreground">{item.status}</span>
                </button>
              </li>
            ))}
          </ul>
          <article aria-live="polite" className="border-t p-5 lg:border-l lg:border-t-0">
            {selected ? (
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-semibold uppercase text-muted-foreground">{selected.kind}</p>
                  <h2 className="text-xl font-semibold">{selected.title}</h2>
                  {selected.description ? <p className="mt-2 text-sm text-muted-foreground">{selected.description}</p> : null}
                </div>
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div><dt className="text-muted-foreground">Status</dt><dd>{selected.status}</dd></div>
                  <div><dt className="text-muted-foreground">Priority</dt><dd>{selected.priority}</dd></div>
                  <div><dt className="text-muted-foreground">Assigned</dt><dd>{formatDate(selected.assignedAt)}</dd></div>
                  <div><dt className="text-muted-foreground">Due</dt><dd>{formatDate(selected.dueAt)}</dd></div>
                </dl>
                {selected.source.href ? (
                  <a className="inline-flex rounded-md border px-3 py-2 text-sm" href={selected.source.href}>Open source document</a>
                ) : null}
                {selected.availableActions.length > 0 ? (
                  <div aria-label="Available actions" className="flex flex-wrap gap-2 border-t pt-4">
                    {selected.availableActions.map((action) => (
                      <button
                        key={action.code}
                        type="button"
                        disabled={actionMutation.isPending}
                        className="rounded-md border px-3 py-2 text-sm disabled:opacity-50"
                        onClick={() => startAction(selected, action)}
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                ) : <p className="text-sm text-muted-foreground">No actions are available for this item.</p>}
                {actionMutation.isError ? <p role="alert" className="text-sm text-destructive">{actionMutation.error.message}</p> : null}
              </div>
            ) : <p className="text-sm text-muted-foreground">Select a work item to view its details.</p>}
          </article>
        </div>
      )}

      <nav aria-label="Inbox pagination" className="flex items-center justify-between">
        <button type="button" className="rounded-md border px-3 py-2 text-sm disabled:opacity-50" disabled={query.page === 0} onClick={() => onQueryChange({ ...query, page: Math.max(0, query.page - 1) })}>Previous</button>
        <span className="text-sm text-muted-foreground">Page {query.page + 1} of {totalPages}</span>
        <button type="button" className="rounded-md border px-3 py-2 text-sm disabled:opacity-50" disabled={query.page + 1 >= totalPages} onClick={() => onQueryChange({ ...query, page: query.page + 1 })}>Next</button>
      </nav>
    </section>
  );
}

function formatDate(value: string | undefined): string {
  return value ? new Date(value).toLocaleString() : "—";
}

function emitWorkItemActionEvent(
  plane: PlaneKey,
  result: "success" | "failure" | "cancelled",
): void {
  emitSurfaceEvent({
    name: "work_item_actioned",
    plane,
    scopeType: plane === "mesh" ? "network_account" : plane === "admin" ? "platform" : "tenant",
    surfaceCode: "inbox.work-item-action",
    route: "/inbox",
    durationMs: 0,
    result,
  });
}
