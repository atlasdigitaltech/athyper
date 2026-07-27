import type {
  PlaneKey,
  WorkItemAction,
  WorkItemSummary,
} from "@athyper/api-contracts";
import type {
  WorkInboxAdapter,
  WorkInboxListResult,
  WorkInboxQuery,
} from "./work-inbox";

export type WorkInboxFetch = <T>(
  path: string,
  init?: {
    method?: string;
    body?: unknown;
    signal?: AbortSignal;
  },
) => Promise<T>;

export function createWorkflowInboxAdapter(
  plane: Extract<PlaneKey, "neon" | "admin">,
  fetcher: WorkInboxFetch,
): WorkInboxAdapter {
  const load = async (query: WorkInboxQuery, signal: AbortSignal): Promise<WorkInboxListResult> => {
    const offset = query.page * query.pageSize;
    const response = await fetcher<{ items?: unknown[]; total?: number }>(
      `/api/relay/workflow/inbox?view=${query.view}&limit=${query.pageSize}&offset=${offset}`,
      { signal },
    );
    let items = (response.items ?? [])
      .map((item) => workflowItem(plane, item, query.view === "assigned"))
      .filter(isWorkItem);
    if (query.search) {
      const search = query.search.toLowerCase();
      items = items.filter((item) => `${item.title} ${item.description ?? ""}`.toLowerCase().includes(search));
    }
    items.sort(sorter(query.sort));
    return { items, total: response.total ?? items.length };
  };

  return {
    plane,
    list: load,
    get: async (id, signal) => {
      const result = await fetcher<{ items?: unknown[] }>(
        "/api/relay/workflow/inbox?limit=200&offset=0",
        { signal },
      );
      return (result.items ?? []).map((item) => workflowItem(plane, item, true)).find((item) => item?.id === id) ?? null;
    },
    act: async (item, action, input) => {
      await fetcher(`/api/relay/workflow/items/${encodeURIComponent(item.id)}/action`, {
        method: "POST",
        body: {
          action: action.code,
          remarks: input?.comment,
          delegate_to: input?.delegateTo,
        },
      });
    },
  };
}

export function createMeshInboxAdapter(fetcher: WorkInboxFetch): WorkInboxAdapter {
  return {
    plane: "mesh",
    list: async (query, signal) => {
      const response = await fetcher<{ items?: unknown[]; total?: number }>(
        `/api/relay/mesh/inbox?limit=${Math.min(200, query.pageSize * (query.page + 1))}`,
        { signal },
      );
      let items = (response.items ?? []).map(meshItem).filter(isWorkItem);
      items = items.filter((item) => meshViewMatches(query.view, item.status));
      if (query.search) {
        const search = query.search.toLowerCase();
        items = items.filter((item) => `${item.title} ${item.description ?? ""}`.toLowerCase().includes(search));
      }
      items.sort(sorter(query.sort));
      const start = query.page * query.pageSize;
      return {
        items: items.slice(start, start + query.pageSize),
        total: response.total ?? items.length,
      };
    },
    get: async (id, signal) => {
      const response = await fetcher<{ items?: unknown[] }>("/api/relay/mesh/inbox?limit=200", { signal });
      return (response.items ?? []).map(meshItem).find((item) => item?.id === id) ?? null;
    },
  };
}

function workflowItem(
  plane: "neon" | "admin",
  value: unknown,
  canAct: boolean,
): WorkItemSummary | null {
  if (!record(value) || typeof value["id"] !== "string") return null;
  const entityType = text(value["entityType"], "record");
  const entityId = text(value["entityId"], "");
  const workflowType = text(value["workflowType"], text(value["taskType"], "workflow"));
  const status = text(value["status"], "pending");
  return {
    id: value["id"],
    kind: workflowType,
    title: `${humanize(workflowType)} · ${humanize(entityType)}`,
    description: text(value["stageName"], `Review ${humanize(entityType)}`),
    status,
    priority: priority(value["dueAt"]),
    assignedAt: optionalText(value["assignedAt"]),
    dueAt: optionalText(value["dueAt"]),
    source: {
      plane,
      surface: plane === "admin" ? "setup" : "runtime",
      entityCode: entityType,
      ...(entityId ? {
        entityId,
        href: plane === "admin"
          ? `/setup/metadata/${encodeURIComponent(entityType)}?record=${encodeURIComponent(entityId)}`
          : `/app/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}`,
      } : {}),
    },
    availableActions: canAct && activeStatus(status)
      ? [
          { code: "approve", label: "Approve", intent: "positive" },
          { code: "reject", label: "Reject", intent: "destructive", requiresComment: true },
          { code: "delegate", label: "Delegate", intent: "neutral" },
          { code: "escalate", label: "Escalate", intent: "warning", requiresComment: true },
        ]
      : [],
  };
}

function meshItem(value: unknown): WorkItemSummary | null {
  if (!record(value) || typeof value["id"] !== "string") return null;
  const entity = text(value["entity"], "document");
  const status = text(value["status"], "received");
  const code = optionalText(value["code"]);
  return {
    id: value["id"],
    kind: "shared_document",
    title: code ? `${humanize(entity)} ${code}` : humanize(entity),
    description: "Shared through the active Mesh account grant.",
    status,
    priority: status.includes("failed") || status.includes("rejected") ? "high" : "normal",
    source: {
      plane: "mesh",
      surface: "runtime",
      entityCode: entity,
      entityId: value["id"],
      href: `/app/${encodeURIComponent(entity)}/${encodeURIComponent(value["id"])}`,
    },
    // The current Mesh endpoint is read-only. Actions stay absent until the
    // acknowledgement capability endpoint authorizes them.
    availableActions: [],
  };
}

function sorter(sort: WorkInboxQuery["sort"]) {
  return (left: WorkItemSummary, right: WorkItemSummary) => {
    if (sort === "priority") return priorityRank(right.priority) - priorityRank(left.priority);
    const a = Date.parse(left.assignedAt ?? "") || 0;
    const b = Date.parse(right.assignedAt ?? "") || 0;
    return sort === "oldest" ? a - b : b - a;
  };
}

function priority(value: unknown): string {
  if (typeof value !== "string") return "normal";
  const remaining = Date.parse(value) - Date.now();
  return remaining < 0 ? "overdue" : remaining < 86_400_000 ? "high" : "normal";
}

function priorityRank(value: string): number {
  return value === "overdue" ? 3 : value === "high" ? 2 : 1;
}

function activeStatus(value: string): boolean {
  return value === "pending" || value === "assigned" || value === "in_progress";
}

function meshViewMatches(view: WorkInboxQuery["view"], status: string): boolean {
  const normalized = status.toLowerCase();
  if (view === "completed") return ["accepted", "acknowledged", "completed", "delivered"].includes(normalized);
  if (view === "escalated") return normalized.includes("failed") || normalized.includes("rejected") || normalized.includes("dead");
  if (view === "delegated") return normalized.includes("shared") || normalized.includes("forwarded");
  return !meshViewMatches("completed", normalized) && !meshViewMatches("escalated", normalized);
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function humanize(value: string): string {
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function isWorkItem(value: WorkItemSummary | null): value is WorkItemSummary {
  return value !== null;
}
